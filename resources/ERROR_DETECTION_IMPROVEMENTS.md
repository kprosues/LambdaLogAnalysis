# Error Detection Improvements Based on ECU Tune File Model

This document outlines improvements that can be made to error detection in log files based on the ECU tune file model for the 1999 JDM Subaru WRX STi EJ207 engine.

## Overview

The tune file model (`ECU_TUNE_FILE_MODEL.md`) provides detailed information about:
- 157 unique maps/parameters organized into 28 functional sections
- Thresholds, limits, and safety systems configured in the tune
- Relationships between different control systems
- Expected operating ranges and behaviors

By leveraging this knowledge, we can improve error detection to be more accurate, context-aware, and aligned with the actual ECU calibration.

---

## 1. Knock Detection Improvements

### Current Implementation
- **Severity Threshold**: -4.0° (severe), -0.0001° (mild)
- **Grouping Window**: 0.1 seconds (100ms)
- **Detection**: Any negative knock retard value

### Improvements Based on Tune File Model

#### 1.1 Use Tune File Knock Limits
**From Tune File:**
- `knock_retard_max = -8.0°` (maximum spark retard allowed)
- `knock_retard_attack = -1.0°` (rate of spark retard when knock detected)
- `knock_retard_decay = 0.2°` (rate of spark advance recovery)
- `knock_rpm_min = 1000 rpm` (minimum RPM for knock detection)

**Improvements:**
1. **Severity Classification Enhancement**:
   - **Critical**: `knockRetard < -6.0°` (approaching max retard limit)
   - **Severe**: `knockRetard < -4.0°` (current threshold, keep)
   - **Moderate**: `knockRetard < -2.0°` (new category)
   - **Mild**: `knockRetard >= -2.0° && knockRetard < -0.0001°`

2. **RPM-Based Filtering**:
   - Filter out knock events below `knock_rpm_min` (1000 rpm) as these may be false positives
   - Add RPM context to knock events (detect knock at high RPM vs low RPM)

3. **Knock Recovery Detection**:
   - Track when knock retard recovers (increases toward 0)
   - Detect if recovery rate matches `knock_retard_decay` (0.2°/update)
   - Flag events where recovery is too slow (potential persistent knock)

4. **Knock Attack Rate Analysis**:
   - Detect if knock retard rate exceeds `knock_retard_attack` (-1.0°/update)
   - Flag rapid knock onset as more severe than gradual onset

#### 1.2 Context-Aware Knock Detection
**From Tune File:**
- Knock sensitivity varies by RPM and load
- `knock_sensitivity_low_load` = 0.81 g/rev threshold
- `knock_sensitivity_low_load_factor` = 196.9% (higher sensitivity at low load)

**Improvements:**
1. **Load-Based Severity Adjustment**:
   - Knock at low load (< 0.81 g/rev) may be more significant due to higher sensitivity
   - Weight knock events differently based on load conditions

2. **Knock During Power Mode**:
   - Detect knock during Power Enrichment (PE) mode
   - More critical as engine is under high load/boost
   - Check if IAM drops during knock events (indicates learned corrections)

---

## 2. Boost Control Analysis Improvements

### Current Implementation
- **Overshoot Threshold**: 5.0 kPa
- **Undershoot Threshold**: -5.0 kPa
- **Target Tolerance**: 10.0 kPa
- **Filtering**: Only analyzes data where `actualBoost >= 100 kPa`

### Improvements Based on Tune File Model

#### 2.1 Use Tune File Boost Error Thresholds
**From Tune File:**
- `boost_error_index` = [20.3, 11.7, 5.3, 2.1] kPa (error magnitude thresholds)
- These thresholds are used by wastegate control step tables
- `boost_limit` varies by RPM (141.9 to 234.7 kPa in base file)

**Improvements:**
1. **Multi-Tier Error Classification**:
   - **Critical Overboost**: `error > 20.3 kPa` (exceeds highest error threshold)
   - **Severe Overboost**: `error > 11.7 kPa`
   - **Moderate Overboost**: `error > 5.3 kPa` (current threshold)
   - **Mild Overboost**: `error > 2.1 kPa`
   - Similar classification for undershoot (negative values)

2. **RPM-Based Boost Limit Checking**:
   - Compare actual boost against `boost_limit` table (varies by RPM)
   - Flag events where boost exceeds RPM-specific limit
   - More accurate than fixed threshold

3. **Boost Error Context**:
   - Check wastegate duty cycle during errors
   - Detect if wastegate is at max (`wg_max`) during overboost (control saturation)
   - Detect if wastegate is at min (0%) during undershoot (control saturation)

#### 2.2 Boost Target Compensation Awareness
**From Tune File:**
- `boost_target_baro_comp` (barometric pressure compensation)
- `boost_target_iat_comp` (intake air temperature compensation)
- Compensations may be disabled (all zeros)

