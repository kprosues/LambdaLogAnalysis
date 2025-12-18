// BoostControlAnalyzer class for analyzing boost control accuracy
// Optimized to use shared utilities

class BoostControlAnalyzer {
  constructor(dataProcessor) {
    this.dataProcessor = dataProcessor;
    this.analysisResults = null;
    
    // Load configuration
    const config = window.Config ? window.Config.boost : {};
    this.overshootThreshold = config.overshootThreshold || 5.0;
    this.undershootThreshold = config.undershootThreshold || -5.0;
    this.targetTolerance = config.targetTolerance || 10.0;
    this.groupingTimeWindow = config.groupingTimeWindow || 0.5;
    this.errorThresholds = config.errorThresholds || [20.3, 11.7, 5.3, 2.1];
    this.minBoostPressure = config.minBoostPressure || 100;
    this.minOvershootDuration = config.minOvershootDuration || 0.25;
    this.minUndershootDuration = config.minUndershootDuration || 0.5;
    this.minThrottleForOvershoot = config.minThrottleForOvershoot || 30;
    this.maxThrottleForUndershoot = config.maxThrottleForUndershoot || 50;
    this.wastegateSaturationThreshold = config.wastegateSaturationThreshold || 0.95;
    this.wastegateMinThreshold = config.wastegateMinThreshold || 5.0;
    
    this.loadTuneFileParameters();
  }

  loadTuneFileParameters() {
    const tuneParser = window.tuneFileParser || window.AppState?.tuneFileParser;
    if (tuneParser && tuneParser.isLoaded && tuneParser.isLoaded()) {
      this.errorThresholds = tuneParser.getBoostErrorIndex() || this.errorThresholds;
    }
  }

  classifyErrorSeverity(error) {
    const absError = Math.abs(error);
    if (absError > this.errorThresholds[0]) return 'critical';
    if (absError > this.errorThresholds[1]) return 'severe';
    if (absError > this.errorThresholds[2]) return 'moderate';
    if (absError > this.errorThresholds[3]) return 'mild';
    return 'normal';
  }

