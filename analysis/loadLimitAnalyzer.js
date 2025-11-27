// LoadLimitAnalyzer class for analyzing load limit violations
class LoadLimitAnalyzer {
  constructor(dataProcessor) {
    this.dataProcessor = dataProcessor;
    this.analysisResults = null;
    this.groupingTimeWindow = 0.5; // Group events within 0.5 seconds (500ms)
    this.warningThreshold = 0.9; // Flag when load is at 90% of limit (approaching limit)
  }

  analyze() {
    const data = this.dataProcessor.getData();
    if (!data || data.length === 0) {
      return null;
    }

    const columns = this.dataProcessor.getColumns();
    
    // Find load column with flexible matching
    const loadCol = this.findColumn(columns, [
      'Load (MAF) (g/rev)',
      'Load (MAF)',
      'Load',
      'Load (g/rev)',
      'Engine Load (g/rev)',
      'Engine Load',
      'MAF Load (g/rev)',
      'MAF Load'
    ]);

    // Log what we found
    console.log('Load Limit column detection results:');
    console.log('  Load:', loadCol || 'NOT FOUND');
    
    if (!loadCol) {
      console.warn('Required load column not found');
      console.warn('Available columns:', columns);
      // Return empty result structure instead of null so tab can still render
      const emptyResult = {
        events: [],
        statistics: {
          totalDataPoints: 0,
          maxLoad: 0,
          violations: 0,
          timeNearLimit: 0,
          avgLoadLimit: 0,
          timeRange: this.dataProcessor ? this.dataProcessor.getTimeRange() : { min: 0, max: 0 }
        },
        columns: {
          load: loadCol
        },
        error: 'Required load column not found in log file. Available columns logged to console.'
      };
      this.analysisResults = emptyResult;
      return emptyResult;
    }

    const events = [];
    let totalLoad = 0;
    let totalLoadLimit = 0;
    let validDataPointCount = 0;
    let maxLoad = 0;
    let violations = 0;
    let timeNearLimit = 0;
    let totalTime = 0;

    data.forEach((row, index) => {
      const time = row['Time (s)'];
      const load = parseFloat(row[loadCol]) || 0;
      const rpm = row['Engine Speed (rpm)'] || 0;

      // Skip if value is invalid (NaN or 0)
      if (isNaN(load) || load <= 0 || rpm <= 0) {
        return;
      }

      validDataPointCount++;

      // Get load limit for current RPM
      let loadLimit = null;
      if (window.tuneFileParser && window.tuneFileParser.isLoaded()) {
        loadLimit = window.tuneFileParser.getLoadLimit(rpm);
      } else {
        // Use default fallback values from documentation
        // Base file: 1.28 to 2.54 g/rev, increases with RPM
        const defaultLimits = [1.28, 1.35, 1.42, 1.50, 1.58, 1.67, 1.75, 1.83, 1.92, 2.00, 2.08, 2.17, 2.25, 2.33, 2.42, 2.54];
        const defaultRpmIndex = [800, 1200, 1600, 2000, 2400, 2800, 3200, 3600, 4000, 4400, 4800, 5200, 5600, 6000, 6400, 6800];
        
        // Simple interpolation
        let limitIdx = 0;
        for (let i = 0; i < defaultRpmIndex.length - 1; i++) {
          if (rpm >= defaultRpmIndex[i] && rpm < defaultRpmIndex[i + 1]) {
            limitIdx = i;
            break;
          }
          if (rpm >= defaultRpmIndex[defaultRpmIndex.length - 1]) {
            limitIdx = defaultRpmIndex.length - 1;
            break;
          }
        }
        loadLimit = defaultLimits[limitIdx];
      }

      // Validate loadLimit is a valid number
      if (!loadLimit || isNaN(loadLimit) || loadLimit <= 0) {
        return; // Skip if we can't determine limit or it's invalid
      }

      // Track statistics
      totalLoad += load;
      totalLoadLimit += loadLimit;
      
      if (load > maxLoad) {
        maxLoad = load;
      }

      // Check for load limit violation
      const loadRatio = load / loadLimit;
      const isViolation = load > loadLimit;
      const isNearLimit = loadRatio >= this.warningThreshold && loadRatio < 1.0;

      if (isViolation) {
        violations++;
      }
      if (isNearLimit || isViolation) {
        timeNearLimit++;
      }

      // Check if fuel cut occurs (injector pulsewidth drops to 0)
      const injectorPW = parseFloat(row['Injector Pulse Width (ms)'] || row['Injector Pulsewidth (ms)'] || 0);
      const fuelCut = injectorPW <= 0.1; // Very low or zero pulsewidth indicates fuel cut

      // Determine event type and severity
      let eventType = 'normal';
      let severity = 'normal';
      
      if (isViolation) {
        eventType = 'limit_violation';
        severity = 'critical'; // Load limit violation is always critical
      } else if (isNearLimit) {
        eventType = 'near_limit';
        severity = 'severe'; // Approaching limit is severe
      }

      // Create events for violations or near-limit conditions
      if (eventType !== 'normal') {
        events.push({
          index: index,
          time: time,
          load: load,
          loadLimit: loadLimit,
          loadRatio: loadRatio,
          rpm: rpm,
          throttle: row['Throttle Position (%)'] || 0,
          boost: row['Manifold Absolute Pressure (kPa)'] || 0,
          fuelCut: fuelCut,
          injectorPW: injectorPW,
          eventType: eventType,
          severity: severity
        });
      }
    });

    // Group nearby events
    console.log(`Raw load limit events detected (before grouping): ${events.length}`);
    const groupedEvents = this.groupLoadLimitEvents(events);
    console.log(`Grouped load limit events: ${groupedEvents.length}`);

    const timeRange = this.dataProcessor.getTimeRange();
    totalTime = timeRange.max - timeRange.min;
    const timeNearLimitPercent = validDataPointCount > 0 ? (timeNearLimit / validDataPointCount) * 100 : 0;

    // Calculate average load limit, ensuring we handle NaN cases
    let avgLoadLimitValue = 0;
    if (validDataPointCount > 0 && totalLoadLimit > 0 && !isNaN(totalLoadLimit)) {
      avgLoadLimitValue = totalLoadLimit / validDataPointCount;
    } else if (window.tuneFileParser && window.tuneFileParser.isLoaded()) {
      // Fallback: try to get a default load limit from tune file
      const defaultRpm = 4000; // Use a mid-range RPM
      const defaultLimit = window.tuneFileParser.getLoadLimit(defaultRpm);
      if (defaultLimit && !isNaN(defaultLimit) && defaultLimit > 0) {
        avgLoadLimitValue = defaultLimit;
      }
    }

    this.analysisResults = {
      events: groupedEvents,
      statistics: {
        totalDataPoints: validDataPointCount,
        maxLoad: maxLoad || 0,
        violations: violations,
        violationEvents: groupedEvents.filter(e => e.eventType === 'limit_violation').length,
        nearLimitEvents: groupedEvents.filter(e => e.eventType === 'near_limit').length,
        timeNearLimit: timeNearLimitPercent,
        avgLoad: validDataPointCount > 0 && !isNaN(totalLoad) ? totalLoad / validDataPointCount : 0,
        avgLoadLimit: avgLoadLimitValue,
        fuelCutEvents: groupedEvents.filter(e => e.fuelCut === true).length,
        timeRange: timeRange
      },
      columns: {
        load: loadCol
      }
    };

    return this.analysisResults;
  }

