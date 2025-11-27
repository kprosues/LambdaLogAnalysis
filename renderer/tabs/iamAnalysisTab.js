// IAM Analysis Tab Module
const IAMAnalysisTab = {
  elements: {
    currentIAM: null,
    minIAM: null,
    recoveryRate: null,
    knockCorrelation: null,
    lowIAMEvents: null,
    iamTableBody: null,
    searchInput: null,
    severityFilter: null,
    iamChart: null
  },

  charts: {},
  chartOriginalRanges: {},
  currentSort: { column: null, direction: 'asc' },

  initialize() {
    // Get DOM elements for this tab
    this.elements.currentIAM = document.getElementById('iam-currentIAM');
    this.elements.minIAM = document.getElementById('iam-minIAM');
    this.elements.recoveryRate = document.getElementById('iam-recoveryRate');
    this.elements.knockCorrelation = document.getElementById('iam-knockCorrelation');
    this.elements.lowIAMEvents = document.getElementById('iam-lowIAMEvents');
    this.elements.iamTableBody = document.getElementById('iam-iamTableBody');
    this.elements.searchInput = document.getElementById('iam-searchInput');
    this.elements.severityFilter = document.getElementById('iam-severityFilter');

    // Set up event listeners
    if (this.elements.searchInput) {
      this.elements.searchInput.addEventListener('input', () => this.updateTable());
    }
    if (this.elements.severityFilter) {
      this.elements.severityFilter.addEventListener('change', () => this.updateTable());
    }

    // Set up table sorting
    document.querySelectorAll('#iam-iamTable th[data-sort]').forEach(th => {
      th.addEventListener('click', () => this.handleSort(th.dataset.sort));
    });
  },

  render(analysisData) {
    if (!analysisData) {
      console.warn('IAM tab: No analysis data available');
      this.showColumnInfo();
      this.updateStatistics();
      this.updateTable();
      return;
    }
    
    if (analysisData.error) {
      console.warn('IAM analysis error:', analysisData.error);
      this.showColumnInfo();
    }
    
    const chartsExist = this.charts.iam;
    
    this.updateStatistics();
    
    if (!chartsExist) {
      this.renderCharts();
    }
    
    this.updateTable();
  },

  showColumnInfo() {
    let dataProcessor = null;
    const analyzer = tabManager ? tabManager.getTabAnalyzer('iam') : null;
    
    if (analyzer && analyzer.dataProcessor) {
      dataProcessor = analyzer.dataProcessor;
    } else if (typeof window !== 'undefined' && window.dataProcessor) {
      dataProcessor = window.dataProcessor;
    }
    
    if (!dataProcessor) {
      const statsPanel = document.querySelector('.tab-content[data-tab="iam"] .statistics-panel');
      if (statsPanel) {
        let infoDiv = document.getElementById('iam-column-info');
        if (!infoDiv) {
          infoDiv = document.createElement('div');
          infoDiv.id = 'iam-column-info';
          infoDiv.style.cssText = 'background: #f8d7da; border: 1px solid #dc3545; border-radius: 6px; padding: 15px; margin: 20px 0; color: #721c24;';
          statsPanel.insertBefore(infoDiv, statsPanel.firstChild);
        }
        infoDiv.innerHTML = `
          <h3 style="margin-top: 0; color: #721c24;">❌ Data Processor Not Available</h3>
          <p>Unable to access file data. Please ensure a log file has been loaded.</p>
        `;
      }
      return;
    }
    
    let columns = dataProcessor.getColumns();
    const data = dataProcessor.getData ? dataProcessor.getData() : null;
    
    if (!Array.isArray(columns) && data && data.length > 0 && data[0]) {
      columns = Object.keys(data[0]);
    }
    
    const iamColumns = columns.filter(col => {
      const colLower = col.toLowerCase();
      return colLower.includes('iam') || (colLower.includes('ignition') && colLower.includes('multiplier'));
    });
    
    const statsPanel = document.querySelector('.tab-content[data-tab="iam"] .statistics-panel');
    if (statsPanel) {
      let infoDiv = document.getElementById('iam-column-info');
      if (!infoDiv) {
        infoDiv = document.createElement('div');
        infoDiv.id = 'iam-column-info';
        infoDiv.style.cssText = 'background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 15px; margin: 20px 0; color: #856404;';
        statsPanel.insertBefore(infoDiv, statsPanel.firstChild);
      }
      
      infoDiv.innerHTML = `
        <h3 style="margin-top: 0; color: #856404;">⚠️ IAM Column Not Found</h3>
        <p><strong>Looking for:</strong> "Ignition Advance Multiplier" or "IAM"</p>
        ${iamColumns.length > 0 ? `<p><strong>Potential IAM columns:</strong> ${iamColumns.join(', ')}</p>` : ''}
        <p><strong>Available columns:</strong> Check browser console (F12) for full list</p>
      `;
    }
  },

  updateStatistics() {
    const analyzer = tabManager.getTabAnalyzer('iam');
    if (!analyzer) {
      console.warn('IAM analyzer not found');
      return;
    }

    const stats = analyzer.getStatistics();
    if (!stats) {
      console.warn('IAM statistics not available');
      return;
    }
    
    if (this.elements.currentIAM) {
      this.elements.currentIAM.textContent = (stats.currentIAM * 100).toFixed(1) + '%';
    }
    if (this.elements.minIAM) {
      this.elements.minIAM.textContent = (stats.minIAM * 100).toFixed(1) + '%';
    }
    if (this.elements.recoveryRate) {
      // Recovery rate is per second, convert to percentage per second
      this.elements.recoveryRate.textContent = (stats.recoveryRate * 100).toFixed(2) + '%/s';
    }
    if (this.elements.knockCorrelation) {
      this.elements.knockCorrelation.textContent = stats.knockCorrelation.toFixed(1) + '%';
    }
    if (this.elements.lowIAMEvents) {
      this.elements.lowIAMEvents.textContent = stats.lowIAMEvents;
    }
  },

  renderCharts(preserveZoom = false) {
    const data = dataProcessor.getData();
    const analyzer = tabManager.getTabAnalyzer('iam');
    if (!analyzer) return;

    const events = analyzer.getEvents();
    
    if (!data || data.length === 0) return;

    // Prepare data
    const times = data.map(row => row['Time (s)']);
    
    // Get RPM data for tooltips
    const rpms = data.map(row => parseFloat(row['Engine Speed (rpm)']) || 0);
    
    let iams = data.map(row => {
      let iam = parseFloat(row['Ignition Advance Multiplier'] || 0);
      // Normalize IAM (could be 0-1 or 0-100)
      if (iam > 1.0) {
        iam = iam / 100.0;
      }
      return iam;
    });

    // Get knock events for overlay if available
    let knockEvents = [];
    const knockDetector = tabManager.getTabAnalyzer('knock');
    if (knockDetector && knockDetector.getKnockEvents) {
      knockEvents = knockDetector.getKnockEvents();
    }

    // Create IAM drop event point arrays
    const createIAMPointArray = (eventList) => {
      const pointArray = new Array(times.length).fill(NaN);
      eventList.forEach(event => {
        let closestIdx = 0;
        let minDiff = Math.abs(times[0] - event.time);
        for (let i = 1; i < times.length; i++) {
          const diff = Math.abs(times[i] - event.time);
          if (diff < minDiff) {
            minDiff = diff;
            closestIdx = i;
          }
        }
        pointArray[closestIdx] = event.iam * 100; // Convert to percentage
      });
      return pointArray;
    };

    const iamDropPoints = createIAMPointArray(events.filter(e => e.eventType === 'low_iam'));

    // Create knock event points
    const createKnockPointArray = (eventList) => {
      const pointArray = new Array(times.length).fill(NaN);
      eventList.forEach(event => {
        let closestIdx = 0;
        let minDiff = Math.abs(times[0] - event.time);
        for (let i = 1; i < times.length; i++) {
          const diff = Math.abs(times[i] - event.time);
          if (diff < minDiff) {
            minDiff = diff;
            closestIdx = i;
          }
        }
        pointArray[closestIdx] = iams[closestIdx] * 100; // Show IAM value at knock time
      });
      return pointArray;
    };

    const knockPoints = createKnockPointArray(knockEvents);

    // Apply gap breaking
    const breakAtGaps = (dataArray, timeArray) => {
      const result = [...dataArray];
      for (let i = 1; i < timeArray.length; i++) {
        const timeDiff = timeArray[i] - timeArray[i - 1];
        if (timeDiff > 1.0) {
          result[i - 1] = NaN;
        }
      }
      return result;
    };

    iams = breakAtGaps(iams, times);

    // Apply smoothing if enabled
    if (window.applyDataSmoothing && window.smoothingConfig) {
      iams = window.applyDataSmoothing(iams, window.smoothingConfig.windowSize, window.smoothingConfig.enabled);
    }

    // Convert IAM to percentage for display
    const iamsPercent = iams.map(iam => iam * 100);

    // Get zoom state if preserving
    let savedZoom = null;
    if (preserveZoom && this.charts.iam) {
      const chart = this.charts.iam;
      const xScale = chart.scales.x;
      if (xScale && xScale.min !== undefined && xScale.max !== undefined) {
        savedZoom = { min: xScale.min, max: xScale.max };
      }
    }

    // Destroy existing chart if it exists
    if (this.charts.iam) {
      this.charts.iam.destroy();
      this.charts.iam = null;
    }

    const ctx = document.getElementById('iam-iamChart');
    if (!ctx) return;

    // Store original time range
    if (!this.chartOriginalRanges.iam) {
      this.chartOriginalRanges.iam = {
        min: Math.min(...times),
        max: Math.max(...times)
      };
    }

    const criticalEvents = events.filter(e => e.severity === 'critical');
    const severeEvents = events.filter(e => e.severity === 'severe');

    const createSeverityPointArray = (eventList) => {
      const pointArray = new Array(times.length).fill(NaN);
      eventList.forEach(event => {
        let closestIdx = 0;
        let minDiff = Math.abs(times[0] - event.time);
        for (let i = 1; i < times.length; i++) {
          const diff = Math.abs(times[i] - event.time);
          if (diff < minDiff) {
            minDiff = diff;
            closestIdx = i;
          }
        }
        pointArray[closestIdx] = event.iam * 100;
      });
      return pointArray;
    };

    const criticalIAMPoints = createSeverityPointArray(criticalEvents);
    const severeIAMPoints = createSeverityPointArray(severeEvents);

    this.charts.iam = new Chart(ctx, {
      type: 'line',
      data: {
        labels: times,
        datasets: [
          {
            label: 'IAM (%)',
            data: iamsPercent,
            borderColor: 'rgb(0, 123, 255)',
            backgroundColor: 'rgba(0, 123, 255, 0.1)',
            borderWidth: 2,
            pointRadius: 0,
            spanGaps: false
          },
          {
            label: 'Critical IAM Drops',
            data: criticalIAMPoints,
            borderColor: 'rgb(220, 53, 69)',
            backgroundColor: 'rgba(220, 53, 69, 0.5)',
            pointRadius: 6,
            pointHoverRadius: 8,
            showLine: false
          },
          {
            label: 'Severe IAM Drops',
            data: severeIAMPoints,
            borderColor: 'rgb(255, 193, 7)',
            backgroundColor: 'rgba(255, 193, 7, 0.5)',
            pointRadius: 4,
            pointHoverRadius: 6,
            showLine: false
          },
          {
            label: 'Knock Events',
            data: knockPoints,
            borderColor: 'rgb(128, 128, 128)',
            backgroundColor: 'rgba(128, 128, 128, 0.3)',
            pointRadius: 3,
            pointHoverRadius: 5,
            showLine: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top'
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
            footer: (tooltipItems) => {
              // Use TooltipConfig to get footer text
              if (tooltipItems.length > 0 && window.TooltipConfig && window.dataProcessor) {
                const dataIndex = tooltipItems[0].dataIndex;
                const data = window.dataProcessor.getData();
                if (data && dataIndex >= 0 && dataIndex < data.length) {
                  return window.TooltipConfig.getTooltipFooter(dataIndex, data);
                }
              }
              return '';
            }
            }
          },
          zoom: {
            zoom: {
              wheel: {
                enabled: true,
                modifierKey: 'ctrl'
              },
              pinch: {
                enabled: true
              },
              mode: 'x',
              onZoomComplete: (ctx) => {
                synchronizeChartZoom('iam', ctx.chart);
              }
            },
            pan: {
              enabled: true,
              modifierKey: 'shift',
              mode: 'x',
              onPanComplete: (ctx) => {
                synchronizeChartZoom('iam', ctx.chart);
              }
            }
          }
        },
        scales: {
          x: {
            type: 'linear',
            position: 'bottom',
            title: {
              display: true,
              text: 'Time (s)'
            },
            min: savedZoom ? savedZoom.min : undefined,
            max: savedZoom ? savedZoom.max : undefined
          },
          y: {
            title: {
              display: true,
              text: 'IAM (%)'
            },
            min: 0,
            max: 100
          }
        }
      }
    });
  },

  updateTable() {
    const analyzer = tabManager.getTabAnalyzer('iam');
    if (!analyzer) return;

    const events = analyzer.getEvents();
    if (!events || events.length === 0) {
      if (this.elements.iamTableBody) {
        this.elements.iamTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">No IAM events detected</td></tr>';
      }
      return;
    }

    // Get filters
    const searchTerm = this.elements.searchInput ? this.elements.searchInput.value.toLowerCase() : '';
    const severityFilter = this.elements.severityFilter ? this.elements.severityFilter.value : 'all';

    // Filter events
    let filteredEvents = events;
    if (severityFilter !== 'all') {
      filteredEvents = filteredEvents.filter(e => e.severity === severityFilter);
    }
    if (searchTerm) {
      filteredEvents = filteredEvents.filter(e => {
        return (
          e.time.toString().includes(searchTerm) ||
          (e.iam * 100).toFixed(1).includes(searchTerm) ||
          e.rpm.toString().includes(searchTerm) ||
          e.eventType.toLowerCase().includes(searchTerm) ||
          e.severity.toLowerCase().includes(searchTerm)
        );
      });
    }

    // Apply sorting
    if (this.currentSort.column) {
      filteredEvents.sort((a, b) => {
        let aVal = a[this.currentSort.column];
        let bVal = b[this.currentSort.column];
        
        // Handle nested properties
        if (this.currentSort.column === 'iam') {
          aVal = a.iam || 0;
          bVal = b.iam || 0;
        }
        
        if (typeof aVal === 'string') {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
        }
        
        if (this.currentSort.direction === 'asc') {
          return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        } else {
          return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
        }
      });
    }

    // Render table
    if (this.elements.iamTableBody) {
      this.elements.iamTableBody.innerHTML = filteredEvents.map((event, idx) => {
        const duration = event.duration ? ` (${event.duration.toFixed(3)}s)` : '';
        const severityBadge = this.getSeverityBadge(event.severity);
        
        return `
          <tr data-event-time="${event.time}" data-event-duration="${event.duration || 0}" 
              style="cursor: pointer;" title="Click to zoom to this event">
            <td>${event.time.toFixed(2)}${duration}</td>
            <td>${(event.iam * 100).toFixed(1)}%</td>
            <td>${event.rpm || 0}</td>
            <td>${(event.throttle || 0).toFixed(1)}%</td>
            <td>${(event.load || 0).toFixed(2)}</td>
            <td>${event.knockRetard ? event.knockRetard.toFixed(2) + '°' : 'N/A'}</td>
            <td>${severityBadge}</td>
          </tr>
        `;
      }).join('');

      // Add click handlers for zoom
      this.elements.iamTableBody.querySelectorAll('tr[data-event-time]').forEach(row => {
        row.addEventListener('click', () => {
          const eventTime = parseFloat(row.dataset.eventTime);
          const eventDuration = parseFloat(row.dataset.eventDuration) || 0;
          if (window.zoomChartsToEvent) {
            window.zoomChartsToEvent(eventTime, eventDuration, 3);
          }
        });
      });
    }
  },

  getSeverityBadge(severity) {
    const badges = {
      critical: '<span class="severity-badge severity-severe">Critical</span>',
      severe: '<span class="severity-badge severity-severe">Severe</span>',
      moderate: '<span class="severity-badge severity-moderate">Moderate</span>',
      mild: '<span class="severity-badge severity-mild">Mild</span>',
      normal: '<span class="severity-badge">Normal</span>'
    };
    return badges[severity] || badges.normal;
  },

  handleSort(column) {
    if (this.currentSort.column === column) {
      this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      this.currentSort.column = column;
      this.currentSort.direction = 'asc';
    }
    this.updateTable();
  }
};

