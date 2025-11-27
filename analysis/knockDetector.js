// KnockDetector class for detecting and analyzing knock events
class KnockDetector {
  constructor(dataProcessor) {
    this.dataProcessor = dataProcessor;
    this.knockEvents = [];
    this.severityThresholds = {
      critical: -6.0,  // Less than -6° (approaching max -8.0°)
      severe: -4.0,    // Less than -4° (current threshold)
      moderate: -2.0   // Less than -2° (new category)
    };
    this.groupingTimeWindow = 0.1; // Group events within 0.1 seconds (100ms)
    this.knockRpmMin = 1000; // Minimum RPM for valid knock detection
    this.knockRetardDecay = 0.2; // Expected recovery rate (°/update)
    this.knockRetardMax = -8.0; // Maximum knock retard allowed
    this.knockSensitivityLowLoad = 0.81; // Low load threshold (g/rev)
    
    // Load tune file parameters if available
    this.loadTuneFileParameters();
  }

  loadTuneFileParameters() {
    if (window.tuneFileParser && window.tuneFileParser.isLoaded()) {
      const params = window.tuneFileParser.getKnockParameters();
      this.knockRpmMin = params.rpmMin;
      this.knockRetardDecay = params.retardDecay;
      this.knockRetardMax = params.retardMax;
      this.knockSensitivityLowLoad = params.sensitivityLowLoad;
    }
  }

