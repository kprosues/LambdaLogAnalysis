# ECU Tune File Model - Subaru WRX STi EJ207 Engine
## Updated Analysis - Latest Schema (v1.6.33.2)

## Overview
These ECU tune files are JSON-formatted calibration files for a JDM Subaru WRX STi EJ207 engine. The files contain a comprehensive set of maps (tables) that control engine operation across all operating conditions.

**File Versions Analyzed:**
- `AF041_base.tune`: Version 1.6.33.2 (Latest Schema)
- `Keith Proseus_1999JDMSTI_DW740_VF28_21builtStroker_v3.tune`: Version 1.6.32.1
- `Keith Proseus_1999JDMSTI_DW740_VF28_21builtStroker_v7_keith_edit.tune`: Version 1.6.36.2

## File Structure
- **Metadata**: `.cal_id`, `.car_id`, `.meta`, `.rom_id`, `.version`
- **Maps Array**: Contains all tuning tables and parameters organized by function

**Total Maps in Latest Schema**: 157 unique map/parameter IDs

---

## Data Sections and Table Relationships

### 1. BAROMETRIC PRESSURE CALIBRATION
**Purpose**: Compensate for altitude/atmospheric pressure variations

**Related Tables:**
- `baro_offset` (kPa) - Barometric pressure sensor offset
- `baro_slope` (kPa) - Barometric pressure sensor slope

**Usage**: These calibrate the barometric pressure sensor. Used by boost control, fuel delivery, and other altitude-compensated systems.

**Values**:
- `baro_offset`: -55.1 kPa
- `baro_slope`: 67.0 kPa

---

### 2. SPARK/IGNITION TIMING
**Purpose**: Control ignition timing advance/retard based on engine conditions

#### Base Spark Tables:
- `base_spark_aet` (°) - Base spark timing for AET mode (16x16: RPM x Load)
- `base_spark_at` (°) - Base spark timing for Automatic Transmission (16x16: RPM x Load)
- `base_spark_mt` (°) - Base spark timing for Manual Transmission (16x16: RPM x Load)

**Note**: `base_spark_b` tables (if present) are **not used** and should not be included in final spark calculations.

**Indexes:**
- `base_spark_rpm_index` (rpm) - RPM breakpoints: 800, 1200, 1600, 2000, 2400, 2800, 3200, 3600, 4000, 4400, 4800, 5200, 5600, 6000, 6400, 6800 (16 points)
- `base_spark_map_index` (g/rev) - Load breakpoints: 0.13, 0.27, 0.40, 0.54, 0.67, 0.81, 0.94, 1.08, 1.21, 1.35, 1.48, 1.62, 1.75, 1.89, 2.02, 2.16 (16 points)

**Compensations:**
- `base_spark_coolant` (°) - Coolant temperature compensation for base spark (16 values, indexed by ECT)
- `closed_throttle_spark` (°BTDC) - Spark timing when throttle is closed (16 values, indexed by RPM)
- `closed_throttle_spark_coolant_comp` (°) - Coolant compensation for closed throttle spark (16 values)
- `closed_throttle_spark_vss_max` (km/h) - Maximum vehicle speed for closed throttle spark (single value: 60 km/h)

#### Learned/Adaptive Spark:
- `learned_spark_at` (°) - Learned spark correction for AT (16x16: RPM x Load)
- `learned_spark_mt` (°) - Learned spark correction for MT (16x16: RPM x Load)
- `learning_enable` - Enable/disable spark learning (0 or 1)

**Note**: `learned_spark_b` tables (if present) are **not used** and should not be included in final spark calculations.

**Fine Learning:**
- `spark_fine_learn_load` (g/rev) - Load breakpoints: 0.63, 0.76, 0.99, 1.21, 1.44, 1.62, 1.84, 2.02 (8 points)
- `spark_fine_learn_rpm` (rpm) - RPM breakpoints: 600, 1200, 2000, 2700, 3900, 5000, 5600, 6200 (8 points)

#### Charge Temperature Compensation:
- `spark_charge_temp` (°) - Spark advance based on charge temperature (16 values, indexed by RPM)
- `spark_charge_temp_map_min` (kPa) - Minimum MAP for charge temp compensation (272.0 kPa)
- `spark_charge_temp_rpm_min` (rpm) - Minimum RPM for charge temp compensation (12750 rpm)

**Status**: **Effectively disabled** - Due to the configured threshold values (272 kPa MAP minimum, 12750 rpm RPM minimum), charge temperature compensation for ignition timing is not active. These threshold values are set beyond normal operating conditions, effectively disabling the feature.

#### Cylinder-Specific Spark:
- `spark_cyl` (°) - Per-cylinder spark adjustment (4x4 table: cylinder x condition)
- `spark_cyl_enable` - Enable cylinder-specific spark (0 or 1)
- `spark_cyl_enable_at` - Enable for AT (0 or 1)
- `spark_cyl_rpm` (rpm) - RPM breakpoints for cylinder spark (2x2 table: 12750, 12750)
- `spark_cyl_throttle` (%) - Throttle breakpoints for cylinder spark (2 values: 0.78, 0.39)

#### Safety Limits:
- `spark_min` (°BTDC) - Minimum spark advance (2 values: 0.0, 0.0)
- `spark_min_rpm` (rpm) - RPM threshold for minimum spark (1000 rpm)
- `rev_limit_spark` (°) - Spark retard when hitting rev limit (-6.0°)

**Relationships**: Base spark tables are indexed by RPM and load (g/rev). Only `base_spark_at`, `base_spark_mt`, and `base_spark_aet` are used - `base_spark_b` tables are not used. Compensations are applied additively. Only `learned_spark_at` and `learned_spark_mt` are used - `learned_spark_b` tables are not used. Learned spark values adjust the base spark based on knock feedback. The IAM (Ignition Advance Multiplier) is applied to learned spark corrections using the formula: `base_spark + learned_spark * (IAM/100)`.

---

### 3. KNOCK DETECTION AND RETARD
**Purpose**: Protect engine from detonation/pre-ignition

**Related Tables:**
- `knock_sensitivity` - Knock sensor sensitivity table (2x16: sensor x RPM)
  - RPM indexed (same as base spark RPM index)
  - Values typically range from 12-35 (arbitrary units)
