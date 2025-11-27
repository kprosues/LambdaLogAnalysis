// CoolantTemperatureAnalyzer class for analyzing engine coolant temperature
class CoolantTemperatureAnalyzer {
  constructor(dataProcessor) {
    this.dataProcessor = dataProcessor;
    this.analysisResults = null;
    this.groupingTimeWindow = 2.0; // Group events within 2.0 seconds (2000ms)
    
    // Fan temperature thresholds (from tune file fan_temp table)
    // fan_temp is a 2x2 table: [low_speed_on, low_speed_off], [high_speed_on, high_speed_off]
    this.fanLowSpeedOn = 95.0; // °C - Low speed fan turns on
    this.fanLowSpeedOff = 90.0; // °C - Low speed fan turns off
    this.fanHighSpeedOn = 105.0; // °C - High speed fan turns on
    this.fanHighSpeedOff = 100.0; // °C - High speed fan turns off
    
    // Load tune file parameters if available
    this.loadTuneFileParameters();
  }

  loadTuneFileParameters() {
    if (window.tuneFileParser && window.tuneFileParser.isLoaded()) {
      const fanTemps = window.tuneFileParser.getFanTemperatures();
      this.fanLowSpeedOn = fanTemps.lowSpeedOn;
      this.fanLowSpeedOff = fanTemps.lowSpeedOff;
      this.fanHighSpeedOn = fanTemps.highSpeedOn;
      this.fanHighSpeedOff = fanTemps.highSpeedOff;
    }
  }

  analyze() {
    const data = this.dataProcessor.getData();
    if (!data || data.length === 0) {
      return null;
    }

    const columns = this.dataProcessor.getColumns();
    
    // Find coolant temperature column with flexible matching
    const coolantTempCol = this.findColumn(columns, [
      'Coolant Temperature (°C)',
      'Coolant Temperature',
      'Engine Coolant Temperature (°C)',
      'Engine Coolant Temperature',
      'ECT (°C)',
      'ECT',
      'Coolant Temp',
      'Coolant Temp (°C)',
      'Engine Coolant Temp',
      'Engine Coolant Temp (°C)'
    ]);

    // Log what we found
    console.log('Coolant Temperature column detection results:');
    console.log('  Coolant Temperature:', coolantTempCol || 'NOT FOUND');
    
    if (!coolantTempCol) {
      console.warn('Required coolant temperature column not found');
      console.warn('Available columns:', columns);
      // Return empty result structure instead of null so tab can still render
      const emptyResult = {
        events: [],
        statistics: {
          totalDataPoints: 0,
          minTemp: 0,
          maxTemp: 0,
          avgTemp: 0,
          highTempEvents: 0,
          criticalTempEvents: 0,
          timeAboveLowSpeedFan: 0,
          timeAboveHighSpeedFan: 0,
          timeRange: this.dataProcessor ? this.dataProcessor.getTimeRange() : { min: 0, max: 0 }
        },
        columns: {
          coolantTemp: coolantTempCol
        },
        error: 'Required coolant temperature column not found in log file. Available columns logged to console.'
      };
      this.analysisResults = emptyResult;
      return emptyResult;
    }

    const events = [];
    let totalTemp = 0;
    let validDataPointCount = 0;
    let minTemp = 200;
    let maxTemp = -50;
    let timeAboveLowSpeedFan = 0;
    let timeAboveHighSpeedFan = 0;
    let previousTime = null;
    let previousTemp = null;

    data.forEach((row, index) => {
      const time = row['Time (s)'];
      const coolantTemp = parseFloat(row[coolantTempCol]) || 0;

      // Skip if value is invalid (NaN or 0)
      if (isNaN(coolantTemp) || coolantTemp <= 0) {
        return;
      }

      validDataPointCount++;
      
      // Track statistics
      totalTemp += coolantTemp;
      if (coolantTemp < minTemp) {
        minTemp = coolantTemp;
      }
      if (coolantTemp > maxTemp) {
        maxTemp = coolantTemp;
      }

      // Calculate time above high speed fan threshold
      if (previousTime !== null && previousTemp !== null) {
        const timeDiff = time - previousTime;
        if (previousTemp >= this.fanHighSpeedOn) {
          timeAboveHighSpeedFan += timeDiff;
        }
      }

      // Determine event type and severity
      // Only flag errors above high speed fan threshold
      let eventType = 'normal';
      let severity = 'normal';
      
      if (coolantTemp >= this.fanHighSpeedOn) {
        eventType = 'high_temp';
        severity = 'critical'; // Above high speed fan threshold
      }

      // Create events only for high temperature conditions (above high speed fan)
      if (eventType !== 'normal') {
        events.push({
          index: index,
          time: time,
          coolantTemp: coolantTemp,
          rpm: row['Engine Speed (rpm)'] || 0,
          throttle: row['Throttle Position (%)'] || 0,
          load: row['Load (MAF) (g/rev)'] || 0,
          speed: row['Vehicle Speed (km/h)'] || 0,
          eventType: eventType,
          severity: severity,
          aboveHighSpeedFan: coolantTemp >= this.fanHighSpeedOn,
          fanHighSpeedOn: this.fanHighSpeedOn
        });
      }

      previousTime = time;
      previousTemp = coolantTemp;
    });

    // Group nearby events
    console.log(`Raw coolant temperature events detected (before grouping): ${events.length}`);
    const groupedEvents = this.groupCoolantTempEvents(events);
    console.log(`Grouped coolant temperature events: ${groupedEvents.length}`);

    const timeRange = this.dataProcessor.getTimeRange();
    const totalTime = timeRange.max - timeRange.min;
    const timeAboveHighSpeedFanPercent = totalTime > 0 ? (timeAboveHighSpeedFan / totalTime) * 100 : 0;

    this.analysisResults = {
      events: groupedEvents,
      statistics: {
        totalDataPoints: validDataPointCount,
        minTemp: minTemp,
        maxTemp: maxTemp,
        avgTemp: validDataPointCount > 0 ? totalTemp / validDataPointCount : 0,
        highTempEvents: groupedEvents.filter(e => e.eventType === 'high_temp').length,
        criticalTempEvents: groupedEvents.filter(e => e.severity === 'critical').length,
        timeAboveHighSpeedFan: timeAboveHighSpeedFanPercent,
        fanHighSpeedOn: this.fanHighSpeedOn,
        timeRange: timeRange
      },
      columns: {
        coolantTemp: coolantTempCol
      }
    };

    return this.analysisResults;
  }