  groupLoadLimitEvents(events) {
    if (events.length === 0) {
      return [];
    }

    // Sort events by time
    const sortedEvents = [...events].sort((a, b) => a.time - b.time);
    const groupedEvents = [];
    let currentGroup = [sortedEvents[0]];

    for (let i = 1; i < sortedEvents.length; i++) {
      const currentEvent = sortedEvents[i];
      const lastEventInGroup = currentGroup[currentGroup.length - 1];
      const timeDiff = currentEvent.time - lastEventInGroup.time;

      // If within the time window and same event type, add to current group
      if (timeDiff <= this.groupingTimeWindow && currentEvent.eventType === lastEventInGroup.eventType) {
        currentGroup.push(currentEvent);
      } else {
        // Time gap is too large or different type, finalize current group and start new one
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
    // Find the most severe event (highest load or highest ratio)
    const mostSevereEvent = eventGroup.reduce((prev, current) => {
      return current.loadRatio > prev.loadRatio ? current : prev;
    });

    // Calculate averages for other metrics
    const avgLoad = eventGroup.reduce((sum, e) => sum + e.load, 0) / eventGroup.length;
    const avgLoadLimit = eventGroup.reduce((sum, e) => sum + e.loadLimit, 0) / eventGroup.length;
    const avgRpm = eventGroup.reduce((sum, e) => sum + e.rpm, 0) / eventGroup.length;
    const avgThrottle = eventGroup.reduce((sum, e) => sum + e.throttle, 0) / eventGroup.length;
    const avgBoost = eventGroup.reduce((sum, e) => sum + e.boost, 0) / eventGroup.length;

    // Use the start time of the group
    const startTime = eventGroup[0].time;
    const endTime = eventGroup[eventGroup.length - 1].time;
    const duration = endTime - startTime;

    // Check if fuel cut occurred during this event
    const fuelCutOccurred = eventGroup.some(e => e.fuelCut === true);

    return {
      index: mostSevereEvent.index,
      time: startTime,
      endTime: endTime,
      duration: duration,
      load: mostSevereEvent.load, // Highest load in group
      maxLoad: Math.max(...eventGroup.map(e => e.load)),
      loadLimit: avgLoadLimit,
      loadRatio: mostSevereEvent.loadRatio, // Highest ratio in group
      maxLoadRatio: Math.max(...eventGroup.map(e => e.loadRatio)),
      rpm: Math.round(avgRpm),
      throttle: avgThrottle,
      boost: avgBoost,
      fuelCut: fuelCutOccurred,
      eventType: mostSevereEvent.eventType,
      severity: mostSevereEvent.severity,
      eventCount: eventGroup.length
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
    const normalize = (str) => str.toLowerCase().replace(/[()°%#\s-]/g, '');
    
    for (const name of possibleNames) {
      const normalizedName = normalize(name);
      const found = columns.find(col => {
        const normalizedCol = normalize(col);
        const nameWords = normalizedName.split(/\s+/).filter(w => w.length > 2);
        return nameWords.every(word => normalizedCol.includes(word));
      });
      if (found) {
        console.log(`Found column "${found}" for search term "${name}"`);
        return found;
      }
    }
    
    // Try keyword-based search
    const keywords = ['load', 'maf', 'g/rev'];
    
    const found = columns.find(col => {
      const colLower = col.toLowerCase();
      const matches = keywords.filter(kw => colLower.includes(kw.toLowerCase())).length;
      return matches >= 2;
    });
    if (found) {
      console.log(`Found column "${found}" using keyword search`);
      return found;
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

  getColumns() {
    if (!this.analysisResults) {
      this.analyze();
    }
    return this.analysisResults ? this.analysisResults.columns : null;
  }
}