- `knock_sensitivity_low_load` (g/rev) - Low load threshold (0.81 g/rev)
- `knock_sensitivity_low_load_factor` (%) - Sensitivity multiplier at low load (196.9%)
- `knock_sampling_start` (°ATDC) - Start of knock sampling window (20.0°)
- `knock_sampling_duration` (°) - Duration of knock sampling window (30.0°)
- `knock_retard_attack` (°) - Rate of spark retard when knock detected (-1.0°)
- `knock_retard_decay` (°) - Rate of spark advance recovery after knock (0.2°)
- `knock_retard_max` (°) - Maximum spark retard (-8.0°)
- `knock_rpm_min` (rpm) - Minimum RPM for knock detection (1000, 975 rpm - two values)
- `knock_average_tolerance` (%) - Tolerance for knock averaging (2x4 table: 2.0, 2.0, 2.0, 2.0)
- `knock_sensitivity_logging_rate` - Data logging rate for knock sensor (128)

**Relationships**: Knock detection feeds back into spark timing. When knock is detected, spark is retarded based on `knock_retard_attack` up to `knock_retard_max`.

---

### 4. FUEL DELIVERY
**Purpose**: Control fuel injection quantity and timing

#### Base Fuel Tables:
- `fuel_base` (%) - Base fuel correction table (16x16: RPM x Load)
  - Indexed by same RPM and load indexes as spark tables
  - Values are percentage corrections (typically 100% = no correction)
- `fuel_base_traction` (%) - Fuel correction during traction control events (16x16: RPM x Load)
  - **Note**: Secondary to `vdc_fuel_cut` (VDC fuel cut takes priority when VDC is active)
  - **Note**: VDC is not applicable for this application, so this table may not be used

#### Temperature Compensations:
- `fuel_ect` (%) - Engine coolant temperature fuel compensation (16 values, indexed by ECT)
  - Range: 42.2% to 2.3% (richer when cold)
- `fuel_ect_rpm` (rpm) - RPM breakpoints for ECT compensation (16 values: 1100 to 500 rpm)

#### Startup/Enrichment:
- `fuel_startup` (%) - Fuel enrichment during engine startup (16 values, indexed by ECT)
  - Range: 106.2% to 10.9% (richer when colder)
- `fuel_startup_closed_throttle` (%) - Startup enrichment when throttle closed (37.5%)
- `fuel_startup_decay` (%) - Rate of startup enrichment decay (3 values: 2.44, 2.69, 1.46)
- `fuel_startup_decay_ect` (°C) - ECT breakpoints for startup decay (-5, 55°C)

#### Acceleration Enrichment:
- `fuel_accel_enrich` (%) - Fuel enrichment during throttle tip-in (8x8: RPM x Rate of change)
  - Most values are 0.0, with 398.4% at high rate of change
- `fuel_accel_enrich_decay` (%) - Decay rate for acceleration enrichment (2x8 table: all 0.0)
- `fuel_accel_enrich_rpm_comp` (%) - RPM compensation for accel enrichment (16 values, all 100.0%)
- `fuel_accel_load_comp` (%) - Load compensation for accel enrichment (16 values, all 100.0%)

#### Injector Calibration:
- `inj_pw_cranking` (ms) - Injector pulsewidth during engine cranking (3x16: ECT x RPM)
  - Range: 39.48 ms (cold, low RPM) to 3.33 ms (warm, high RPM)
- `inj_pw_cranking_baro_factor` (%) - Barometric pressure compensation for cranking fuel (16 values: -47.7% to 0.0%)
- `inj_pw_cranking_rpm_factor` (%) - RPM compensation for cranking fuel (3x16 table)
- `inj_pw_cranking_rpm_factor_b` (%) - Alternative RPM compensation (3x16 table)
- `inj_pw_cranking_rpm_factor_thresh` (°C) - ECT threshold for switching compensation (-5, 55°C)
- `inj_pw_cranking_throttle_factor` (%) - Throttle compensation for cranking (16 values: 0.0 to 50.0%)
- `inj_latency_offset` (ms) - Injector opening delay offset (2.03 ms)
- `inj_latency_slope` (ms) - Injector opening delay voltage dependency (0.11 ms)

**Relationships**: Base fuel table provides foundation. All compensations are applied multiplicatively or additively. Startup enrichment decays as engine warms up.

---

### 5. BOOST CONTROL
**Purpose**: Control turbocharger boost pressure

#### Target Boost:
- `boost_target` (kPa) - Target boost pressure table (8x8: RPM x TPS)
  - Indexed by `boost_target_rpm_index` and `boost_target_tps_index`
  - Range: 60.8 kPa (low RPM/TPS) to 208.0 kPa (high RPM/TPS)
- `boost_target_rpm_index` (rpm) - RPM breakpoints: 0, 2800, 2900, 3000, 3100, 3300, 5400, 6200 (8 points)
- `boost_target_tps_index` (%) - TPS breakpoints: 0.00, 18.75, 21.88, 28.12, 34.38, 43.75, 53.12, 62.50 (8 points)
- `boost_target_update_interval` (ms) - Update rate for boost target (120 ms)

#### Compensations:
- `boost_target_baro_comp` (%) - Barometric pressure compensation for boost target (16 values)
  - Base file: -44.5% to 0.0% (active compensation)
  - Tuned files: All 0.0% (compensation effectively disabled - all zero values signify disabled)
  - **Zero values = compensation disabled**
- `boost_target_iat_comp` (%) - Intake air temperature compensation (8x8 table, all 0.0% in base)
  - **All 0.0% values = compensation effectively disabled**
- `boost_target_iat_index` (°C) - IAT breakpoints: -20, 0, 20, 40, 60, 80, 100, 120 (8 points)

#### Limits:
- `boost_limit` (kPa) - Maximum allowed boost pressure (16 values, indexed by RPM: 141.9 to 234.7 kPa)
- `boost_error_index` (kPa) - **Shared index/breakpoints for overboost and underboost step tables** (4 values: 20.3, 11.7, 5.3, 2.1)
  - These kPa values represent boost error magnitude thresholds
  - Used to index `wg_overboost_step`, `wg_overboost_step_transition`, `wg_underboost_step`, and `wg_underboost_step_transition`
  - Allows all four step tables to be indexed on the same boost error values

#### Configuration:
- `boost_iat_enable_at` - Enable IAT compensation for AT (1 = enabled)
- `boost_iat_enable_mt` - Enable IAT compensation for MT (1 = enabled)
- `boost_prop_enable` - Enable proportional boost control (0 = disabled)
- `boost_doubler` - Boost doubler feature enable (0 = disabled)

**Relationships**: Boost target is the desired pressure. Wastegate control (see below) adjusts to achieve target. Limits prevent overboost.

---

### 6. WASTEGATE CONTROL
**Purpose**: Control wastegate duty cycle to achieve boost targets

