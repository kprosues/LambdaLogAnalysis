// AFRAnalyzer class for analyzing air/fuel ratio differences
class AFRAnalyzer {
  constructor(dataProcessor) {
    this.dataProcessor = dataProcessor;
    this.analysisResults = null;
    this.leanThreshold = 0.05; // λ above target (measured > target) - closed-loop
    this.richThreshold = -0.05; // λ below target (measured < target) - closed-loop
    this.targetTolerance = 0.02; // λ tolerance for "in target" range (±0.02 λ)
    this.groupingTimeWindow = 1.0; // Group events within 1.0 seconds (1000ms)
    
    // PE mode thresholds (stricter for open-loop operation)
    this.peLeanThreshold = 0.03; // λ above target in PE mode
    this.peRichThreshold = -0.03; // λ below target in PE mode
    this.peTargetTolerance = 0.015; // λ tolerance in PE mode (±0.015 λ)
  }

  analyze() {
    const data = this.dataProcessor.getData();
    if (!data || data.length === 0) {
      return null;
    }

    const columns = this.dataProcessor.getColumns();
    
    // Find AFR-related columns with flexible matching
    // Try many variations for AFR target
    const targetAFRCol = this.findColumn(columns, [
      'Power Mode - Fuel Ratio Target (λ)',
      'Power Mode - Fuel Ratio Target',
      'Fuel Ratio Target (λ)',
      'Fuel Ratio Target',
      'AFR Target (λ)',
      'AFR Target',
      'Target AFR (λ)',
      'Target AFR',
      'Fuel Target (λ)',
      'Fuel Target',
      'Desired AFR (λ)',
      'Desired AFR',
      'Commanded AFR (λ)',
      'Commanded AFR'
    ]);
    
    // Try many variations for measured AFR
    const measuredAFRCol = this.findColumn(columns, [
      'Air/Fuel Sensor #1 (λ)',
      'Air/Fuel Sensor #1',
      'Air Fuel Sensor #1 (λ)',
      'Air Fuel Sensor #1',
      'AFR Sensor #1 (λ)',
      'AFR Sensor #1',
      'Measured AFR (λ)',
      'Measured AFR',
      'Actual AFR (λ)',
      'Actual AFR',
      'O2 Sensor (λ)',
      'O2 Sensor',
      'Lambda Sensor #1 (λ)',
      'Lambda Sensor #1'
    ]);

    // Log what we found
    console.log('AFR column detection results:');
    console.log('  Target AFR:', targetAFRCol || 'NOT FOUND');
    console.log('  Measured AFR:', measuredAFRCol || 'NOT FOUND');
    
    if (!targetAFRCol || !measuredAFRCol) {
      console.warn('Required AFR columns not found');
      console.warn('Available columns:', columns);
      // Return empty result structure instead of null so tab can still render
      const emptyResult = {
        events: [],
        statistics: {
          totalDataPoints: 0,
          avgError: 0,
          avgErrorAbs: 0,
          avgDeviationPercent: 0,
          maxLean: 0,
          maxRich: 0,
          inTargetPercent: 0,
          leanEvents: 0,
          richEvents: 0,
          timeRange: this.dataProcessor ? this.dataProcessor.getTimeRange() : { min: 0, max: 0 }
        },
        columns: {
          targetAFR: targetAFRCol,
          measuredAFR: measuredAFRCol
        },
        error: 'Required AFR columns not found in log file. Available columns logged to console.'
      };
      this.analysisResults = emptyResult;
      return emptyResult;
    }

    const allDataPoints = [];
    const OPEN_LOOP_THRESHOLD = 0.85; // Target lambda < 0.85 indicates open loop (PE mode)
    
    // Statistics variables (will be calculated after filtering by duration)
    let totalError = 0;
    let totalErrorAbs = 0;
    let totalDeviationPercent = 0;
    let totalDeviationPercentAbs = 0;
    let inTargetCount = 0;
    let maxLean = 0;
    let maxRich = 0;
    let maxDeviationPercent = 0;
    let validDataPointCount = 0;

    data.forEach((row, index) => {
      const time = row['Time (s)'];
      const targetAFR = parseFloat(row[targetAFRCol]) || 0;
      const measuredAFR = parseFloat(row[measuredAFRCol]) || 0;

      // Skip if either value is invalid (0 or NaN)
      // Lambda values should never be 0, so this is a valid check
      if (!targetAFR || !measuredAFR || isNaN(targetAFR) || isNaN(measuredAFR)) {
        return;
      }

      // FOCUS ON OPEN LOOP MODE: Only process data points where target lambda < 0.85
      // This indicates power enrichment (PE) mode - open loop fueling
      if (targetAFR >= OPEN_LOOP_THRESHOLD) {
        return; // Skip closed-loop data points
      }

      // Get throttle position, RPM, and load
      const throttle = parseFloat(row['Throttle Position (%)']) || 0;
      const rpm = parseFloat(row['Engine Speed (rpm)']) || 0;
      const load = parseFloat(row['Load (MAF) (g/rev)']) || 0;

      // Calculate AFR error: measured - target
      const afrError = measuredAFR - targetAFR;
      
      // Calculate percent deviation from target: (error / target) * 100
      const deviationPercent = targetAFR > 0 ? (afrError / targetAFR) * 100 : 0;
      const deviationPercentAbs = Math.abs(deviationPercent);

      // Use PE mode thresholds
      const leanThreshold = this.peLeanThreshold;
      const richThreshold = this.peRichThreshold;
      const targetTolerance = this.peTargetTolerance;

      // Determine event type based on error magnitude
      let eventType = 'normal';
      if (afrError > leanThreshold) {
        eventType = 'lean';
      } else if (afrError < richThreshold) {
        eventType = 'rich';
      }

      // Check if this is a significant deviation (error or outside tolerance)
      const isSignificantDeviation = eventType !== 'normal' || Math.abs(afrError) > targetTolerance;

      allDataPoints.push({
        index: index,
        time: time,
        targetAFR: targetAFR,
        measuredAFR: measuredAFR,
        afrError: afrError,
        afrErrorPercent: deviationPercent,
        deviationPercent: deviationPercent,
        deviationPercentAbs: deviationPercentAbs,
        rpm: rpm,
        throttle: throttle,
        load: load,
        eventType: eventType,
        isSignificantDeviation: isSignificantDeviation,
        isInTarget: Math.abs(afrError) <= targetTolerance
      });
    });

    // Calculate average sampling interval from the full dataset for accurate duration calculation
    let avgSamplingInterval = 0.05; // Default to 50ms if we can't calculate
    if (data && data.length > 1) {
      let totalInterval = 0;
      let intervalCount = 0;
      for (let i = 1; i < Math.min(data.length, 1000); i++) { // Sample first 1000 points for efficiency
        const time1 = parseFloat(data[i - 1]['Time (s)']);
        const time2 = parseFloat(data[i]['Time (s)']);
        if (!isNaN(time1) && !isNaN(time2)) {
          const interval = time2 - time1;
          if (interval > 0 && interval < 1.0) { // Only count reasonable intervals (< 1 second)
            totalInterval += interval;
            intervalCount++;
          }
        }
      }
      if (intervalCount > 0) {
        avgSamplingInterval = totalInterval / intervalCount;
      }
      // Ensure minimum sampling interval (at least 10ms)
      if (avgSamplingInterval < 0.01) {
        avgSamplingInterval = 0.01;
      }
      console.log(`AFR Analyzer: Calculated average sampling interval: ${(avgSamplingInterval * 1000).toFixed(2)}ms`);
    } else {
      console.warn('AFR Analyzer: Could not calculate sampling interval, using default 50ms');
    }

    // Group consecutive error periods and filter by duration (100ms minimum)
    const MIN_ERROR_DURATION = 0.1; // 100ms
    const errorPeriods = this.groupErrorPeriods(allDataPoints, MIN_ERROR_DURATION, avgSamplingInterval);
    
    // Only count data points that are part of error periods lasting > 100ms
    const validDataPoints = allDataPoints.filter(dp => {
      return errorPeriods.some(period => 
        period.dataPoints.some(p => p.index === dp.index)
      );
    });

    // Calculate statistics only for valid data points (errors lasting > 100ms)
    validDataPoints.forEach(dp => {
      validDataPointCount++;
      totalError += dp.afrError;
      totalErrorAbs += Math.abs(dp.afrError);
      totalDeviationPercent += dp.deviationPercent;
      totalDeviationPercentAbs += dp.deviationPercentAbs;

      if (dp.isInTarget) {
        inTargetCount++;
      }

      if (dp.afrError > maxLean) {
        maxLean = dp.afrError;
      }
      if (dp.afrError < maxRich) {
        maxRich = dp.afrError;
      }
      if (dp.deviationPercentAbs > maxDeviationPercent) {
        maxDeviationPercent = dp.deviationPercentAbs;
      }
    });

    // Create events only from error periods that last > 100ms
    const events = errorPeriods.map(period => {
      // Find the most severe error in the period
      const mostSevere = period.dataPoints.reduce((prev, current) => {
        return Math.abs(current.afrError) > Math.abs(prev.afrError) ? current : prev;
      });

      // Ensure duration is calculated and valid
      let eventDuration = period.duration;
      if (!eventDuration || eventDuration <= 0 || isNaN(eventDuration)) {
        // Recalculate duration if it's missing or invalid
        eventDuration = this.calculatePeriodDuration(period, avgSamplingInterval);
        // Safety check: ensure duration is at least the sampling interval
        if (!eventDuration || eventDuration <= 0) {
          eventDuration = avgSamplingInterval;
        }
      }

      return {
        index: mostSevere.index,
        time: period.startTime,
        endTime: period.endTime,
        duration: eventDuration,
        targetAFR: mostSevere.targetAFR,
        measuredAFR: mostSevere.measuredAFR,
        afrError: mostSevere.afrError,
        afrErrorPercent: mostSevere.deviationPercent,
        rpm: mostSevere.rpm,
        throttle: mostSevere.throttle,
        load: mostSevere.load,
        eventType: mostSevere.eventType,
        isPEMode: true,
        deviationPercent: mostSevere.deviationPercent
      };
    });

    // Group nearby events of the same type
    console.log(`Raw AFR events detected (before grouping): ${events.length}`);
    const groupedEvents = this.groupAFREvents(events);
    console.log(`Grouped AFR events: ${groupedEvents.length}`);

    // Calculate "time in target" percentage for open loop mode
    const inTargetPercent = validDataPointCount > 0 ? (inTargetCount / validDataPointCount) * 100 : 0;

    // Calculate average deviation percentage (absolute value) from target
    const avgDeviationPercent = validDataPointCount > 0 ? totalDeviationPercentAbs / validDataPointCount : 0;

    this.analysisResults = {
      events: groupedEvents,
      statistics: {
        totalDataPoints: validDataPointCount,
        avgError: validDataPointCount > 0 ? totalError / validDataPointCount : 0,
        avgErrorAbs: validDataPointCount > 0 ? totalErrorAbs / validDataPointCount : 0,
        avgDeviationPercent: avgDeviationPercent,
        maxLean: maxLean,
        maxRich: maxRich,
        maxDeviationPercent: maxDeviationPercent,
        inTargetPercent: inTargetPercent,
        leanEvents: groupedEvents.filter(e => e.eventType === 'lean').length,
        richEvents: groupedEvents.filter(e => e.eventType === 'rich').length,
        timeRange: this.dataProcessor ? this.dataProcessor.getTimeRange() : { min: 0, max: 0 }
      },
      columns: {
        targetAFR: targetAFRCol,
        measuredAFR: measuredAFRCol
      },
      validDataPoints: validDataPoints, // Store for pe_final calculation (errors > 100ms)
      allOpenLoopDataPoints: allDataPoints // Store all open loop data points for pe_final calculation
    };

    return this.analysisResults;
  }

