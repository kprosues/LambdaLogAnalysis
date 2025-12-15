# Subaru MAF Scale Tuning Guide
## For Closed-Loop and Open-Loop Operation

## Overview

The MAF (Mass Air Flow) scale table is a critical calibration that converts the MAF sensor voltage output to actual airflow in grams per second (g/s). Proper MAF scaling ensures accurate air measurement, which directly impacts:

- **Load calculation**: `Load (g/rev) = MAF (g/s) / (RPM / 60) / 2` (for 4-cylinder)
- **Fuel delivery**: The ECU uses load to index fuel tables
- **Boost control**: Load affects boost target lookups
- **Spark timing**: Load indexes spark advance tables

### When MAF Scaling is Needed

- After installing a larger MAF sensor or housing
- After upgrading to a larger turbo (higher airflow capacity)
- When fuel trims are consistently off by more than ±5%
- When open-loop AFR deviates significantly from targets
- After any modification affecting the intake airflow path

---

## ECU Parameters Reference

### MAF Scale Table (`maf_scale`)

```
Table ID: maf_scale
Units: g/s
Size: 64 points (indexed by MAF voltage)
Range: 0.00 to 250.00+ g/s (varies by tune)
```

The MAF scale is a 64-point lookup table that maps MAF sensor voltage (0-5V linear) to airflow in g/s. Each point corresponds to a voltage step of approximately 0.079V (5V / 64 points).

**Index Calculation:**
```
MAF Voltage Index = MAF_Voltage × (64 / 5.0)
```

**Example from base tune:**
```
Index 0:   0.00 g/s   (0.00V)
Index 10:  12.98 g/s  (0.78V)
Index 32:  49.63 g/s  (2.50V)
Index 56:  246.85 g/s (4.38V)
Index 63:  250.00 g/s (4.92V) - Max clamp
```

### Related Parameters

| Parameter | Description | Typical Value |
|-----------|-------------|---------------|
| `maf_bias` | Offset applied to MAF reading | 16.56 g/s |
| `maf_limit` | Maximum MAF reading clamp | 250.00 g/s |
| `maf_delete` | Disable MAF (speed-density mode) | 0 (MAF enabled) |

---

## Log Values for MAF Scale Tuning

### Required Log Parameters

| Log Column | Internal Name | Purpose | Used For |
|------------|---------------|---------|----------|
| `Mass Air Flow Voltage (V)` | MAF Voltage | Primary index for MAF scale | Both loops |
| `Airflow (MAF) (g/s)` | MAF Airflow | ECU-reported airflow | Verification |
| `Fuel Trim - Short Term (%)` | STFT | Real-time fuel correction | Closed-loop |
| `Fuel Trim - Long Term (%)` | LTFT | Learned fuel correction | Closed-loop |
| `Air/Fuel Sensor #1 (λ)` | Lambda Actual | Wideband O2 reading | Open-loop |
| `Power Mode - Fuel Ratio Target (λ)` | Lambda Target | PE table target | Open-loop |
| `Engine Speed (rpm)` | RPM | Operating condition filter | Both loops |
| `Load (MAF) (g/rev)` | Load | Operating condition filter | Both loops |
| `Throttle Position (%)` | TPS | Loop state classification | Both loops |
| `Coolant Temperature (°C)` | ECT | Warm engine filter | Both loops |
| `Intake Air Temperature (°C)` | IAT | Environmental condition | Both loops |

### Optional but Recommended

| Log Column | Purpose |
|------------|---------|
| `Manifold Absolute Pressure (kPa)` | Cross-reference with MAP for SD blend |
| `Boost Target (kPa)` | Verify boost control behavior |
| `Injector Pulse Width (ms)` | Verify fuel delivery changes |
| `Knock Retard (°)` | Safety monitoring |

---

## Closed-Loop MAF Scaling

### Theory

In closed-loop operation, the ECU uses oxygen sensor feedback to maintain stoichiometric AFR (λ = 1.0). The ECU applies fuel trims to correct for differences between expected and actual AFR:

- **STFT (Short-Term Fuel Trim)**: Real-time correction (±25% typical range)
- **LTFT (Long-Term Fuel Trim)**: Learned correction stored in ECU memory