**Related Tables:**
- `wastegate_enable` - Master enable for wastegate control (1 = enabled)
- `wg_base` (%) - Base wastegate duty cycle table (8x8: RPM x TPS)
  - Range: 0.0% (closed) to 80.5% (open)
- `wg_max` (%) - Maximum wastegate duty cycle table (8x8: RPM x TPS)
  - Range: 0.0% to 90.6%
- `wg_rpm_index` (rpm) - RPM breakpoints (same as boost_target_rpm_index)
- `wg_tps_index` (%) - TPS breakpoints (same as boost_target_tps_index)

#### Compensations:
- `wg_max_baro_comp` (%) - Barometric pressure compensation for max duty (16 values: 18.8% to 0.0%)
- `wg_max_iat_comp` (%) - Intake air temperature compensation for max duty (16 values: -10.2% to 1.6%)

#### Control Parameters:
- `wg_freq` (Hz) - Wastegate PWM frequency (14.46 Hz)
- `wg_update_interval` (ms) - Update rate for wastegate control (120 ms)
- `wg_overboost_step` (%) - Duty reduction steps when overboost detected (4 values: 3.1, 1.6, 0.8, 0.4)
  - **Indexed by `boost_error_index`**: Each value corresponds to a boost error threshold
- `wg_overboost_step_transition` (%) - Transition steps for overboost (4 values: 6.2, 3.1, 1.6, 0.8)
  - **Indexed by `boost_error_index`**
- `wg_underboost_step` (%) - Duty increase steps when underboost detected (4 values: 3.1, 1.6, 0.8, 0.4)
  - **Indexed by `boost_error_index`**: Each value corresponds to a boost error threshold
- `wg_underboost_step_transition` (%) - Transition steps for underboost (4 values: 6.2, 3.1, 1.6, 0.8)
  - **Indexed by `boost_error_index`**
- `wg_integral_limit` (%) - Integral term limit for PID control (0.0%)
- `wg_secondary_enable` - Enable secondary wastegate (0 = disabled)

**Boost Error Control**: When actual boost deviates from target boost, the error magnitude (in kPa) is used to look up the appropriate adjustment step from these tables. The `boost_error_index` provides shared breakpoints (20.3, 11.7, 5.3, 2.1 kPa) so all four step tables use the same error thresholds. Larger errors result in larger duty cycle adjustments.

**Relationships**: Wastegate control is a closed-loop system that adjusts duty cycle to achieve `boost_target` while respecting `boost_limit`.

---

### 7. MASS AIRFLOW (MAF) SENSOR
**Purpose**: Calibrate and process MAF sensor signals

**Related Tables:**
- `maf_scale` (g/s) - MAF sensor voltage-to-flow calibration (64-point lookup table: 0-250 g/s range)
  - Values: 0.00 to 250.00 g/s (64 points total)
- `maf_bias` (g/s) - MAF sensor offset/bias (16.56 g/s)
- `maf_limit` (g/s) - Maximum MAF reading limit (250.00 g/s)
- `maf_delete` - Enable/disable MAF (0 = MAF enabled, likely for speed-density mode)

**Relationships**: MAF reading is used to calculate engine load (g/rev) which indexes many fuel and spark tables.

---

### 8. MANIFOLD ABSOLUTE PRESSURE (MAP) SENSOR
**Purpose**: Calibrate MAP sensor for speed-density operation

**Related Tables:**
- `map_offset` (kPa) - MAP sensor offset (-55.2 kPa)
- `map_slope` (kPa) - MAP sensor slope (67.0 kPa)
- `map_filter` (%) - MAP signal filtering (99.61%)
- `map_rpm_min` (rpm) - Minimum RPM for MAP usage (600 rpm)
- `map_ad0_enable` - Enable MAP on AD0 channel (0 = disabled)

**Relationships**: Used for speed-density fuel calculation when MAF is disabled or as backup. Also used for boost control.

---

### 9. INTAKE AIR TEMPERATURE (IAT) SENSOR
**Purpose**: Calibrate IAT sensor and provide temperature compensation

**Related Tables:**
- `iat_scale` (°C) - IAT sensor calibration (32-point lookup table: 205°C to -50°C)
  - Values: 205, 180, 142, 122, 108, 98, 90, 83, 77, 71, 66, 62, 57, 53, 49, 45, 42, 38, 35, 31, 27, 24, 20, 16, 12, 7, 0, -4, -11, -23, -38, -50
- `iat_ad0_enable` - Enable IAT on AD0 channel (0 = disabled)
- `iat_comp_ratio` (%) - IAT compensation for fuel (8 values: all 0.0%)
- `iat_comp_ratio_index` (g/s) - Airflow breakpoints for IAT compensation (8 values: 0.00 to 304.64 g/s)

**Relationships**: IAT affects boost control, fuel delivery, and spark timing through various compensation tables.

---

### 10. ENGINE COOLANT TEMPERATURE (ECT) SENSOR
**Purpose**: Calibrate ECT sensor

**Related Tables:**
- `ect_scale` (°C) - ECT sensor calibration (32-point lookup table: 205°C to -50°C)
  - Values: 205, 180, 142, 122, 108, 98, 90, 83, 77, 71, 66, 62, 57, 53, 49, 45, 42, 38, 35, 31, 27, 24, 20, 15, 11, 6, 1, -6, -14, -24, -44, -50

**Relationships**: ECT affects fuel enrichment, spark timing, idle control, and various temperature-dependent functions.

---

### 11. IDLE AIR CONTROL
**Purpose**: Maintain stable idle RPM

#### Target RPM:
- `idle_target_at` (rpm) - Idle target RPM for AT (4x16: AC state x ECT)
  - Range: 750-1700 rpm depending on AC and ECT
- `idle_target_mt` (rpm) - Idle target RPM for MT (4x16: AC state x ECT)
  - Range: 750-1700 rpm depending on AC and ECT
- `idle_target_min_ac_at` (rpm) - Minimum idle with AC on (AT) (2 values: 800, 0)
- `idle_target_min_ac_mt` (rpm) - Minimum idle with AC on (MT) (800 rpm)
- `idle_target_min_acc_at` (rpm) - Minimum idle during acceleration (AT) (2 values: 0, 0)
- `idle_target_min_acc_mt` (rpm) - Minimum idle during acceleration (MT) (0 rpm)
- `idle_target_min_steer` (rpm) - Minimum idle during steering assist (2 values: 800, 0)

#### Air Control:
- `idle_air_base_at` (%) - Base idle air valve duty for AT (5x16: gear x ECT)
  - Range: 9.8% to 100.0%
- `idle_air_base_mt` (%) - Base idle air valve duty for MT (5x16: gear x ECT)
  - Range: 11.7% to 100.0%