  groupErrorPeriods(dataPoints, minDuration, avgSamplingInterval) {
    // Group consecutive data points with significant deviations into error periods
    const errorPeriods = [];
    let currentPeriod = null;

    // Sort by time
    const sortedPoints = [...dataPoints].sort((a, b) => a.time - b.time);

    for (const point of sortedPoints) {
      if (!point.isSignificantDeviation) {
        // End current period if we hit a point without significant deviation
        if (currentPeriod) {
          const duration = this.calculatePeriodDuration(currentPeriod, avgSamplingInterval);
          if (duration >= minDuration) {
            currentPeriod.duration = duration;
            errorPeriods.push(currentPeriod);
          }
          currentPeriod = null;
        }
        continue;
      }

      if (!currentPeriod) {
        // Start a new error period
        currentPeriod = {
          startTime: point.time,
          endTime: point.time,
          dataPoints: [point]
        };
      } else {
        // Check if this point is consecutive (within reasonable time gap, e.g., 0.5s)
        const timeDiff = point.time - currentPeriod.endTime;
        if (timeDiff <= 0.5) {
          // Continue the current period
          currentPeriod.endTime = point.time;
          currentPeriod.dataPoints.push(point);
        } else {
          // Gap too large, finalize current period and start new one
          const duration = this.calculatePeriodDuration(currentPeriod, avgSamplingInterval);
          if (duration >= minDuration) {
            currentPeriod.duration = duration;
            errorPeriods.push(currentPeriod);
          }
          currentPeriod = {
            startTime: point.time,
            endTime: point.time,
            dataPoints: [point]
          };
        }
      }
    }

    // Don't forget the last period
    if (currentPeriod) {
      const duration = this.calculatePeriodDuration(currentPeriod, avgSamplingInterval);
      if (duration >= minDuration) {
        currentPeriod.duration = duration;
        errorPeriods.push(currentPeriod);
      }
    }

    return errorPeriods;
  }

