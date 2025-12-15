// Log Score Tab Module - Compiles all error events from other tabs
const LogScoreTab = {
  // DOM element references
  elements: {
    totalIssues: null,
    criticalIssues: null,
    issuesByCategory: null,
    issuesTableBody: null,
    searchInput: null,
    sourceFilter: null,
    eventTypeFilter: null,
    severityFilter: null,
    showShortTermTrimToggle: null
  },

  compiledIssues: [], // All compiled issues from all tabs
  currentSort: { column: null, direction: 'asc' },
  showShortTermTrim: false, // Default: don't show short term fuel trim errors

  initialize() {
    // Get DOM elements for this tab
    this.elements.totalIssues = document.getElementById('logscore-totalIssues');
    this.elements.criticalIssues = document.getElementById('logscore-criticalIssues');
    this.elements.issuesByCategory = document.getElementById('logscore-issuesByCategory');
    this.elements.issuesTableBody = document.getElementById('logscore-issuesTableBody');
    this.elements.searchInput = document.getElementById('logscore-searchInput');
    this.elements.sourceFilter = document.getElementById('logscore-sourceFilter');
    this.elements.eventTypeFilter = document.getElementById('logscore-eventTypeFilter');
    this.elements.severityFilter = document.getElementById('logscore-severityFilter');
    this.elements.showShortTermTrimToggle = document.getElementById('logscore-showShortTermTrim');

    // Set up event listeners
    if (this.elements.searchInput) {
      this.elements.searchInput.addEventListener('input', () => this.updateTable());
    }
    if (this.elements.sourceFilter) {
      this.elements.sourceFilter.addEventListener('change', () => this.updateTable());
    }
    if (this.elements.eventTypeFilter) {
      this.elements.eventTypeFilter.addEventListener('change', () => this.updateTable());
    }
    if (this.elements.severityFilter) {
      this.elements.severityFilter.addEventListener('change', () => this.updateTable());
    }
    
    // Set up short term fuel trim toggle
    if (this.elements.showShortTermTrimToggle) {
      this.elements.showShortTermTrimToggle.checked = this.showShortTermTrim;
      this.elements.showShortTermTrimToggle.addEventListener('change', (e) => {
        this.showShortTermTrim = e.target.checked;
        // Recompile issues and update table when toggle changes
        this.compileAllIssues();
        this.updateStatistics();
        this.updateTable();
      });
    }

    // Set up table sorting
    document.querySelectorAll('#logscore-issuesTable th[data-sort]').forEach(th => {
      th.addEventListener('click', () => this.handleSort(th.dataset.sort));
    });
  },

  render(analysisData) {
    // Compile all issues from all tabs
    // Note: analysisData parameter is not used as we get data from cache
    this.compileAllIssues();
    
    // Update statistics and table
    this.updateStatistics();
    this.updateTable();
  },

  compileAllIssues() {
    this.compiledIssues = [];

    // 1. Get Knock Analysis events
    const knockData = tabManager ? tabManager.getCachedAnalysis('knock') : null;
    if (knockData && knockData.events && Array.isArray(knockData.events)) {
      knockData.events.forEach(event => {
        const knockRetard = (event.knockRetard !== undefined && event.knockRetard !== null) ? event.knockRetard : 0;
        const originalSeverity = event.severity || 'mild';
        // Mark all knock events as high severity
        const severity = 'high';
        this.compiledIssues.push({
          time: event.time || 0,
          source: 'Knock Analysis',
          sourceId: 'knock',
          eventType: 'Knock',
          severity: severity,
          value: knockRetard,
          valueUnit: '°',
          description: `${originalSeverity === 'severe' ? 'Severe' : 'Mild'} knock detected: ${Math.abs(knockRetard).toFixed(2)}° retard`,
          originalEvent: event
        });
      });
    }

    // 2. Get Boost Control events
    const boostData = tabManager ? tabManager.getCachedAnalysis('boost') : null;
    if (boostData && boostData.events && Array.isArray(boostData.events)) {
      boostData.events.forEach(event => {
        if (event.eventType !== 'normal') {
          const isOvershoot = event.eventType === 'overshoot';
          const errorText = isOvershoot ? 'Overshoot' : 'Undershoot';
          const boostTarget = (event.boostTarget !== undefined && event.boostTarget !== null) ? event.boostTarget : 0;
          const actualBoost = (event.actualBoost !== undefined && event.actualBoost !== null) ? event.actualBoost : 0;
          const boostError = (event.boostError !== undefined && event.boostError !== null) ? event.boostError : 0;
          // Convert kPa to PSI (1 kPa = 0.1450377377 PSI)
          const kPaToPSI = (kpa) => kpa * 0.1450377377;
          // Convert to gauge pressure (above atmosphere) for display
          const ATMOSPHERIC_PSI = 14.696;
          const kPaToGaugePSI = (kpa) => kPaToPSI(kpa) - ATMOSPHERIC_PSI;
          const boostTargetPSIg = boostTarget > 0 ? kPaToGaugePSI(boostTarget).toFixed(2) : 'N/A';
          const actualBoostPSIg = actualBoost > 0 ? kPaToGaugePSI(actualBoost).toFixed(2) : 'N/A';
          const boostErrorPSI = kPaToPSI(Math.abs(boostError));
          this.compiledIssues.push({
            time: event.time || 0,
            source: 'Boost Control',
            sourceId: 'boost',
            eventType: errorText,
            severity: isOvershoot ? 'high' : 'low',
            value: boostErrorPSI,
            valueUnit: 'PSI',
            description: `Boost ${errorText.toLowerCase()}: ${boostErrorPSI.toFixed(2)} PSI error (target: ${boostTargetPSIg} PSIg, actual: ${actualBoostPSIg} PSIg)`,
            originalEvent: event
          });
        }
      });
    }

    // 3. Get Air/Fuel Ratio events
    const afrData = tabManager ? tabManager.getCachedAnalysis('fueling') : null;
    const AFR_CONVERSION_FACTOR = 14.7; // 1 lambda = 14.7 AFR
    
    if (afrData && afrData.events && Array.isArray(afrData.events)) {
      afrData.events.forEach(event => {
        if (event.eventType !== 'normal') {
          const isLean = event.eventType === 'lean';
          const errorText = isLean ? 'Lean' : 'Rich';
          const targetLambda = (event.targetAFR !== undefined && event.targetAFR !== null) ? event.targetAFR : 0;
          const measuredLambda = (event.measuredAFR !== undefined && event.measuredAFR !== null) ? event.measuredAFR : 0;
          const afrError = (event.afrError !== undefined && event.afrError !== null) ? event.afrError : 0;
          
          // Convert lambda to AFR for display
          const targetAFR = targetLambda > 0 ? targetLambda * AFR_CONVERSION_FACTOR : 0;
          const measuredAFR = measuredLambda > 0 ? measuredLambda * AFR_CONVERSION_FACTOR : 0;
          
          // Calculate error as the difference between converted values (to match AFR tab)
          const errorAFR = measuredAFR - targetAFR;
          
          // Calculate percentage deviation from target using converted AFR values
          let percentDeviation = 0;
          if (targetAFR > 0 && !isNaN(targetAFR) && !isNaN(errorAFR)) {
            percentDeviation = (errorAFR / targetAFR) * 100;
          }
          
          // Calculate severity based on percentage deviation for lean events
          let severity = isLean ? 'high' : 'low';
          if (isLean && targetLambda > 0) {
            const deviationPercent = Math.abs(percentDeviation);
            // Reduce severity to low if deviation is within 5% of target
            if (deviationPercent <= 5.0) {
              severity = 'low';
            }
          }
          
          this.compiledIssues.push({
            time: event.time || 0,
            source: 'Air/Fuel Ratio',
            sourceId: 'afr',
            eventType: errorText,
            severity: severity,
            value: percentDeviation, // Store percent deviation instead of raw lambda error
            valueUnit: '%',
            description: `AFR ${errorText.toLowerCase()}: ${percentDeviation > 0 ? '+' : ''}${percentDeviation.toFixed(2)}% deviation (target: ${targetAFR > 0 ? targetAFR.toFixed(1) : 'N/A'} AFR, measured: ${measuredAFR > 0 ? measuredAFR.toFixed(1) : 'N/A'} AFR)`,
            originalEvent: event
          });
        }
      });
    }

    // 4. Get Short Term Fuel Trim events (only if toggle is enabled)
    if (this.showShortTermTrim) {
      const fuelTrimData = tabManager ? tabManager.getCachedAnalysis('fueltrim') : null;
      if (fuelTrimData && fuelTrimData.events && Array.isArray(fuelTrimData.events)) {
        fuelTrimData.events.forEach(event => {
          const isPositive = event.eventType === 'positive';
          const trimType = isPositive ? 'Positive Trim' : 'Negative Trim';
          const shortTermTrim = (event.shortTermTrim !== undefined && event.shortTermTrim !== null) ? event.shortTermTrim : 0;
          this.compiledIssues.push({
            time: event.time || 0,
            source: 'Short Term Fuel Trim',
            sourceId: 'fueltrim',
            eventType: trimType,
            severity: isPositive ? 'high' : 'low',
            value: shortTermTrim,
            valueUnit: '%',
            description: `Fuel trim ${isPositive ? 'positive' : 'negative'}: ${isPositive ? '+' : ''}${shortTermTrim.toFixed(2)}% (${isPositive ? 'adding fuel, rich condition' : 'removing fuel, lean condition'})`,
            originalEvent: event
          });
        });
      }
    }

    // 5. Get Long Term Fuel Trim events
    const longTermFuelTrimData = tabManager ? tabManager.getCachedAnalysis('longtermfueltrim') : null;
    if (longTermFuelTrimData && longTermFuelTrimData.events && Array.isArray(longTermFuelTrimData.events)) {
      longTermFuelTrimData.events.forEach(event => {
        const isPositive = event.eventType === 'positive';
        const trimType = isPositive ? 'Positive Trim' : 'Negative Trim';
        const longTermTrim = (event.longTermTrim !== undefined && event.longTermTrim !== null) ? event.longTermTrim : 0;
        this.compiledIssues.push({
          time: event.time || 0,
          source: 'Long Term Fuel Trim',
          sourceId: 'longtermfueltrim',
          eventType: trimType,
          severity: isPositive ? 'high' : 'low',
          value: longTermTrim,
          valueUnit: '%',
          description: `Long-term fuel trim ${isPositive ? 'positive' : 'negative'}: ${isPositive ? '+' : ''}${longTermTrim.toFixed(2)}% (${isPositive ? 'adding fuel, rich condition' : 'removing fuel, lean condition'})`,
          originalEvent: event
        });
      });
    }

    // 6. Get IAM events
    const iamData = tabManager ? tabManager.getCachedAnalysis('iam') : null;
    if (iamData && iamData.events && Array.isArray(iamData.events)) {
      iamData.events.forEach(event => {
        if (event.eventType !== 'normal') {
          const iam = (event.iam !== undefined && event.iam !== null) ? event.iam : 0;
          const iamPercent = iam * 100;
          const severity = event.severity === 'critical' ? 'severe' : (event.severity === 'severe' ? 'high' : 'low');
          const eventType = event.eventType === 'stuck_low' ? 'IAM Stuck Low' : 'IAM Drop';
          this.compiledIssues.push({
            time: event.time || 0,
            source: 'IAM Analysis',
            sourceId: 'iam',
            eventType: eventType,
            severity: severity,
            value: iamPercent,
            valueUnit: '%',
            description: `${eventType}: IAM dropped to ${iamPercent.toFixed(1)}% (${event.severity} severity)`,
            originalEvent: event
          });
        }
      });
    }

    // 7. Get Load Limit events
    const loadLimitData = tabManager ? tabManager.getCachedAnalysis('loadlimit') : null;
    if (loadLimitData && loadLimitData.events && Array.isArray(loadLimitData.events)) {
      loadLimitData.events.forEach(event => {
        if (event.eventType !== 'normal') {
          const load = (event.load !== undefined && event.load !== null) ? event.load : 0;
          const loadLimit = (event.loadLimit !== undefined && event.loadLimit !== null) ? event.loadLimit : 0;
          const loadRatio = (event.loadRatio !== undefined && event.loadRatio !== null) ? event.loadRatio : 0;
          const severity = event.severity === 'critical' ? 'severe' : (event.severity === 'severe' ? 'high' : 'low');
          const eventType = event.eventType === 'limit_violation' ? 'Load Limit Violation' : 'Near Load Limit';
          const fuelCutText = event.fuelCut ? ' (Fuel Cut Active)' : '';
          this.compiledIssues.push({
            time: event.time || 0,
            source: 'Load Limit',
            sourceId: 'loadlimit',
            eventType: eventType,
            severity: severity,
            value: load,
            valueUnit: 'g/rev',
            description: `${eventType}: Load ${load.toFixed(2)} g/rev exceeds limit ${loadLimit.toFixed(2)} g/rev (${(loadRatio * 100).toFixed(1)}%)${fuelCutText}`,
            originalEvent: event
          });
        }
      });
    }

    // 8. Get Coolant Temperature events
    const coolantTempData = tabManager ? tabManager.getCachedAnalysis('coolanttemp') : null;
    if (coolantTempData && coolantTempData.events && Array.isArray(coolantTempData.events)) {
      coolantTempData.events.forEach(event => {
        if (event.eventType !== 'normal') {
          const coolantTemp = (event.coolantTemp !== undefined && event.coolantTemp !== null) ? event.coolantTemp : 0;
          const severity = event.severity === 'critical' ? 'severe' : (event.severity === 'severe' ? 'high' : (event.severity === 'moderate' ? 'moderate' : 'low'));
          const eventType = event.eventType === 'high_temp' ? 'High Temperature' : 'Elevated Temperature';
          const fanStatus = event.aboveHighSpeedFan ? ' (High Speed Fan)' : '';
          this.compiledIssues.push({
            time: event.time || 0,
            source: 'Coolant Temperature',
            sourceId: 'coolanttemp',
            eventType: eventType,
            severity: severity,
            value: coolantTemp,
            valueUnit: '°C',
            description: `${eventType}: ${coolantTemp.toFixed(1)}°C${fanStatus}`,
            originalEvent: event
          });
        }
      });
    }

    // 9. Get Intake Air Temperature events
    const iatData = tabManager ? tabManager.getCachedAnalysis('iat') : null;
    if (iatData && iatData.events && Array.isArray(iatData.events)) {
      iatData.events.forEach(event => {
        if (event.eventType !== 'normal') {
          const iat = (event.iat !== undefined && event.iat !== null) ? event.iat : 0;
          const severity = event.severity === 'critical' ? 'severe' : (event.severity === 'severe' ? 'high' : (event.severity === 'moderate' ? 'moderate' : (event.severity === 'mild' ? 'low' : 'low')));
          const eventType = event.eventType === 'high_temp' ? 'High IAT' : 'Low IAT';
          const thresholdStatus = event.aboveHighThreshold ? ' (Above High Threshold)' : (event.belowLowThreshold ? ' (Below Low Threshold)' : '');
          this.compiledIssues.push({
            time: event.time || 0,
            source: 'Intake Air Temperature',
            sourceId: 'iat',
            eventType: eventType,
            severity: severity,
            value: iat,
            valueUnit: '°C',
            description: `${eventType}: ${iat.toFixed(1)}°C${thresholdStatus}`,
            originalEvent: event
          });
        }
      });
    }

    // Sort by time by default
    this.compiledIssues.sort((a, b) => a.time - b.time);
  },

  updateStatistics() {
    const totalIssues = this.compiledIssues.length;
    const criticalIssues = this.compiledIssues.filter(issue => 
      issue.severity === 'severe' || 
      (issue.sourceId === 'knock' && issue.severity === 'high') ||
      (issue.sourceId === 'boost' && issue.valueUnit === 'PSI' && Math.abs(issue.value) > 1.45) || // 10 kPa = 1.45 PSI
      (issue.sourceId === 'afr' && issue.severity === 'high' && Math.abs(issue.value) > 0.1) ||
      (issue.sourceId === 'iam' && (issue.severity === 'severe' || issue.severity === 'high')) ||
      (issue.sourceId === 'loadlimit' && issue.eventType === 'Load Limit Violation')
    ).length;

    // Count by category
    const bySource = {};
    this.compiledIssues.forEach(issue => {
      bySource[issue.source] = (bySource[issue.source] || 0) + 1;
    });

    // Update DOM elements
    if (this.elements.totalIssues) {
      this.elements.totalIssues.textContent = totalIssues.toLocaleString();
    }
    if (this.elements.criticalIssues) {
      this.elements.criticalIssues.textContent = criticalIssues.toLocaleString();
    }
    if (this.elements.issuesByCategory) {
      const categoryText = Object.entries(bySource)
        .map(([source, count]) => `${source}: ${count}`)
        .join(', ');
      this.elements.issuesByCategory.textContent = categoryText || 'None';
    }
  },

  updateTable() {
    if (!this.elements.issuesTableBody) return;

    // Get filter values
    const searchTerm = this.elements.searchInput ? this.elements.searchInput.value.toLowerCase() : '';
    const sourceFilter = this.elements.sourceFilter ? this.elements.sourceFilter.value : 'all';
    const eventTypeFilter = this.elements.eventTypeFilter ? this.elements.eventTypeFilter.value : 'all';
    const severityFilter = this.elements.severityFilter ? this.elements.severityFilter.value : 'all';

    // Filter issues
    let filteredIssues = [...this.compiledIssues];

    // Apply source filter
    if (sourceFilter !== 'all') {
      filteredIssues = filteredIssues.filter(issue => issue.sourceId === sourceFilter);
    }

    // Apply event type filter
    if (eventTypeFilter !== 'all') {
      filteredIssues = filteredIssues.filter(issue => {
        if (eventTypeFilter === 'knock') return issue.eventType === 'Knock';
        if (eventTypeFilter === 'overshoot') return issue.eventType === 'Overshoot';
        if (eventTypeFilter === 'undershoot') return issue.eventType === 'Undershoot';
        if (eventTypeFilter === 'lean') return issue.eventType === 'Lean';
        if (eventTypeFilter === 'rich') return issue.eventType === 'Rich';
        if (eventTypeFilter === 'positive') return issue.eventType === 'Positive Trim';
        if (eventTypeFilter === 'negative') return issue.eventType === 'Negative Trim';
        if (eventTypeFilter === 'iam') return issue.eventType === 'IAM Drop' || issue.eventType === 'IAM Stuck Low';
        if (eventTypeFilter === 'loadlimit') return issue.eventType === 'Load Limit Violation' || issue.eventType === 'Near Load Limit';
        if (eventTypeFilter === 'coolanttemp') return issue.eventType === 'High Temperature' || issue.eventType === 'Elevated Temperature';
        if (eventTypeFilter === 'iat') return issue.eventType === 'High IAT' || issue.eventType === 'Low IAT';
        return true;
      });
    }

    // Apply severity filter
    if (severityFilter !== 'all') {
      filteredIssues = filteredIssues.filter(issue => {
        if (severityFilter === 'critical') {
          return issue.severity === 'severe' || 
                 (issue.sourceId === 'knock' && issue.severity === 'high') ||
                 (issue.sourceId === 'boost' && issue.valueUnit === 'PSI' && Math.abs(issue.value) > 1.45) || // 10 kPa = 1.45 PSI
                 (issue.sourceId === 'afr' && issue.severity === 'high' && Math.abs(issue.value) > 0.1) ||
                 (issue.sourceId === 'iam' && (issue.severity === 'severe' || issue.severity === 'high')) ||
                 (issue.sourceId === 'loadlimit' && issue.eventType === 'Load Limit Violation') ||
                 (issue.sourceId === 'coolanttemp' && (issue.severity === 'severe' || issue.severity === 'high')) ||
                 (issue.sourceId === 'iat' && (issue.severity === 'severe' || issue.severity === 'high'));
        }
        return issue.severity === severityFilter;
      });
    }

    // Apply search filter
    if (searchTerm) {
      filteredIssues = filteredIssues.filter(issue => {
        return issue.time.toString().includes(searchTerm) ||
               issue.source.toLowerCase().includes(searchTerm) ||
               issue.eventType.toLowerCase().includes(searchTerm) ||
               issue.severity.toLowerCase().includes(searchTerm) ||
               issue.description.toLowerCase().includes(searchTerm) ||
               issue.value.toString().includes(searchTerm);
      });
    }

    // Apply sorting
    if (this.currentSort.column) {
      filteredIssues.sort((a, b) => {
        let aVal, bVal;
        switch (this.currentSort.column) {
          case 'time':
            aVal = a.time;
            bVal = b.time;
            break;
          case 'source':
            aVal = a.source;
            bVal = b.source;
            break;
          case 'eventType':
            aVal = a.eventType;
            bVal = b.eventType;
            break;
          case 'severity':
            aVal = a.severity;
            bVal = b.severity;
            break;
          case 'value':
            aVal = Math.abs(a.value);
            bVal = Math.abs(b.value);
            break;
          default:
            return 0;
        }

        if (typeof aVal === 'string') {
          return this.currentSort.direction === 'asc' 
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        } else {
          return this.currentSort.direction === 'asc' 
            ? aVal - bVal
            : bVal - aVal;
        }
      });
    }

    // Render table
    this.elements.issuesTableBody.innerHTML = '';

    if (filteredIssues.length === 0) {
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="6" style="text-align: center; padding: 20px; color: #666;">No issues found matching the current filters.</td>';
      this.elements.issuesTableBody.appendChild(row);
      return;
    }

    filteredIssues.forEach(issue => {
      const row = document.createElement('tr');
      
      // Add click handler to zoom to event (similar to other tabs)
      if (issue.originalEvent && window.zoomChartsToEvent && issue.sourceId) {
        row.style.cursor = 'pointer';
        row.title = 'Click to zoom to this event in its source tab';
        const eventDuration = (issue.originalEvent.duration !== undefined) ? issue.originalEvent.duration : 0;
        row.setAttribute('data-event-time', issue.time.toString());
        row.setAttribute('data-event-duration', eventDuration.toString());
        row.addEventListener('click', () => {
          // First switch to the source tab, then zoom
          if (tabManager && issue.sourceId) {
            tabManager.switchTab(issue.sourceId);
            // Wait a bit for tab to switch, then zoom
            setTimeout(() => {
              if (window.zoomChartsToEvent) {
                window.zoomChartsToEvent(issue.time, eventDuration, 3);
              }
            }, 100);
          }
        });
        row.addEventListener('mouseenter', () => {
          row.style.backgroundColor = '#e8f4f8';
        });
        row.addEventListener('mouseleave', () => {
          row.style.backgroundColor = '';
        });
      }

      // Format value with unit
      const valueDisplay = issue.value !== undefined && issue.value !== null
        ? `${issue.value >= 0 ? '+' : ''}${issue.value.toFixed(issue.valueUnit === '%' ? 2 : (issue.valueUnit === 'λ' ? 3 : 2))} ${issue.valueUnit}`
        : 'N/A';

      // Severity badge
      let severityBadgeClass = 'badge';
      let severityText = issue.severity;
      if (issue.severity === 'severe') {
        severityBadgeClass += ' badge-severe';
        severityText = 'Severe';
      } else if (issue.severity === 'high') {
        severityBadgeClass += ' badge-warning';
        severityText = 'High';
      } else if (issue.severity === 'low') {
        severityBadgeClass += ' badge-info';
        severityText = 'Low';
      } else if (issue.severity === 'mild') {
        severityBadgeClass += ' badge-mild';
        severityText = 'Mild';
      } else {
        severityBadgeClass += ' badge-default';
      }

      row.innerHTML = `
        <td>${issue.time.toFixed(2)}</td>
        <td>${issue.source}</td>
        <td>${issue.eventType}</td>
        <td><span class="${severityBadgeClass}">${severityText}</span></td>
        <td>${valueDisplay}</td>
        <td>${issue.description}</td>
      `;

      this.elements.issuesTableBody.appendChild(row);
    });
  },

  handleSort(column) {
    if (this.currentSort.column === column) {
      // Toggle direction
      this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      // New column, default to ascending
      this.currentSort.column = column;
      this.currentSort.direction = 'asc';
    }

    // Update sort indicators in table headers - remove all existing arrows first using regex
    document.querySelectorAll('#logscore-issuesTable th[data-sort]').forEach(th => {
      // Remove all arrow indicators (may be multiple if bug occurred)
      th.textContent = th.textContent.replace(/ ↑+| ↓+/g, '');
      if (th.dataset.sort === column) {
        th.textContent += this.currentSort.direction === 'asc' ? ' ↑' : ' ↓';
      }
    });

    this.updateTable();
  }
};

