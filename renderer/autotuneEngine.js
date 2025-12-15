// AutotuneEngine: analyze log data against tune fuel_base table and apply adjustments
(function() {
  // Base columns required for both modes
  const BASE_REQUIRED_COLUMNS = [
    'Engine Speed (rpm)',
    'Load (MAF) (g/rev)',
    'Air/Fuel Sensor #1 (λ)',
    'Power Mode - Fuel Ratio Target (λ)',
    'Fuel Trim - Short Term (%)',
    'Fuel Trim - Long Term (%)',
    'Throttle Position (%)'
  ];

  // Additional column required for MAF scaling mode
  const MAF_REQUIRED_COLUMN = 'Mass Air Flow Voltage (V)';

  function axisIndex(value, axis, clamp = true) {
    // Match Python axis_index implementation exactly:
    // Python: axis_index(value, axis, clamp=True)
    //   - Returns None if NaN
    //   - Returns 0 if value < axis[0] (if clamp)
    //   - Returns len-1 if value > axis[-1] (if clamp)
    //   - Otherwise: int(np.searchsorted(axis, value, side="right") - 1)
    //     then clamped to [0, len-1]
    if (!Array.isArray(axis) || axis.length === 0 || isNaN(value)) {
      return null;
    }
    if (value < axis[0]) {
      return clamp ? 0 : null;
    }
    if (value > axis[axis.length - 1]) {
      return clamp ? axis.length - 1 : null;
    }
    // np.searchsorted(axis, value, side="right") finds the insertion point
    // such that all elements to the right are >= value
    // Then subtract 1 to get the index of the last element <= value
    let insertIdx = axis.length;
    for (let i = 0; i < axis.length; i++) {
      if (axis[i] > value) {
        insertIdx = i;
        break;
      }
    }
    const idx = insertIdx - 1;
    return Math.max(0, Math.min(idx, axis.length - 1));
  }

  function clone2DArray(table) {
    return table.map(row => row.slice());
  }

  function formatFuelBaseTable(table) {
    return table.map(row => row.map(val => (isFinite(val) ? val.toFixed(1) : '0.0')).join(', '));
  }

  function ensureNumberArray(arr) {
    if (!Array.isArray(arr)) {
      return [];
    }
    return arr.map(val => {
      const num = parseFloat(val);
      return isNaN(num) ? 0 : num;
    });
  }

  // Default max MAF voltage for building the voltage axis when not specified in tune file.
  // Most automotive MAF sensors output 0-5V; 5.12V provides a small margin for sensor variance.
  // Common MAF table lengths: 64 points (Subaru), 32 points, 16 points.
  const DEFAULT_MAX_MAF_VOLTAGE = 5.0;

  function buildDefaultMafVoltageAxis(length) {
    if (!length || length < 1) {
      return [];
    }
    if (length === 1) {
      return [0];
    }
    const axis = [];
    const step = DEFAULT_MAX_MAF_VOLTAGE / (length - 1);
    for (let i = 0; i < length; i++) {
      const voltage = i * step;
      axis.push(parseFloat(voltage.toFixed(3)));
    }
    return axis;
  }

  function getMafVoltageAxis(tuneParser, expectedLength) {
    if (!tuneParser) {
      return buildDefaultMafVoltageAxis(expectedLength);
    }

    const candidateIds = [
      'maf_voltage',
      'maf_voltage_index',
      'maf_scale_voltage',
      'maf_scale_voltage_index'
    ];

    for (const id of candidateIds) {
      if (!id) continue;
      const arr = ensureNumberArray(tuneParser.getArray(id));
      if (arr.length) {
        return arr;
      }
    }

    return buildDefaultMafVoltageAxis(expectedLength);
  }

  /**
   * Calculate the "centered weight" of a data point within its bin.
   * Returns a value from 0.0 (at bin edge) to 1.0 (at bin center).
   * 
   * @param {number} value - The actual value (rpm or load)
   * @param {number} idx - The bin index
   * @param {number[]} axis - The axis array
   * @returns {number} Weight from 0.0 to 1.0
   */
  function calculateAxisWeight(value, idx, axis) {
    if (!Array.isArray(axis) || axis.length < 2 || idx === null) {
      return 1.0; // Default to full weight if axis is invalid
    }
    
    // Handle edge cases for first and last bins
    let lower, upper;
    
    if (idx === 0) {
      // First bin: center is between axis[0] and axis[1]
      lower = axis[0];
      upper = axis[1];
    } else if (idx >= axis.length - 1) {
      // Last bin: center is between axis[len-2] and axis[len-1]
      lower = axis[axis.length - 2];
      upper = axis[axis.length - 1];
    } else {
      // Normal case: bin spans axis[idx] to axis[idx+1]
      lower = axis[idx];
      upper = axis[idx + 1];
    }
    
    const binCenter = (lower + upper) / 2;
    const halfWidth = (upper - lower) / 2;
    
    if (halfWidth <= 0) {
      return 1.0; // Avoid division by zero
    }
    
    const distanceFromCenter = Math.abs(value - binCenter);
    const weight = Math.max(0.0, 1.0 - (distanceFromCenter / halfWidth));
    
    return weight;
  }

  /**
   * Calculate the combined 2D weight for a data point in the RPM/Load grid.
   * Uses multiplication of the two axis weights (bilinear weighting).
   * 
   * @param {number} rpm - RPM value
   * @param {number} load - Load value
   * @param {number} rpmIdx - RPM bin index
   * @param {number} loadIdx - Load bin index
   * @param {number[]} rpmAxis - RPM axis array
   * @param {number[]} loadAxis - Load axis array
   * @returns {number} Combined weight from 0.0 to 1.0
   */
  function calculateCellWeight(rpm, load, rpmIdx, loadIdx, rpmAxis, loadAxis) {
    const rpmWeight = calculateAxisWeight(rpm, rpmIdx, rpmAxis);
    const loadWeight = calculateAxisWeight(load, loadIdx, loadAxis);
    return rpmWeight * loadWeight;
  }

  // Valid tuning modes
  const TUNING_MODES = {
    FUEL_BASE: 'fuel_base',
    MAF_SCALE: 'maf_scale'
  };

  function analyze(options = {}) {
    const mode = options.mode === TUNING_MODES.MAF_SCALE ? TUNING_MODES.MAF_SCALE : TUNING_MODES.FUEL_BASE;
    const minSamples = Math.max(1, parseInt(options.minSamples || 5, 10));
    const changeLimit = Math.max(0, parseFloat(options.changeLimit || 5));
    const minHitWeight = Math.max(0, Math.min(1, parseFloat(options.minHitWeight || 0)));
    const additionalLogsData = options.additionalLogsData || [];

    if (!window.tuneFileParser || !window.tuneFileParser.isLoaded()) {
      return { error: 'Please load a tune file before running autotune.' };
    }

    if (!window.dataProcessor) {
      return { error: 'Please load at least one datalog before running autotune.' };
    }

    const primaryData = window.dataProcessor.getData();
    const columns = window.dataProcessor.getColumns();

    if (!Array.isArray(primaryData) || primaryData.length === 0) {
      return { error: 'No datalog data available. Load a datalog and try again.' };
    }

    if (!columns || !Array.isArray(columns)) {
      return { error: 'Unable to determine datalog columns.' };
    }

    // Combine primary data with additional logs data
    let data = [...primaryData];
    let additionalRowCount = 0;
    
    if (additionalLogsData && additionalLogsData.length > 0) {
      additionalLogsData.forEach(logEntry => {
        if (logEntry.data && Array.isArray(logEntry.data)) {
          data = data.concat(logEntry.data);
          additionalRowCount += logEntry.data.length;
        }
      });
      console.log(`Combined ${primaryData.length} primary rows + ${additionalRowCount} additional rows = ${data.length} total rows`);
    }

    // Build required columns based on mode
    const requiredColumns = [...BASE_REQUIRED_COLUMNS];
    if (mode === TUNING_MODES.MAF_SCALE) {
      requiredColumns.push(MAF_REQUIRED_COLUMN);
    }

    const missingColumns = requiredColumns.filter(col => !columns.includes(col));
    if (missingColumns.length > 0) {
      return { error: `The datalog is missing required columns: ${missingColumns.join(', ')}` };
    }

    const rpmAxis = ensureNumberArray(window.tuneFileParser.getArray('base_spark_rpm_index'));
    const loadAxis = ensureNumberArray(window.tuneFileParser.getArray('base_spark_map_index'));
    const fuelBaseTable = window.tuneFileParser.getTable('fuel_base');
    const peEnableLoad = ensureNumberArray(window.tuneFileParser.getArray('pe_enable_load'));
    const peEnableTps = ensureNumberArray(window.tuneFileParser.getArray('pe_enable_tps'));
    const mafScale = ensureNumberArray(window.tuneFileParser.getArray('maf_scale'));
    const mafVoltageAxis = getMafVoltageAxis(window.tuneFileParser, mafScale.length);

    if (!rpmAxis.length || !loadAxis.length || !fuelBaseTable) {
      return { error: 'Tune file is missing required base spark/fuel tables.' };
    }

    if (fuelBaseTable.length !== rpmAxis.length || fuelBaseTable[0]?.length !== loadAxis.length) {
      return { error: 'fuel_base table dimensions do not match RPM/Load axes.' };
    }

    if (peEnableLoad.length !== rpmAxis.length || peEnableTps.length !== rpmAxis.length) {
      return { error: 'PE enable tables do not match RPM axis length.' };
    }

    // MAF-specific validation (only for MAF mode)
    if (mode === TUNING_MODES.MAF_SCALE) {
      if (!mafScale.length) {
        return { error: 'Tune file is missing the maf_scale table.' };
      }

      if (!mafVoltageAxis.length) {
        return { error: 'Unable to determine MAF voltage axis from tune file.' };
      }

      if (mafVoltageAxis.length !== mafScale.length) {
        return { error: 'MAF voltage axis length does not match maf_scale table length.' };
      }
    }

    // Process all rows: filter valid data, classify loop state, then bin by RPM/Load
    // This matches the Python implementation logic:
    // 1. Filter rows with valid rpm, load, lambda_actual, lambda_target
    // 2. Calculate indices
    // 3. Classify loop state (open if lambda_target < 1.0 and PE conditions met)
    // 4. For open loop: filter lambda_target > 0, then calculate ratio
    // 5. For closed loop: use fuel trims
    
    const openBins = {};
    const closedBins = {};
    let totalOpenSamples = 0;
    let totalClosedSamples = 0;
    let skippedRows = 0;
    let filteredByCenterWeight = 0;
    
    // Initialize hit count matrix for heatmap visualization (tracks all valid data points)
    // Only needed for fuel_base mode
    const hitCounts = mode === TUNING_MODES.FUEL_BASE
      ? Array.from({ length: rpmAxis.length }, () => Array.from({ length: loadAxis.length }, () => 0))
      : null;
    
    // MAF-specific accumulators (only for maf_scale mode)
    const mafOpenBins = mode === TUNING_MODES.MAF_SCALE ? {} : null;
    const mafClosedBins = mode === TUNING_MODES.MAF_SCALE ? {} : null;
    const mafHitCounts = mode === TUNING_MODES.MAF_SCALE
      ? Array.from({ length: mafVoltageAxis.length }, () => 0)
      : null;
    let totalMafOpenSamples = 0;
    let totalMafClosedSamples = 0;
    let rowsMissingMafVoltage = 0;
    let mafFilteredByCenterWeight = 0;
    
    function accumulateMafOpenSample(idx, weight, ratio) {
      if (mode !== TUNING_MODES.MAF_SCALE || !mafOpenBins) return;
      if (idx === null || weight === null) {
        return;
      }
      if (weight < minHitWeight) {
        mafFilteredByCenterWeight += 1;
        return;
      }
      const key = `${idx}`;
      if (!mafOpenBins[key]) {
        mafOpenBins[key] = { idx, samples: 0, totalWeight: 0, weightedSumRatio: 0 };
      }
      const entry = mafOpenBins[key];
      entry.samples += 1;
      entry.totalWeight += weight;
      entry.weightedSumRatio += ratio * weight;
      totalMafOpenSamples += 1;
    }
    
    function accumulateMafClosedSample(idx, weight, trim) {
      if (mode !== TUNING_MODES.MAF_SCALE || !mafClosedBins) return;
      if (idx === null || weight === null) {
        return;
      }
      if (weight < minHitWeight) {
        mafFilteredByCenterWeight += 1;
        return;
      }
      const key = `${idx}`;
      if (!mafClosedBins[key]) {
        mafClosedBins[key] = { idx, samples: 0, totalWeight: 0, weightedSumTrim: 0 };
      }
      const entry = mafClosedBins[key];
      entry.samples += 1;
      entry.totalWeight += weight;
      entry.weightedSumTrim += trim * weight;
      totalMafClosedSamples += 1;
    }

    data.forEach(row => {
      const rpm = parseFloat(row['Engine Speed (rpm)']);
      const load = parseFloat(row['Load (MAF) (g/rev)']);
      const lambdaActual = parseFloat(row['Air/Fuel Sensor #1 (λ)']);
      const lambdaTarget = parseFloat(row['Power Mode - Fuel Ratio Target (λ)']);
      const throttle = parseFloat(row['Throttle Position (%)']);
      const mafVoltage = parseFloat(row['Mass Air Flow Voltage (V)']);

      // Filter: require valid rpm, load, lambda_actual, lambda_target (matching Python dropna)
      if (!isFinite(rpm) || !isFinite(load) || !isFinite(lambdaActual) || !isFinite(lambdaTarget)) {
        skippedRows += 1;
        return;
      }

      const rpmIdx = axisIndex(rpm, rpmAxis);
      const loadIdx = axisIndex(load, loadAxis);
      if (rpmIdx === null || loadIdx === null) {
        skippedRows += 1;
        return;
      }
      
      // MAF voltage processing (only for maf_scale mode)
      let mafIdx = null;
      let mafWeight = null;
      if (mode === TUNING_MODES.MAF_SCALE) {
        // Filter: reject very low MAF voltage (idle noise)
        // Per MAF_SCALE_TUNING_GUIDE.md: reject maf_voltage < 0.5V
        if (isFinite(mafVoltage) && mafVoltage >= 0.5) {
          mafIdx = axisIndex(mafVoltage, mafVoltageAxis);
          if (mafIdx !== null) {
            mafHitCounts[mafIdx] += 1;
            mafWeight = calculateAxisWeight(mafVoltage, mafIdx, mafVoltageAxis);
          } else {
            rowsMissingMafVoltage += 1;
          }
        } else {
          rowsMissingMafVoltage += 1;
        }
      }

      // Increment hit count for heatmap (track all valid data points regardless of loop state)
      // Only for fuel_base mode
      if (mode === TUNING_MODES.FUEL_BASE && hitCounts) {
        hitCounts[rpmIdx][loadIdx] += 1;
      }

      // Get PE enable thresholds for current RPM (matching Python: tune.pe_enable_load_at_rpm(rpm))
      // pe_enable_load and pe_enable_tps are indexed by RPM axis (same as fuel_base)
      const loadThreshold = (rpmIdx !== null && peEnableLoad[rpmIdx] !== undefined) 
        ? peEnableLoad[rpmIdx] 
        : Infinity;
      const tpsThreshold = (rpmIdx !== null && peEnableTps[rpmIdx] !== undefined) 
        ? peEnableTps[rpmIdx] 
        : Infinity;
      
      // Classify loop state based on ECU_TUNE_FILE_MODEL.md:
      // Open loop (PE mode) is active when:
      // - Load >= pe_enable_load threshold for current RPM
      // - TPS >= pe_enable_tps threshold for current RPM
      // 
      // Per the documentation: "PE mode activates when load and TPS thresholds are exceeded"
      // In PE mode, STFT is DISABLED but LTFT corrections are still applied.
      // The lambda target comes from pe_initial/pe_safe tables (range: 0.831 to 1.000).
      // 
      // Note: We do NOT check lambdaTarget < 1.0 because PE tables CAN have lambda = 1.0
      // at lower load/RPM cells. The PE enable conditions alone determine open vs closed loop.
      const isOpenLoop = load >= loadThreshold && throttle >= tpsThreshold;

      if (isOpenLoop) {
        // Filter: minimum RPM to avoid idle/tip-in transients
        // Per MAF_SCALE_TUNING_GUIDE.md: RPM >= 2000 for open-loop
        if (rpm < 2000) {
          skippedRows += 1;
          return;
        }
        
        // Filter: lambda_target must be in valid PE range (0.7-1.0)
        // Per MAF_SCALE_TUNING_GUIDE.md: valid PE lambda targets are 0.75-1.0
        if (lambdaTarget <= 0.7 || lambdaTarget > 1.0) {
          skippedRows += 1;
          return;
        }
        
        // Filter: lambda_actual must be valid and reasonable (0.6-1.5)
        if (lambdaActual <= 0.6 || lambdaActual > 1.5) {
          skippedRows += 1;
          return;
        }
        
        // Calculate lambda ratio (measured vs target)
        const ratio = lambdaActual / lambdaTarget;
        
        // Filter: reject outlier lambda ratios (wideband noise/errors)
        // Per MAF_SCALE_TUNING_GUIDE.md: valid range is 0.85-1.15
        if (ratio < 0.85 || ratio > 1.15) {
          skippedRows += 1;
          return;
        }
        
        // Accumulate MAF samples (only in MAF mode)
        accumulateMafOpenSample(mafIdx, mafWeight, ratio);
        
        // Accumulate fuel-base samples (only in fuel_base mode)
        if (mode === TUNING_MODES.FUEL_BASE) {
          // Calculate cell weight based on how centered the data point is in RPM/Load grid
          const cellWeight = calculateCellWeight(rpm, load, rpmIdx, loadIdx, rpmAxis, loadAxis);
          
          // Filter by minimum hit weight threshold for fuel-base accumulation
          if (cellWeight < minHitWeight) {
            filteredByCenterWeight += 1;
            return;
          }
          
          const key = `${rpmIdx}_${loadIdx}`;
          if (!openBins[key]) {
            openBins[key] = { rpmIdx, loadIdx, samples: 0, totalWeight: 0, weightedSumRatio: 0 };
          }
          openBins[key].samples += 1;
          openBins[key].totalWeight += cellWeight;
          openBins[key].weightedSumRatio += ratio * cellWeight;
          totalOpenSamples += 1;
        }
      } else {
        // Closed loop: use fuel trims (STFT + LTFT)
        // Fill NaN with 0.0 (matching Python: logs["stft"] = logs["stft"].fillna(0.0))
        const stft = isFinite(parseFloat(row['Fuel Trim - Short Term (%)'])) 
          ? parseFloat(row['Fuel Trim - Short Term (%)']) 
          : 0.0;
        const ltft = isFinite(parseFloat(row['Fuel Trim - Long Term (%)'])) 
          ? parseFloat(row['Fuel Trim - Long Term (%)']) 
          : 0.0;
        const combined = stft + ltft;
        
        // Accumulate MAF samples (only in MAF mode)
        accumulateMafClosedSample(mafIdx, mafWeight, combined);
        
        // Accumulate fuel-base samples (only in fuel_base mode)
        if (mode === TUNING_MODES.FUEL_BASE) {
          // Calculate cell weight based on how centered the data point is in RPM/Load grid
          const cellWeight = calculateCellWeight(rpm, load, rpmIdx, loadIdx, rpmAxis, loadAxis);
          
          // Filter by minimum hit weight threshold for fuel-base accumulation
          if (cellWeight < minHitWeight) {
            filteredByCenterWeight += 1;
            return;
          }
          
          const key = `${rpmIdx}_${loadIdx}`;
          if (!closedBins[key]) {
            closedBins[key] = { rpmIdx, loadIdx, samples: 0, totalWeight: 0, weightedSumTrim: 0 };
          }
          closedBins[key].samples += 1;
          closedBins[key].totalWeight += cellWeight;
          closedBins[key].weightedSumTrim += combined * cellWeight;
          totalClosedSamples += 1;
        }
      }
    });

    // Fuel-base summaries (only for fuel_base mode)
    let openSummary = [];
    let closedSummary = [];
    if (mode === TUNING_MODES.FUEL_BASE) {
      openSummary = Object.values(openBins)
        .filter(entry => entry.samples >= minSamples)
        .map(entry => {
          const weightedMeanRatio = entry.totalWeight > 0 
            ? entry.weightedSumRatio / entry.totalWeight 
            : 1.0;
          const avgWeight = entry.samples > 0 ? entry.totalWeight / entry.samples : 0;
          const currentValue = fuelBaseTable[entry.rpmIdx][entry.loadIdx] || 0;
          const suggested = currentValue * weightedMeanRatio;
          return {
            rpmIdx: entry.rpmIdx,
            loadIdx: entry.loadIdx,
            rpm: rpmAxis[entry.rpmIdx],
            load: loadAxis[entry.loadIdx],
            samples: entry.samples,
            avgWeight: avgWeight,
            meanRatio: weightedMeanRatio,
            meanErrorPct: (weightedMeanRatio - 1) * 100,
            currentFuelBase: currentValue,
            suggestedFuelBase: suggested
          };
        })
        .sort((a, b) => Math.abs(b.meanErrorPct) - Math.abs(a.meanErrorPct));

      closedSummary = Object.values(closedBins)
        .filter(entry => entry.samples >= minSamples)
        .map(entry => {
          const weightedMeanTrim = entry.totalWeight > 0 
            ? entry.weightedSumTrim / entry.totalWeight 
            : 0.0;
          const avgWeight = entry.samples > 0 ? entry.totalWeight / entry.samples : 0;
          const currentValue = fuelBaseTable[entry.rpmIdx][entry.loadIdx] || 0;
          const suggested = currentValue * (1 + weightedMeanTrim / 100);
          return {
            rpmIdx: entry.rpmIdx,
            loadIdx: entry.loadIdx,
            rpm: rpmAxis[entry.rpmIdx],
            load: loadAxis[entry.loadIdx],
            samples: entry.samples,
            avgWeight: avgWeight,
            meanTrim: weightedMeanTrim,
            currentFuelBase: currentValue,
            suggestedFuelBase: suggested
          };
        })
        .sort((a, b) => Math.abs(b.meanTrim) - Math.abs(a.meanTrim));
    }

    // MAF summaries (only for maf_scale mode)
    let mafOpenSummary = [];
    let mafClosedSummary = [];
    if (mode === TUNING_MODES.MAF_SCALE && mafOpenBins && mafClosedBins) {
      mafOpenSummary = Object.values(mafOpenBins)
        .filter(entry => entry.samples >= minSamples)
        .map(entry => {
          const weightedMeanRatio = entry.totalWeight > 0
            ? entry.weightedSumRatio / entry.totalWeight
            : 1.0;
          const avgWeight = entry.samples > 0 ? entry.totalWeight / entry.samples : 0;
          const currentValue = mafScale[entry.idx] || 0;
          const suggestedValue = currentValue * weightedMeanRatio;
          return {
            idx: entry.idx,
            voltage: mafVoltageAxis[entry.idx],
            samples: entry.samples,
            avgWeight,
            meanRatio: weightedMeanRatio,
            meanErrorPct: (weightedMeanRatio - 1) * 100,
            currentGs: currentValue,
            suggestedGs: suggestedValue
          };
        })
        .sort((a, b) => Math.abs(b.meanErrorPct) - Math.abs(a.meanErrorPct));

      mafClosedSummary = Object.values(mafClosedBins)
        .filter(entry => entry.samples >= minSamples)
        .map(entry => {
          const weightedMeanTrim = entry.totalWeight > 0
            ? entry.weightedSumTrim / entry.totalWeight
            : 0.0;
          const avgWeight = entry.samples > 0 ? entry.totalWeight / entry.samples : 0;
          const currentValue = mafScale[entry.idx] || 0;
          const suggestedValue = currentValue * (1 + weightedMeanTrim / 100);
          return {
            idx: entry.idx,
            voltage: mafVoltageAxis[entry.idx],
            samples: entry.samples,
            avgWeight,
            meanTrim: weightedMeanTrim,
            currentGs: currentValue,
            suggestedGs: suggestedValue
          };
        })
        .sort((a, b) => Math.abs(b.meanTrim) - Math.abs(a.meanTrim));
    }

    // Fuel-base modifications (only for fuel_base mode)
    let cloneTable = null;
    let modifications = new Map();
    let clampedDetails = [];

    if (mode === TUNING_MODES.FUEL_BASE) {
      cloneTable = clone2DArray(fuelBaseTable);

      closedSummary.forEach(row => {
        const key = `${row.rpmIdx}_${row.loadIdx}`;
        modifications.set(key, { ...row, source: 'closed' });
      });

      openSummary.forEach(row => {
        const key = `${row.rpmIdx}_${row.loadIdx}`;
        modifications.set(key, { ...row, source: 'open' });
      });

      // Apply modifications with change limit (based on source/analysis tune file values)
      // This ensures idempotency: change limits are always based on the analysis tune file,
      // not the base tune file (if one is provided for modification)
      modifications.forEach(row => {
        // Get the original value from the analysis tune file (for change limit baseline)
        const sourceOriginal = fuelBaseTable[row.rpmIdx][row.loadIdx] || 0;
        if (!isFinite(sourceOriginal) || sourceOriginal === 0) {
          // Cannot compute meaningful change for zero or invalid values
          return;
        }
        
        // Calculate percent change from source tune file (for limit checking)
        const changePct = ((row.suggestedFuelBase - sourceOriginal) / sourceOriginal) * 100.0;
        
        let targetValue = row.suggestedFuelBase;
        
        // Apply change limit (limit is based on source tune file values for idempotency)
        if (changeLimit > 0 && Math.abs(changePct) > changeLimit) {
          // Clamp to limit based on source tune file value
          if (changePct > 0) {
            targetValue = sourceOriginal * (1.0 + changeLimit / 100.0);
          } else {
            targetValue = sourceOriginal * (1.0 - changeLimit / 100.0);
          }
          
          clampedDetails.push({
            rpm: row.rpm,
            load: row.load,
            original: sourceOriginal,
            suggested: row.suggestedFuelBase,
            applied: targetValue,
            changePct: changePct,
            source: row.source
          });
        }
        
        // Apply the modification (within limit, use raw suggested value; otherwise use clamped value)
        cloneTable[row.rpmIdx][row.loadIdx] = targetValue;
      });
    }

    // MAF modifications (only for maf_scale mode)
    let mafCloneScale = null;
    let mafModifications = new Map();
    let mafClampedDetails = [];

    if (mode === TUNING_MODES.MAF_SCALE) {
      mafCloneScale = mafScale.slice();

      mafClosedSummary.forEach(row => {
        const key = row.idx;
        mafModifications.set(key, { ...row, source: 'closed' });
      });

      mafOpenSummary.forEach(row => {
        const key = row.idx;
        mafModifications.set(key, { ...row, source: 'open' });
      });

      mafModifications.forEach(row => {
        const sourceOriginal = mafScale[row.idx] || 0;
        if (!isFinite(sourceOriginal) || sourceOriginal === 0) {
          // Cannot scale zero values - leave unchanged
          return;
        }

        let targetValue = row.suggestedGs;
        const changePct = ((row.suggestedGs - sourceOriginal) / sourceOriginal) * 100.0;

        if (changeLimit > 0 && Math.abs(changePct) > changeLimit) {
          if (changePct > 0) {
            targetValue = sourceOriginal * (1.0 + changeLimit / 100.0);
          } else {
            targetValue = sourceOriginal * (1.0 - changeLimit / 100.0);
          }

          mafClampedDetails.push({
            voltage: row.voltage,
            original: sourceOriginal,
            suggested: row.suggestedGs,
            applied: targetValue,
            changePct: changePct,
            source: row.source
          });
        }

        mafCloneScale[row.idx] = targetValue;
      });
    }

    // Build visualization tables (only for fuel_base mode)
    let openChangeTable = null;
    let closedChangeTable = null;
    let openHitCounts = null;
    let closedHitCounts = null;
    let suggestedTable = null;

    if (mode === TUNING_MODES.FUEL_BASE && cloneTable) {
      // Build 2D tables for open-loop and closed-loop change visualization
      // Each cell contains: { current, suggested, changePct, samples, source } or null if no data
      openChangeTable = Array.from({ length: rpmAxis.length }, () => 
        Array.from({ length: loadAxis.length }, () => null)
      );
      closedChangeTable = Array.from({ length: rpmAxis.length }, () => 
        Array.from({ length: loadAxis.length }, () => null)
      );
      openHitCounts = Array.from({ length: rpmAxis.length }, () => 
        Array.from({ length: loadAxis.length }, () => 0)
      );
      closedHitCounts = Array.from({ length: rpmAxis.length }, () => 
        Array.from({ length: loadAxis.length }, () => 0)
      );

      // Populate open-loop change table
      openSummary.forEach(row => {
        const changePct = row.currentFuelBase !== 0
          ? ((row.suggestedFuelBase - row.currentFuelBase) / row.currentFuelBase) * 100
          : 0;
        openChangeTable[row.rpmIdx][row.loadIdx] = {
          current: row.currentFuelBase,
          suggested: row.suggestedFuelBase,
          changePct: changePct,
          samples: row.samples,
          meanErrorPct: row.meanErrorPct
        };
        openHitCounts[row.rpmIdx][row.loadIdx] = row.samples;
      });

      // Populate closed-loop change table
      closedSummary.forEach(row => {
        const changePct = row.currentFuelBase !== 0
          ? ((row.suggestedFuelBase - row.currentFuelBase) / row.currentFuelBase) * 100
          : 0;
        closedChangeTable[row.rpmIdx][row.loadIdx] = {
          current: row.currentFuelBase,
          suggested: row.suggestedFuelBase,
          changePct: changePct,
          samples: row.samples,
          meanTrim: row.meanTrim
        };
        closedHitCounts[row.rpmIdx][row.loadIdx] = row.samples;
      });

      // Build combined/final suggested table (showing what will be applied after change limits)
      suggestedTable = Array.from({ length: rpmAxis.length }, () => 
        Array.from({ length: loadAxis.length }, () => null)
      );
      
      for (let rpmIdx = 0; rpmIdx < rpmAxis.length; rpmIdx++) {
        for (let loadIdx = 0; loadIdx < loadAxis.length; loadIdx++) {
          const current = fuelBaseTable[rpmIdx][loadIdx];
          const suggested = cloneTable[rpmIdx][loadIdx];
          const changePct = current !== 0 ? ((suggested - current) / current) * 100 : 0;
          const hasChange = Math.abs(changePct) > 0.01;
          
          // Determine source (open takes priority over closed)
          let source = null;
          let samples = 0;
          if (openChangeTable[rpmIdx][loadIdx]) {
            source = 'open';
            samples = openChangeTable[rpmIdx][loadIdx].samples;
          } else if (closedChangeTable[rpmIdx][loadIdx]) {
            source = 'closed';
            samples = closedChangeTable[rpmIdx][loadIdx].samples;
          }
          
          suggestedTable[rpmIdx][loadIdx] = {
            current: current,
            suggested: suggested,
            changePct: changePct,
            hasChange: hasChange,
            source: source,
            samples: samples
          };
        }
      }
    }

    // Build MAF combined changes (only for maf_scale mode)
    let mafCombinedChanges = null;
    let mafScaleStrings = null;

    if (mode === TUNING_MODES.MAF_SCALE && mafCloneScale) {
      const mafOpenSummaryMap = new Map(mafOpenSummary.map(entry => [entry.idx, entry]));
      const mafClosedSummaryMap = new Map(mafClosedSummary.map(entry => [entry.idx, entry]));
      mafCombinedChanges = mafVoltageAxis.map((voltage, idx) => {
        const current = mafScale[idx] || 0;
        const suggested = mafCloneScale[idx];
        const changePct = current !== 0 ? ((suggested - current) / current) * 100 : 0;
        const hasChange = Math.abs(changePct) > 0.01;

        let source = null;
        let samples = 0;
        let metricLabel = null;
        let metricValue = null;
        if (mafOpenSummaryMap.has(idx)) {
          const entry = mafOpenSummaryMap.get(idx);
          source = 'open';
          samples = entry.samples;
          metricLabel = 'Lambda Error';
          metricValue = entry.meanErrorPct;
        } else if (mafClosedSummaryMap.has(idx)) {
          const entry = mafClosedSummaryMap.get(idx);
          source = 'closed';
          samples = entry.samples;
          metricLabel = 'Mean Trim';
          metricValue = entry.meanTrim;
        }

        return {
          idx,
          voltage,
          current,
          suggested,
          changePct,
          hasChange,
          source,
          samples,
          metricLabel,
          metricValue
        };
      });

      mafScaleStrings = [
        mafCloneScale.map(val => (isFinite(val) ? val.toFixed(2) : '0.00')).join(', ')
      ];
    }

    return {
      // Mode indicator
      mode,
      // Common fields
      changeLimitPercent: changeLimit,
      minSamples,
      minHitWeight,
      skippedRows,
      // Data source information
      totalDataRows: data.length,
      primaryDataRows: primaryData.length,
      additionalDataRows: additionalRowCount,
      additionalLogsCount: additionalLogsData.length,
      // Fuel-base specific results (only populated for fuel_base mode)
      openSummary,
      closedSummary,
      modificationsApplied: modifications.size,
      clampedModifications: clampedDetails,
      fuelBaseStrings: cloneTable ? formatFuelBaseTable(cloneTable) : null,
      totalOpenSamples,
      totalClosedSamples,
      filteredByCenterWeight,
      hitCounts,
      rpmAxis,
      loadAxis,
      currentFuelBase: fuelBaseTable,
      openChangeTable,
      closedChangeTable,
      openHitCounts,
      closedHitCounts,
      suggestedTable,
      // MAF calibration specific results (only populated for maf_scale mode)
      mafOpenSummary,
      mafClosedSummary,
      mafModificationsApplied: mafModifications.size,
      mafClampedModifications: mafClampedDetails,
      mafScaleStrings,
      mafVoltageAxis,
      mafScale,
      mafSuggestedScale: mafCloneScale,
      mafCombinedChanges,
      mafHitCounts,
      totalMafOpenSamples,
      totalMafClosedSamples,
      rowsMissingMafVoltage,
      mafFilteredByCenterWeight
    };
  }

  function downloadTune(result, filename, baseTuneData = null) {
    if (!result || !result.mode) {
      return { error: 'Run the autotune analysis before downloading a tune file.' };
    }

    // Validate mode-specific data exists
    if (result.mode === TUNING_MODES.FUEL_BASE && !Array.isArray(result.fuelBaseStrings)) {
      return { error: 'Fuel base analysis data not available. Run analysis in Base Fuel mode.' };
    }
    if (result.mode === TUNING_MODES.MAF_SCALE && !Array.isArray(result.mafScaleStrings)) {
      return { error: 'MAF scale analysis data not available. Run analysis in MAF Calibration mode.' };
    }

    // Use base tune file if provided, otherwise use currently loaded tune file
    let tuneData;
    if (baseTuneData) {
      // Deep clone the base tune data
      try {
        tuneData = JSON.parse(JSON.stringify(baseTuneData));
      } catch (error) {
        return { error: 'Unable to clone base tune data.' };
      }
    } else {
      // Fall back to currently loaded tune file
      if (!window.tuneFileParser || !window.tuneFileParser.isLoaded()) {
        return { error: 'No tune file loaded. Please load a tune file or specify a base tune file.' };
      }
      tuneData = window.tuneFileParser.getRawTuneDataClone();
    }

    if (!tuneData || !Array.isArray(tuneData.maps)) {
      return { error: 'Unable to clone tune data.' };
    }

    // Find the map to modify based on mode
    let targetMap = null;
    let expectedLength = 0;

    if (result.mode === TUNING_MODES.FUEL_BASE) {
      targetMap = tuneData.maps.find(entry => entry.id === 'fuel_base');
      if (!targetMap) {
        return { error: 'fuel_base map not found in tune file.' };
      }
    } else if (result.mode === TUNING_MODES.MAF_SCALE) {
      targetMap = tuneData.maps.find(entry => entry.id === 'maf_scale');
      if (!targetMap) {
        return { error: 'maf_scale map not found in tune file.' };
      }
      expectedLength = Array.isArray(result.mafSuggestedScale) ? result.mafSuggestedScale.length : 0;
    }

    // Validate that the table dimensions match (if using base tune file)
    if (baseTuneData) {
      if (!window.tuneFileParser || !window.tuneFileParser.isLoaded()) {
        return { error: 'Analysis tune file must be loaded to validate base tune file compatibility.' };
      }
      
      // Create a temporary parser to validate the base tune file
      if (typeof TuneFileParser === 'undefined') {
        return { error: 'TuneFileParser class not available. Please refresh the page.' };
      }
      
      const baseTuneParser = new TuneFileParser();
      if (!baseTuneParser.parse(JSON.stringify(tuneData))) {
        return { error: 'Unable to parse base tune file data.' };
      }

      if (result.mode === TUNING_MODES.FUEL_BASE) {
        const rpmAxis = ensureNumberArray(window.tuneFileParser.getArray('base_spark_rpm_index'));
        const loadAxis = ensureNumberArray(window.tuneFileParser.getArray('base_spark_map_index'));
        const baseFuelBaseTable = baseTuneParser.getTable('fuel_base');
        const baseRpmAxis = ensureNumberArray(baseTuneParser.getArray('base_spark_rpm_index'));
        const baseLoadAxis = ensureNumberArray(baseTuneParser.getArray('base_spark_map_index'));

        if (!baseFuelBaseTable || !baseRpmAxis || !baseLoadAxis) {
          return { error: 'Base tune file is missing required fuel_base table or axis data.' };
        }

        if (baseFuelBaseTable.length !== rpmAxis.length || 
            baseFuelBaseTable[0]?.length !== loadAxis.length ||
            baseRpmAxis.length !== rpmAxis.length ||
            baseLoadAxis.length !== loadAxis.length) {
          return { error: 'Base tune file fuel_base table dimensions do not match the tune file used for analysis.' };
        }
      } else if (result.mode === TUNING_MODES.MAF_SCALE) {
        const baseMafScale = ensureNumberArray(baseTuneParser.getArray('maf_scale'));
        if (!baseMafScale || (expectedLength && baseMafScale.length !== expectedLength)) {
          return { error: 'Base tune file maf_scale table length does not match the tune file used for analysis.' };
        }
      }
    }

    // Apply modifications based on mode
    if (result.mode === TUNING_MODES.FUEL_BASE) {
      targetMap.data = result.fuelBaseStrings;
    } else if (result.mode === TUNING_MODES.MAF_SCALE) {
      targetMap.data = result.mafScaleStrings;
    }

    const fileName = (filename || 'autotuned_tune.tune').trim() || 'autotuned_tune.tune';
    const lowerFileName = fileName.toLowerCase();
    const normalizedName = (lowerFileName.endsWith('.tune') || lowerFileName.endsWith('.json')) 
      ? fileName 
      : `${fileName}.tune`;

    const blob = new Blob([JSON.stringify(tuneData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = normalizedName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return { success: true, fileName: normalizedName };
  }

  window.AutotuneEngine = {
    analyze,
    downloadTune
  };
})();