  calculatePeriodDuration(period, avgSamplingInterval) {
    // Calculate duration accounting for sampling interval
    // For a period with N data points spanning from t1 to tN:
    // Duration = (tN - t1) + avgSamplingInterval
    // This accounts for the fact that the last data point represents a sample over an interval
    const timeSpan = period.endTime - period.startTime;
    const numPoints = period.dataPoints.length;
    
    let duration;
    if (numPoints === 1) {
      // Single data point: use average sampling interval as duration
      // This represents the time span covered by a single sample
      duration = avgSamplingInterval;
    } else {
      // Multiple data points: 
      // Duration = time span from first to last point + one sampling interval
      // This accounts for the fact that the last point represents a sample over an interval
      const calculatedDuration = timeSpan + avgSamplingInterval;
      // Ensure minimum duration is at least (numPoints * avgSamplingInterval) to account for all points
      const minExpectedDuration = numPoints * avgSamplingInterval;
      duration = Math.max(calculatedDuration, minExpectedDuration);
    }
    
    // Safety check: ensure duration is never zero or negative
    // Use at least the sampling interval as minimum
    return Math.max(duration, avgSamplingInterval);
  }

  groupAFREvents(events) {
    if (events.length === 0) {
      return [];
    }

    // Separate events by type (lean, rich, normal)
    const leanEvents = events.filter(e => e.eventType === 'lean');
    const richEvents = events.filter(e => e.eventType === 'rich');
    const normalEvents = events.filter(e => e.eventType === 'normal');

    // Group each type separately
    const groupedLean = this.groupEventsByType(leanEvents);
    const groupedRich = this.groupEventsByType(richEvents);
    
    // Include normal events if they represent significant deviations
    // (already filtered to only include deviations > tolerance)
    const groupedNormal = this.groupEventsByType(normalEvents);
    
    // Combine all grouped events
    return [...groupedLean, ...groupedRich, ...groupedNormal].sort((a, b) => a.time - b.time);
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
      return Math.abs(current.afrError) > Math.abs(prev.afrError) ? current : prev;
    });

    // Use the start time of the group
    const startTime = eventGroup[0].time;
    const endTime = eventGroup[eventGroup.length - 1].time;
    
    // Calculate duration: sum of individual event durations, or time span if durations are missing
    // This ensures grouped events have accurate duration
    let duration = 0;
    const validDurations = eventGroup.filter(e => e.duration && e.duration > 0 && !isNaN(e.duration));
    if (validDurations.length > 0) {
      // Sum the durations of all events in the group
      duration = validDurations.reduce((sum, e) => sum + e.duration, 0);
    } else {
      // Fallback: use time span + estimate based on number of events
      const timeSpan = endTime - startTime;
      // Estimate sampling interval from the events themselves
      let estimatedInterval = 0.05; // Default 50ms
      if (eventGroup.length > 1) {
        const intervals = [];
        for (let i = 1; i < eventGroup.length; i++) {
          const interval = eventGroup[i].time - eventGroup[i - 1].time;
          if (interval > 0 && interval < 1.0) {
            intervals.push(interval);
          }
        }
        if (intervals.length > 0) {
          estimatedInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
        }
      }
      // Duration = time span + one sampling interval per event
      duration = Math.max(timeSpan + estimatedInterval, eventGroup.length * estimatedInterval);
    }
    
    // Use the actual values from the event at the start time (to match chart display)
    // This ensures table values match what's shown in the chart at that time
    const startEvent = eventGroup[0];
    
    // Calculate averages for statistics/metrics that benefit from averaging
    const avgAFRError = eventGroup.reduce((sum, e) => sum + e.afrError, 0) / eventGroup.length;
    const avgAFRErrorPercent = eventGroup.reduce((sum, e) => sum + e.afrErrorPercent, 0) / eventGroup.length;
    const avgRpm = eventGroup.reduce((sum, e) => sum + e.rpm, 0) / eventGroup.length;
    const avgThrottle = eventGroup.reduce((sum, e) => sum + e.throttle, 0) / eventGroup.length;
    const avgLoad = eventGroup.reduce((sum, e) => sum + e.load, 0) / eventGroup.length;

    return {
      index: mostSevereEvent.index,
      time: startTime, // Start time of the event group
      endTime: endTime, // End time of the event group
      duration: duration, // Duration of the event group
      targetAFR: startEvent.targetAFR, // Use actual value at start time (matches chart)
      measuredAFR: startEvent.measuredAFR, // Use actual value at start time (matches chart)
      afrError: mostSevereEvent.afrError, // Use most severe error
      maxAFRError: Math.max(...eventGroup.map(e => Math.abs(e.afrError))) * (mostSevereEvent.afrError < 0 ? -1 : 1), // Most severe error with sign
      avgAFRError: avgAFRError,
      afrErrorPercent: mostSevereEvent.afrErrorPercent, // Use most severe error percent
      avgAFRErrorPercent: avgAFRErrorPercent,
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
    const normalize = (str) => str.toLowerCase().replace(/[()°%#\s-]/g, '');
    
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
    
    // Try keyword-based search
    const keywords = {
      'target': ['fuel', 'ratio', 'target', 'commanded', 'desired', 'power', 'mode'],
      'measured': ['fuel', 'sensor', 'measured', 'actual', 'lambda', 'o2', 'afr']
    };
    
    // Determine which type we're looking for based on possible names
    let searchType = null;
    if (possibleNames.some(n => n.toLowerCase().includes('target') || n.toLowerCase().includes('commanded') || n.toLowerCase().includes('desired'))) {
      searchType = 'target';
    } else {
      searchType = 'measured';
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

  getLeanEvents() {
    return this.getEvents().filter(e => e.eventType === 'lean');
  }

  getRichEvents() {
    return this.getEvents().filter(e => e.eventType === 'rich');
  }

  getColumns() {
    if (!this.analysisResults) {
      this.analyze();
    }
    return this.analysisResults ? this.analysisResults.columns : null;
  }

}