**Key Insight**: If the MAF scale is incorrect, the ECU will consistently apply fuel trims to compensate. By analyzing these trims, we can calculate MAF scale corrections.

### Operating Conditions for Closed-Loop Data

Filter data to include only stable closed-loop conditions:

| Condition | Criteria | Rationale |
|-----------|----------|-----------|
| Engine Temperature | ECT ≥ 70°C | Warm engine for stable trims |
| Throttle Position | TPS < 50% | Below PE (Power Enrichment) threshold |
| Load | Load < PE enable threshold | Not in open-loop power mode |
| Lambda Target | λ = 1.0 | Stoichiometric target |
| RPM Stability | ΔRPM < 200 over 1 second | Steady state operation |

### Correction Formula - Closed Loop

```
Total_Trim (%) = STFT (%) + LTFT (%)

Correction_Factor = 1 + (Total_Trim / 100)

New_MAF_Scale[index] = Current_MAF_Scale[index] × Correction_Factor
```

**Example:**
- Current MAF Scale at 2.5V index: 50.0 g/s
- Average Total Trim at this voltage: +8%
- Correction Factor: 1.08
- New MAF Scale: 50.0 × 1.08 = **54.0 g/s**

### Why This Works

If fuel trims are **positive** (+), the ECU is **adding fuel** because the MAF is under-reporting airflow. Increasing the MAF scale value tells the ECU more air is entering, resulting in more fuel and reduced positive trims.

If fuel trims are **negative** (-), the ECU is **removing fuel** because the MAF is over-reporting airflow. Decreasing the MAF scale value tells the ECU less air is entering, resulting in less fuel and reduced negative trims.

---

## Open-Loop MAF Scaling

### Theory

In open-loop (Power Enrichment / PE) mode, the ECU does not use oxygen sensor feedback. Instead, it targets a specific lambda value from the PE tables (`pe_initial`, `pe_safe`). 

**Key Insight**: Since there's no feedback loop, any MAF scale error directly translates to AFR error. By comparing actual lambda (wideband) to target lambda, we can calculate corrections.

### Operating Conditions for Open-Loop Data

Filter data to include only valid open-loop conditions:

| Condition | Criteria | Rationale |
|-----------|----------|-----------|
| Engine Temperature | ECT ≥ 70°C | Warm engine |
| Throttle Position | TPS ≥ PE enable TPS threshold | In power mode |
| Load | Load ≥ PE enable load threshold | In power mode |
| Lambda Target | λ < 1.0 | PE enrichment active |
| RPM | RPM ≥ 2000 | Avoid idle/tip-in transients |
| Steady State | Minimal throttle change | Stable readings |

### PE Enable Thresholds

From the tune file, PE mode activates when both conditions are met:

```
pe_enable_load: [11.45, 11.45, 11.45, 1.35, 1.35, 1.62, 1.89, 1.89, ...] (g/rev by RPM)
pe_enable_tps:  [99.61, 99.61, 99.61, 10.94, 10.94, 14.06, 17.19, ...] (% by RPM)
```

At higher RPM (≥2400), PE typically activates above ~15-17% TPS and ~1.3-1.9 g/rev load.

### Correction Formula - Open Loop

```
Lambda_Error (%) = ((Actual_Lambda - Target_Lambda) / Target_Lambda) × 100

Correction_Factor = 1 - (Lambda_Error / 100)

New_MAF_Scale[index] = Current_MAF_Scale[index] × Correction_Factor
```

**Note the sign reversal**: In open-loop, if actual lambda is **higher** (leaner) than target, we need to **increase** MAF scale to add more fuel.

**Example:**
- Current MAF Scale at 4.0V index: 135.0 g/s
- Target Lambda: 0.82
- Actual Lambda (wideband): 0.90
- Lambda Error: ((0.90 - 0.82) / 0.82) × 100 = **+9.76%** (running lean)
- Correction Factor: 1 - (9.76 / 100) = 0.9024
- **Wait** - this would decrease! Let me reconsider...