  analyze() {
    const data = this.dataProcessor.getData();
    if (!data || data.length === 0) {
      return null;
    }

    const columns = this.dataProcessor.getColumns();
    
    // Find columns using ColumnMapper or AnalyzerUtils
    const boostTargetCol = this._findColumn(columns, 'boostTarget');
    const actualBoostCol = this._findColumn(columns, 'actualBoost');
    const wastegateCol = this._findColumn(columns, 'wastegateDC');

    console.log('Boost column detection results:');
    console.log('  Boost Target:', boostTargetCol || 'NOT FOUND');
    console.log('  Actual Boost:', actualBoostCol || 'NOT FOUND');
    console.log('  Wastegate:', wastegateCol || 'NOT FOUND');

    if (!actualBoostCol) {
      console.warn('Required boost column not found');
      return this._createEmptyResult(boostTargetCol, actualBoostCol, wastegateCol,
        'Required boost column (actual boost/manifold pressure) not found in log file.');
    }

    // Filter data to boost conditions (>= 100 kPa)
    const filteredData = data.filter(row => {
      const actualBoost = parseFloat(row[actualBoostCol]) || 0;
      return actualBoost >= this.minBoostPressure;
    });

    console.log(`Filtered ${data.length} rows to ${filteredData.length} rows (>= ${this.minBoostPressure} kPa)`);

    if (filteredData.length === 0) {
      return this._createEmptyResult(boostTargetCol, actualBoostCol, wastegateCol,
        'No boost data found (all values below 100 kPa)');
    }

    // Analyze data
    const events = [];
    let totalError = 0;
    let totalErrorAbs = 0;
    let inTargetCount = 0;
    let maxOvershoot = 0;
    let maxUndershoot = 0;
    let totalWastegateDC = 0;
    let wastegateCount = 0;

    const tuneParser = window.tuneFileParser || window.AppState?.tuneFileParser;

    filteredData.forEach((row, index) => {
      const time = row['Time (s)'];
      const boostTarget = boostTargetCol ? (parseFloat(row[boostTargetCol]) || 0) : 0;
      const actualBoost = parseFloat(row[actualBoostCol]) || 0;
      const wastegateDC = wastegateCol ? (parseFloat(row[wastegateCol]) || 0) : null;
      const throttle = row['Throttle Position (%)'] || 0;
      const rpm = row['Engine Speed (rpm)'] || 0;

      const boostError = actualBoost - boostTarget;
      const boostErrorPercent = boostTarget > 0 ? (boostError / boostTarget) * 100 : 0;

      // Track statistics
      totalError += boostError;
      totalErrorAbs += Math.abs(boostError);
      if (Math.abs(boostError) <= this.targetTolerance) {
        inTargetCount++;
      }
      if (boostError > maxOvershoot) maxOvershoot = boostError;
      if (boostError < maxUndershoot) maxUndershoot = boostError;
      if (wastegateDC !== null) {
        totalWastegateDC += wastegateDC;
        wastegateCount++;
      }

      // Check boost limit
      let boostLimitViolation = false;
      let boostLimit = null;
      if (tuneParser && tuneParser.isLoaded && tuneParser.isLoaded()) {
        boostLimit = tuneParser.getBoostLimit(rpm);
        if (actualBoost > boostLimit) {
          boostLimitViolation = true;
        }
      }

      // Determine event type
      let eventType = 'normal';
      if (boostError > this.overshootThreshold) {
        eventType = 'overshoot';
      } else if (boostError < this.undershootThreshold) {
        eventType = 'undershoot';
      }

      const severity = this.classifyErrorSeverity(boostError);

      // Check wastegate saturation
      let wastegateSaturated = false;
      if (wastegateDC !== null && tuneParser && tuneParser.isLoaded()) {
        const wgMaxTable = tuneParser.getTable('wg_max');
        const wgRpmIndex = tuneParser.getArray('wg_rpm_index');
        const wgTpsIndex = tuneParser.getArray('wg_tps_index');
        if (wgMaxTable && wgRpmIndex && wgTpsIndex) {
          const wgMax = tuneParser.interpolate2D(wgMaxTable, wgRpmIndex, wgTpsIndex, rpm, throttle);
          if (eventType === 'overshoot' && wastegateDC >= wgMax * this.wastegateSaturationThreshold) {
            wastegateSaturated = true;
          }
          if (eventType === 'undershoot' && wastegateDC <= this.wastegateMinThreshold) {
            wastegateSaturated = true;
          }
        }
      }

      // Filter and create events
      if (boostLimitViolation || eventType !== 'normal' || Math.abs(boostError) > this.targetTolerance) {
        // Skip low throttle overshoots
        if (eventType === 'overshoot' && throttle < this.minThrottleForOvershoot && !boostLimitViolation) {
          return;
        }
        // Skip low throttle undershoots
        if (eventType === 'undershoot' && throttle <= this.maxThrottleForUndershoot && !boostLimitViolation) {
          return;
        }

        events.push({
          index,
          time,
          boostTarget,
          actualBoost,
          boostError,
          boostErrorPercent,
          wastegateDC,
          rpm,
          throttle,
          load: row['Load (MAF) (g/rev)'] || 0,
          eventType: boostLimitViolation ? 'limit_violation' : eventType,
          severity: boostLimitViolation ? 'critical' : severity,
          boostLimit,
          boostLimitViolation,
          wastegateSaturated
        });
      }
    });

    console.log(`Raw boost events detected (before grouping): ${events.length}`);
    
    // Group events
    const groupedEvents = this._groupBoostEvents(events);
    console.log(`Grouped boost events: ${groupedEvents.length}`);

    const timeRange = this.dataProcessor.getTimeRange();
    const inTargetPercent = filteredData.length > 0 ? (inTargetCount / filteredData.length) * 100 : 0;

    this.analysisResults = {
      events: groupedEvents,
      statistics: {
        totalDataPoints: filteredData.length,
        avgBoostError: filteredData.length > 0 ? totalError / filteredData.length : 0,
        avgBoostErrorAbs: filteredData.length > 0 ? totalErrorAbs / filteredData.length : 0,
        maxOvershoot,
        maxUndershoot,
        inTargetPercent,
        overshootEvents: groupedEvents.filter(e => e.eventType === 'overshoot').length,
        undershootEvents: groupedEvents.filter(e => e.eventType === 'undershoot').length,
        limitViolations: groupedEvents.filter(e => e.eventType === 'limit_violation').length,
        criticalEvents: groupedEvents.filter(e => e.severity === 'critical').length,
        severeEvents: groupedEvents.filter(e => e.severity === 'severe').length,
        moderateEvents: groupedEvents.filter(e => e.severity === 'moderate').length,
        mildEvents: groupedEvents.filter(e => e.severity === 'mild').length,
        wastegateSaturatedEvents: groupedEvents.filter(e => e.wastegateSaturated === true).length,
        avgWastegateDC: wastegateCount > 0 ? totalWastegateDC / wastegateCount : 0,
        timeRange
      },
      columns: {
        boostTarget: boostTargetCol,
        actualBoost: actualBoostCol,
        wastegate: wastegateCol
      }
    };

    return this.analysisResults;
  }