- `idle_air_rpm_at` (%) - RPM-based idle air adjustment for AT (16 values: 0.0% to 37.5%)
- `idle_air_rpm_mt` (%) - RPM-based idle air adjustment for MT (16 values: 0.0% to 37.5%)
- `idle_air_throttle_at` (%) - Throttle-based idle air adjustment for AT (16 values: 0.0% to 12.2%)
- `idle_air_throttle_mt` (%) - Throttle-based idle air adjustment for MT (16 values: 0.0% to 12.2%)
- `idle_air_startup_at` (%) - Startup idle air for AT (16 values: 9.0% to 32.8%)
- `idle_air_startup_mt` (%) - Startup idle air for MT (16 values: 9.0% to 25.8%)
- `idle_air_rad_fan` (%) - Idle air adjustment when radiator fan runs (0.8%)

#### Control Steps:
- `idle_air_step_overspeed` (%) - Correction steps when RPM too high (4 values: 0.00, 0.05, 0.10, 0.20)
- `idle_air_step_overspeed_ac` (%) - Correction steps with AC on (4 values: 0.00, 0.05, 0.10, 0.20)
- `idle_air_step_underspeed` (%) - Correction steps when RPM too low (3 values: 0.00, 0.05, 0.07)
- `idle_air_step_underspeed_ac` (%) - Correction steps with AC on (3 values: 0.00, 0.05, 0.07)

**Relationships**: Idle control uses PID-style control to adjust idle air valve duty cycle to achieve target RPM based on ECT, AC status, and other conditions.

---

### 12. POWER ENRICHMENT (PE) / LAMBDA TARGETS
**Purpose**: Control air-fuel ratio under power conditions (open-loop fueling mode)

**Related Tables:**
- `pe_initial` (λ) - Initial power enrichment lambda target (16x16: RPM x Load)
  - Range: 0.921 to 1.000 (richer mixture under power)
  - Used when Power Mode is first entered (before blend delay elapses)
- `pe_final` (λ) - Final power enrichment lambda target (16x16: RPM x Load)
  - Range: 0.921 to 1.000
  - **Currently not used** - Reserved for future map switching functionality
- `pe_safe` (λ) - Safe power enrichment lambda target (16x16: RPM x Load)
  - Range: 0.831 to 1.000 (richer than initial for safety)
  - **Active Usage**: Target fuel ratio used after Power Mode is entered, Blend Delay has elapsed, and IAM is below the safe mode threshold
  - When active, operates in open-loop fueling mode (short-term fuel trim disabled)
  - Long-term fuel trim learned corrections are still applied
  - **Note**: The IAM threshold value that triggers safe mode is not found in the tune file tables - it may be hardcoded in the ECU firmware
- `pe_rpm_index` (rpm) - RPM breakpoints: 800, 1200, 1600, 2000, 2400, 2800, 3200, 3600, 4000, 4400, 4800, 5200, 5600, 6000, 6400, 6800 (same as base spark)
- `pe_load_index` (g/rev) - Load breakpoints: 0.13, 0.27, 0.40, 0.54, 0.67, 0.81, 0.94, 1.08, 1.21, 1.35, 1.48, 1.62, 1.75, 1.89, 2.02, 2.16 (same as base spark)
- `pe_enable_load` (g/rev) - Minimum load to enable PE (16 values: 11.45 to 0.00 g/rev)
- `pe_enable_tps` (%) - Minimum TPS to enable PE (16 values: 99.61% to 0.00%)
- `pe_delay` - Delay counters before PE activates (2x4 table: 1, 1, 1, 2)
- `pe_delay_index` - Breakpoints for PE delay (4 values: 1, 600, 3000, 6000)

**Power Mode Operation Flow:**
1. PE mode activates when load and TPS thresholds are exceeded (`pe_enable_load`, `pe_enable_tps`)
2. Initial blend period: `pe_initial` lambda target is used during blend delay
3. After blend delay elapses and IAM < safe threshold: `pe_safe` lambda target is used
4. Power mode operates in **open-loop** (STFT disabled) but maintains LTFT corrections
5. `pe_final` is reserved for future map switching functionality (not currently used)

**Relationships**: PE provides richer mixture (lower lambda) under high load/boost conditions. The system transitions from `pe_initial` to `pe_safe` based on blend delay and IAM threshold. Long-term fuel trim learned values are maintained during power mode operation.

---

### 13. VOLUMETRIC EFFICIENCY (VE) TABLE
**Purpose**: Define engine volumetric efficiency for speed-density fuel calculation

**Related Tables:**
- `ve` (%) - Volumetric efficiency table (16x16: RPM x MAP)
  - All values are 0.00% in base file (VE table not populated - MAF mode)
- `ve_map_index` (kPa) - MAP breakpoints: 0.0, 36.3, 72.5, 108.8, 145.1, 181.3, 217.6, 253.9, 290.1, 326.4, 362.7, 398.9, 435.2, 471.5, 507.7, 544.0 (16 points)
- `ve_baro_comp` (%) - Barometric pressure compensation for VE (16 values: all -100.0%)
  - **-100.0% = "not used" marker** (compensation disabled)
- `ve_throttle_comp` (%) - Throttle position compensation for VE (16 values: all -100.0%)
  - **-100.0% = "not used" marker** (compensation disabled)

**Relationships**: Used for speed-density fuel calculation. Combined with MAP, RPM, and IAT to calculate airflow when MAF is unavailable.

---

### 14. SPEED-DENSITY BLENDING
**Purpose**: Blend between MAF and speed-density fuel calculation

**⚠️ NOTE: Can be ignored when using MAF-based airflow calculations (SD mode not used)**

**Related Tables:**
- `sd_blend_ratio` (%) - Blend ratio between MAF and SD (8 values: all 0.0% - MAF only)
  - **Algorithm**: Not fully understood, but appears to be a ratio of MAF-based fueling and SD-based fueling tables
  - Values indexed by `sd_blend_ratio_index` (airflow in g/s)
  - 0% = MAF only, 100% = SD only, values in between = blended calculation
- `sd_blend_ratio_index` (g/s) - Airflow breakpoints for blending (8 values: 0.00 to 304.64 g/s)

**Relationships**: Allows smooth transition between MAF-based and speed-density fuel calculation. The blend ratio determines the proportion of each calculation method used at different airflow levels. **Not used when operating in MAF-only mode.**

---

### 15. COIL/IGNITION SYSTEM
**Purpose**: Control ignition coil dwell time

