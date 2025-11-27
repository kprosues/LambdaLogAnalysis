// FuelTrimAnalyzer class for analyzing short term fuel trim values
class FuelTrimAnalyzer {
  constructor(dataProcessor) {
    this.dataProcessor = dataProcessor;
    this.analysisResults = null;
    this.abnormalThreshold = 10.0; // % - values exceeding +/- 10% are abnormal
    this.groupingTimeWindow = 0.5; // Group events within 0.5 seconds (500ms)
    this.minimumDuration = 0.3; // Minimum duration in seconds (300ms) for events to be reported
  }

  analyze() {
    const data = this.dataProcessor.getData();
    if (!data || data.length === 0) {
      return null;
    }

    const columns = this.dataProcessor.getColumns();
    
    // Find short term fuel trim column with flexible matching
    const shortTermTrimCol = this.findColumn(columns, [
      'Fuel Trim - Short Term (%)',
      'Fuel Trim - Short Term',
      'Short Term Fuel Trim (%)',
      'Short Term Fuel Trim',
      'STFT (%)',
      'STFT',
      'Short Term Trim (%)',
      'Short Term Trim',
      'Fuel Trim Short Term (%)',
      'Fuel Trim Short Term',
      'ST Fuel Trim (%)',
      'ST Fuel Trim'
    ]);

    // Log what we found
    console.log('Fuel Trim column detection results:');
    console.log('  Short Term Fuel Trim:', shortTermTrimCol || 'NOT FOUND');
    
    if (!shortTermTrimCol) {
      console.warn('Required fuel trim column not found');
      console.warn('Available columns:', columns);
      // Return empty result structure instead of null so tab can still render
      const emptyResult = {
        events: [],
        statistics: {
          totalDataPoints: 0,
          avgTrim: 0,
          avgTrimAbs: 0,
          maxPositive: 0,
          maxNegative: 0,
          inTargetPercent: 0,
          abnormalEvents: 0,
          positiveEvents: 0,
          negativeEvents: 0,
          timeRange: this.dataProcessor ? this.dataProcessor.getTimeRange() : { min: 0, max: 0 }
        },
        columns: {
          shortTermTrim: shortTermTrimCol
        },
        error: 'Required fuel trim column not found in log file. Available columns logged to console.'
      };
      this.analysisResults = emptyResult;
      return emptyResult;
    }

    const events = [];
    let totalTrim = 0;
    let totalTrimAbs = 0;
    let inTargetCount = 0;
    let maxPositive = 0;
    let maxNegative = 0;
    let validDataPointCount = 0;

    data.forEach((row, index) => {
      const time = row['Time (s)'];
      const shortTermTrim = parseFloat(row[shortTermTrimCol]) || 0;

      // Skip if value is invalid (NaN)
      if (isNaN(shortTermTrim)) {
        return;
      }

      const rpm = row['Engine Speed (rpm)'] || 0;
      const throttle = row['Throttle Position (%)'] || 0;
      const load = row['Load (MAF) (g/rev)'] || 0;
      const ect = row['Coolant Temperature (°C)'] || 0;
      const iat = row['Intake Air Temperature (°C)'] || 0;

      // Check if in PE mode (STFT should be near 0% in open-loop)
      let isPEMode = false;
      if (window.tuneFileParser && window.tuneFileParser.isLoaded()) {
        isPEMode = window.tuneFileParser.isPEModeActive(rpm, load, throttle);
      }

      // Filter out STFT events during PE mode (expected to be near 0% in open-loop)
      // Only analyze STFT during closed-loop operation
      if (isPEMode) {
        // In PE mode, STFT should be near 0%. Flag if it's not.
        // Use stricter threshold for PE mode (5% instead of 10%)
        if (Math.abs(shortTermTrim) > 5.0) {
          // This is abnormal - STFT should be near 0% in PE mode
          events.push({
            index: index,
            time: time,
            shortTermTrim: shortTermTrim,
            rpm: rpm,
            throttle: throttle,
            load: load,
            afr: row['Air/Fuel Sensor #1 (λ)'] || 0,
            eventType: shortTermTrim > 0 ? 'positive' : 'negative',
            isPEMode: true,
            isAbnormalInPEMode: true
          });
        }
        // Don't count PE mode data points in normal statistics
        return;
      }

      validDataPointCount++;

      // Track statistics (only for closed-loop operation)
      totalTrim += shortTermTrim;
      totalTrimAbs += Math.abs(shortTermTrim);
      
      // Count "in target" (within +/- 10%)
      if (Math.abs(shortTermTrim) <= this.abnormalThreshold) {
        inTargetCount++;
      }

      if (shortTermTrim > maxPositive) {
        maxPositive = shortTermTrim;
      }
      if (shortTermTrim < maxNegative) {
        maxNegative = shortTermTrim;
      }

      // Determine event type
      // Positive = adding fuel (rich condition, ECU trying to lean out)
      // Negative = removing fuel (lean condition, ECU trying to enrich)
      let eventType = 'normal';
      let severity = 'normal';
      
      // Check trim limits
      const trimLimitWarning = 20.0; // Approaching ECU limits
      const trimLimitMax = 25.0; // ECU limit reached
      
      if (shortTermTrim > this.abnormalThreshold) {
        eventType = 'positive';
        if (shortTermTrim >= trimLimitMax) {
          severity = 'critical'; // At or above ECU limit
        } else if (shortTermTrim >= trimLimitWarning) {
          severity = 'severe'; // Approaching limit
        }
      } else if (shortTermTrim < -this.abnormalThreshold) {
        eventType = 'negative';
        if (shortTermTrim <= -trimLimitMax) {
          severity = 'critical'; // At or below ECU limit
        } else if (shortTermTrim <= -trimLimitWarning) {
          severity = 'severe'; // Approaching limit
        }
      }

      // Check if high trim is expected (compensation-aware)
      // High trim during cold start may be expected
      const isColdStart = ect < 60; // Below 60°C is cold
      // High trim during acceleration may be expected (accel enrichment)
      const isAcceleration = throttle > 50 && load > 1.0;
      
      // Create events for abnormal conditions (exceeding +/- 10%)
      // But flag if high trim is expected vs unexpected
      if (eventType !== 'normal') {
        events.push({
          index: index,
          time: time,
          shortTermTrim: shortTermTrim,
          rpm: rpm,
          throttle: throttle,
          load: load,
          afr: row['Air/Fuel Sensor #1 (λ)'] || 0,
          eventType: eventType,
          severity: severity,
          isPEMode: false,
          isColdStart: isColdStart,
          isAcceleration: isAcceleration,
          ect: ect,
          iat: iat
        });
      }
    });

    // Group nearby events of the same type
    console.log(`Raw fuel trim events detected (before grouping): ${events.length}`);
    const groupedEvents = this.groupFuelTrimEvents(events);
    console.log(`Grouped fuel trim events: ${groupedEvents.length}`);
    
    // Filter out events that don't meet minimum duration requirement
    const filteredEvents = groupedEvents.filter(event => {
      const duration = event.duration || 0;
      return duration >= this.minimumDuration;
    });
    console.log(`Fuel trim events after minimum duration filter (${this.minimumDuration}s): ${filteredEvents.length}`);

    const inTargetPercent = validDataPointCount > 0 ? (inTargetCount / validDataPointCount) * 100 : 0;

    this.analysisResults = {
      events: filteredEvents,
      statistics: {
        totalDataPoints: validDataPointCount,
        avgTrim: validDataPointCount > 0 ? totalTrim / validDataPointCount : 0,
        avgTrimAbs: validDataPointCount > 0 ? totalTrimAbs / validDataPointCount : 0,
        maxPositive: maxPositive,
        maxNegative: maxNegative,
        inTargetPercent: inTargetPercent,
        abnormalEvents: filteredEvents.length,
        positiveEvents: filteredEvents.filter(e => e.eventType === 'positive').length,
        negativeEvents: filteredEvents.filter(e => e.eventType === 'negative').length,
        timeRange: this.dataProcessor ? this.dataProcessor.getTimeRange() : { min: 0, max: 0 }
      },
      columns: {
        shortTermTrim: shortTermTrimCol
      }
    };

    return this.analysisResults;
  }