  /**
   * Find column using ColumnMapper or AnalyzerUtils
   * @private
   */
  _findColumn(columns, key) {
    // Try ColumnMapper
    if (window.ColumnMapper && window.ColumnMapper.hasColumn(key)) {
      return window.ColumnMapper.getColumn(key);
    }

    // Get aliases from config
    const config = window.Config ? window.Config.columnAliases : {};
    const aliases = config[key] || this._getDefaultAliases(key);

    // Try AnalyzerUtils
    if (window.AnalyzerUtils) {
      return window.AnalyzerUtils.findColumn(columns, aliases);
    }

    // Fallback
    for (const name of aliases) {
      if (columns.includes(name)) return name;
    }
    return null;
  }

  /**
   * Get default aliases for column key
   * @private
   */
  _getDefaultAliases(key) {
    const aliasMap = {
      boostTarget: [
        'Boost Target (kPa)', 'Boost Target', 'BoostTarget', 'Target Boost',
        'Boost Setpoint', 'Desired Boost'
      ],
      actualBoost: [
        'Manifold Absolute Pressure (kPa)', 'Manifold Air Pressure - Filtered (kPa)',
        'Manifold Pressure', 'MAP', 'MAP (kPa)', 'Boost Pressure', 'Actual Boost'
      ],
      wastegateDC: [
        'Wastegate Duty Cycle (%)', 'Wastegate DC', 'WG Duty', 'Wastegate Duty',
        'WG Duty (%)'
      ]
    };
    return aliasMap[key] || [];
  }

  /**
   * Create empty result for error cases
   * @private
   */
  _createEmptyResult(boostTargetCol, actualBoostCol, wastegateCol, errorMessage) {
    const result = {
      events: [],
      statistics: {
        totalDataPoints: 0,
        avgBoostError: 0,
        avgBoostErrorAbs: 0,
        maxOvershoot: 0,
        maxUndershoot: 0,
        inTargetPercent: 0,
        overshootEvents: 0,
        undershootEvents: 0,
        avgWastegateDC: 0,
        timeRange: this.dataProcessor ? this.dataProcessor.getTimeRange() : { min: 0, max: 0 }
      },
      columns: { boostTarget: boostTargetCol, actualBoost: actualBoostCol, wastegate: wastegateCol },
      error: errorMessage
    };
    this.analysisResults = result;
    return result;
  }