**Related Tables:**
- `coil_dwell_rpm` (%) - Coil dwell multiplier by RPM (16 values: 31.2% to 100.0%)
- `coil_dwell_rpm_index` (rpm) - RPM breakpoints: 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000, 6500, 7000, 7500, 8000 (16 points)
- `coil_dwell_voltage` (ms) - Base dwell time by voltage (8 values: 9.98 to 5.76 ms)
- `coil_dwell_voltage_index` (V) - Voltage breakpoints: 4.00, 6.00, 8.00, 10.00, 12.00, 14.00, 16.00, 18.00 (8 points)
- `cop_enable` - Enable coil-on-plug (0 = disabled)
- `cop_enable_at` - Enable COP for AT (0 = disabled)

**Relationships**: Dwell time ensures proper coil charging. Varies with RPM and battery voltage.

---

### 16. DECELERATION FUEL CUT-OFF (DFCO)
**Purpose**: Cut fuel during deceleration for emissions and fuel economy

**Related Tables:**
- `dfco_enable` - Master enable for DFCO (1 = enabled)
- `dfco_enable_rpm_a` (rpm) - RPM thresholds to enable DFCO (2x16: gear x ECT)
  - Range: 2100 to 3700 rpm
- `dfco_enable_rpm_b` (rpm) - Alternative RPM thresholds (2x16: gear x ECT)
  - Range: 1300 to 3400 rpm
- `dfco_enable_rpm_neutral` (rpm) - RPM thresholds in neutral (3x2: condition x threshold)
  - Values: 5600, 5100; 4000, 3500; 2600, 1900
- `dfco_disable_rpm` (rpm) - RPM thresholds to disable DFCO (2x16: gear x ECT)
  - Range: 1100 to 2900 rpm
- `dfco_disable_rpm_neutral` (rpm) - Disable thresholds in neutral (2 values: 1500, 1250)
- `dfco_delay` - Delay counters before DFCO activates (2x4 table: 4, 4, 4, 0)
- `dfco_delay_rpm` (rpm) - RPM breakpoints for delay (3 values: 1600, 2400, 4000)
- `dfco_delay_neutral` - Delay in neutral (3 values: 1500, 3500, 15000)
- `dfco_vss_threshold` (km/h) - Vehicle speed thresholds for DFCO (3 values: 24, 22, 16 km/h)

**Relationships**: DFCO activates when throttle is closed above certain RPM/load conditions. Prevents engine braking and reduces emissions.

---

### 17. REV LIMITING
**Purpose**: Prevent engine overspeed

**Related Tables:**
- `rev_limit` (rpm) - Rev limit by gear (5 values: 6000, 7800, 8000, 8000, 8117)
- `rev_limit_spark` (°) - Spark retard at rev limit (-6.0°)

**Relationships**: When RPM exceeds limit, spark is retarded to reduce power and prevent further acceleration.

---

### 18. SPEED LIMITING
**Purpose**: Vehicle speed limiting

**Related Tables:**
- `speed_limit` (km/h) - Speed limit by gear (5 values: 180, 182, 184, 186, 188)
- `speed_limit_at` (km/h) - Speed limit for AT (5 values: 180, 182, 184, 186, 188)
- `speed_limit_boost` (km/h) - Speed limit during boost conditions (3 values: 236, 230, 220)
- `vss_failsafe` (km/h) - Vehicle speed sensor failsafe threshold (10 km/h)

**Relationships**: Limits maximum vehicle speed through fuel cut or throttle reduction.

---

### 19. LAUNCH CONTROL
**Purpose**: Rev limiting for launch control/launch mode

**Related Tables:**
- `launch_enable` - Enable launch control (0 = disabled)
- `launch_rev_limit` (rpm) - Rev limit during launch (4 values: 7800, 8000, 8000, 8117)
- `launch_speed` (km/h) - Maximum speed for launch mode (0 km/h)

**Relationships**: Provides rev limiting when vehicle is stationary or at low speed for drag racing launches.

---

### 20. TRACTION CONTROL (VDC)
**Purpose**: Vehicle Dynamic Control (VDC) - Also known as stability control

**⚠️ NOTE: VDC is not applicable for this application and can be ignored**

**Related Tables:**
- `vdc_enable_at` - Enable VDC for AT (0 = disabled)
- `vdc_enable_mt` - Enable VDC for MT (0 = disabled)
- `vdc_in_mode_at` - VDC input mode for AT (0)
- `vdc_in_mode_mt` - VDC input mode for MT (0)
- `vdc_out_enable_at` - VDC output enable for AT (0)
- `vdc_out_enable_mt` - VDC output enable for MT (0)
- `vdc_fuel_cut` (%) - Fuel cut amount during VDC traction/stability events (16x16: RPM x Torque)
  - Range: 37.5% to 100.0% (higher = more fuel cut)
  - **Takes priority over `fuel_base_traction` when VDC is active**
- `vdc_torque_index` (N·m) - Torque breakpoints (16 values: 0.0 to 240.0 N·m)
- `vdc_torque_ratio_index` - Torque ratio breakpoints (16 values: 0.000 to 99.609)
- `fuel_base_traction` (%) - Fuel adjustment during traction control (16x16: all 100.0% in base)
  - **Secondary to `vdc_fuel_cut`** (VDC fuel cut takes priority when VDC is active)

**Priority Relationship**: When VDC is active and wheel slip/instability is detected, `vdc_fuel_cut` takes priority over `fuel_base_traction`. VDC reduces engine power through fuel cut and/or spark retard to maintain vehicle stability.

---

### 21. LOAD MANAGEMENT
**Purpose**: Define maximum engine load limits

**Related Tables:**
- `load_max` (g/rev) - Maximum allowed load by RPM (16 values)
  - All values: 1.28 to 2.54 g/rev (increases with RPM)
  - Indexed by same RPM index as base spark/fuel tables

**Enforcement**: **Fuel cut is triggered when load exceeds `load_max`**. This protects engine components from excessive load.

**Relationships**: Used to limit engine load to protect components. When calculated load (from MAF reading) exceeds the limit for the current RPM, fuel cut is activated to reduce engine power and protect the engine.

---

### 22. IGNITION ADVANCE MULTIPLIER (IAM)
**Purpose**: Overall spark timing adjustment based on knock history

**Related Tables:**
- `iam_init` - Initial IAM value (0.50 = 50%)

**Spark Calculation Formula:**
The IAM is applied to learned spark corrections using the following formula:
```
Final Spark = base_spark + learned_spark * (IAM/100)
```

Where:
- `base_spark` is the base spark timing from the spark tables (AT/MT, RPM x Load)
- `learned_spark` is the learned spark correction value (from `learned_spark_at` or `learned_spark_mt`)
- `IAM` is the Ignition Advance Multiplier value (0-100%, typically starts at 50%)