**Corrected Formula (for leaner-than-target):**
```
If Actual_Lambda > Target_Lambda (running lean):
  Need MORE fuel → MAF scale should be HIGHER
  Correction = Actual_Lambda / Target_Lambda

If Actual_Lambda < Target_Lambda (running rich):
  Need LESS fuel → MAF scale should be LOWER
  Correction = Actual_Lambda / Target_Lambda
```

**Simplified:**
```
Lambda_Ratio = Actual_Lambda / Target_Lambda
New_MAF_Scale[index] = Current_MAF_Scale[index] × Lambda_Ratio
```

**Revised Example:**
- Current MAF Scale at 4.0V index: 135.0 g/s
- Target Lambda: 0.82
- Actual Lambda: 0.90 (running lean)
- Lambda Ratio: 0.90 / 0.82 = 1.0976
- New MAF Scale: 135.0 × 1.0976 = **148.2 g/s**

This tells the ECU more air is present, so it adds more fuel, bringing lambda down toward target.

---

## Algorithm for MAF Scale Tuning Script

### High-Level Flow

```
1. Load tune file (maf_scale table)
2. Load datalog(s)
3. Filter and classify data into closed-loop and open-loop
4. Group data by MAF voltage bins (64 bins matching scale table)
5. Calculate corrections for each bin with sufficient samples
6. Apply corrections with smoothing and limits
7. Generate modified maf_scale table
8. Save new tune file and report
```

### Detailed Algorithm

#### Step 1: MAF Voltage Binning

```python
def maf_voltage_to_index(voltage: float) -> int:
    """Convert MAF voltage (0-5V) to maf_scale table index (0-63)."""
    index = int(voltage * (64 / 5.0))
    return max(0, min(63, index))
```

#### Step 2: Closed-Loop Analysis

```python
def analyze_closed_loop(df: DataFrame, maf_scale: np.ndarray) -> Dict[int, float]:
    """
    Analyze closed-loop data to calculate MAF scale corrections.
    
    Returns: dict mapping maf_scale index to correction factor
    """
    # Filter for closed-loop conditions
    closed_loop = df[
        (df['lambda_target'] == 1.0) &
        (df['ect_c'] >= 70) &
        (df['throttle_pct'] < 50)
    ].copy()
    
    # Calculate total fuel trim
    closed_loop['total_trim'] = closed_loop['stft'] + closed_loop['ltft']
    
    # Bin by MAF voltage
    closed_loop['maf_idx'] = closed_loop['maf_voltage'].apply(maf_voltage_to_index)
    
    # Group and calculate mean trim per bin
    corrections = {}
    for idx, group in closed_loop.groupby('maf_idx'):
        if len(group) >= MIN_SAMPLES:  # Require minimum samples
            mean_trim = group['total_trim'].mean()
            correction_factor = 1 + (mean_trim / 100)
            corrections[idx] = correction_factor
    
    return corrections
```

#### Step 3: Open-Loop Analysis

```python
def analyze_open_loop(df: DataFrame, maf_scale: np.ndarray) -> Dict[int, float]:
    """
    Analyze open-loop data to calculate MAF scale corrections.
    
    Returns: dict mapping maf_scale index to correction factor
    """
    # Filter for open-loop conditions
    open_loop = df[
        (df['lambda_target'] < 1.0) &
        (df['lambda_target'] > 0.7) &  # Valid PE range
        (df['ect_c'] >= 70) &
        (df['rpm'] >= 2000)
    ].copy()
    
    # Calculate lambda ratio
    open_loop['lambda_ratio'] = (
        open_loop['lambda_actual'] / open_loop['lambda_target']
    )
    
    # Remove outliers (wideband noise/errors)
    open_loop = open_loop[
        (open_loop['lambda_ratio'] > 0.85) &
        (open_loop['lambda_ratio'] < 1.15)
    ]
    
    # Bin by MAF voltage
    open_loop['maf_idx'] = open_loop['maf_voltage'].apply(maf_voltage_to_index)
    
    # Group and calculate mean correction per bin
    corrections = {}
    for idx, group in open_loop.groupby('maf_idx'):
        if len(group) >= MIN_SAMPLES:
            mean_ratio = group['lambda_ratio'].mean()
            corrections[idx] = mean_ratio
    
    return corrections
```

