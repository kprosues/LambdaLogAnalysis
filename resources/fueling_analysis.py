#!/usr/bin/env python
"""
Fueling analysis utility for Subaru EJ207 tune files.

The script ingests one or more datalogs and compares measured lambda / fuel
trim behavior against the `fuel_base` table defined inside a tune file. The
logic for table relationships follows the documentation captured in
`ECU_TUNE_FILE_MODEL.md`.
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence

import numpy as np
import pandas as pd


# Column labels used by the Cobb-style datalogs present in this repo.
REQUIRED_COLUMNS = [
    "Time (s)",
    "Load (MAF) (g/rev)",
    "Engine Speed (rpm)",
    "Air/Fuel Sensor #1 (λ)",
    "Power Mode - Fuel Ratio Target (λ)",
    "Fuel Trim - Short Term (%)",
    "Fuel Trim - Long Term (%)",
    "Throttle Position (%)",
]

RENAMED_COLUMNS = {
    "Time (s)": "time_s",
    "Load (MAF) (g/rev)": "load_g_rev",
    "Engine Speed (rpm)": "rpm",
    "Air/Fuel Sensor #1 (λ)": "lambda_actual",
    "Power Mode - Fuel Ratio Target (λ)": "lambda_target",
    "Fuel Trim - Short Term (%)": "stft",
    "Fuel Trim - Long Term (%)": "ltft",
    "Throttle Position (%)": "throttle_pct",
    "Coolant Temperature (°C)": "ect_c",
    "Intake Air Temperature (°C)": "iat_c",
}


@dataclass
class TuneFuelBase:
    """Container for the axes and values used by the `fuel_base` table and PE enable conditions."""

    rpm_axis: np.ndarray
    load_axis: np.ndarray
    fuel_base: np.ndarray
    pe_enable_load: np.ndarray  # Minimum load (g/rev) to enable PE, indexed by RPM
    pe_enable_tps: np.ndarray  # Minimum TPS (%) to enable PE, indexed by RPM
    pe_delay: np.ndarray  # PE delay counters, indexed by pe_delay_index
    pe_delay_index: np.ndarray  # RPM breakpoints for PE delay indexing

    def value(self, rpm_idx: int, load_idx: int) -> float:
        return float(self.fuel_base[rpm_idx, load_idx])
    
    def pe_enable_load_at_rpm(self, rpm: float) -> float:
        """Get minimum load threshold for PE at given RPM."""
        idx = axis_index(rpm, self.rpm_axis, clamp=True)
        if idx is None:
            return float('inf')  # Disable if RPM out of range
        return float(self.pe_enable_load[idx])
    
    def pe_enable_tps_at_rpm(self, rpm: float) -> float:
        """Get minimum TPS threshold for PE at given RPM."""
        idx = axis_index(rpm, self.rpm_axis, clamp=True)
        if idx is None:
            return float('inf')  # Disable if RPM out of range
        return float(self.pe_enable_tps[idx])


def parse_numeric_rows(rows: Sequence[str]) -> np.ndarray:
    parsed: List[List[float]] = []
    for row in rows:
        numbers = [float(item.strip()) for item in row.split(",") if item.strip()]
        if numbers:
            parsed.append(numbers)
    return np.array(parsed, dtype=float)


def load_tune(tune_path: Path) -> TuneFuelBase:
    with tune_path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    map_lookup: Dict[str, Dict[str, Sequence[str]]] = {
        entry["id"]: entry for entry in payload["maps"]
    }

    try:
        rpm_axis = parse_numeric_rows(map_lookup["base_spark_rpm_index"]["data"])[0]
        load_axis = parse_numeric_rows(map_lookup["base_spark_map_index"]["data"])[0]
        fuel_base = parse_numeric_rows(map_lookup["fuel_base"]["data"])
        pe_enable_load = parse_numeric_rows(map_lookup["pe_enable_load"]["data"])[0]
        pe_enable_tps = parse_numeric_rows(map_lookup["pe_enable_tps"]["data"])[0]
        pe_delay = parse_numeric_rows(map_lookup["pe_delay"]["data"])[0]
        pe_delay_index = parse_numeric_rows(map_lookup["pe_delay_index"]["data"])[0]
    except KeyError as exc:
        missing = exc.args[0]
        raise KeyError(
            f"Required map '{missing}' not found in tune file '{tune_path}'."
        ) from exc

    if fuel_base.shape != (len(rpm_axis), len(load_axis)):
        raise ValueError(
            "fuel_base shape mismatch: "
            f"{fuel_base.shape} vs expected {(len(rpm_axis), len(load_axis))}"
        )
    
    if len(pe_enable_load) != len(rpm_axis):
        raise ValueError(
            f"pe_enable_load length mismatch: {len(pe_enable_load)} vs {len(rpm_axis)}"
        )
    
    if len(pe_enable_tps) != len(rpm_axis):
        raise ValueError(
            f"pe_enable_tps length mismatch: {len(pe_enable_tps)} vs {len(rpm_axis)}"
        )
    
    # pe_delay is indexed by pe_delay_index (RPM breakpoints), not the main RPM axis
    if len(pe_delay) != len(pe_delay_index):
        raise ValueError(
            f"pe_delay length mismatch: {len(pe_delay)} vs {len(pe_delay_index)}"
        )

    return TuneFuelBase(
        rpm_axis=np.asarray(rpm_axis, dtype=float),
        load_axis=np.asarray(load_axis, dtype=float),
        fuel_base=fuel_base,
        pe_enable_load=np.asarray(pe_enable_load, dtype=float),
        pe_enable_tps=np.asarray(pe_enable_tps, dtype=float),
        pe_delay=np.asarray(pe_delay, dtype=float),
        pe_delay_index=np.asarray(pe_delay_index, dtype=float),
    )


def axis_index(value: float, axis: np.ndarray, clamp: bool = True) -> Optional[int]:
    if math.isnan(value):
        return None
    if value < axis[0]:
        return 0 if clamp else None
    if value > axis[-1]:
        return len(axis) - 1 if clamp else None
    idx = int(np.searchsorted(axis, value, side="right") - 1)
    return max(0, min(idx, len(axis) - 1))


def load_logs(csv_paths: Iterable[Path]) -> pd.DataFrame:
    frames: List[pd.DataFrame] = []
    for path in csv_paths:
        frame = pd.read_csv(path)
        missing = [col for col in REQUIRED_COLUMNS if col not in frame.columns]
        if missing:
            raise ValueError(
                f"Missing columns {missing} in datalog '{path}'. "
                "Update REQUIRED_COLUMNS if needed."
            )
        frame = frame.rename(columns=RENAMED_COLUMNS)
        frame["log_file"] = path.name
        frames.append(frame)
    if not frames:
        raise ValueError("No datalogs were loaded.")
    return pd.concat(frames, ignore_index=True)


def classify_loop_state(
    df: pd.DataFrame,
    tune: TuneFuelBase,
) -> pd.Series:
    """
    Classify loop state using PE enable conditions from the tune file.
    
    PE (open loop) is active when:
    - Load >= pe_enable_load threshold for current RPM
    - TPS >= pe_enable_tps threshold for current RPM
    - Lambda target indicates PE mode (lambda_target < 1.0, typically)
    
    Note: PE delay logic is simplified - we check if current conditions
    meet the enable thresholds. The actual delay counters would require
    tracking state transitions over time.
    """
    # Get PE enable thresholds for each row's RPM
    pe_load_thresholds = df["rpm"].apply(
        lambda rpm: tune.pe_enable_load_at_rpm(rpm)
    )
    pe_tps_thresholds = df["rpm"].apply(
        lambda rpm: tune.pe_enable_tps_at_rpm(rpm)
    )
    
    # Check if PE conditions are met
    # PE is active when load and TPS exceed thresholds, and lambda target indicates PE
    open_loop = (
        (df["load_g_rev"] >= pe_load_thresholds)
        & (df["throttle_pct"] >= pe_tps_thresholds)
        & (df["lambda_target"] < 1.0)  # PE mode typically targets lambda < 1.0
    )
    
    return np.where(open_loop, "open", "closed")


def summarize_open_loop(
    df: pd.DataFrame, tune: TuneFuelBase, min_samples: int
) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame()

    grouped = (
        df.groupby(["rpm_idx", "load_idx"])
        .agg(
            samples=("lambda_ratio", "size"),
            mean_ratio=("lambda_ratio", "mean"),
            median_ratio=("lambda_ratio", "median"),
            p95_ratio=("lambda_ratio", lambda s: np.percentile(s, 95)),
        )
        .reset_index()
    )

    grouped = grouped[grouped["samples"] >= min_samples]
    if grouped.empty:
        return grouped

    grouped["rpm_axis"] = grouped["rpm_idx"].apply(
        lambda idx: int(tune.rpm_axis[int(idx)])
    )
    grouped["load_axis"] = grouped["load_idx"].apply(
        lambda idx: round(float(tune.load_axis[int(idx)]), 3)
    )
    grouped["current_fuel_base"] = grouped.apply(
        lambda row: tune.value(int(row["rpm_idx"]), int(row["load_idx"])), axis=1
    )
    grouped["mean_error_pct"] = (grouped["mean_ratio"] - 1.0) * 100.0
    grouped["suggested_fuel_base"] = (
        grouped["current_fuel_base"] * grouped["mean_ratio"]
    )
    return grouped.sort_values(
        by="mean_error_pct", key=lambda col: col.abs(), ascending=False
    )


def summarize_closed_loop(
    df: pd.DataFrame, tune: TuneFuelBase, min_samples: int
) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame()

    grouped = (
        df.groupby(["rpm_idx", "load_idx"])
        .agg(
            samples=("combined_trim", "size"),
            mean_trim=("combined_trim", "mean"),
            median_trim=("combined_trim", "median"),
            p95_trim=("combined_trim", lambda s: np.percentile(s, 95)),
        )
        .reset_index()
    )

    grouped = grouped[grouped["samples"] >= min_samples]
    if grouped.empty:
        return grouped

    grouped["rpm_axis"] = grouped["rpm_idx"].apply(
        lambda idx: int(tune.rpm_axis[int(idx)])
    )
    grouped["load_axis"] = grouped["load_idx"].apply(
        lambda idx: round(float(tune.load_axis[int(idx)]), 3)
    )
    grouped["current_fuel_base"] = grouped.apply(
        lambda row: tune.value(int(row["rpm_idx"]), int(row["load_idx"])), axis=1
    )
    grouped["suggested_fuel_base"] = (
        grouped["current_fuel_base"] * (1.0 + grouped["mean_trim"] / 100.0)
    )
    return grouped.sort_values(
        by="mean_trim", key=lambda col: col.abs(), ascending=False
    )


def generate_report(
    open_summary: pd.DataFrame,
    closed_summary: pd.DataFrame,
    output_path: Optional[Path],
) -> None:
    def _format(df: pd.DataFrame) -> str:
        if df.empty:
            return "_No data available._"
        display_cols = [
            "rpm_axis",
            "load_axis",
            "samples",
            "mean_error_pct" if "mean_error_pct" in df.columns else "mean_trim",
            "current_fuel_base",
            "suggested_fuel_base",
        ]
        filtered = df[display_cols].copy()
        return filtered.to_string(index=False, float_format=lambda val: f"{val:.3f}")

    open_section = (
        "### Open-Loop Fueling (PE) Summary\n" + _format(open_summary) + "\n"
    )
    closed_section = (
        "### Closed-Loop Fueling Summary\n" + _format(closed_summary) + "\n"
    )

    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(open_section + "\n" + closed_section, encoding="utf-8")

    print(open_section)
    print(closed_section)


def apply_fuel_base_modifications(
    tune_path: Path,
    open_summary: pd.DataFrame,
    closed_summary: pd.DataFrame,
    output_tune_path: Path,
    change_limit_pct: float = 5.0,
    modify_tune_path: Optional[Path] = None,
) -> None:
    """
    Apply fuel_base modifications from analysis summaries to create a new tune file.
    
    Open-loop recommendations take precedence over closed-loop for cells that appear
    in both summaries (PE mode is more critical for engine safety).
    
    Modifications are applied as raw values from the analysis (idempotent operation).
    Changes are limited to +/-change_limit_pct% of the original source tune file value
    to prevent overly aggressive changes. Suggested changes outside this limit are
    clamped and reported.
    
    This function is idempotent: running it multiple times with the same inputs will
    always produce the same output, as it always uses the original source tune file's
    values as the baseline for change limit calculations.
    
    Args:
        tune_path: Tune file used for analysis (baseline for fuel_base and limits)
        open_summary: Open-loop analysis summary
        closed_summary: Closed-loop analysis summary
        output_tune_path: Path to write the modified tune file
        change_limit_pct: Maximum percent change allowed (based on source tune file)
        modify_tune_path: Optional tune file used only as a template for non-fuel_base
            content. Fuel_base values are always derived from tune_path.
    """
    # ALWAYS use tune_path as the source for fuel_base values and change limits
    # This guarantees idempotency even when modify_tune_path points to a previously
    # modified file.
    source_tune_path = tune_path
    
    # Load the source tune file to get original baseline values
    with source_tune_path.open("r", encoding="utf-8") as handle:
        source_tune_data = json.load(handle)
    
    # Find the fuel_base map entry in the source tune file
    source_fuel_base_map = None
    for i, map_entry in enumerate(source_tune_data["maps"]):
        if map_entry["id"] == "fuel_base":
            source_fuel_base_map = map_entry
            break
    
    if source_fuel_base_map is None:
        raise ValueError(f"fuel_base map not found in source tune file '{source_tune_path}'")
    
    # Parse original fuel_base table from source tune file (used for change limit baseline)
    source_fuel_base = parse_numeric_rows(source_fuel_base_map["data"])
    
    # Load or create the output tune file structure
    # Priority:
    #   1. If output file exists, modify it in-place (other maps preserved)
    #   2. Else if modify_tune_path is provided, start from that as template
    #   3. Else fall back to source_tune_data
    if output_tune_path.exists():
        with output_tune_path.open("r", encoding="utf-8") as handle:
            tune_data = json.load(handle)
    elif modify_tune_path is not None:
        with modify_tune_path.open("r", encoding="utf-8") as handle:
            tune_data = json.load(handle)
    else:
        tune_data = json.loads(json.dumps(source_tune_data))
    
    # Find the fuel_base map entry in the output tune file (for updating)
    fuel_base_map = None
    for i, map_entry in enumerate(tune_data["maps"]):
        if map_entry["id"] == "fuel_base":
            fuel_base_map = map_entry
            break
    
    if fuel_base_map is None:
        raise ValueError(f"fuel_base map not found in output tune file structure")
    
    # Always start from source tune file's fuel_base values for idempotency
    # The output file is only used to preserve other settings, not fuel_base values
    # This ensures running the script multiple times always produces the same result
    modified_fuel_base = source_fuel_base.copy()
    
    # Create a lookup of modifications: (rpm_idx, load_idx) -> (suggested_value, source_original, source, rpm_axis, load_axis)
    # We use raw suggested values from analysis for idempotent operation
    modifications: Dict[tuple[int, int], tuple[float, float, str, float, float]] = {}
    
    # Add closed-loop modifications first
    if not closed_summary.empty:
        for _, row in closed_summary.iterrows():
            rpm_idx = int(row["rpm_idx"])
            load_idx = int(row["load_idx"])
            # Get suggested value from analysis (raw value, not percent change)
            suggested = float(row["suggested_fuel_base"])
            # Get original from analysis tune (for change limit calculation)
            analysis_original = float(row["current_fuel_base"])
            rpm_axis = float(row["rpm_axis"])
            load_axis = float(row["load_axis"])
            modifications[(rpm_idx, load_idx)] = (suggested, analysis_original, "closed", rpm_axis, load_axis)
    
    # Override with open-loop modifications (PE takes precedence)
    if not open_summary.empty:
        for _, row in open_summary.iterrows():
            rpm_idx = int(row["rpm_idx"])
            load_idx = int(row["load_idx"])
            # Get suggested value from analysis (raw value, not percent change)
            suggested = float(row["suggested_fuel_base"])
            # Get original from analysis tune (for change limit calculation)
            analysis_original = float(row["current_fuel_base"])
            rpm_axis = float(row["rpm_axis"])
            load_axis = float(row["load_axis"])
            modifications[(rpm_idx, load_idx)] = (suggested, analysis_original, "open", rpm_axis, load_axis)
    
    # Apply modifications with change limit (based on source tune file values)
    clamped_modifications: List[Dict[str, Any]] = []
    
    for (rpm_idx, load_idx), (suggested, analysis_original, source, rpm_axis, load_axis) in modifications.items():
        if 0 <= rpm_idx < modified_fuel_base.shape[0] and 0 <= load_idx < modified_fuel_base.shape[1]:
            # Get the original value from the source tune file (for change limit baseline)
            source_original = source_fuel_base[rpm_idx, load_idx]
            
            # Calculate percent change from source tune file (for limit checking)
            change_pct = ((suggested - source_original) / source_original) * 100.0
            
            # Apply change limit (limit is based on source tune file values for idempotency)
            if abs(change_pct) > change_limit_pct:
                # Clamp to limit based on source tune file value
                if change_pct > 0:
                    clamped_value = source_original * (1.0 + change_limit_pct / 100.0)
                else:
                    clamped_value = source_original * (1.0 - change_limit_pct / 100.0)
                
                modified_fuel_base[rpm_idx, load_idx] = clamped_value
                
                # Track clamped modification
                clamped_modifications.append({
                    "rpm": rpm_axis,
                    "load": load_axis,
                    "original": source_original,
                    "suggested": suggested,
                    "clamped": clamped_value,
                    "change_pct": change_pct,
                    "source": source,
                })
            else:
                # Within limit, apply raw suggested value directly (idempotent)
                modified_fuel_base[rpm_idx, load_idx] = suggested
    
    # Convert back to string format (comma-separated rows)
    fuel_base_strings = []
    for row in modified_fuel_base:
        row_str = ", ".join(f"{val:.1f}" for val in row)
        fuel_base_strings.append(row_str)
    
    # Update the map entry
    fuel_base_map["data"] = fuel_base_strings
    
    # Write the modified tune file
    output_tune_path.parent.mkdir(parents=True, exist_ok=True)
    with output_tune_path.open("w", encoding="utf-8") as handle:
        json.dump(tune_data, handle, indent=1, ensure_ascii=False)
    
    print(f"\nModified tune file saved to: {output_tune_path}")
    if modify_tune_path is not None:
        print(f"Source tune file for modifications: {modify_tune_path}")
    else:
        print(f"Source tune file for modifications: {tune_path}")
    print(f"Applied {len(modifications)} fuel_base modifications (limit: +/-{change_limit_pct}% from source).")
    print("Note: Modifications are idempotent - running multiple times produces the same result.")
    
    # Report clamped modifications
    if clamped_modifications:
        print(f"\nWARNING: {len(clamped_modifications)} modifications exceeded the +/-{change_limit_pct}% limit and were clamped:")
        print("   RPM     Load    Original  Suggested  Clamped   Change%  Source")
        print("   " + "-" * 65)
        for mod in clamped_modifications:
            print(
                f"   {mod['rpm']:5.0f}   {mod['load']:5.3f}   "
                f"{mod['original']:7.1f}   {mod['suggested']:8.1f}   "
                f"{mod['clamped']:7.1f}   {mod['change_pct']:6.1f}%  {mod['source']}"
            )
        print(f"\n   Review these cells in the summary report for full details.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Analyze open/closed loop fueling accuracy to refine the fuel_base table. "
            "See ECU_TUNE_FILE_MODEL.md for map structure details."
        )
    )
    parser.add_argument(
        "--tune",
        type=Path,
        required=True,
        help="Path to the JSON-formatted tune file.",
    )
    parser.add_argument(
        "--logs",
        type=Path,
        nargs="+",
        required=True,
        help="One or more CSV datalog files to analyze.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional path to save a Markdown summary.",
    )
    parser.add_argument(
        "--output-tune",
        type=Path,
        help="Optional path to save a modified tune file with updated fuel_base table.",
    )
    parser.add_argument(
        "--modify-tune",
        type=Path,
        help="Optional tune file to modify. If not specified, uses --tune file as the source for modifications.",
    )
    parser.add_argument(
        "--min-samples",
        type=int,
        default=5,
        help="Minimum hits per cell before reporting a recommendation (default: 5).",
    )
    parser.add_argument(
        "--change-limit",
        type=float,
        default=5.0,
        help="Maximum percent change allowed for fuel_base modifications (default: 5.0%%).",
    )

    args = parser.parse_args()

    tune = load_tune(args.tune)
    logs = load_logs(args.logs)

    logs = logs.dropna(
        subset=["rpm", "load_g_rev", "lambda_actual", "lambda_target"]
    ).copy()
    logs["stft"] = logs["stft"].fillna(0.0)
    logs["ltft"] = logs["ltft"].fillna(0.0)
    logs["combined_trim"] = logs["stft"] + logs["ltft"]

    logs["rpm_idx"] = logs["rpm"].apply(lambda val: axis_index(val, tune.rpm_axis))
    logs["load_idx"] = logs["load_g_rev"].apply(
        lambda val: axis_index(val, tune.load_axis)
    )
    logs = logs.dropna(subset=["rpm_idx", "load_idx"])
    logs["rpm_idx"] = logs["rpm_idx"].astype(int)
    logs["load_idx"] = logs["load_idx"].astype(int)

    logs["loop_state"] = classify_loop_state(logs, tune)

    open_rows = logs[logs["loop_state"] == "open"].copy()
    open_rows = open_rows[open_rows["lambda_target"] > 0]
    open_rows["lambda_ratio"] = open_rows["lambda_actual"] / open_rows["lambda_target"]

    closed_rows = logs[logs["loop_state"] == "closed"].copy()

    open_summary = summarize_open_loop(open_rows, tune, args.min_samples)
    closed_summary = summarize_closed_loop(closed_rows, tune, args.min_samples)

    generate_report(open_summary, closed_summary, args.output)
    
    if args.output_tune:
        apply_fuel_base_modifications(
            args.tune,
            open_summary,
            closed_summary,
            args.output_tune,
            change_limit_pct=args.change_limit,
            modify_tune_path=args.modify_tune,
        )


if __name__ == "__main__":
    main()

