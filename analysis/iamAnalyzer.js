// IAMAnalyzer class for analyzing Ignition Advance Multiplier
class IAMAnalyzer {
  constructor(dataProcessor) {
    this.dataProcessor = dataProcessor;
    this.analysisResults = null;
    this.lowThreshold = 0.30; // IAM < 0.30 indicates severe knock history
    this.criticalThreshold = 0.20; // IAM < 0.20 indicates very severe knock history
    this.groupingTimeWindow = 1.0; // Group events within 1.0 seconds (1000ms)
    this.iamInit = 0.50; // Initial IAM value (50%)
  }

  analyze() {
    const data = this.dataProcessor.getData();
    if (!data || data.length === 0) {
      return null;
    }

    const columns = this.dataProcessor.getColumns();
    
    // Find IAM column with flexible matching
    const iamCol = this.findColumn(columns, [
      'Ignition Advance Multiplier',
      'IAM',
      'Ignition Advance Multiplier (%)',
      'IAM (%)',
      'Ignition Advance Multiplier (0-1)',
      'IAM (0-1)',
      'Ignition Advance Multiplier (0-100)',
      'IAM (0-100)'
    ]);

    // Log what we found
    console.log('IAM column detection results:');
    console.log('  IAM:', iamCol || 'NOT FOUND');
    
    if (!iamCol) {
      console.warn('Required IAM column not found');
      console.warn('Available columns:', columns);
      // Return empty result structure instead of null so tab can still render
      const emptyResult = {
        events: [],
        statistics: {
          totalDataPoints: 0,
          currentIAM: 0,
          minIAM: 0,
          maxIAM: 0,
          avgIAM: 0,
          lowIAMEvents: 0,
          criticalIAMEvents: 0,
          stuckLowEvents: 0,
          recoveryRate: 0,
          timeRange: this.dataProcessor ? this.dataProcessor.getTimeRange() : { min: 0, max: 0 }
        },
        columns: {
          iam: iamCol
        },
        error: 'Required IAM column not found in log file. Available columns logged to console.'
      };
      this.analysisResults = emptyResult;
      return emptyResult;
    }

    // Load tune file parameters if available
    if (window.tuneFileParser && window.tuneFileParser.isLoaded()) {
      const iamInitParam = window.tuneFileParser.getParameter('iam_init');
      if (iamInitParam !== null && iamInitParam !== undefined) {
        this.iamInit = iamInitParam;
      }
    }

    const events = [];
    let totalIAM = 0;
    let validDataPointCount = 0;
    let minIAM = 1.0;
    let maxIAM = 0;
    let currentIAM = this.iamInit;
    let previousIAM = this.iamInit;
    let iamDrops = [];
    let recoveryRates = [];
    let stuckLowStartTime = null;
    let stuckLowDuration = 0;
    const stuckLowThreshold = 5.0; // Seconds - IAM stuck low for 5+ seconds

    data.forEach((row, index) => {
      const time = row['Time (s)'];
      let iam = parseFloat(row[iamCol]) || 0;

      // Normalize IAM value (could be 0-1 or 0-100)
      if (iam > 1.0) {
        iam = iam / 100.0; // Convert from 0-100 to 0-1
      }

      // Skip if value is invalid (NaN or 0)
      if (isNaN(iam) || iam <= 0) {
        return;
      }

      validDataPointCount++;
      currentIAM = iam; // Track current IAM

      // Track statistics
      totalIAM += iam;
      if (iam < minIAM) {
        minIAM = iam;
      }
      if (iam > maxIAM) {
        maxIAM = iam;
      }

      // Detect IAM drops
      const iamDrop = previousIAM - iam;
      if (iamDrop > 0.05) { // Significant drop (>5%)
        iamDrops.push({
          time: time,
          iam: iam,
          previousIAM: previousIAM,
          dropAmount: iamDrop,
          rpm: row['Engine Speed (rpm)'] || 0,
          throttle: row['Throttle Position (%)'] || 0,
          load: row['Load (MAF) (g/rev)'] || 0,
          knockRetard: row['Knock Retard (°)'] || 0
        });
      }

      // Detect IAM recovery (increase)
      const iamRecovery = iam - previousIAM;
      if (iamRecovery > 0.01 && previousIAM < 1.0) { // Recovering from low IAM
        recoveryRates.push({
          time: time,
          iam: iam,
          previousIAM: previousIAM,
          recoveryAmount: iamRecovery,
          timeSinceLastDrop: iamDrops.length > 0 ? time - iamDrops[iamDrops.length - 1].time : 0
        });
      }

      // Detect stuck low IAM
      if (iam < this.lowThreshold) {
        if (stuckLowStartTime === null) {
          stuckLowStartTime = time;
        } else {
          const duration = time - stuckLowStartTime;
          if (duration > stuckLowDuration) {
            stuckLowDuration = duration;
          }
        }
      } else {
        if (stuckLowStartTime !== null && (time - stuckLowStartTime) >= stuckLowThreshold) {
          // IAM was stuck low for significant duration
          events.push({
            index: index,
            time: stuckLowStartTime,
            endTime: time,
            duration: time - stuckLowStartTime,
            iam: iam,
            minIAM: minIAM,
            severity: iam < this.criticalThreshold ? 'critical' : 'severe',
            rpm: row['Engine Speed (rpm)'] || 0,
            throttle: row['Throttle Position (%)'] || 0,
            load: row['Load (MAF) (g/rev)'] || 0,
            eventType: 'stuck_low'
          });
        }
        stuckLowStartTime = null;
      }

      // Create events for low IAM conditions
      let eventType = 'normal';
      let severity = 'normal';
      
      if (iam < this.criticalThreshold) {
        eventType = 'low_iam';
        severity = 'critical';
      } else if (iam < this.lowThreshold) {
        eventType = 'low_iam';
        severity = 'severe';
      }

      // Only create events for significant drops or low IAM conditions
      if (eventType !== 'normal' || iamDrop > 0.1) {
        events.push({
          index: index,
          time: time,
          iam: iam,
          previousIAM: previousIAM,
          dropAmount: iamDrop,
          rpm: row['Engine Speed (rpm)'] || 0,
          throttle: row['Throttle Position (%)'] || 0,
          load: row['Load (MAF) (g/rev)'] || 0,
          knockRetard: row['Knock Retard (°)'] || 0,
          eventType: eventType,
          severity: severity
        });
      }

      previousIAM = iam;
    });

    // Group nearby events
    console.log(`Raw IAM events detected (before grouping): ${events.length}`);
    const groupedEvents = this.groupIAMEvents(events);
    console.log(`Grouped IAM events: ${groupedEvents.length}`);

    // Calculate average recovery rate
    let avgRecoveryRate = 0;
    if (recoveryRates.length > 0) {
      const totalRecovery = recoveryRates.reduce((sum, r) => sum + r.recoveryAmount, 0);
      const totalTime = recoveryRates[recoveryRates.length - 1].time - recoveryRates[0].time;
      avgRecoveryRate = totalTime > 0 ? totalRecovery / totalTime : 0; // Recovery per second
    }

    // Correlate with knock events if available
    let knockCorrelation = 0;
    if (window.knockDetector) {
      const knockEvents = window.knockDetector.getKnockEvents ? window.knockDetector.getKnockEvents() : [];
      // Count IAM drops that occurred near knock events
      const correlatedDrops = iamDrops.filter(drop => {
        return knockEvents.some(knock => Math.abs(knock.time - drop.time) < 1.0);
      });
      knockCorrelation = iamDrops.length > 0 ? (correlatedDrops.length / iamDrops.length) * 100 : 0;
    }

    this.analysisResults = {
      events: groupedEvents,
      statistics: {
        totalDataPoints: validDataPointCount,
        currentIAM: currentIAM,
        minIAM: minIAM,
        maxIAM: maxIAM,
        avgIAM: validDataPointCount > 0 ? totalIAM / validDataPointCount : 0,
        lowIAMEvents: groupedEvents.filter(e => e.severity === 'severe' || e.severity === 'critical').length,
        criticalIAMEvents: groupedEvents.filter(e => e.severity === 'critical').length,
        stuckLowEvents: groupedEvents.filter(e => e.eventType === 'stuck_low').length,
        recoveryRate: avgRecoveryRate,
        knockCorrelation: knockCorrelation,
        iamDrops: iamDrops.length,
        timeRange: this.dataProcessor ? this.dataProcessor.getTimeRange() : { min: 0, max: 0 }
      },
      columns: {
        iam: iamCol
      }
    };

    return this.analysisResults;
  }