  detectKnockEvents() {
    const data = this.dataProcessor.getData();
    if (!data || data.length === 0) {
      return [];
    }

    this.knockEvents = [];

    // Try to find the knock retard column with flexible matching
    const columns = this.dataProcessor.getColumns();
    let knockColumnName = 'Knock Retard (°)';
    
    // Try to find the column (handle potential encoding issues)
    if (!columns.includes(knockColumnName)) {
      // Try alternative column names
      const alternatives = [
        'Knock Retard (°)',
        'Knock Retard (deg)',
        'Knock Retard',
        'Knock Retard (degrees)'
      ];
      
      for (const alt of alternatives) {
        if (columns.includes(alt)) {
          knockColumnName = alt;
          break;
        }
      }
      
      // If still not found, try case-insensitive search
      if (!columns.includes(knockColumnName)) {
        const found = columns.find(col => 
          col.toLowerCase().includes('knock') && 
          col.toLowerCase().includes('retard')
        );
        if (found) {
          knockColumnName = found;
        }
      }
    }

    // Debug: Check first row for knock retard value and sample some rows
    if (data.length > 0) {
      const firstRow = data[0];
      console.log('First row knock retard value:', firstRow[knockColumnName], 'Type:', typeof firstRow[knockColumnName], 'Column name:', knockColumnName);
      console.log('Available keys in first row:', Object.keys(firstRow));
      
      // Sample some random rows to check knock values
      const sampleIndices = [0, Math.floor(data.length / 4), Math.floor(data.length / 2), Math.floor(data.length * 3 / 4), data.length - 1];
      console.log('Sample knock retard values at various indices:');
      sampleIndices.forEach(idx => {
        if (data[idx]) {
          const val = data[idx][knockColumnName];
          console.log(`  Index ${idx}: ${val} (type: ${typeof val}, parsed: ${parseFloat(val)})`);
        }
      });
    }
    
    // Count total non-zero values for debugging
    let nonZeroCount = 0;
    
    data.forEach((row, index) => {
      // Try multiple ways to access the knock retard value
      let knockRetard = row[knockColumnName];
      
      // If not found, try direct property access with various column name formats
      if (knockRetard === undefined || knockRetard === null || isNaN(knockRetard)) {
        // Try all possible column name variations
        const possibleNames = [
          'Knock Retard (°)',
          'Knock Retard (deg)',
          'Knock Retard',
          'Knock Retard (degrees)',
          'KnockRetard',
          'knock retard (°)',
          'knock retard'
        ];
        
        for (const name of possibleNames) {
          if (row[name] !== undefined && row[name] !== null) {
            knockRetard = row[name];
            break;
          }
        }
      }
      
      // Ensure it's a number - handle string values that might be "0.0" or similar
      if (typeof knockRetard === 'string') {
        knockRetard = knockRetard.trim();
      }
      knockRetard = parseFloat(knockRetard);
      if (isNaN(knockRetard)) {
        knockRetard = 0;
      }
      
      // Check for knock events - knock retard values are NEGATIVE (timing removed)
      // Use a small threshold to catch negative values that represent knock
      const KNOCK_THRESHOLD = -0.0001; // Negative threshold to catch any negative value
      
      // Debug: Log first few non-zero values
      if (knockRetard < KNOCK_THRESHOLD && this.knockEvents.length < 10) {
        console.log(`Knock event found at index ${index}:`, {
          time: row['Time (s)'],
          knockRetard: knockRetard,
          columnUsed: knockColumnName,
          rawValue: row[knockColumnName]
        });
      }
      
      // Knock events are indicated by negative knock retard values
      if (knockRetard < KNOCK_THRESHOLD) {
        const rpm = row['Engine Speed (rpm)'] || 0;
        const load = row['Load (MAF) (g/rev)'] || 0;
        
        // RPM-based filtering: filter out knock events below minimum RPM (false positives)
        if (rpm < this.knockRpmMin) {
          return; // Skip this event
        }
        
        // Check if in PE mode (for context-aware detection)
        let isPEMode = false;
        if (window.tuneFileParser && window.tuneFileParser.isLoaded()) {
          const tps = row['Throttle Position (%)'] || 0;
          isPEMode = window.tuneFileParser.isPEModeActive(rpm, load, tps);
        }
        
        // Get IAM if available
        const iam = row['Ignition Advance Multiplier'] || null;
        
        const event = {
          index: index,
          time: row['Time (s)'],
          knockRetard: knockRetard,
          rpm: rpm,
          throttle: row['Throttle Position (%)'] || 0,
          load: load,
          afr: row['Air/Fuel Sensor #1 (λ)'] || 0,
          boost: row['Manifold Absolute Pressure (kPa)'] || 0,
          coolantTemp: row['Coolant Temperature (°C)'] || 0,
          intakeTemp: row['Intake Air Temperature (°C)'] || 0,
          severity: this.categorizeSeverity(knockRetard, load),
          isPEMode: isPEMode,
          iam: iam,
          isLowLoad: load < this.knockSensitivityLowLoad
        };
        
        this.knockEvents.push(event);
        nonZeroCount++;
      }
    });
    
    console.log(`Total rows processed: ${data.length}`);
    console.log(`Raw knock events detected (before grouping): ${this.knockEvents.length}`);
    console.log(`Total non-zero knock retard values: ${nonZeroCount}`);
    
    // Group nearby knock events
    this.knockEvents = this.groupKnockEvents(this.knockEvents);
    
    // Analyze knock recovery
    this.analyzeKnockRecovery();
    
    console.log(`Grouped knock events: ${this.knockEvents.length}`);

    return this.knockEvents;
  }

  analyzeKnockRecovery() {
    // Track recovery rate for grouped events
    // Recovery is when knock retard increases toward 0 (becomes less negative)
    const data = this.dataProcessor.getData();
    if (!data || data.length === 0) return;

    // For each grouped event, check recovery after the event
    this.knockEvents.forEach((event, eventIndex) => {
      // Find data points after this event
      const eventEndIndex = event.index + (event.eventCount || 1);
      const recoveryWindow = 2.0; // Look 2 seconds ahead for recovery
      const eventEndTime = event.time + (event.duration || 0);
      const recoveryEndTime = eventEndTime + recoveryWindow;

      let recoveryPoints = [];
      for (let i = eventEndIndex; i < data.length && i < eventEndIndex + 100; i++) {
        const row = data[i];
        const time = row['Time (s)'] || 0;
        if (time > recoveryEndTime) break;

        const knockRetard = parseFloat(row['Knock Retard (°)'] || 0);
        if (knockRetard < -0.0001) {
          recoveryPoints.push({ time, knockRetard });
        } else {
          // Recovery complete (knock retard back to 0 or positive)
          break;
        }
      }

      // Calculate recovery rate
      if (recoveryPoints.length > 1) {
        const timeDiff = recoveryPoints[recoveryPoints.length - 1].time - recoveryPoints[0].time;
        const retardDiff = recoveryPoints[recoveryPoints.length - 1].knockRetard - recoveryPoints[0].knockRetard;
        const recoveryRate = timeDiff > 0 ? retardDiff / timeDiff : 0; // °/second

        // Expected recovery rate: 0.2°/update, assuming ~10 updates/second = 2.0°/second
        const expectedRecoveryRate = this.knockRetardDecay * 10; // Approximate updates per second
        const recoveryRatio = Math.abs(recoveryRate) / expectedRecoveryRate;

        event.recoveryRate = recoveryRate;
        event.recoveryTime = timeDiff;
        event.slowRecovery = recoveryRatio < 0.5; // Recovery is less than 50% of expected
        event.persistentKnock = recoveryPoints.length > 20; // More than 20 data points still showing knock
      } else if (recoveryPoints.length === 0) {
        // Immediate recovery (good)
        event.recoveryRate = 0;
        event.recoveryTime = 0;
        event.slowRecovery = false;
        event.persistentKnock = false;
      } else {
        // Single point - can't calculate rate
        event.recoveryRate = null;
        event.recoveryTime = null;
        event.slowRecovery = false;
        event.persistentKnock = false;
      }
    });
  }