**Improvements:**
1. **Expected Target Calculation**:
   - If tune file is available, calculate expected boost target with compensations
   - Compare logged target vs calculated target (detect compensation issues)

2. **Compensation State Detection**:
   - Detect if compensations are active or disabled
   - Flag errors that may be due to missing compensations

#### 2.3 Wastegate Control Analysis
**From Tune File:**
- `wg_overboost_step` and `wg_underboost_step` tables indexed by `boost_error_index`
- Step values: [3.1, 1.6, 0.8, 0.4]% duty cycle adjustments

**Improvements:**
1. **Wastegate Response Analysis**:
   - Check if wastegate duty cycle changes appropriately for boost error magnitude
   - Detect if wastegate response is too slow or too fast
   - Compare actual wastegate changes to expected step values

2. **Control Saturation Detection**:
   - Flag when wastegate is at `wg_max` but boost still overshooting
   - Flag when wastegate is at 0% but boost still undershooting
   - Indicates control system limits reached

---

## 3. Air/Fuel Ratio Analysis Improvements

### Current Implementation
- **Lean Threshold**: +0.05 λ (measured > target)
- **Rich Threshold**: -0.05 λ (measured < target)
- **Target Tolerance**: ±0.02 λ
- **Filtering**: Skips target AFR = 1.0 (stoichiometric), filters low throttle (< 15%)

### Improvements Based on Tune File Model

#### 3.1 Power Enrichment Mode Detection
**From Tune File:**
- `pe_initial` (λ): Initial PE lambda target (0.921 to 1.000)
- `pe_safe` (λ): Safe PE lambda target (0.831 to 1.000, richer)
- `pe_enable_load` and `pe_enable_tps`: Thresholds to enable PE mode
- PE mode operates in open-loop (STFT disabled, LTFT still applied)

**Improvements:**
1. **PE Mode State Detection**:
   - Detect when PE mode is active (load > `pe_enable_load`, TPS > `pe_enable_tps`)
   - Compare measured AFR to `pe_initial` or `pe_safe` targets
   - More accurate error detection during power mode

2. **PE Mode Transition Analysis**:
   - Detect blend delay period (transition from `pe_initial` to `pe_safe`)
   - Flag if AFR doesn't transition correctly
   - Check if IAM triggers safe mode (IAM below threshold)

3. **Open-Loop vs Closed-Loop Context**:
   - Different error thresholds for open-loop (PE) vs closed-loop operation
   - STFT should be near 0% during PE mode (open-loop)
   - LTFT still applies during PE mode

#### 3.2 Lambda Target Validation
**From Tune File:**
- PE lambda targets are indexed by RPM and Load (16x16 tables)
- Targets range from 0.831 (richest) to 1.000 (stoichiometric)

**Improvements:**
1. **Expected Target Calculation**:
   - If tune file is available, calculate expected lambda target based on RPM and Load
   - Compare logged target vs calculated target (detect tune file mismatch)

2. **Target Range Validation**:
   - Flag if target lambda is outside expected range (0.831 to 1.000 for PE)
   - Detect if target is stuck at 1.0 when it should be in PE mode

---

## 4. Fuel Trim Analysis Improvements

### Current Implementation
- **STFT Threshold**: ±10% (abnormal)
- **LTFT Threshold**: ±5% (abnormal)
- **Grouping Window**: 0.5 seconds

### Improvements Based on Tune File Model

#### 4.1 Fuel Trim Context Awareness
**From Tune File:**
- STFT is disabled during PE mode (`stft_enable` flag)
- LTFT learned corrections are still applied during PE mode
- Fuel trim compensations: ECT, IAT, startup, acceleration enrichment

**Improvements:**
1. **PE Mode Filtering**:
   - Filter out STFT events during PE mode (expected to be near 0%)
   - Only analyze STFT during closed-loop operation
   - More accurate STFT error detection

2. **Compensation-Aware Analysis**:
   - Consider ECT and IAT when evaluating fuel trim
   - High trim during cold start may be expected (`fuel_startup` enrichment)
   - High trim during acceleration may be expected (`fuel_accel_enrich`)

3. **LTFT Learning Rate Analysis**:
   - LTFT represents learned corrections over time
   - Flag if LTFT changes too rapidly (unstable learning)
   - Flag if LTFT is stuck at limits (learning saturated)

#### 4.2 Fuel Trim Limit Detection
**From Tune File:**
- Fuel trim typically ranges from -25% to +25% (ECU limits)
- Excessive trim indicates fueling issues (injectors, MAF, leaks, etc.)

**Improvements:**
1. **Trim Limit Checking**:
   - Flag when trim approaches ±20% (approaching ECU limits)
   - Flag when trim exceeds ±25% (ECU limit reached, fuel cut may occur)