  /**
   * Group boost events by type and time
   * @private
   */
  _groupBoostEvents(events) {
    if (events.length === 0) return [];

    // Separate by type
    const overshootEvents = events.filter(e => e.eventType === 'overshoot');
    const undershootEvents = events.filter(e => e.eventType === 'undershoot');

    const createGroupedEvent = (eventGroup) => {
      const mostSevereEvent = eventGroup.reduce((prev, current) =>
        Math.abs(current.boostError) > Math.abs(prev.boostError) ? current : prev
      );

      const count = eventGroup.length;
      return {
        index: mostSevereEvent.index,
        time: eventGroup[0].time,
        endTime: eventGroup[eventGroup.length - 1].time,
        duration: eventGroup[eventGroup.length - 1].time - eventGroup[0].time,
        boostTarget: eventGroup.reduce((sum, e) => sum + e.boostTarget, 0) / count,
        actualBoost: eventGroup.reduce((sum, e) => sum + e.actualBoost, 0) / count,
        boostError: mostSevereEvent.boostError,
        maxBoostError: Math.max(...eventGroup.map(e => Math.abs(e.boostError))) * 
                       (mostSevereEvent.boostError < 0 ? -1 : 1),
        avgBoostError: eventGroup.reduce((sum, e) => sum + e.boostError, 0) / count,
        boostErrorPercent: mostSevereEvent.boostErrorPercent,
        avgBoostErrorPercent: eventGroup.reduce((sum, e) => sum + e.boostErrorPercent, 0) / count,
        wastegateDC: eventGroup.filter(e => e.wastegateDC !== null).length > 0
          ? eventGroup.filter(e => e.wastegateDC !== null).reduce((sum, e) => sum + e.wastegateDC, 0) / 
            eventGroup.filter(e => e.wastegateDC !== null).length
          : null,
        rpm: Math.round(eventGroup.reduce((sum, e) => sum + e.rpm, 0) / count),
        throttle: eventGroup.reduce((sum, e) => sum + e.throttle, 0) / count,
        load: eventGroup.reduce((sum, e) => sum + e.load, 0) / count,
        eventType: mostSevereEvent.eventType,
        eventCount: count
      };
    };

    // Group each type
    const groupEvents = (eventList) => {
      if (eventList.length === 0) return [];
      
      if (window.AnalyzerUtils) {
        return window.AnalyzerUtils.groupEventsByTime(eventList, this.groupingTimeWindow, createGroupedEvent);
      }

      // Fallback
      const sorted = [...eventList].sort((a, b) => a.time - b.time);
      const grouped = [];
      let currentGroup = [sorted[0]];

      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].time - currentGroup[currentGroup.length - 1].time <= this.groupingTimeWindow) {
          currentGroup.push(sorted[i]);
        } else {
          grouped.push(createGroupedEvent(currentGroup));
          currentGroup = [sorted[i]];
        }
      }
      if (currentGroup.length > 0) {
        grouped.push(createGroupedEvent(currentGroup));
      }
      return grouped;
    };

    const groupedOvershoot = groupEvents(overshootEvents)
      .filter(e => e.duration >= this.minOvershootDuration);
    const groupedUndershoot = groupEvents(undershootEvents)
      .filter(e => e.duration >= this.minUndershootDuration);

    console.log(`Filtered overshoot: ${overshootEvents.length} -> ${groupedOvershoot.length}`);
    console.log(`Filtered undershoot: ${undershootEvents.length} -> ${groupedUndershoot.length}`);

    return [...groupedOvershoot, ...groupedUndershoot].sort((a, b) => a.time - b.time);
  }

  getStatistics() {
    if (!this.analysisResults) this.analyze();
    return this.analysisResults ? this.analysisResults.statistics : null;
  }

  getEvents() {
    if (!this.analysisResults) this.analyze();
    return this.analysisResults ? this.analysisResults.events : [];
  }

  getOvershootEvents() {
    return this.getEvents().filter(e => e.eventType === 'overshoot');
  }

  getUndershootEvents() {
    return this.getEvents().filter(e => e.eventType === 'undershoot');
  }

  getColumns() {
    if (!this.analysisResults) this.analyze();
    return this.analysisResults ? this.analysisResults.columns : null;
  }
}