  groupCoolantTempEvents(events) {
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
    // Find the most severe event (highest temperature)
    const mostSevereEvent = eventGroup.reduce((prev, current) => {
      return current.coolantTemp > prev.coolantTemp ? current : prev;
    });

    // Calculate averages for other metrics
    const avgTemp = eventGroup.reduce((sum, e) => sum + e.coolantTemp, 0) / eventGroup.length;
    const avgRpm = eventGroup.reduce((sum, e) => sum + e.rpm, 0) / eventGroup.length;
    const avgThrottle = eventGroup.reduce((sum, e) => sum + e.throttle, 0) / eventGroup.length;
    const avgLoad = eventGroup.reduce((sum, e) => sum + e.load, 0) / eventGroup.length;
    const avgSpeed = eventGroup.reduce((sum, e) => sum + e.speed, 0) / eventGroup.length;

    // Use the start time of the group
    const startTime = eventGroup[0].time;
    const endTime = eventGroup[eventGroup.length - 1].time;
    const duration = endTime - startTime;

    return {
      index: mostSevereEvent.index,
      time: startTime,
      endTime: endTime,
      duration: duration,
      coolantTemp: mostSevereEvent.coolantTemp, // Highest temp in group
      maxTemp: Math.max(...eventGroup.map(e => e.coolantTemp)),
      minTemp: Math.min(...eventGroup.map(e => e.coolantTemp)),
      avgTemp: avgTemp,
      rpm: Math.round(avgRpm),
      throttle: avgThrottle,
      load: avgLoad,
      speed: avgSpeed,
      eventType: mostSevereEvent.eventType,
      severity: mostSevereEvent.severity,
      aboveHighSpeedFan: eventGroup.some(e => e.aboveHighSpeedFan),
      fanHighSpeedOn: mostSevereEvent.fanHighSpeedOn,
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
    const keywords = ['coolant', 'temperature', 'ect'];
    
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