**Relationships**: IAM starts low (typically 50%) and increases as engine proves knock-free. The IAM scales the learned spark correction - when IAM is 100%, full learned spark is applied; when IAM is 0%, no learned spark correction is applied. If knock detected, IAM decreases, reducing the impact of learned spark corrections.

---

### 23. WIDEBAND OXYGEN SENSOR
**Purpose**: Calibrate wideband O2 sensor for closed-loop fuel control

**Related Tables:**
- `wideband_enable` - Enable wideband sensor (0 = disabled)
- `wideband_cal` (λ) - Wideband sensor voltage-to-lambda calibration (16-point: 0.680-1.367 λ)
  - Values: 0.680, 0.727, 0.773, 0.820, 0.859, 0.906, 0.953, 1.000, 1.047, 1.094, 1.141, 1.188, 1.227, 1.273, 1.320, 1.367
- `wideband_cal_index` (V) - Voltage breakpoints: 0.00, 0.34, 0.66, 1.00, 1.34, 1.66, 2.00, 2.34, 2.66, 3.00, 3.34, 3.66, 4.00, 4.34, 4.66, 5.00 (16 points)
- `wideband_filter` (%) - Signal filtering for wideband (100.0%)

**Relationships**: Provides accurate lambda measurement for closed-loop fuel control and logging.

---

### 24. FAN CONTROL
**Purpose**: Control radiator/cooling fan operation

**Related Tables:**
- `fan_temp` (°C) - Fan on/off temperatures (2x2: low/high speed, on/off)
  - Values: 92, 96; 89, 90 (low speed on/off, high speed on/off)

**Relationships**: Controls cooling fan based on ECT to maintain proper engine temperature.

---

### 25. FUEL PUMP CONTROL
**Purpose**: Control fuel pump duty cycle

**Related Tables:**
- `fp_duty_pw` (%) - Fuel pump duty cycle (2x2: high/low speed, on/off)
  - Values: 10.0, 9.7; 5.1, 4.8

**Relationships**: Adjusts fuel pump speed based on engine demand. Reduces noise and power consumption at idle.

---

### 26. GEAR DETECTION
**Purpose**: Detect current transmission gear

**Related Tables:**
- `gear_ratios_at` (:1) - Gear ratios for automatic transmission (4 values: inf, 11.075, 7.166, 5.184)
- `gear_ratios_mt` (:1) - Gear ratios for manual transmission (5 values: inf, 11.075, 7.166, 5.184, 3.909)

**Relationships**: Used with vehicle speed and RPM to determine current gear. Affects boost control, rev limits, and other gear-dependent functions.

---

### 27. ENGINE DISPLACEMENT
**Purpose**: Define engine displacement for calculations

**Related Tables:**
- `engine_disp` (cc) - Engine displacement (1998 cc)

**Relationships**: Used for load calculations and various engine calculations.

---

### 28. MISCELLANEOUS FEATURES
**Purpose**: Various enable/disable flags and options

**Related Tables:**
- `immo_enable` - Immobilizer enable (0 = disabled)
- `immo_enable_at` - Immobilizer enable for AT (0)
- `immo_option` - Immobilizer options (0)
- `immo_option_at` - Immobilizer options for AT (0)
- `stft_enable` - Short-term fuel trim enable (1 = enabled)
- `fpc_enable` - Fuel pump control enable (0 = disabled)
- `fpc_enable_at` - Fuel pump control enable for AT (0)
- `cpc_enable_at` - Closed loop control enable for AT (1 = enabled)
- `cpc_enable_mt` - Closed loop control enable for MT (1 = enabled)

---

## Unknown/Uncertain Tables

The following tables need clarification on their exact function:

1. ~~**`boost_error_index`**: How does this relate to PID control tuning for boost? What are the error thresholds used for?~~ **Clarified**: Shared index/breakpoints for overboost and underboost step tables.
2. ~~**`fuel_base_traction` vs `vdc_fuel_cut`**: What is the relationship and priority between these two traction control fuel adjustments?~~ **Clarified**: VDC fuel cut takes priority over fuel_base_traction. VDC is not applicable for this application.
3. ~~**`sd_blend_ratio`**: What is the exact blending algorithm between MAF and speed-density calculations?~~ **Partially clarified**: Appears to be a ratio of MAF-based fueling and SD-based fueling tables. Algorithm not fully understood. Can be ignored - SD mode not used.
4. ~~**`load_max`**: How is this limit enforced when exceeded? (fuel cut, spark retard, throttle reduction?)~~ **Clarified**: Fuel cut is triggered when load_max limit is exceeded.
5. ~~**`boost_target_baro_comp`**: The values are all negative or zero (-44.5% to 0.0%). Why would boost target decrease with altitude?~~ **Clarified**: All-zero values in this table signify that the compensation is effectively disabled. In the base file, values range from -44.5% to 0.0% (active), but in tuned files all values are 0.0% (disabled).
6. ~~**`ve_baro_comp` and `ve_throttle_comp`**: Why are all values -100.0%? Is this a "not used" marker?~~ **Clarified**: Yes, -100.0% values signify a "not used" marker, indicating these compensations are disabled.
7. ~~**`spark_charge_temp_map_min` (272 kPa) and `spark_charge_temp_rpm_min` (12750 rpm)**: These seem like "effectively disabled" values. Is this correct?~~ **Clarified**: Yes, due to the configured threshold values, ignition timing is not adjusted for charge temperature - the feature is effectively disabled.
8. **IAM safe mode threshold**: What is the IAM threshold value that triggers safe mode in PE? (Referenced in `pe_safe` but threshold value not found in tables)
   - **Research Note**: Web search indicates IAM thresholds vary by ECU calibration and are not universally defined. The threshold may be hardcoded in the ECU firmware rather than a configurable table value. Typical IAM values range from 0.0 to 1.0 (or 0% to 100%), with lower values indicating more knock activity. The specific threshold for triggering `pe_safe` is not documented in available sources.

---

## Open Questions: System Interactions and Holistic Behavior

While individual tables and flows are documented, several questions remain about how systems interact to form a complete ECU calibration:

**Research Note**: Internet research was conducted for these questions, but verifiable answers from multiple consistent sources were not found. Much of the detailed ECU operation logic appears to be proprietary and not publicly documented. The questions remain open pending additional information from official Subaru technical documentation, ECU firmware analysis, or expert consultation.

### Safety System Interactions:

1. **Priority of Simultaneous Safety Interventions**: When multiple safety systems activate simultaneously (e.g., `load_max` fuel cut, rev limit spark retard, knock retard, speed limit), what is the execution priority and order? Do they all apply simultaneously or is there a hierarchy?

2. ~~**IAM and Learned Spark Relationship**~~: **Clarified**: The IAM scales the learned spark correction using the formula: `base_spark + learned_spark * (IAM/100)`. The IAM value (0-100%) determines how much of the learned spark correction is applied. When IAM is 100%, full learned spark is applied; when IAM is lower (e.g., 50%), only a portion of the learned spark correction is applied. IAM does not directly modify the base spark table - it only affects the learned spark contribution.
   - **Remaining Question**: How does IAM recovery rate work after knock events? (What is the rate at which IAM increases back toward 100% after knock events cease?)

3. **Knock Retard vs Learned Spark**:
   - Can `knock_retard` and `learned_spark` both apply simultaneously, or does one take priority?
   - How does the system transition from immediate `knock_retard` to permanent `learned_spark` adjustments?

4. **Rev Limit Enforcement Method**: 
   - When `rev_limit` is exceeded, does `rev_limit_spark` retard occur first, followed by fuel cut if spark retard alone is insufficient?
   - Or are both applied simultaneously?

5. **Load Limit vs Rev Limit Interaction**: 
   - If both `load_max` and `rev_limit` are exceeded simultaneously, which takes precedence?
   - Does fuel cut from `load_max` occur before rev limit intervention?

### Fuel System Interactions:

6. **LTFT Application in PE Mode**: 
   - How exactly are LTFT learned corrections applied during PE (Power Enrichment) open-loop mode?
   - Are LTFT values multiplied with the PE lambda targets, or applied as an offset?
   - What happens if LTFT is negative (lean correction) - does it make PE lambda even richer, or is there a limit?

7. **Fuel Cut Priority**:
   - If multiple fuel cut conditions exist (DFCO, `load_max`, speed limit, rev limit), what is the priority order?
   - Can fuel cut conditions override PE mode, or does PE mode take priority until limits are exceeded?

8. **Accel Enrichment and PE Interaction**:
   - If throttle tip-in occurs while already in PE mode, does `fuel_accel_enrich` still apply on top of PE lambda, or is it ignored?
   - What happens during the PE blend delay period - does accel enrichment apply?

9. **Startup Fuel Enrichment and PE**:
   - Can PE mode activate during cold start conditions?
   - If yes, how do `fuel_startup` and PE lambda interact?

### Spark System Interactions:

10. **IAM Effect on All Spark Corrections**:
    - Does IAM multiply the final spark timing (after all corrections), or does it affect only the base spark table?
    - Are learned_spark, knock_retard, and other compensations affected by IAM, or are they applied after IAM multiplication?

11. **Spark Min Enforcement**:
    - How does `spark_min` interact with other spark corrections?
    - If calculated spark (base + corrections) falls below `spark_min`, is it clamped, or do safety limits (knock retard, rev limit) override `spark_min`?

12. **Closed Throttle Spark vs Decel Fuel Cut**:
    - When DFCO activates (fuel cut), does the spark system still use `closed_throttle_spark` timing?
    - Or does spark control pause during DFCO?

### Boost Control Interactions:

13. **Boost Error Handling vs Wastegate Limits**:
    - If `wg_max` or `boost_limit` is reached, does the boost error correction (overboost/underboost step tables) still attempt to adjust?
    - Or are these absolute limits that override error correction?

14. **Boost Target Compensation Calculation Order**:
    - Are IAT and barometric compensations applied to the base `boost_target` simultaneously, or sequentially?
    - If `boost_target_baro_comp` is all zeros (disabled), does the base target get used directly?

### MAF/Load Calculation:

15. **Load Calculation from MAF**:
    - What is the exact formula: Load (g/rev) = MAF (g/s) / (RPM / 60) / (number of cylinders / 2)?
    - Are there any additional compensations (temperature, pressure) applied to MAF reading before load calculation?

16. **Load Limits and Index Boundaries**:
    - If calculated load falls outside the table index range (e.g., > 2.74 g/rev in extended tunes), does the ECU extrapolate, clamp to last value, or use `load_max` enforcement?

### Idle Control Interactions:

17. **Idle vs Decel Fuel Cut**:
    - Can DFCO activate while the engine is at idle target RPM?
    - How does the idle control system interact with DFCO when transitioning from driving to stopped/idle?

18. **Idle Spark vs Closed Throttle Spark**:
    - Are `closed_throttle_spark` and idle-specific spark timings mutually exclusive, or can both apply?
    - How does the ECU determine when to use idle control vs closed throttle spark?

### PE Mode Transitions:

19. **PE Mode Entry/Exit Hysteresis**:
    - Is there hysteresis in PE mode enable conditions to prevent rapid on/off cycling?
    - What happens if load/TPS drops below thresholds during blend delay - does PE abort or continue?

20. **PE Initial vs PE Safe Transition**:
    - If IAM rises above the safe threshold after `pe_safe` has been activated, does the system revert to `pe_initial` or stay in `pe_safe`?
    - Or does it exit PE mode entirely?

### System-Wide Questions:

21. **Update Frequency and Execution Order**:
    - What is the ECU loop/update frequency for each system (fuel, spark, boost, idle)?
    - Are all systems updated synchronously, or do some run at different rates?

22. **Compensation Calculation Precision**:
    - Are compensation values (ECT, IAT, etc.) interpolated between table breakpoints, or is the nearest value used?
    - What interpolation method is used (linear, bilinear for 2D tables)?

23. **Fail-Safe Behaviors**:
    - If a sensor fails (MAF, MAP, ECT, IAT), what are the default/fallback values used?
    - Are there any documented fail-safe modes that override normal operation?

24. **Map Switching Logic** (Future Feature):
    - While `pe_final` is reserved for map switching, what other tables would be involved in map switching functionality?
    - How would the ECU determine when to switch maps?

---

## Table Index Relationships

Many tables share common indexes:

### Primary RPM Index (16 points):
Used by: `base_spark_*`, `fuel_base`, `fuel_base_traction`, `pe_initial/final/safe`, `learned_spark_*`
- Values: 800, 1200, 1600, 2000, 2400, 2800, 3200, 3600, 4000, 4400, 4800, 5200, 5600, 6000, 6400, 6800 rpm

### Boost/Wastegate RPM Index (8 points):
Used by: `boost_target`, `wg_base`, `wg_max`
- Values: 0, 2800, 2900, 3000, 3100, 3300, 5400, 6200 rpm

