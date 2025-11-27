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

    const events = [];
    let totalError = 0;
    let totalErrorAbs = 0;
    let inTargetCount = 0;
    let maxLean = 0;
    let maxRich = 0;
    let validDataPointCount = 0;
    let validDataPointCountForTimeInTarget = 0; // Counts points with throttle >= 15%

    data.forEach((row, index) => {
      const time = row['Time (s)'];
      const targetAFR = parseFloat(row[targetAFRCol]) || 0;
      const measuredAFR = parseFloat(row[measuredAFRCol]) || 0;

      // Skip if either value is invalid (0 or NaN)
      // Lambda values should never be 0, so this is a valid check
      if (!targetAFR || !measuredAFR || isNaN(targetAFR) || isNaN(measuredAFR)) {
        return;
      }

      // Skip records where commanded AFR is 1 (stoichiometric, often idle/neutral state)
      // Use small tolerance for floating point comparison
      if (Math.abs(targetAFR - 1.0) < 0.001) {
        return;
      }

      validDataPointCount++;

      // Get throttle position, RPM, and load (needed for filtering and PE mode detection)
      const throttle = parseFloat(row['Throttle Position (%)']) || 0;
      const rpm = parseFloat(row['Engine Speed (rpm)']) || 0;
      const load = parseFloat(row['Load (MAF) (g/rev)']) || 0;

      // Early exit: Skip all AFR error events at very low throttle (< 10%) unless it's a target mismatch
      // This must be checked early, before calculating error and determining event type
      // We'll check for target mismatch after PE mode detection, but filter lean/rich events here
      let isPEMode = false;
      let expectedPETarget = null;
      let targetMismatch = false;
      
      if (window.tuneFileParser && window.tuneFileParser.isLoaded()) {
        isPEMode = window.tuneFileParser.isPEModeActive(rpm, load, throttle);
        
        if (isPEMode) {
          // Calculate expected PE target (use pe_initial for now, could check IAM for pe_safe)
          expectedPETarget = window.tuneFileParser.getPETarget(rpm, load, 'initial');
          
          // Check if logged target matches expected target (within tolerance)
          if (expectedPETarget && Math.abs(targetAFR - expectedPETarget) > 0.01) {
            targetMismatch = true;
          }
        }
      }

      // Calculate AFR error: measured - target
      // Positive error = measured > target = lean (too much air)
      // Negative error = measured < target = rich (too much fuel)
      const afrError = measuredAFR - targetAFR;
      const afrErrorPercent = targetAFR > 0 ? (afrError / targetAFR) * 100 : 0;

      // Use different thresholds for PE mode vs closed-loop
      const leanThreshold = isPEMode ? this.peLeanThreshold : this.leanThreshold;
      const richThreshold = isPEMode ? this.peRichThreshold : this.richThreshold;
      const targetTolerance = isPEMode ? this.peTargetTolerance : this.targetTolerance;

      // Determine event type based on error magnitude
      // Use stricter thresholds for PE mode, but still detect in closed-loop
      let eventType = 'normal';
      if (afrError > leanThreshold) {
        eventType = 'lean';
      } else if (afrError < richThreshold) {
        eventType = 'rich';
      }

      // Skip all events at very low throttle (< 10%) unless it's a target mismatch
      // Low throttle events are often idle/neutral and less meaningful, regardless of error size
      // This check must happen before creating any events
      if (throttle < 10 && !targetMismatch) {
        // Still track statistics for these points, but don't create events
        totalError += afrError;
        totalErrorAbs += Math.abs(afrError);
        
        // Only count "in target" for points with throttle >= 15%
        if (Math.abs(afrError) <= targetTolerance && throttle >= 15) {
          inTargetCount++;
        }
        
        if (afrError > maxLean) {
          maxLean = afrError;
        }
        if (afrError < maxRich) {
          maxRich = afrError;
        }
        
        return; // Continue to next iteration without adding event
      }

      // Count data points that meet "time in target" criteria (throttle >= 15%)
      if (throttle >= 15) {
        validDataPointCountForTimeInTarget++;
      }

      // Track statistics
      totalError += afrError;
      totalErrorAbs += Math.abs(afrError);
      
      // Only count "in target" for points with throttle >= 15%
      if (Math.abs(afrError) <= targetTolerance && throttle >= 15) {
        inTargetCount++;
      }

      if (afrError > maxLean) {
        maxLean = afrError;
      }
      if (afrError < maxRich) {
        maxRich = afrError;
      }

      // Create events for lean/rich conditions, significant deviations, or target mismatches
      // Suppress events that deviate 7% or less from target (unless it's a target mismatch)
      const isSignificantDeviation = eventType !== 'normal' || Math.abs(afrError) > targetTolerance;
      const meetsMinimumDeviation = Math.abs(afrErrorPercent) > 7.0;
      
      // Always create target mismatch events, but for other events require > 7% deviation
      const shouldCreateEvent = targetMismatch || (isSignificantDeviation && meetsMinimumDeviation);

      if (shouldCreateEvent) {
        events.push({
          index: index,
          time: time,
          targetAFR: targetAFR,
          measuredAFR: measuredAFR,
          afrError: afrError,
          afrErrorPercent: afrErrorPercent,
          rpm: rpm,
          throttle: throttle,
          load: load,
          eventType: targetMismatch ? 'target_mismatch' : eventType,
          isPEMode: isPEMode,
          expectedPETarget: expectedPETarget,
          targetMismatch: targetMismatch
        });
      }
    });

    // Group nearby events of the same type
    console.log(`Raw AFR events detected (before grouping): ${events.length}`);
    const groupedEvents = this.groupAFREvents(events);
    console.log(`Grouped AFR events: ${groupedEvents.length}`);

    // Calculate "time in target" using only data points with throttle >= 15%
    // This excludes idle/low throttle periods and target AFR of 1
    const inTargetPercent = validDataPointCountForTimeInTarget > 0 ? (inTargetCount / validDataPointCountForTimeInTarget) * 100 : 0;

    this.analysisResults = {
      events: groupedEvents,
      statistics: {
        totalDataPoints: validDataPointCount,
        avgError: validDataPointCount > 0 ? totalError / validDataPointCount : 0,
        avgErrorAbs: validDataPointCount > 0 ? totalErrorAbs / validDataPointCount : 0,
        maxLean: maxLean,
        maxRich: maxRich,
        inTargetPercent: inTargetPercent,
        leanEvents: groupedEvents.filter(e => e.eventType === 'lean').length,
        richEvents: groupedEvents.filter(e => e.eventType === 'rich').length,
        pemodeEvents: groupedEvents.filter(e => e.isPEMode === true).length,
        targetMismatchEvents: groupedEvents.filter(e => e.targetMismatch === true).length,
        timeRange: this.dataProcessor ? this.dataProcessor.getTimeRange() : { min: 0, max: 0 }
      },
      columns: {
        targetAFR: targetAFRCol,
        measuredAFR: measuredAFRCol
      }
    };

    return this.analysisResults;
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
    const duration = endTime - startTime;
    
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