#### Step 4: Combine and Apply Corrections

```python
def apply_maf_corrections(
    maf_scale: np.ndarray,
    closed_corrections: Dict[int, float],
    open_corrections: Dict[int, float],
    max_change_pct: float = 10.0,
    smoothing: bool = True
) -> np.ndarray:
    """
    Apply corrections to MAF scale with limits and smoothing.
    
    Open-loop corrections take priority (more critical for engine safety).
    """
    new_scale = maf_scale.copy()
    
    # Start with closed-loop corrections
    for idx, factor in closed_corrections.items():
        new_scale[idx] = maf_scale[idx] * factor
    
    # Override with open-loop corrections (priority)
    for idx, factor in open_corrections.items():
        new_scale[idx] = maf_scale[idx] * factor
    
    # Apply change limits
    for i in range(len(new_scale)):
        max_increase = maf_scale[i] * (1 + max_change_pct / 100)
        max_decrease = maf_scale[i] * (1 - max_change_pct / 100)
        new_scale[i] = np.clip(new_scale[i], max_decrease, max_increase)
    
    # Optional: Smooth the curve to prevent jagged transitions
    if smoothing:
        new_scale = smooth_maf_scale(new_scale)
    
    # Ensure monotonically increasing (MAF should always increase with voltage)
    for i in range(1, len(new_scale)):
        if new_scale[i] < new_scale[i-1]:
            new_scale[i] = new_scale[i-1]
    
    return new_scale
```

#### Step 5: Smoothing Function

```python
def smooth_maf_scale(scale: np.ndarray, window: int = 3) -> np.ndarray:
    """
    Apply moving average smoothing to prevent jagged transitions.
    Preserves endpoints and ensures monotonicity.
    """
    smoothed = scale.copy()
    
    for i in range(1, len(scale) - 1):
        start = max(0, i - window // 2)
        end = min(len(scale), i + window // 2 + 1)
        smoothed[i] = np.mean(scale[start:end])
    
    return smoothed
```

---

## Quality Metrics and Validation

### Success Criteria - Closed Loop

| Metric | Target | Action if Failed |
|--------|--------|------------------|
| Mean Total Trim | ±3% | Re-iterate MAF scaling |
| Trim Range | Within ±5% across all MAF voltages | Identify problem bins |
| Trim Stability | Standard deviation < 3% per bin | Need more samples or identify transients |

### Success Criteria - Open Loop

| Metric | Target | Action if Failed |
|--------|--------|------------------|
| Mean Lambda Ratio | 0.98 - 1.02 | Re-iterate MAF scaling |
| Lambda Deviation | Within ±5% of target | Identify problem bins |
| No Lean Spikes | Lambda never exceeds target by >10% | Critical safety issue |

### Safety Limits

```python
SAFETY_LIMITS = {
    'max_change_per_iteration': 10.0,  # % max change per tuning pass
    'max_cumulative_change': 25.0,     # % max total change from baseline
    'min_samples_per_bin': 10,         # Minimum data points per MAF voltage bin
    'min_lambda_target': 0.75,         # Reject data with invalid targets
    'max_lambda_actual': 1.1,          # Warn if running lean
}
```

---

## Data Collection Best Practices

### Logging Session Requirements

1. **Warm-up**: Engine at full operating temperature (ECT ≥ 70°C)
2. **Duration**: Minimum 15-20 minutes of driving
3. **Variety**: Cover idle, cruise (multiple speeds), light acceleration, WOT pulls

### Closed-Loop Data Collection

- Highway cruising at 50-80 km/h (various gears)
- Light throttle acceleration (25-40% TPS)
- Deceleration (overrun) data
- Avoid hills that cause sustained heavy throttle

### Open-Loop Data Collection

- Safe location (empty road, track, dyno)
- 3rd or 4th gear WOT pulls from 2500-6500 RPM
- Multiple pulls for data consistency
- Allow 2-3 minutes between pulls for heat soak recovery

### Data Quality Filters