### Boost/Wastegate TPS Index (8 points):
Used by: `boost_target`, `wg_base`, `wg_max`
- Values: 0.00, 18.75, 21.88, 28.12, 34.38, 43.75, 53.12, 62.50 %

### Primary Load Index (g/rev) - 16 points:
Used by: `base_spark_*`, `fuel_base`, `fuel_base_traction`, `pe_initial/final/safe`, `learned_spark_*`
- Base file: 0.13, 0.27, 0.40, 0.54, 0.67, 0.81, 0.94, 1.08, 1.21, 1.35, 1.48, 1.62, 1.75, 1.89, 2.02, 2.16
- **Note**: Modified files (v3, v7) use extended range: 0.13, 0.27, 0.40, 0.54, 0.67, 0.81, 0.94, 1.08, 1.21, 1.35, 1.48, 1.75, 2.02, 2.24, 2.51, 2.74

### MAP Index (16 points):
Used by: `ve`
- Values: 0.0, 36.3, 72.5, 108.8, 145.1, 181.3, 217.6, 253.9, 290.1, 326.4, 362.7, 398.9, 435.2, 471.5, 507.7, 544.0 kPa

### ECT Index (16 points):
Used by: `idle_target_*`, `fuel_ect`, `fuel_startup`, various compensations
- Implicitly indexed by ECT sensor scale (32 points available)

### IAT Index (8 points):
Used by: `boost_target_iat_comp`
- Values: -20, 0, 20, 40, 60, 80, 100, 120 °C

---

## Inter-Table Dependencies

### 1. Fuel Calculation Flow:
```
MAF Reading → Load (g/rev) 
    ↓
fuel_base (RPM x Load) 
    ↓
× fuel_ect (ECT compensation)
× fuel_startup (if cold start)
× fuel_accel_enrich (if throttle tip-in)
    ↓
Check PE Enable Conditions (Load > pe_enable_load, TPS > pe_enable_tps)
    ↓
[If PE Enabled - Open Loop Mode]
  - pe_initial (during blend delay)
  - pe_safe (after blend delay, if IAM < safe threshold)
  - STFT disabled, LTFT still applied
    ↓
[If PE Not Enabled - Closed Loop Mode]
  - STFT + LTFT applied (if cpc_enable = 1)
    ↓
Final Injector Pulsewidth
```

### 2. Spark Calculation Flow:
```
Base Spark Table (AT/MT/AET, RPM x Load)
Note: base_spark_b tables are NOT used
    ↓
+ base_spark_coolant (ECT compensation)
+ (learned_spark_at or learned_spark_mt * (IAM/100))  [IAM-scaled learned spark correction]
Note: learned_spark_b tables are NOT used
- knock_retard (if knock detected)
+ spark_charge_temp (if enabled)
+ spark_cyl (if enabled)
    ↓
Final Spark Timing

Formula: base_spark (AT/MT/AET only) + learned_spark (AT/MT only) * (IAM/100) + other_compensations
```

### 3. Boost Control Flow:
```
boost_target (RPM x TPS)
    ↓
× (1 + boost_target_iat_comp/100) (IAT compensation)
× (1 + boost_target_baro_comp/100) (barometric compensation)
    ↓
Target Boost Pressure
    ↓
Compare with Actual Boost → Calculate Boost Error (kPa)
    ↓
[If Overboost] → Lookup wg_overboost_step using boost_error_index
[If Underboost] → Lookup wg_underboost_step using boost_error_index
    ↓
Adjust wg_base duty cycle by step amount
    ↓
Respect boost_limit and wg_max
    ↓
Final Wastegate Duty Cycle
```

### 4. Idle Control Flow:
```
idle_target (ECT x AC state)
    ↓
Compare with Current RPM
    ↓
PID Control (using step tables)
    ↓
idle_air_base (ECT x Gear)
+ idle_air_rpm (RPM compensation)
+ idle_air_throttle (TPS compensation)
+ idle_air_startup (if cold)
    ↓
Final Idle Air Valve Duty Cycle
```

---

## File Version Differences

### Schema Differences:

**Version 1.6.33.2 (AF041_base.tune - Latest Schema):**
- Standard load index range (0.13-2.16 g/rev)
- `boost_target_tps_index`: 0.00, 18.75, 21.88, 28.12, 34.38, 43.75, 53.12, 62.50
- All maps present and accounted for

**Version 1.6.32.1 (v3):**
- Extended load index range (0.13-2.74 g/rev) - different breakpoints
- Modified `boost_target_tps_index`: 0.00, 18.80, 21.90, 28.10, 34.40, 43.80, 53.10, 80.10
- Different MAF scale calibration (64 points, extended range)
- Different `load_max` values (5.00 g/rev max vs 2.54 g/rev in base)
- More aggressive boost targets, fuel, and spark values

**Version 1.6.36.2 (v7):**
- Extended load index range (0.13-2.74 g/rev) - same as v3
- Modified `boost_target_tps_index`: 0.00, 18.80, 21.90, 28.10, 34.40, 43.80, 53.10, 80.10
- Different MAF scale calibration (64 points, extended range to 280 g/s)
- Different `load_max` values (5.00 g/rev max)
- Most aggressive tune - higher boost, richer fuel, more spark advance
- Different `wideband_cal` values (0.500-1.523 λ vs 0.680-1.367 λ in base)

### Key Differences in Tuned Files:
1. **Boost Targets**: v3 and v7 have significantly higher boost targets (up to 230.4 kPa vs 208.0 kPa in base)
2. **Fuel Base**: Tuned files have richer fueling in high-load regions
3. **Spark Timing**: More aggressive spark advance in tuned files (up to 48° vs 44° in base)
4. **PE Lambda**: More aggressive enrichment (richer) in tuned files
5. **Wastegate Control**: More aggressive wastegate duty cycles in tuned files
6. **Load Limits**: Tuned files allow higher load limits (5.00 vs 2.54 g/rev)

---

## Summary

The ECU tune file contains **157 unique maps/parameters** organized into **28 functional sections**. The latest schema (v1.6.33.2) provides a comprehensive calibration framework for controlling:

- Spark timing with multiple compensations and learning
- Fuel delivery with temperature and enrichment adjustments
- Boost control with closed-loop wastegate management
- Idle control with adaptive air valve management
- Safety systems (knock detection, rev limiting, speed limiting)
- Sensor calibrations (MAF, MAP, IAT, ECT, wideband)

All tables are interconnected through shared indexes (RPM, Load, TPS, ECT, etc.) and dependencies. The tuned files (v3, v7) show modifications for performance tuning with extended load ranges, higher boost targets, and more aggressive fuel and spark values.