  groupFuelTrimEvents(events) {
    if (events.length === 0) {
      return [];
    }

    // Separate events by type (positive, negative)
    const positiveEvents = events.filter(e => e.eventType === 'positive');
    const negativeEvents = events.filter(e => e.eventType === 'negative');

    // Group each type separately
    const groupedPositive = this.groupEventsByType(positiveEvents);
    const groupedNegative = this.groupEventsByType(negativeEvents);
    
    // Combine all grouped events
    return [...groupedPositive, ...groupedNegative].sort((a, b) => a.time - b.time);
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
    // Find the most severe event (largest absolute trim value)
    const mostSevereEvent = eventGroup.reduce((prev, current) => {
      return Math.abs(current.shortTermTrim) > Math.abs(prev.shortTermTrim) ? current : prev;
    });

    // Calculate averages for other metrics
    const avgShortTermTrim = eventGroup.reduce((sum, e) => sum + e.shortTermTrim, 0) / eventGroup.length;
    const avgRpm = eventGroup.reduce((sum, e) => sum + e.rpm, 0) / eventGroup.length;
    const avgThrottle = eventGroup.reduce((sum, e) => sum + e.throttle, 0) / eventGroup.length;
    const avgLoad = eventGroup.reduce((sum, e) => sum + e.load, 0) / eventGroup.length;
    const avgAfr = eventGroup.reduce((sum, e) => sum + (e.afr || 0), 0) / eventGroup.length;

    // Use the start time of the group
    const startTime = eventGroup[0].time;
    const endTime = eventGroup[eventGroup.length - 1].time;
    const duration = endTime - startTime;

    return {
      index: mostSevereEvent.index,
      time: startTime, // Start time of the event group
      endTime: endTime, // End time of the event group
      duration: duration, // Duration of the event group
      shortTermTrim: mostSevereEvent.shortTermTrim, // Use most severe trim value
      maxShortTermTrim: Math.max(...eventGroup.map(e => Math.abs(e.shortTermTrim))) * (mostSevereEvent.shortTermTrim < 0 ? -1 : 1), // Most severe trim with sign
      avgShortTermTrim: avgShortTermTrim,
      rpm: Math.round(avgRpm),
      throttle: avgThrottle,
      load: avgLoad,
      afr: avgAfr,
      eventType: mostSevereEvent.eventType,
      severity: mostSevereEvent.severity || 'normal',
      isPEMode: eventGroup.some(e => e.isPEMode === true),
      isAbnormalInPEMode: eventGroup.some(e => e.isAbnormalInPEMode === true),
      isColdStart: eventGroup.some(e => e.isColdStart === true),
      isAcceleration: eventGroup.some(e => e.isAcceleration === true),
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
    const keywords = ['fuel', 'trim', 'short', 'term', 'stft'];
    
    const found = columns.find(col => {
      const colLower = col.toLowerCase();
      // Check if column contains at least 2 of the keywords
      const matches = keywords.filter(kw => colLower.includes(kw)).length;
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

  getPositiveEvents() {
    return this.getEvents().filter(e => e.eventType === 'positive');
  }

  getNegativeEvents() {
    return this.getEvents().filter(e => e.eventType === 'negative');
  }

  getColumns() {
    if (!this.analysisResults) {
      this.analyze();
    }
    return this.analysisResults ? this.analysisResults.columns : null;
  }
}

