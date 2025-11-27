// BoostControlAnalyzer class for analyzing boost control accuracy
class BoostControlAnalyzer {
  constructor(dataProcessor) {
    this.dataProcessor = dataProcessor;
    this.analysisResults = null;
    this.overshootThreshold = 5.0; // kPa above target (moderate threshold)
    this.undershootThreshold = -5.0; // kPa below target (moderate threshold)
    this.targetTolerance = 10.0; // kPa tolerance for "in target" range (±10 kPa)
    this.groupingTimeWindow = 0.5; // Group events within 0.5 seconds (500ms)
    
    // Multi-tier error thresholds from boost_error_index
    this.errorThresholds = [20.3, 11.7, 5.3, 2.1]; // Critical, Severe, Moderate, Mild
    
    // Load tune file parameters if available
    this.loadTuneFileParameters();
  }

  loadTuneFileParameters() {
    if (window.tuneFileParser && window.tuneFileParser.isLoaded()) {
      this.errorThresholds = window.tuneFileParser.getBoostErrorIndex();
    }
  }

  /**
   * Classify boost error severity based on error thresholds
   * @param {number} error - Boost error in kPa (positive = overboost, negative = undershoot)
   * @returns {string} - Severity: 'critical', 'severe', 'moderate', 'mild', or 'normal'
   */
  classifyErrorSeverity(error) {
    const absError = Math.abs(error);
    
    if (absError > this.errorThresholds[0]) {
      return 'critical';
    } else if (absError > this.errorThresholds[1]) {
      return 'severe';
    } else if (absError > this.errorThresholds[2]) {
      return 'moderate';
    } else if (absError > this.errorThresholds[3]) {
      return 'mild';
    } else {
      return 'normal';
    }
  }

