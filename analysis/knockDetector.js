// KnockDetector class for detecting and analyzing knock events
// Optimized to use shared utilities

class KnockDetector {
  constructor(dataProcessor) {
    this.dataProcessor = dataProcessor;
    this.knockEvents = [];
    
    // Load configuration
    const config = window.Config ? window.Config.knock : {};
    this.severityThresholds = config.severityThresholds || {
      critical: -6.0,
      severe: -4.0,
      moderate: -2.0
    };
    this.groupingTimeWindow = config.groupingTimeWindow || 0.1;
    this.knockRpmMin = config.rpmMin || 1000;
    this.knockRetardDecay = config.retardDecay || 0.2;
    this.knockRetardMax = config.retardMax || -8.0;
    this.knockSensitivityLowLoad = config.sensitivityLowLoad || 0.81;
    this.knockThreshold = config.knockThreshold || -0.0001;
    this.recoveryWindow = config.recoveryWindow || 2.0;
    this.recoveryMaxPoints = config.recoveryMaxPoints || 100;
    this.persistentKnockThreshold = config.persistentKnockThreshold || 20;
    
    // Load tune file parameters if available
    this.loadTuneFileParameters();
  }

  loadTuneFileParameters() {
    const tuneParser = window.tuneFileParser || window.AppState?.tuneFileParser;
    if (tuneParser && tuneParser.isLoaded && tuneParser.isLoaded()) {
      const params = tuneParser.getKnockParameters();
      this.knockRpmMin = params.rpmMin || this.knockRpmMin;
      this.knockRetardDecay = params.retardDecay || this.knockRetardDecay;
      this.knockRetardMax = params.retardMax || this.knockRetardMax;
      this.knockSensitivityLowLoad = params.sensitivityLowLoad || this.knockSensitivityLowLoad;
    }
  }

  detectKnockEvents() {
    const data = this.dataProcessor.getData();
    if (!data || data.length === 0) {
      return [];
    }

    this.knockEvents = [];

    // Use ColumnMapper for column detection if available
    const columns = this.dataProcessor.getColumns();
    let knockColumnName = this._findKnockColumn(columns);

    // Debug logging
    if (data.length > 0) {
      console.log('Knock column used:', knockColumnName);
    }

    // Collect raw events
    const rawEvents = [];
    const tuneParser = window.tuneFileParser || window.AppState?.tuneFileParser;

    for (let index = 0; index < data.length; index++) {
      const row = data[index];
      let knockRetard = this._getKnockRetard(row, knockColumnName);

      // Skip if no knock detected
      if (knockRetard >= this.knockThreshold) {
        continue;
      }

      const rpm = row['Engine Speed (rpm)'] || 0;
      const load = row['Load (MAF) (g/rev)'] || 0;

      // RPM-based filtering
      if (rpm < this.knockRpmMin) {
        continue;
      }

      // Check PE mode
      let isPEMode = false;
      if (tuneParser && tuneParser.isLoaded && tuneParser.isLoaded()) {
        const tps = row['Throttle Position (%)'] || 0;
        isPEMode = tuneParser.isPEModeActive(rpm, load, tps);
      }

      // Get IAM if available
      const iam = row['Ignition Advance Multiplier'] || null;

      rawEvents.push({
        index,
        time: row['Time (s)'],
        knockRetard,
        rpm,
        throttle: row['Throttle Position (%)'] || 0,
        load,
        afr: row['Air/Fuel Sensor #1 (λ)'] || 0,
        boost: row['Manifold Absolute Pressure (kPa)'] || 0,
        coolantTemp: row['Coolant Temperature (°C)'] || 0,
        intakeTemp: row['Intake Air Temperature (°C)'] || 0,
        severity: this.categorizeSeverity(knockRetard, load),
        isPEMode,
        iam,
        isLowLoad: load < this.knockSensitivityLowLoad
      });
    }

    console.log(`Raw knock events detected (before grouping): ${rawEvents.length}`);

    // Group events using AnalyzerUtils
    this.knockEvents = this._groupKnockEvents(rawEvents);

    // Analyze recovery
    this.analyzeKnockRecovery();

    console.log(`Grouped knock events: ${this.knockEvents.length}`);

    return this.knockEvents;
  }

  /**
   * Find knock column name
   * @private
   */
  _findKnockColumn(columns) {
    // Try ColumnMapper first
    if (window.ColumnMapper && window.ColumnMapper.hasColumn('knockRetard')) {
      return window.ColumnMapper.getColumn('knockRetard');
    }

    // Use AnalyzerUtils if available
    const config = window.Config ? window.Config.columnAliases : {};
    const aliases = config.knockRetard || [
      'Knock Retard (°)',
      'Knock Retard (deg)',
      'Knock Retard',
      'Knock Retard (degrees)',
      'KnockRetard',
      'knock retard (°)',
      'knock retard'
    ];

    if (window.AnalyzerUtils) {
      return window.AnalyzerUtils.findColumn(columns, aliases) || 'Knock Retard (°)';
    }

    // Fallback
    for (const name of aliases) {
      if (columns.includes(name)) return name;
    }
    return 'Knock Retard (°)';
  }