  categorizeSeverity(knockRetard, load = 0) {
    // Knock retard is negative
    // Multi-tier severity classification:
    // Critical: < -6.0° (approaching max -8.0°)
    // Severe: < -4.0° (current threshold)
    // Moderate: < -2.0° (new category)
    // Mild: >= -2.0° && < -0.0001°
    
    // Adjust severity based on load context
    // Knock at low load may be more significant due to higher sensitivity
    let adjustedThreshold = 0;
    if (load < this.knockSensitivityLowLoad) {
      // At low load, be more sensitive - reduce thresholds slightly
      adjustedThreshold = 0.5; // Make thresholds 0.5° less negative (more sensitive)
    }
    
    if (knockRetard < (this.severityThresholds.critical + adjustedThreshold)) {
      return 'critical';
    } else if (knockRetard < (this.severityThresholds.severe + adjustedThreshold)) {
      return 'severe';
    } else if (knockRetard < (this.severityThresholds.moderate + adjustedThreshold)) {
      return 'moderate';
    } else {
      return 'mild';
    }
  }

  getStatistics() {
    if (this.knockEvents.length === 0) {
      return {
        totalEvents: 0,
        maxKnockRetard: 0,
        timeWithKnock: 0,
        criticalEvents: 0,
        severeEvents: 0,
        moderateEvents: 0,
        mildEvents: 0,
        avgKnockRetard: 0,
        slowRecoveryEvents: 0,
        persistentKnockEvents: 0,
        pemodeEvents: 0,
        rpmRange: { min: 0, max: 0 },
        timeRange: { min: 0, max: 0 }
      };
    }

    const knockRetards = this.knockEvents.map(e => e.knockRetard);
    const rpms = this.knockEvents.map(e => e.rpm);
    const times = this.knockEvents.map(e => e.time);
    
    const timeRange = this.dataProcessor.getTimeRange();
    const totalTime = timeRange.max - timeRange.min;
    const knockTime = Math.max(...times) - Math.min(...times);
    const timeWithKnockPercent = totalTime > 0 ? (knockTime / totalTime) * 100 : 0;

    // For max knock retard, we want the most negative value (most severe)
    // But display as positive for clarity
    const maxKnockRetardAbs = Math.max(...knockRetards.map(k => Math.abs(k)));
    const maxKnockRetard = Math.min(...knockRetards); // Most negative
    
    return {
      totalEvents: this.knockEvents.length,
      maxKnockRetard: maxKnockRetard, // Keep as negative for display
      maxKnockRetardAbs: maxKnockRetardAbs, // Absolute value for reference
      timeWithKnock: timeWithKnockPercent,
      criticalEvents: this.knockEvents.filter(e => e.severity === 'critical').length,
      severeEvents: this.knockEvents.filter(e => e.severity === 'severe').length,
      moderateEvents: this.knockEvents.filter(e => e.severity === 'moderate').length,
      mildEvents: this.knockEvents.filter(e => e.severity === 'mild').length,
      avgKnockRetard: knockRetards.reduce((a, b) => a + b, 0) / knockRetards.length,
      slowRecoveryEvents: this.knockEvents.filter(e => e.slowRecovery === true).length,
      persistentKnockEvents: this.knockEvents.filter(e => e.persistentKnock === true).length,
      pemodeEvents: this.knockEvents.filter(e => e.isPEMode === true).length,
      rpmRange: {
        min: Math.min(...rpms),
        max: Math.max(...rpms)
      },
      timeRange: {
        min: Math.min(...times),
        max: Math.max(...times)
      }
    };
  }

