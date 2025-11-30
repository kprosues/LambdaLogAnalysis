// AutotuneEngine: analyze log data against tune fuel_base table and apply adjustments
(function() {
  const REQUIRED_COLUMNS = [
    'Engine Speed (rpm)',
    'Load (MAF) (g/rev)',
    'Air/Fuel Sensor #1 (λ)',
    'Power Mode - Fuel Ratio Target (λ)',
    'Fuel Trim - Short Term (%)',
    'Fuel Trim - Long Term (%)',
    'Throttle Position (%)'
  ];

  function axisIndex(value, axis, clamp = true) {
    if (!Array.isArray(axis) || axis.length === 0 || isNaN(value)) {
      return null;
    }
    if (value <= axis[0]) {
      return clamp ? 0 : null;
    }
    if (value >= axis[axis.length - 1]) {
      return clamp ? axis.length - 1 : null;
    }
    for (let i = 0; i < axis.length - 1; i++) {
      const current = axis[i];
      const next = axis[i + 1];
      if (value >= current && value < next) {
        return i;
      }
    }
    return axis.length - 1;
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

  function analyze(options = {}) {
    const minSamples = Math.max(1, parseInt(options.minSamples || 5, 10));
    const changeLimit = Math.max(0, parseFloat(options.changeLimit || 5));

    if (!window.tuneFileParser || !window.tuneFileParser.isLoaded()) {
      return { error: 'Please load a tune file before running autotune.' };
    }

    if (!window.dataProcessor) {
      return { error: 'Please load at least one datalog before running autotune.' };
    }

    const data = window.dataProcessor.getData();
    const columns = window.dataProcessor.getColumns();

    if (!Array.isArray(data) || data.length === 0) {
      return { error: 'No datalog data available. Load a datalog and try again.' };
    }

    if (!columns || !Array.isArray(columns)) {
      return { error: 'Unable to determine datalog columns.' };
    }

    const missingColumns = REQUIRED_COLUMNS.filter(col => !columns.includes(col));
    if (missingColumns.length > 0) {
      return { error: `The datalog is missing required columns: ${missingColumns.join(', ')}` };
    }

    const rpmAxis = ensureNumberArray(window.tuneFileParser.getArray('base_spark_rpm_index'));
    const loadAxis = ensureNumberArray(window.tuneFileParser.getArray('base_spark_map_index'));
    const fuelBaseTable = window.tuneFileParser.getTable('fuel_base');
    const peEnableLoad = ensureNumberArray(window.tuneFileParser.getArray('pe_enable_load'));
    const peEnableTps = ensureNumberArray(window.tuneFileParser.getArray('pe_enable_tps'));

    if (!rpmAxis.length || !loadAxis.length || !fuelBaseTable) {
      return { error: 'Tune file is missing required base spark/fuel tables.' };
    }

    if (fuelBaseTable.length !== rpmAxis.length || fuelBaseTable[0]?.length !== loadAxis.length) {
      return { error: 'fuel_base table dimensions do not match RPM/Load axes.' };
    }

    if (peEnableLoad.length !== rpmAxis.length || peEnableTps.length !== rpmAxis.length) {
      return { error: 'PE enable tables do not match RPM axis length.' };
    }

    const openBins = {};
    const closedBins = {};
    let totalOpenSamples = 0;
    let totalClosedSamples = 0;

    data.forEach(row => {
      const rpm = parseFloat(row['Engine Speed (rpm)']);
      const load = parseFloat(row['Load (MAF) (g/rev)']);
      const lambdaActual = parseFloat(row['Air/Fuel Sensor #1 (λ)']);
      const lambdaTarget = parseFloat(row['Power Mode - Fuel Ratio Target (λ)']);
      const throttle = parseFloat(row['Throttle Position (%)']);

      if (!isFinite(rpm) || !isFinite(load)) {
        return;
      }

      const rpmIdx = axisIndex(rpm, rpmAxis);
      const loadIdx = axisIndex(load, loadAxis);
      if (rpmIdx === null || loadIdx === null) {
        return;
      }

      const loadThreshold = peEnableLoad[rpmIdx] || Infinity;
      const tpsThreshold = peEnableTps[rpmIdx] || Infinity;
      // Open loop (PE mode) is active when:
      // - Load >= pe_enable_load threshold for current RPM
      // - TPS >= pe_enable_tps threshold for current RPM  
      // - Lambda target indicates PE mode (lambda_target < 1.0 and lambda_target > 0)
      const isOpenLoop = isFinite(lambdaTarget) && lambdaTarget > 0 && lambdaTarget < 1.0 &&
        load >= loadThreshold && throttle >= tpsThreshold;

      if (isOpenLoop) {
        if (!isFinite(lambdaActual) || lambdaActual <= 0) {
          return;
        }
        const ratio = lambdaActual / lambdaTarget;
        const key = `${rpmIdx}_${loadIdx}`;
        if (!openBins[key]) {
          openBins[key] = { rpmIdx, loadIdx, samples: 0, sumRatio: 0 };
        }
        openBins[key].samples += 1;
        openBins[key].sumRatio += ratio;
        totalOpenSamples += 1;
      } else {
        const stft = parseFloat(row['Fuel Trim - Short Term (%)']) || 0;
        const ltft = parseFloat(row['Fuel Trim - Long Term (%)']) || 0;
        const combined = stft + ltft;
        const key = `${rpmIdx}_${loadIdx}`;
        if (!closedBins[key]) {
          closedBins[key] = { rpmIdx, loadIdx, samples: 0, sumTrim: 0 };
        }
        closedBins[key].samples += 1;
        closedBins[key].sumTrim += combined;
        totalClosedSamples += 1;
      }
    });

    const openSummary = Object.values(openBins)
      .filter(entry => entry.samples >= minSamples)
      .map(entry => {
        const meanRatio = entry.sumRatio / entry.samples;
        const currentValue = fuelBaseTable[entry.rpmIdx][entry.loadIdx] || 0;
        const suggested = currentValue * meanRatio;
        return {
          rpmIdx: entry.rpmIdx,
          loadIdx: entry.loadIdx,
          rpm: rpmAxis[entry.rpmIdx],
          load: loadAxis[entry.loadIdx],
          samples: entry.samples,
          meanRatio,
          meanErrorPct: (meanRatio - 1) * 100,
          currentFuelBase: currentValue,
          suggestedFuelBase: suggested
        };
      })
      .sort((a, b) => Math.abs(b.meanErrorPct) - Math.abs(a.meanErrorPct));

    const closedSummary = Object.values(closedBins)
      .filter(entry => entry.samples >= minSamples)
      .map(entry => {
        const meanTrim = entry.sumTrim / entry.samples;
        const currentValue = fuelBaseTable[entry.rpmIdx][entry.loadIdx] || 0;
        const suggested = currentValue * (1 + meanTrim / 100);
        return {
          rpmIdx: entry.rpmIdx,
          loadIdx: entry.loadIdx,
          rpm: rpmAxis[entry.rpmIdx],
          load: loadAxis[entry.loadIdx],
          samples: entry.samples,
          meanTrim,
          currentFuelBase: currentValue,
          suggestedFuelBase: suggested
        };
      })
      .sort((a, b) => Math.abs(b.meanTrim) - Math.abs(a.meanTrim));

    const cloneTable = clone2DArray(fuelBaseTable);
    const changeLimitFraction = changeLimit / 100;
    const modifications = new Map();

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
    const clampedDetails = [];
    modifications.forEach(row => {
      // Get the original value from the analysis tune file (for change limit baseline)
      const sourceOriginal = fuelBaseTable[row.rpmIdx][row.loadIdx] || 0;
      if (!isFinite(sourceOriginal)) {
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

    return {
      openSummary,
      closedSummary,
      modificationsApplied: modifications.size,
      clampedModifications: clampedDetails,
      fuelBaseStrings: formatFuelBaseTable(cloneTable),
      changeLimitPercent: changeLimit,
      minSamples,
      totalOpenSamples,
      totalClosedSamples
    };
  }

  function downloadTune(result, filename, baseTuneData = null) {
    if (!result || !Array.isArray(result.fuelBaseStrings)) {
      return { error: 'Run the autotune analysis before downloading a tune file.' };
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

    const fuelBaseMap = tuneData.maps.find(entry => entry.id === 'fuel_base');
    if (!fuelBaseMap) {
      return { error: 'fuel_base map not found in tune file.' };
    }

    // Validate that the fuel_base table dimensions match (if using base tune file)
    if (baseTuneData) {
      if (!window.tuneFileParser || !window.tuneFileParser.isLoaded()) {
        return { error: 'Analysis tune file must be loaded to validate base tune file compatibility.' };
      }

      const rpmAxis = ensureNumberArray(window.tuneFileParser.getArray('base_spark_rpm_index'));
      const loadAxis = ensureNumberArray(window.tuneFileParser.getArray('base_spark_map_index'));
      
      // Create a temporary parser to validate the base tune file
      if (typeof TuneFileParser === 'undefined') {
        return { error: 'TuneFileParser class not available. Please refresh the page.' };
      }
      
      const baseTuneParser = new TuneFileParser();
      if (!baseTuneParser.parse(JSON.stringify(tuneData))) {
        return { error: 'Unable to parse base tune file data.' };
      }

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
        return { 
          error: 'Base tune file fuel_base table dimensions or axis lengths do not match the analysis tune file. The base tune file must use the same RPM and Load axis structure as the tune file used for analysis.' 
        };
      }
    }

    fuelBaseMap.data = result.fuelBaseStrings;

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