  /**
   * Get knock retard value from row
   * @private
   */
  _getKnockRetard(row, columnName) {
    let knockRetard = row[columnName];

    // Try alternatives if not found
    if (knockRetard === undefined || knockRetard === null) {
      const possibleNames = [
        'Knock Retard (°)', 'Knock Retard (deg)', 'Knock Retard',
        'KnockRetard', 'knock retard (°)', 'knock retard'
      ];
      for (const name of possibleNames) {
        if (row[name] !== undefined && row[name] !== null) {
          knockRetard = row[name];
          break;
        }
      }
    }

    // Parse and validate
    if (typeof knockRetard === 'string') {
      knockRetard = knockRetard.trim();
    }
    knockRetard = parseFloat(knockRetard);
    return isNaN(knockRetard) ? 0 : knockRetard;
  }

  analyzeKnockRecovery() {
    const data = this.dataProcessor.getData();
    if (!data || data.length === 0) return;

    this.knockEvents.forEach(event => {
      const eventEndIndex = event.index + (event.eventCount || 1);
      const eventEndTime = event.time + (event.duration || 0);
      const recoveryEndTime = eventEndTime + this.recoveryWindow;

      const recoveryPoints = [];
      for (let i = eventEndIndex; i < data.length && i < eventEndIndex + this.recoveryMaxPoints; i++) {
        const row = data[i];
        const time = row['Time (s)'] || 0;
        if (time > recoveryEndTime) break;

        const knockRetard = parseFloat(row['Knock Retard (°)'] || 0);
        if (knockRetard < this.knockThreshold) {
          recoveryPoints.push({ time, knockRetard });
        } else {
          break; // Recovery complete
        }
      }

      // Calculate recovery rate
      if (recoveryPoints.length > 1) {
        const timeDiff = recoveryPoints[recoveryPoints.length - 1].time - recoveryPoints[0].time;
        const retardDiff = recoveryPoints[recoveryPoints.length - 1].knockRetard - recoveryPoints[0].knockRetard;
        const recoveryRate = timeDiff > 0 ? retardDiff / timeDiff : 0;
        const expectedRecoveryRate = this.knockRetardDecay * 10;
        const recoveryRatio = Math.abs(recoveryRate) / expectedRecoveryRate;

        event.recoveryRate = recoveryRate;
        event.recoveryTime = timeDiff;
        event.slowRecovery = recoveryRatio < 0.5;
        event.persistentKnock = recoveryPoints.length > this.persistentKnockThreshold;
      } else {
        event.recoveryRate = recoveryPoints.length === 0 ? 0 : null;
        event.recoveryTime = recoveryPoints.length === 0 ? 0 : null;
        event.slowRecovery = false;
        event.persistentKnock = false;
      }
    });
  }