2. **Trim Direction Analysis**:
   - Positive trim (adding fuel) = rich condition (ECU trying to lean out)
   - Negative trim (removing fuel) = lean condition (ECU trying to enrich)
   - Correlate with AFR errors to identify root cause

---

## 5. New Error Detection Capabilities

### 5.1 Load Limit Violation Detection
**From Tune File:**
- `load_max` varies by RPM (1.28 to 2.54 g/rev in base, up to 5.00 in tuned files)
- **Enforcement**: Fuel cut is triggered when load exceeds `load_max`

**Implementation:**
1. **Load Limit Analyzer**:
   - Detect when `Load (MAF) (g/rev)` exceeds RPM-specific `load_max`
   - Flag as critical error (engine protection active)
   - Check if fuel cut occurs (injector pulsewidth drops to 0)

2. **Load Limit Context**:
   - Compare load to `load_max` table based on current RPM
   - Flag if load is consistently near limit (potential tune issue)
   - Detect load spikes that trigger fuel cut

### 5.2 Rev Limit Detection
**From Tune File:**
- `rev_limit` varies by gear (6000, 7800, 8000, 8000, 8117 rpm)
- `rev_limit_spark = -6.0°` (spark retard at rev limit)

**Implementation:**
1. **Rev Limit Analyzer**:
   - Detect when RPM exceeds gear-specific `rev_limit`
   - Check if spark retard occurs (`rev_limit_spark = -6.0°`)
   - Flag as warning (normal operation, but indicates aggressive driving)

2. **Rev Limit Context**:
   - Detect if rev limit is hit frequently (potential tune issue)
   - Check if spark retard is applied correctly
   - Detect if fuel cut occurs at rev limit (additional protection)

### 5.3 IAM (Ignition Advance Multiplier) Analysis
**From Tune File:**
- `iam_init = 0.50` (50% initial value)
- IAM scales learned spark corrections: `base_spark + learned_spark * (IAM/100)`
- IAM decreases when knock detected, increases when knock-free

**Implementation:**
1. **IAM Analyzer**:
   - Detect when IAM drops below thresholds (e.g., < 0.30 = severe knock history)
   - Track IAM recovery rate after knock events
   - Flag if IAM is stuck low (persistent knock issues)

2. **IAM Context**:
   - Correlate IAM drops with knock events
   - Detect if IAM recovery is too slow (potential tune issue)
   - Check if IAM affects spark timing as expected

### 5.4 Spark Timing Analysis
**From Tune File:**
- Base spark tables indexed by RPM and Load
- Multiple compensations: ECT, IAT, charge temp, cylinder-specific
- `spark_min` = 0.0° (minimum spark advance)
- `spark_charge_temp` compensation (effectively disabled in base file)

**Implementation:**
1. **Spark Timing Analyzer**:
   - Compare logged spark timing to expected base spark (if tune file available)
   - Detect if spark timing is below `spark_min` (safety limit)
   - Flag excessive spark retard (beyond knock retard)

2. **Spark Compensation Analysis**:
   - Check if ECT compensation is applied correctly
   - Detect if charge temp compensation is active (should be disabled in base)
   - Flag cylinder-specific spark issues (if enabled)

### 5.5 Boost Limit Violation Detection
**From Tune File:**
- `boost_limit` varies by RPM (141.9 to 234.7 kPa in base file)
- Boost limit is absolute maximum, separate from boost target

**Implementation:**
1. **Boost Limit Analyzer**:
   - Detect when actual boost exceeds RPM-specific `boost_limit`
   - Flag as critical error (engine protection active)
   - Check if fuel cut or wastegate intervention occurs

2. **Boost Limit Context**:
   - Compare boost to `boost_limit` table based on current RPM
   - Flag if boost is consistently near limit (potential tune issue)
   - Detect boost spikes that trigger protection

### 5.6 DFCO (Deceleration Fuel Cut-Off) Detection
**From Tune File:**
- `dfco_enable = 1` (enabled)
- DFCO activates based on RPM, throttle, vehicle speed, and ECT thresholds
- Fuel is cut during deceleration for emissions and fuel economy

**Implementation:**
1. **DFCO Analyzer**:
   - Detect when DFCO should be active vs when it actually is
   - Flag if DFCO activates incorrectly (fuel cut during acceleration)
   - Flag if DFCO doesn't activate when it should (fuel economy issue)

2. **DFCO Context**:
   - Check RPM thresholds for DFCO enable/disable
   - Verify throttle position (should be closed for DFCO)
   - Check vehicle speed thresholds

---

## 6. Context-Aware Error Detection

### 6.1 Operating Mode Detection
**From Tune File:**
- Multiple operating modes: Idle, Closed-Loop, Open-Loop (PE), DFCO, Rev Limit, etc.

