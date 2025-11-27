// IntakeAirTemperatureAnalyzer class for analyzing intake air temperature
class IntakeAirTemperatureAnalyzer {
  constructor(dataProcessor) {
    this.dataProcessor = dataProcessor;
    this.analysisResults = null;
    this.groupingTimeWindow = 2.0; // Group events within 2.0 seconds (2000ms)
    
    // IAT thresholds based on compensation table ranges
    // IAT index breakpoints: -20, 0, 20, 40, 60, 80, 100, 120°C
    // Normal operating range: typically 20-60°C
    this.iatNormalMin = 20.0; // °C - Lower bound of normal range
    this.iatNormalMax = 60.0; // °C - Upper bound of normal range
    this.iatHighThreshold = 80.0; // °C - High temperature threshold (affects boost/spark)
    this.iatCriticalThreshold = 100.0; // °C - Critical temperature threshold
    this.iatLowThreshold = 0.0; // °C - Low temperature threshold (cold air)
    this.iatVeryLowThreshold = -10.0; // °C - Very low temperature threshold
    
    // Load tune file parameters if available
    this.loadTuneFileParameters();
  }

  loadTuneFileParameters() {
    if (window.tuneFileParser && window.tuneFileParser.isLoaded()) {
      // Get IAT index breakpoints from boost_target_iat_index
      const iatIndex = window.tuneFileParser.getArray('boost_target_iat_index');
      if (iatIndex && iatIndex.length >= 2) {
        // IAT index: -20, 0, 20, 40, 60, 80, 100, 120°C
        // Use the index values to set thresholds
        const sortedIndex = [...iatIndex].sort((a, b) => a - b);
        this.iatLowThreshold = sortedIndex[0] || 0.0; // First breakpoint (typically -20°C)
        this.iatNormalMin = sortedIndex[1] || 20.0; // Second breakpoint (typically 0°C)
        this.iatNormalMax = sortedIndex[4] || 60.0; // Fifth breakpoint (typically 60°C)
        this.iatHighThreshold = sortedIndex[6] || 80.0; // Seventh breakpoint (typically 80°C)
        this.iatCriticalThreshold = sortedIndex[7] || 100.0; // Last breakpoint (typically 100°C)
        this.iatVeryLowThreshold = sortedIndex[0] - 10 || -10.0; // Below first breakpoint
      }
      
      // Check if IAT compensation is enabled
      const iatEnableAt = window.tuneFileParser.getParameter('boost_iat_enable_at');
      const iatEnableMt = window.tuneFileParser.getParameter('boost_iat_enable_mt');
      this.iatCompensationEnabled = (iatEnableAt === 1 || iatEnableMt === 1);
    } else {
      this.iatCompensationEnabled = true; // Default to enabled
    }
  }