  categorizeSeverity(knockRetard, load = 0) {
    let adjustedThreshold = 0;
    if (load < this.knockSensitivityLowLoad) {
      adjustedThreshold = 0.5;
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

    // Use AnalyzerUtils if available
    const knockRetards = this.knockEvents.map(e => e.knockRetard);
    const rpms = this.knockEvents.map(e => e.rpm);
    const times = this.knockEvents.map(e => e.time);

    const timeRange = this.dataProcessor.getTimeRange();
    const totalTime = timeRange.max - timeRange.min;
    const knockTimeSpan = times.length > 0 ? Math.max(...times) - Math.min(...times) : 0;
    const timeWithKnockPercent = totalTime > 0 ? (knockTimeSpan / totalTime) * 100 : 0;

    // Calculate stats
    let stats;
    if (window.AnalyzerUtils) {
      const knockStats = window.AnalyzerUtils.calculateStats(knockRetards);
      const rpmStats = window.AnalyzerUtils.calculateStats(rpms);
      const timeStats = window.AnalyzerUtils.calculateStats(times);
      stats = {
        maxKnockRetard: knockStats.min, // Most negative is most severe
        avgKnockRetard: knockStats.avg,
        rpmRange: { min: rpmStats.min, max: rpmStats.max },
        timeRange: { min: timeStats.min, max: timeStats.max }
      };
    } else {
      stats = {
        maxKnockRetard: Math.min(...knockRetards),
        avgKnockRetard: knockRetards.reduce((a, b) => a + b, 0) / knockRetards.length,
        rpmRange: { min: Math.min(...rpms), max: Math.max(...rpms) },
        timeRange: { min: Math.min(...times), max: Math.max(...times) }
      };
    }

    return {
      totalEvents: this.knockEvents.length,
      maxKnockRetard: stats.maxKnockRetard,
      maxKnockRetardAbs: Math.abs(stats.maxKnockRetard),
      timeWithKnock: timeWithKnockPercent,
      criticalEvents: this.knockEvents.filter(e => e.severity === 'critical').length,
      severeEvents: this.knockEvents.filter(e => e.severity === 'severe').length,
      moderateEvents: this.knockEvents.filter(e => e.severity === 'moderate').length,
      mildEvents: this.knockEvents.filter(e => e.severity === 'mild').length,
      avgKnockRetard: stats.avgKnockRetard,
      slowRecoveryEvents: this.knockEvents.filter(e => e.slowRecovery === true).length,
      persistentKnockEvents: this.knockEvents.filter(e => e.persistentKnock === true).length,
      pemodeEvents: this.knockEvents.filter(e => e.isPEMode === true).length,
      rpmRange: stats.rpmRange,
      timeRange: stats.timeRange
    };
  }

  getKnockEvents() {
    return this.knockEvents;
  }

  /**
   * Group knock events using shared utility
   * @private
   */
  _groupKnockEvents(events) {
    if (events.length === 0) return [];

    const createGroupedEvent = (eventGroup) => {
      // Find most severe knock
      const mostSevereEvent = eventGroup.reduce((prev, current) => 
        current.knockRetard < prev.knockRetard ? current : prev
      );

      // Calculate averages
      const count = eventGroup.length;
      const avgRpm = eventGroup.reduce((sum, e) => sum + e.rpm, 0) / count;
      const avgThrottle = eventGroup.reduce((sum, e) => sum + e.throttle, 0) / count;
      const avgLoad = eventGroup.reduce((sum, e) => sum + e.load, 0) / count;
      const avgAfr = eventGroup.reduce((sum, e) => sum + e.afr, 0) / count;
      const avgBoost = eventGroup.reduce((sum, e) => sum + e.boost, 0) / count;
      const avgCoolantTemp = eventGroup.reduce((sum, e) => sum + e.coolantTemp, 0) / count;
      const avgIntakeTemp = eventGroup.reduce((sum, e) => sum + e.intakeTemp, 0) / count;

      const startTime = eventGroup[0].time;
      const endTime = eventGroup[eventGroup.length - 1].time;

      return {
        index: mostSevereEvent.index,
        time: startTime,
        endTime: endTime,
        duration: endTime - startTime,
        knockRetard: mostSevereEvent.knockRetard,
        maxKnockRetard: Math.min(...eventGroup.map(e => e.knockRetard)),
        avgKnockRetard: eventGroup.reduce((sum, e) => sum + e.knockRetard, 0) / count,
        rpm: Math.round(avgRpm),
        throttle: avgThrottle,
        load: avgLoad,
        afr: avgAfr,
        boost: avgBoost,
        coolantTemp: avgCoolantTemp,
        intakeTemp: avgIntakeTemp,
        severity: mostSevereEvent.severity,
        isPEMode: eventGroup.some(e => e.isPEMode),
        isLowLoad: avgLoad < this.knockSensitivityLowLoad,
        iam: eventGroup.find(e => e.iam !== null && e.iam !== undefined)?.iam || null,
        eventCount: count,
        recoveryRate: null,
        recoveryTime: null,
        slowRecovery: false,
        persistentKnock: false
      };
    };

    // Use AnalyzerUtils if available
    if (window.AnalyzerUtils) {
      return window.AnalyzerUtils.groupEventsByTime(events, this.groupingTimeWindow, createGroupedEvent);
    }

    // Fallback to manual grouping
    const sortedEvents = [...events].sort((a, b) => a.time - b.time);
    const groupedEvents = [];
    let currentGroup = [sortedEvents[0]];

    for (let i = 1; i < sortedEvents.length; i++) {
      const timeDiff = sortedEvents[i].time - currentGroup[currentGroup.length - 1].time;
      if (timeDiff <= this.groupingTimeWindow) {
        currentGroup.push(sortedEvents[i]);
      } else {
        groupedEvents.push(createGroupedEvent(currentGroup));
        currentGroup = [sortedEvents[i]];
      }
    }
    if (currentGroup.length > 0) {
      groupedEvents.push(createGroupedEvent(currentGroup));
    }

    return groupedEvents;
  }

  getEventsBySeverity(severity) {
    if (severity === 'all') return this.knockEvents;
    return this.knockEvents.filter(e => e.severity === severity);
  }

  filterEvents(searchTerm, severityFilter) {
    let filtered = this.knockEvents;

    if (severityFilter && severityFilter !== 'all') {
      filtered = filtered.filter(e => e.severity === severityFilter);
    }

    if (searchTerm && searchTerm.trim()) {
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