**Improvements:**
1. **Mode-Aware Thresholds**:
   - Different error thresholds for different operating modes
   - STFT should be near 0% during PE mode (open-loop)
   - AFR errors more critical during PE mode (high load)

2. **Mode Transition Detection**:
   - Flag incorrect mode transitions (e.g., PE mode during idle)
   - Detect stuck modes (e.g., always in PE mode)

### 6.2 Temperature-Based Error Detection
**From Tune File:**
- ECT and IAT affect multiple systems (fuel, spark, boost, idle)
- Cold start conditions have different expected behaviors

**Improvements:**
1. **Temperature Context**:
   - Adjust error thresholds based on ECT (cold vs warm engine)
   - High fuel trim during cold start is expected
   - High AFR errors during warmup may be normal

2. **Temperature Compensation Validation**:
   - Check if temperature compensations are applied correctly
   - Flag if compensations are missing or incorrect

### 6.3 RPM/Load Context
**From Tune File:**
- Many tables are indexed by RPM and Load
- Different behaviors expected at different RPM/Load combinations

**Improvements:**
1. **RPM/Load-Aware Analysis**:
   - Use RPM and Load to determine expected values from tune file
   - Compare logged values to expected values
   - More accurate error detection

2. **Operating Range Validation**:
   - Flag if engine operates outside expected RPM/Load ranges
   - Detect if tune file limits are being exceeded

---

## 7. Tune File Integration

### 7.1 Tune File Loading
**Implementation:**
1. **Tune File Parser**:
   - Parse JSON tune file format
   - Extract all maps, parameters, and thresholds
   - Store in accessible data structure

2. **Tune File Validation**:
   - Validate tune file format and version
   - Check for required maps/parameters
   - Handle missing or invalid tune files gracefully

### 7.2 Expected Value Calculation
**Implementation:**
1. **Table Lookup Functions**:
   - Interpolate values from 2D tables (RPM x Load, RPM x TPS, etc.)
   - Handle table boundaries (clamp or extrapolate)
   - Support multiple table types (spark, fuel, boost, etc.)

2. **Compensation Calculation**:
   - Apply temperature compensations (ECT, IAT)
   - Apply barometric pressure compensation
   - Calculate final expected values with all compensations

### 7.3 Log vs Tune Comparison
**Implementation:**
1. **Target Comparison**:
   - Compare logged targets (boost, AFR, spark) to calculated targets from tune
   - Flag mismatches (indicates tune file not loaded or different version)

2. **Limit Checking**:
   - Compare logged values to tune file limits (boost_limit, load_max, rev_limit)
   - Flag when limits are exceeded

---

## 8. Implementation Priority

### High Priority (Immediate Impact)
1. **Knock Detection Improvements** (Section 1.1, 1.2)
   - Use tune file knock limits for severity classification
   - Add RPM-based filtering
   - Critical for engine protection

2. **Boost Control Improvements** (Section 2.1, 2.2)
   - Multi-tier error classification using `boost_error_index`
   - RPM-based boost limit checking
   - High impact on boost control accuracy

3. **Load Limit Detection** (Section 5.1)
   - New analyzer for load limit violations
   - Critical safety system

### Medium Priority (Significant Improvement)
4. **IAM Analysis** (Section 5.3)
   - New analyzer for IAM tracking
   - Important for knock history analysis

5. **PE Mode Detection** (Section 3.1)
   - Context-aware AFR analysis
   - Improves AFR error detection accuracy

6. **Fuel Trim Context** (Section 4.1)
   - PE mode filtering for STFT
   - Compensation-aware analysis

### Low Priority (Nice to Have)
7. **Rev Limit Detection** (Section 5.2)
   - Warning-level detection
   - Less critical than other systems

8. **DFCO Detection** (Section 5.6)
   - Fuel economy optimization
   - Lower priority than safety systems

9. **Tune File Integration** (Section 7)
   - Requires tune file loading infrastructure
   - Complex but provides most accurate detection

---

## 9. Summary

The ECU tune file model provides extensive information about:
- **Thresholds and Limits**: Use actual tune file values instead of hardcoded thresholds
- **System Relationships**: Understand how systems interact (PE mode, IAM, compensations)
- **Expected Behaviors**: Calculate expected values based on operating conditions
- **Safety Systems**: Detect when protection systems activate (load_max, boost_limit, rev_limit)

By implementing these improvements, error detection will be:
- **More Accurate**: Based on actual tune file configuration
- **Context-Aware**: Considers operating mode, temperature, RPM/Load
- **Comprehensive**: Detects errors in systems not currently analyzed
- **Actionable**: Provides specific information about what's wrong and why

The improvements can be implemented incrementally, starting with high-priority items that provide immediate value, then expanding to more comprehensive tune file integration.