  groupIAMEvents(events) {
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
    // Find the most severe event (lowest IAM)
    const mostSevereEvent = eventGroup.reduce((prev, current) => {
      return current.iam < prev.iam ? current : prev;
    });

    // Calculate averages for other metrics
    const avgIAM = eventGroup.reduce((sum, e) => sum + e.iam, 0) / eventGroup.length;
    const avgRpm = eventGroup.reduce((sum, e) => sum + e.rpm, 0) / eventGroup.length;
    const avgThrottle = eventGroup.reduce((sum, e) => sum + e.throttle, 0) / eventGroup.length;
    const avgLoad = eventGroup.reduce((sum, e) => sum + e.load, 0) / eventGroup.length;
    const avgKnockRetard = eventGroup.reduce((sum, e) => sum + (e.knockRetard || 0), 0) / eventGroup.length;

    // Use the start time of the group
    const startTime = eventGroup[0].time;
    const endTime = eventGroup[eventGroup.length - 1].time;
    const duration = endTime - startTime;

    return {
      index: mostSevereEvent.index,
      time: startTime,
      endTime: endTime,
      duration: duration,
      iam: mostSevereEvent.iam, // Lowest IAM in group
      minIAM: Math.min(...eventGroup.map(e => e.iam)),
      maxIAM: Math.max(...eventGroup.map(e => e.iam)),
      avgIAM: avgIAM,
      dropAmount: mostSevereEvent.dropAmount || 0,
      rpm: Math.round(avgRpm),
      throttle: avgThrottle,
      load: avgLoad,
      knockRetard: avgKnockRetard,
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
    const keywords = ['ignition', 'advance', 'multiplier', 'iam'];
    
    const found = columns.find(col => {
      const colLower = col.toLowerCase();
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

  getColumns() {
    if (!this.analysisResults) {
      this.analyze();
    }
    return this.analysisResults ? this.analysisResults.columns : null;
  }
}