  analyze() {
    const data = this.dataProcessor.getData();
    if (!data || data.length === 0) {
      return null;
    }

    const columns = this.dataProcessor.getColumns();
    
    // Find boost-related columns with flexible matching
    // Try many variations for boost target
    const boostTargetCol = this.findColumn(columns, [
      'Boost Target (kPa)',
      'Boost Target',
      'BoostTarget',
      'Boost Target kPa',
      'Boost Target(kPa)',
      'Target Boost',
      'Target Boost (kPa)',
      'Boost Setpoint',
      'Boost Setpoint (kPa)',
      'Desired Boost',
      'Desired Boost (kPa)'
    ]);
    
    // Try many variations for actual boost/manifold pressure
    const actualBoostCol = this.findColumn(columns, [
      'Manifold Absolute Pressure (kPa)',
      'Manifold Air Pressure - Filtered (kPa)',
      'Manifold Air Pressure - Filtered',
      'Manifold Absolute Pressure',
      'Manifold Pressure',
      'Manifold Pressure (kPa)',
      'MAP',
      'MAP (kPa)',
      'Boost Pressure',
      'Boost Pressure (kPa)',
      'Actual Boost',
      'Actual Boost (kPa)',
      'Intake Manifold Pressure',
      'Intake Manifold Pressure (kPa)'
    ]);
    
    // Try many variations for wastegate
    const wastegateCol = this.findColumn(columns, [
      'Wastegate Duty Cycle (%)',
      'Wastegate Duty Cycle',
      'Wastegate DC',
      'Wastegate DC (%)',
      'WG Duty',
      'WG Duty (%)',
      'Wastegate',
      'Wastegate (%)',
      'Wastegate Duty',
      'Wastegate Duty (%)',
      'WG Duty Cycle',
      'WG Duty Cycle (%)'
    ]);

    // Log what we found
    console.log('Boost column detection results:');
    console.log('  Boost Target:', boostTargetCol || 'NOT FOUND');
    console.log('  Actual Boost:', actualBoostCol || 'NOT FOUND');
    console.log('  Wastegate:', wastegateCol || 'NOT FOUND');
    
    if (!actualBoostCol) {
      console.warn('Required boost column (actual boost/manifold pressure) not found');
      console.warn('Available columns:', columns);
      // Return empty result structure instead of null so tab can still render
      const emptyResult = {
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
        columns: {
          boostTarget: boostTargetCol,
          actualBoost: actualBoostCol,
          wastegate: wastegateCol
        },
        error: 'Required boost column (actual boost/manifold pressure) not found in log file. Available columns logged to console.'
      };
      this.analysisResults = emptyResult;
      return emptyResult;
    }
    
    // If boost target is not found, we can still analyze actual boost pressure
    // but we won't be able to calculate error. Let's use a default target or analyze actual boost only
    if (!boostTargetCol) {
      console.warn('Boost target column not found. Will analyze actual boost pressure only (no error calculation).');
      console.warn('Available columns:', columns);
    }

    // Filter data to only include rows where actual boost is >= 100 kPa
    // Below 100 kPa is atmospheric/vacuum, not boost conditions
    const filteredData = data.filter(row => {
      const actualBoost = parseFloat(row[actualBoostCol]) || 0;
      return actualBoost >= 100;
    });
    
    console.log(`Filtered ${data.length} rows to ${filteredData.length} rows (>= 100 kPa)`);
    
    if (filteredData.length === 0) {
      console.warn('No data points above 100 kPa found');
      const emptyResult = {
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
        columns: {
          boostTarget: boostTargetCol,
          actualBoost: actualBoostCol,
          wastegate: wastegateCol
        },
        error: 'No boost data found (all values below 100 kPa)'
      };
      this.analysisResults = emptyResult;
      return emptyResult;
    }

    const events = [];
    let totalError = 0;
    let totalErrorAbs = 0;
    let inTargetCount = 0;
    let maxOvershoot = 0;
    let maxUndershoot = 0;
    let totalWastegateDC = 0;
    let wastegateCount = 0;

    filteredData.forEach((row, index) => {
      const time = row['Time (s)'];
      // If boost target column not found, use 0 as default (or could use a calculated average)
      const boostTarget = boostTargetCol ? (parseFloat(row[boostTargetCol]) || 0) : 0;
      const actualBoost = parseFloat(row[actualBoostCol]) || 0;
      const wastegateDC = wastegateCol ? (parseFloat(row[wastegateCol]) || 0) : null;

      // Calculate boost error (will be just actual boost if target is 0)
      const boostError = actualBoost - boostTarget;
      const boostErrorPercent = boostTarget > 0 ? (boostError / boostTarget) * 100 : 0;

      // Track statistics
      totalError += boostError;
      totalErrorAbs += Math.abs(boostError);
      if (Math.abs(boostError) <= this.targetTolerance) {
        inTargetCount++;
      }

      if (boostError > maxOvershoot) {
        maxOvershoot = boostError;
      }
      if (boostError < maxUndershoot) {
        maxUndershoot = boostError;
      }

      if (wastegateDC !== null) {
        totalWastegateDC += wastegateDC;
        wastegateCount++;
      }

      // Get throttle position and RPM
      const throttle = row['Throttle Position (%)'] || 0;
      const rpm = row['Engine Speed (rpm)'] || 0;
      
      // Check boost limit violation (RPM-based)
      let boostLimitViolation = false;
      let boostLimit = null;
      if (window.tuneFileParser && window.tuneFileParser.isLoaded()) {
        boostLimit = window.tuneFileParser.getBoostLimit(rpm);
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
      
      // Classify error severity
      const severity = this.classifyErrorSeverity(boostError);
      
      // Check wastegate saturation
      let wastegateSaturated = false;
      if (wastegateDC !== null) {
        // Get wastegate max if available
        if (window.tuneFileParser && window.tuneFileParser.isLoaded()) {
          const wgMaxTable = window.tuneFileParser.getTable('wg_max');
          const wgRpmIndex = window.tuneFileParser.getArray('wg_rpm_index');
          const wgTpsIndex = window.tuneFileParser.getArray('wg_tps_index');
          if (wgMaxTable && wgRpmIndex && wgTpsIndex) {
            const wgMax = window.tuneFileParser.interpolate2D(wgMaxTable, wgRpmIndex, wgTpsIndex, rpm, throttle);
            // Check if wastegate is at max during overboost (saturation)
            if (eventType === 'overshoot' && wastegateDC >= wgMax * 0.95) {
              wastegateSaturated = true;
            }
            // Check if wastegate is at min during undershoot (saturation)
            if (eventType === 'undershoot' && wastegateDC <= 5.0) { // 5% threshold for "closed"
              wastegateSaturated = true;
            }
          }
        }
      }

      // Only create events for overshoot/undershoot, significant deviations, or boost limit violations
      if (boostLimitViolation || eventType !== 'normal' || Math.abs(boostError) > this.targetTolerance) {
        // Skip overshoot events at low throttle (< 30%) unless it's a limit violation
        if (eventType === 'overshoot' && throttle < 30 && !boostLimitViolation) {
          return; // Continue to next iteration
        }
        
        // Skip undershoot events when throttle is 50% or less unless it's a limit violation
        if (eventType === 'undershoot' && throttle <= 50 && !boostLimitViolation) {
          return; // Continue to next iteration
        }
        
        events.push({
          index: index,
          time: time,
          boostTarget: boostTarget,
          actualBoost: actualBoost,
          boostError: boostError,
          boostErrorPercent: boostErrorPercent,
          wastegateDC: wastegateDC,
          rpm: rpm,
          throttle: throttle,
          load: row['Load (MAF) (g/rev)'] || 0,
          eventType: boostLimitViolation ? 'limit_violation' : eventType,
          severity: boostLimitViolation ? 'critical' : severity,
          boostLimit: boostLimit,
          boostLimitViolation: boostLimitViolation,
          wastegateSaturated: wastegateSaturated
        });
      }
    });

    // Group nearby events of the same type
    console.log(`Raw boost events detected (before grouping): ${events.length}`);
    const groupedEvents = this.groupBoostEvents(events);
    console.log(`Grouped boost events: ${groupedEvents.length}`);

    const timeRange = this.dataProcessor.getTimeRange();
    const totalTime = timeRange.max - timeRange.min;
    const inTargetPercent = filteredData.length > 0 ? (inTargetCount / filteredData.length) * 100 : 0;

    // Count events by severity
    const criticalEvents = groupedEvents.filter(e => e.severity === 'critical').length;
    const severeEvents = groupedEvents.filter(e => e.severity === 'severe').length;
    const moderateEvents = groupedEvents.filter(e => e.severity === 'moderate').length;
    const mildEvents = groupedEvents.filter(e => e.severity === 'mild').length;
    const limitViolations = groupedEvents.filter(e => e.eventType === 'limit_violation').length;
    const wastegateSaturatedEvents = groupedEvents.filter(e => e.wastegateSaturated === true).length;

    this.analysisResults = {
      events: groupedEvents,
      statistics: {
        totalDataPoints: filteredData.length,
        avgBoostError: filteredData.length > 0 ? totalError / filteredData.length : 0,
        avgBoostErrorAbs: filteredData.length > 0 ? totalErrorAbs / filteredData.length : 0,
        maxOvershoot: maxOvershoot,
        maxUndershoot: maxUndershoot,
        inTargetPercent: inTargetPercent,
        overshootEvents: groupedEvents.filter(e => e.eventType === 'overshoot').length,
        undershootEvents: groupedEvents.filter(e => e.eventType === 'undershoot').length,
        limitViolations: limitViolations,
        criticalEvents: criticalEvents,
        severeEvents: severeEvents,
        moderateEvents: moderateEvents,
        mildEvents: mildEvents,
        wastegateSaturatedEvents: wastegateSaturatedEvents,
        avgWastegateDC: wastegateCount > 0 ? totalWastegateDC / wastegateCount : 0,
        timeRange: timeRange
      },
      columns: {
        boostTarget: boostTargetCol,
        actualBoost: actualBoostCol,
        wastegate: wastegateCol
      }
    };

    return this.analysisResults;
  }

  groupBoostEvents(events) {
    if (events.length === 0) {
      return [];
    }

    // Separate events by type (overshoot, undershoot, normal)
    const overshootEvents = events.filter(e => e.eventType === 'overshoot');
    const undershootEvents = events.filter(e => e.eventType === 'undershoot');
    const normalEvents = events.filter(e => e.eventType === 'normal');

    // Group each type separately
    const groupedOvershoot = this.groupEventsByType(overshootEvents);
    const groupedUndershoot = this.groupEventsByType(undershootEvents);
    
    // Filter overshoot events to only include those with duration >= 0.25 seconds
    const minOvershootDuration = 0.25; // seconds
    const filteredOvershoot = groupedOvershoot.filter(event => {
      return event.duration >= minOvershootDuration;
    });
    
    console.log(`Filtered ${groupedOvershoot.length} overshoot events to ${filteredOvershoot.length} (min duration: ${minOvershootDuration}s)`);
    
    // Filter undershoot events to only include those with duration >= 0.5 seconds
    const minUndershootDuration = 0.5; // seconds
    const filteredUndershoot = groupedUndershoot.filter(event => {
      return event.duration >= minUndershootDuration;
    });
    
    console.log(`Filtered ${groupedUndershoot.length} undershoot events to ${filteredUndershoot.length} (min duration: ${minUndershootDuration}s)`);
    
    // Normal events don't need grouping, but we can include them if needed
    // For now, we'll only include overshoot and undershoot events in the results
    return [...filteredOvershoot, ...filteredUndershoot].sort((a, b) => a.time - b.time);
  }

  groupEventsByType(eventList) {
    if (eventList.length === 0) {
      return [];
    }

    // Sort events by time
    const sortedEvents = [...eventList].sort((a, b) => a.time - b.time);
    const groupedEvents = [];
    let currentGroup = [sortedEvents[0]];

    for (let i = 1; i < sortedEvents.length; i++) {
      const currentEvent = sortedEvents[i];
      const lastEventInGroup = currentGroup[currentGroup.length - 1];
      const timeDiff = currentEvent.time - lastEventInGroup.time;

      // If within the time window, add to current group
      if (timeDiff <= this.groupingTimeWindow) {
        currentGroup.push(currentEvent);
      } else {
        // Time gap is too large, finalize current group and start new one
        groupedEvents.push(this.createGroupedEvent(currentGroup));
        currentGroup = [currentEvent];
      }
    }

    // Don't forget the last group
    if (currentGroup.length > 0) {
      groupedEvents.push(this.createGroupedEvent(currentGroup));
    }

    return groupedEvents;
  }

  createGroupedEvent(eventGroup) {
    // Find the most severe event (largest absolute error)
    const mostSevereEvent = eventGroup.reduce((prev, current) => {
      return Math.abs(current.boostError) > Math.abs(prev.boostError) ? current : prev;
    });

    // Calculate averages for other metrics
    const avgBoostTarget = eventGroup.reduce((sum, e) => sum + e.boostTarget, 0) / eventGroup.length;
    const avgActualBoost = eventGroup.reduce((sum, e) => sum + e.actualBoost, 0) / eventGroup.length;
    const avgBoostError = eventGroup.reduce((sum, e) => sum + e.boostError, 0) / eventGroup.length;
    const avgBoostErrorPercent = eventGroup.reduce((sum, e) => sum + e.boostErrorPercent, 0) / eventGroup.length;
    const avgWastegateDC = eventGroup.filter(e => e.wastegateDC !== null).length > 0
      ? eventGroup.filter(e => e.wastegateDC !== null).reduce((sum, e) => sum + e.wastegateDC, 0) / eventGroup.filter(e => e.wastegateDC !== null).length
      : null;
    const avgRpm = eventGroup.reduce((sum, e) => sum + e.rpm, 0) / eventGroup.length;
    const avgThrottle = eventGroup.reduce((sum, e) => sum + e.throttle, 0) / eventGroup.length;
    const avgLoad = eventGroup.reduce((sum, e) => sum + e.load, 0) / eventGroup.length;

    // Use the start time of the group
    const startTime = eventGroup[0].time;
    const endTime = eventGroup[eventGroup.length - 1].time;
    const duration = endTime - startTime;

    return {
      index: mostSevereEvent.index,
      time: startTime, // Start time of the event group
      endTime: endTime, // End time of the event group
      duration: duration, // Duration of the event group
      boostTarget: avgBoostTarget,
      actualBoost: avgActualBoost,
      boostError: mostSevereEvent.boostError, // Use most severe error
      maxBoostError: Math.max(...eventGroup.map(e => Math.abs(e.boostError))) * (mostSevereEvent.boostError < 0 ? -1 : 1), // Most severe error with sign
      avgBoostError: avgBoostError,
      boostErrorPercent: mostSevereEvent.boostErrorPercent, // Use most severe error percent
      avgBoostErrorPercent: avgBoostErrorPercent,
      wastegateDC: avgWastegateDC,
      rpm: Math.round(avgRpm),
      throttle: avgThrottle,
      load: avgLoad,
      eventType: mostSevereEvent.eventType,
      eventCount: eventGroup.length // Number of data points in this grouped event
    };
  }

  findColumn(columns, possibleNames) {
    // First try exact match
    for (const name of possibleNames) {
      if (columns.includes(name)) {
        return name;
      }
    }
    
    // Try case-insensitive exact match
    for (const name of possibleNames) {
      const found = columns.find(col => col.toLowerCase() === name.toLowerCase());
      if (found) {
        return found;
      }
    }
    
    // Try partial matching (case-insensitive)
    // Remove special characters and normalize for comparison
    const normalize = (str) => str.toLowerCase().replace(/[()°%-\s]/g, '');
    
    for (const name of possibleNames) {
      const normalizedName = normalize(name);
      const found = columns.find(col => {
        const normalizedCol = normalize(col);
        // Check if column contains all key words from the search name
        const nameWords = normalizedName.split(/\s+/).filter(w => w.length > 2);
        return nameWords.every(word => normalizedCol.includes(word));
      });
      if (found) {
        console.log(`Found column "${found}" for search term "${name}"`);
        return found;
      }
    }
    
    // Try keyword-based search (for boost target, look for "boost" and "target")
    // For actual boost, look for "manifold" or "map" or "boost" and "pressure"
    // For wastegate, look for "wastegate" or "wg" and "duty" or "cycle"
    const keywords = {
      'boost': ['boost', 'target', 'setpoint', 'desired'],
      'actual': ['manifold', 'map', 'pressure', 'boost', 'actual'],
      'wastegate': ['wastegate', 'wg', 'duty', 'cycle']
    };
    
    // Determine which type we're looking for based on possible names
    let searchType = null;
    if (possibleNames.some(n => n.toLowerCase().includes('target') || n.toLowerCase().includes('setpoint'))) {
      searchType = 'boost';
    } else if (possibleNames.some(n => n.toLowerCase().includes('wastegate') || n.toLowerCase().includes('wg'))) {
      searchType = 'wastegate';
    } else {
      searchType = 'actual';
    }
    
    if (searchType && keywords[searchType]) {
      const searchKeywords = keywords[searchType];
      const found = columns.find(col => {
        const colLower = col.toLowerCase();
        // Check if column contains at least 2 of the keywords
        const matches = searchKeywords.filter(kw => colLower.includes(kw)).length;
        return matches >= 2;
      });
      if (found) {
        console.log(`Found column "${found}" using keyword search for "${searchType}"`);
        return found;
      }
    }
    
    return null;
  }

  getStatistics() {
    if (!this.analysisResults) {
      this.analyze();
    }
    return this.analysisResults ? this.analysisResults.statistics : null;
  }

  getEvents() {
    if (!this.analysisResults) {
      this.analyze();
    }
    return this.analysisResults ? this.analysisResults.events : [];
  }

  getOvershootEvents() {
    return this.getEvents().filter(e => e.eventType === 'overshoot');
  }

  getUndershootEvents() {
    return this.getEvents().filter(e => e.eventType === 'undershoot');
  }

  getColumns() {
    if (!this.analysisResults) {
      this.analyze();
    }
    return this.analysisResults ? this.analysisResults.columns : null;
  }
}