```python
# Reject transient data
df = df[df['rpm'].diff().abs() < 500]  # RPM change < 500/sample
df = df[df['throttle_pct'].diff().abs() < 10]  # TPS change < 10%/sample

# Reject cold engine data
df = df[df['ect_c'] >= 70]

# Reject invalid readings
df = df[df['lambda_actual'] > 0.6]
df = df[df['lambda_actual'] < 1.5]
df = df[df['maf_voltage'] > 0.5]  # Reject idle noise
```

---

## Iterative Tuning Process

### Recommended Workflow

```
Iteration 1: Closed-Loop Focus
├── Collect 20 min mixed driving data
├── Analyze closed-loop fuel trims
├── Apply corrections (max 5% per bin)
├── Flash ECU and reset LTFT
└── Re-log to verify improvements

Iteration 2: Closed-Loop Refinement
├── Collect 15 min mixed driving data
├── Verify trims are within ±5%
├── Apply minor corrections if needed
└── Proceed to open-loop when trims are stable

Iteration 3: Open-Loop Tuning
├── Collect WOT pulls (3-5 clean pulls)
├── Analyze lambda deviation from targets
├── Apply corrections to high-airflow bins
├── Flash and re-test
└── Repeat until within ±3%

Iteration 4: Final Validation
├── Combined drive session
├── Verify closed-loop trims remain stable
├── Verify open-loop hits targets
└── Document final MAF scale values
```

---

## Example Output: MAF Scale Analysis Report

```
=== MAF SCALE ANALYSIS REPORT ===
Tune File: Keith_v10.tune
Datalog: session_2024-12-14.csv
Analysis Date: 2024-12-14

--- CLOSED-LOOP ANALYSIS ---
MAF Idx | MAF V  | Airflow | Samples | Mean Trim | Correction
--------|--------|---------|---------|-----------|------------
   8    | 0.63V  |  9.6 g/s|    245  |   +2.3%   |   1.023
  12    | 0.94V  | 13.9 g/s|    312  |   +4.1%   |   1.041
  16    | 1.25V  | 18.8 g/s|    187  |   +3.7%   |   1.037
  20    | 1.56V  | 24.1 g/s|    156  |   +2.9%   |   1.029
  ...

--- OPEN-LOOP ANALYSIS ---
MAF Idx | MAF V  | Airflow | Samples | λ Target | λ Actual | Correction
--------|--------|---------|---------|----------|----------|------------
  40    | 3.13V  | 78.3 g/s|     23  |   0.85   |   0.88   |   1.035
  44    | 3.44V  | 96.2 g/s|     45  |   0.83   |   0.87   |   1.048
  48    | 3.75V  |118.1 g/s|     38  |   0.82   |   0.85   |   1.037
  52    | 4.06V  |143.5 g/s|     19  |   0.82   |   0.86   |   1.049
  56    | 4.38V  |176.5 g/s|     12  |   0.83   |   0.89   |   1.072 *CLAMPED
  ...

* Corrections exceeding 10% are clamped for safety

--- RECOMMENDATIONS ---
Overall Health: MODERATE - Corrections needed
Closed-Loop: Average trim +3.2% (needs adjustment)
Open-Loop: Running 4-6% lean at high airflow (priority fix)

Next Steps:
1. Apply suggested corrections to maf_scale
2. Reset ECU learned values after flash
3. Re-log to verify improvements
```

---

## Script Integration Points

### Input Files
- Tune file (JSON format): `maf_scale` table extraction
- Datalog(s) (CSV format): Fuel trim and lambda data

### Output Files
- Modified tune file with updated `maf_scale`
- Analysis report (Markdown or text)
- Comparison visualization (optional)

### Command-Line Interface (Proposed)

```bash
python maf_scale_tuning.py \
    --tune "Keith_v10.tune" \
    --logs "session1.csv" "session2.csv" \
    --output-tune "Keith_v11_maf_adjusted.tune" \
    --report "maf_analysis.md" \
    --max-change 10.0 \
    --min-samples 10
```

---

## References

- ECU_TUNE_FILE_MODEL.md - Detailed tune file structure
- RomRaider MAF Scaling documentation
- Cobb Tuning MAF scaling guides
- Lambda Tuning support articles

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2024-12-14 | 1.0 | Initial guide created |