  analyze() {
    const data = this.dataProcessor.getData();
    if (!data || data.length === 0) {
      return null;
    }

    const columns = this.dataProcessor.getColumns();
    
    // Find intake air temperature column with flexible matching
    const iatCol = this.findColumn(columns, [
      'Intake Air Temperature (°C)',
      'Intake Air Temperature',
      'IAT (°C)',
      'IAT',
      'Intake Air Temp',
      'Intake Air Temp (°C)',
      'Air Intake Temperature',
      'Air Intake Temperature (°C)'
    ]);

    // Log what we found
    console.log('Intake Air Temperature column detection results:');
    console.log('  Intake Air Temperature:', iatCol || 'NOT FOUND');
    
    if (!iatCol) {
      console.warn('Required intake air temperature column not found');
      console.warn('Available columns:', columns);
      // Return empty result structure instead of null so tab can still render
      const emptyResult = {
        events: [],
        statistics: {
          totalDataPoints: 0,
          minIAT: 0,
          maxIAT: 0,
          avgIAT: 0,
          highTempEvents: 0,
          lowTempEvents: 0,
          criticalTempEvents: 0,
          timeAboveHighThreshold: 0,
          timeBelowLowThreshold: 0,
          timeRange: this.dataProcessor ? this.dataProcessor.getTimeRange() : { min: 0, max: 0 }
        },
        columns: {
          iat: iatCol
        },
        error: 'Required intake air temperature column not found in log file. Available columns logged to console.'
      };
      this.analysisResults = emptyResult;
      return emptyResult;
    }

    const events = [];
    let totalIAT = 0;
    let validDataPointCount = 0;
    let minIAT = 200;
    let maxIAT = -50;
    let timeAboveHighThreshold = 0;
    let timeBelowLowThreshold = 0;
    let previousTime = null;
    let previousIAT = null;

    data.forEach((row, index) => {
      const time = row['Time (s)'];
      const iat = parseFloat(row[iatCol]) || 0;

      // Skip if value is invalid (NaN or extreme outliers)
      if (isNaN(iat) || iat < -50 || iat > 200) {
        return;
      }

      validDataPointCount++;
      
      // Track statistics
      totalIAT += iat;
      if (iat < minIAT) {
        minIAT = iat;
      }
      if (iat > maxIAT) {
        maxIAT = iat;
      }

      // Calculate time above/below thresholds
      if (previousTime !== null && previousIAT !== null) {
        const timeDiff = time - previousTime;
        if (previousIAT >= this.iatHighThreshold) {
          timeAboveHighThreshold += timeDiff;
        }
        if (previousIAT <= this.iatLowThreshold) {
          timeBelowLowThreshold += timeDiff;
        }
      }

      // Determine event type and severity
      let eventType = 'normal';
      let severity = 'normal';
      
      if (iat >= this.iatCriticalThreshold) {
        eventType = 'high_temp';
        severity = 'critical'; // Critical high temperature (affects engine performance/safety)
      } else if (iat >= this.iatHighThreshold) {
        eventType = 'high_temp';
        severity = 'severe'; // High temperature (affects boost/spark compensation)
      } else if (iat <= this.iatVeryLowThreshold) {
        eventType = 'low_temp';
        severity = 'severe'; // Very low temperature (may cause issues)
      } else if (iat <= this.iatLowThreshold) {
        eventType = 'low_temp';
        severity = 'moderate'; // Low temperature (cold air, may affect performance)
      } else if (iat < this.iatNormalMin || iat > this.iatNormalMax) {
        eventType = iat < this.iatNormalMin ? 'low_temp' : 'high_temp';
        severity = 'mild'; // Outside normal range but not extreme
      }

      // Create events for abnormal temperature conditions
      if (eventType !== 'normal') {
        events.push({
          index: index,
          time: time,
          iat: iat,
          rpm: row['Engine Speed (rpm)'] || 0,
          throttle: row['Throttle Position (%)'] || 0,
          load: row['Load (MAF) (g/rev)'] || 0,
          speed: row['Vehicle Speed (km/h)'] || 0,
          boost: row['Boost (kPa)'] || row['Manifold Absolute Pressure (kPa)'] || 0,
          eventType: eventType,
          severity: severity,
          aboveHighThreshold: iat >= this.iatHighThreshold,
          belowLowThreshold: iat <= this.iatLowThreshold,
          iatHighThreshold: this.iatHighThreshold,
          iatLowThreshold: this.iatLowThreshold,
          iatCriticalThreshold: this.iatCriticalThreshold
        });
      }

      previousTime = time;
      previousIAT = iat;
    });

    // Group nearby events
    console.log(`Raw intake air temperature events detected (before grouping): ${events.length}`);
    const groupedEvents = this.groupIATEvents(events);
    console.log(`Grouped intake air temperature events: ${groupedEvents.length}`);

    const timeRange = this.dataProcessor.getTimeRange();
    const totalTime = timeRange.max - timeRange.min;
    const timeAboveHighThresholdPercent = totalTime > 0 ? (timeAboveHighThreshold / totalTime) * 100 : 0;
    const timeBelowLowThresholdPercent = totalTime > 0 ? (timeBelowLowThreshold / totalTime) * 100 : 0;

    this.analysisResults = {
      events: groupedEvents,
      statistics: {
        totalDataPoints: validDataPointCount,
        minIAT: minIAT,
        maxIAT: maxIAT,
        avgIAT: validDataPointCount > 0 ? totalIAT / validDataPointCount : 0,
        highTempEvents: groupedEvents.filter(e => e.eventType === 'high_temp').length,
        lowTempEvents: groupedEvents.filter(e => e.eventType === 'low_temp').length,
        criticalTempEvents: groupedEvents.filter(e => e.severity === 'critical').length,
        timeAboveHighThreshold: timeAboveHighThresholdPercent,
        timeBelowLowThreshold: timeBelowLowThresholdPercent,
        iatHighThreshold: this.iatHighThreshold,
        iatLowThreshold: this.iatLowThreshold,
        iatCriticalThreshold: this.iatCriticalThreshold,
        iatNormalMin: this.iatNormalMin,
        iatNormalMax: this.iatNormalMax,
        timeRange: timeRange
      },
      columns: {
        iat: iatCol
      }
    };

    return this.analysisResults;
  }

  groupIATEvents(events) {
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
    // Find the most severe event (highest or lowest temperature depending on type)
    const mostSevereEvent = eventGroup.reduce((prev, current) => {
      if (current.eventType === 'high_temp') {
        return current.iat > prev.iat ? current : prev;
      } else {
        return current.iat < prev.iat ? current : prev;
      }
    });

    // Calculate averages for other metrics
    const avgIAT = eventGroup.reduce((sum, e) => sum + e.iat, 0) / eventGroup.length;
    const avgRpm = eventGroup.reduce((sum, e) => sum + e.rpm, 0) / eventGroup.length;
    const avgThrottle = eventGroup.reduce((sum, e) => sum + e.throttle, 0) / eventGroup.length;
    const avgLoad = eventGroup.reduce((sum, e) => sum + e.load, 0) / eventGroup.length;
    const avgSpeed = eventGroup.reduce((sum, e) => sum + e.speed, 0) / eventGroup.length;
    const avgBoost = eventGroup.reduce((sum, e) => sum + e.boost, 0) / eventGroup.length;

    // Use the start time of the group
    const startTime = eventGroup[0].time;
    const endTime = eventGroup[eventGroup.length - 1].time;
    const duration = endTime - startTime;

    return {
      index: mostSevereEvent.index,
      time: startTime,
      endTime: endTime,
      duration: duration,
      iat: mostSevereEvent.iat, // Most extreme temp in group
      maxIAT: Math.max(...eventGroup.map(e => e.iat)),
      minIAT: Math.min(...eventGroup.map(e => e.iat)),
      avgIAT: avgIAT,
      rpm: Math.round(avgRpm),
      throttle: avgThrottle,
      load: avgLoad,
      speed: avgSpeed,
      boost: avgBoost,
      eventType: mostSevereEvent.eventType,
      severity: mostSevereEvent.severity,
      aboveHighThreshold: eventGroup.some(e => e.aboveHighThreshold),
      belowLowThreshold: eventGroup.some(e => e.belowLowThreshold),
      iatHighThreshold: mostSevereEvent.iatHighThreshold,
      iatLowThreshold: mostSevereEvent.iatLowThreshold,
      iatCriticalThreshold: mostSevereEvent.iatCriticalThreshold,
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
    const keywords = ['intake', 'air', 'temperature', 'iat'];
    
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