  getKnockEvents() {
    return this.knockEvents;
  }

  groupKnockEvents(events) {
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
    // Find the most severe knock (most negative value)
    const mostSevereEvent = eventGroup.reduce((prev, current) => {
      return current.knockRetard < prev.knockRetard ? current : prev;
    });

    // Calculate averages for other metrics
    const avgRpm = eventGroup.reduce((sum, e) => sum + e.rpm, 0) / eventGroup.length;
    const avgThrottle = eventGroup.reduce((sum, e) => sum + e.throttle, 0) / eventGroup.length;
    const avgLoad = eventGroup.reduce((sum, e) => sum + e.load, 0) / eventGroup.length;
    const avgAfr = eventGroup.reduce((sum, e) => sum + e.afr, 0) / eventGroup.length;
    const avgBoost = eventGroup.reduce((sum, e) => sum + e.boost, 0) / eventGroup.length;
    const avgCoolantTemp = eventGroup.reduce((sum, e) => sum + e.coolantTemp, 0) / eventGroup.length;
    const avgIntakeTemp = eventGroup.reduce((sum, e) => sum + e.intakeTemp, 0) / eventGroup.length;

    // Use the start time of the group
    const startTime = eventGroup[0].time;
    const endTime = eventGroup[eventGroup.length - 1].time;
    const duration = endTime - startTime;

    return {
      index: mostSevereEvent.index,
      time: startTime, // Start time of the knock event
      endTime: endTime, // End time of the knock event
      duration: duration, // Duration of the knock event
      knockRetard: mostSevereEvent.knockRetard, // Most severe knock retard value
      maxKnockRetard: Math.min(...eventGroup.map(e => e.knockRetard)), // Most negative (most severe)
      avgKnockRetard: eventGroup.reduce((sum, e) => sum + e.knockRetard, 0) / eventGroup.length,
      rpm: Math.round(avgRpm),
      throttle: avgThrottle,
      load: avgLoad,
      afr: avgAfr,
      boost: avgBoost,
      coolantTemp: avgCoolantTemp,
      intakeTemp: avgIntakeTemp,
      severity: mostSevereEvent.severity, // Use severity from most severe event
      isPEMode: eventGroup.some(e => e.isPEMode), // True if any event in group was in PE mode
      isLowLoad: avgLoad < this.knockSensitivityLowLoad,
      iam: eventGroup.find(e => e.iam !== null && e.iam !== undefined)?.iam || null, // Get IAM if available
      eventCount: eventGroup.length, // Number of data points in this grouped event
      // Recovery data will be added by analyzeKnockRecovery()
      recoveryRate: null,
      recoveryTime: null,
      slowRecovery: false,
      persistentKnock: false
    };
  }

  getEventsBySeverity(severity) {
    if (severity === 'all') {
      return this.knockEvents;
    }
    return this.knockEvents.filter(e => e.severity === severity);
  }

  filterEvents(searchTerm, severityFilter) {
    let filtered = this.knockEvents;

    // Apply severity filter
    if (severityFilter && severityFilter !== 'all') {
      filtered = filtered.filter(e => e.severity === severityFilter);
    }

    // Apply search filter
    if (searchTerm && searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(e => {
        return (
          e.time.toString().includes(term) ||
          e.knockRetard.toString().includes(term) ||
          e.rpm.toString().includes(term) ||
          e.throttle.toString().includes(term) ||
          e.severity.toLowerCase().includes(term)
        );
      });
    }

    return filtered;
  }
}

