// Load Limit Analysis Tab Module
const LoadLimitTab = {
  elements: {
    maxLoad: null,
    violations: null,
    timeNearLimit: null,
    loadTableBody: null,
    searchInput: null,
    eventTypeFilter: null,
    loadChart: null
  },

  charts: {},
  chartOriginalRanges: {},
  currentSort: { column: null, direction: 'asc' },

  initialize() {
    // Get DOM elements for this tab
    this.elements.maxLoad = document.getElementById('loadlimit-maxLoad');
    this.elements.violations = document.getElementById('loadlimit-violations');
    this.elements.timeNearLimit = document.getElementById('loadlimit-timeNearLimit');
    this.elements.loadTableBody = document.getElementById('loadlimit-loadTableBody');
    this.elements.searchInput = document.getElementById('loadlimit-searchInput');
    this.elements.eventTypeFilter = document.getElementById('loadlimit-eventTypeFilter');

    // Set up event listeners
    if (this.elements.searchInput) {
      this.elements.searchInput.addEventListener('input', () => this.updateTable());
    }
    if (this.elements.eventTypeFilter) {
      this.elements.eventTypeFilter.addEventListener('change', () => this.updateTable());
    }

    // Set up table sorting
    document.querySelectorAll('#loadlimit-loadTable th[data-sort]').forEach(th => {
      th.addEventListener('click', () => this.handleSort(th.dataset.sort));
    });
  },

  render(analysisData) {
    if (!analysisData) {
      console.warn('Load limit tab: No analysis data available');
      this.showColumnInfo();
      this.updateStatistics();
      this.updateTable();
      return;
    }
    
    if (analysisData.error) {
      console.warn('Load limit analysis error:', analysisData.error);
      this.showColumnInfo();
    }
    
    const chartsExist = this.charts.load;
    
    this.updateStatistics();
    
    if (!chartsExist) {
      this.renderCharts();
    }
    
    this.updateTable();
  },

  showColumnInfo() {
    let dataProcessor = null;
    const analyzer = tabManager ? tabManager.getTabAnalyzer('loadlimit') : null;
    
    if (analyzer && analyzer.dataProcessor) {
      dataProcessor = analyzer.dataProcessor;
    } else if (typeof window !== 'undefined' && window.dataProcessor) {
      dataProcessor = window.dataProcessor;
    }
    
    if (!dataProcessor) {
      const statsPanel = document.querySelector('.tab-content[data-tab="loadlimit"] .statistics-panel');
      if (statsPanel) {
        let infoDiv = document.getElementById('loadlimit-column-info');
        if (!infoDiv) {
          infoDiv = document.createElement('div');
          infoDiv.id = 'loadlimit-column-info';
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
    
    const loadColumns = columns.filter(col => {
      const colLower = col.toLowerCase();
      return colLower.includes('load') && (colLower.includes('maf') || colLower.includes('g/rev'));
    });
    
    const statsPanel = document.querySelector('.tab-content[data-tab="loadlimit"] .statistics-panel');
    if (statsPanel) {
      let infoDiv = document.getElementById('loadlimit-column-info');
      if (!infoDiv) {
        infoDiv = document.createElement('div');
        infoDiv.id = 'loadlimit-column-info';
        infoDiv.style.cssText = 'background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 15px; margin: 20px 0; color: #856404;';
        statsPanel.insertBefore(infoDiv, statsPanel.firstChild);
      }
      
      infoDiv.innerHTML = `
        <h3 style="margin-top: 0; color: #856404;">⚠️ Load Column Not Found</h3>
        <p><strong>Looking for:</strong> "Load (MAF) (g/rev)" or similar</p>
        ${loadColumns.length > 0 ? `<p><strong>Potential load columns:</strong> ${loadColumns.join(', ')}</p>` : ''}
        <p><strong>Available columns:</strong> Check browser console (F12) for full list</p>
      `;
    }
  },

  updateStatistics() {
    const analyzer = tabManager.getTabAnalyzer('loadlimit');
    if (!analyzer) {
      console.warn('Load limit analyzer not found');
      return;
    }

    const stats = analyzer.getStatistics();
    if (!stats) {
      console.warn('Load limit statistics not available');
      return;
    }
    
    if (this.elements.maxLoad) {
      this.elements.maxLoad.textContent = stats.maxLoad.toFixed(2) + ' g/rev';
    }
    if (this.elements.violations) {
      this.elements.violations.textContent = stats.violationEvents;
    }
    if (this.elements.timeNearLimit) {
      this.elements.timeNearLimit.textContent = stats.timeNearLimit.toFixed(2) + '%';
    }
  },

  renderCharts(preserveZoom = false) {
    const data = dataProcessor.getData();
    const analyzer = tabManager.getTabAnalyzer('loadlimit');
    if (!analyzer) return;

    const events = analyzer.getEvents();
    
    if (!data || data.length === 0) return;

    // Prepare data
    const times = data.map(row => row['Time (s)']);
    let loads = data.map(row => parseFloat(row['Load (MAF) (g/rev)'] || 0));
    const rpms = data.map(row => parseFloat(row['Engine Speed (rpm)']) || 0);

    // Calculate load limit line (RPM-based)
    let loadLimits = [];
    if (window.tuneFileParser && window.tuneFileParser.isLoaded()) {
      loadLimits = rpms.map(rpm => window.tuneFileParser.getLoadLimit(rpm));
    } else {
      // Use default fallback
      const defaultLimits = [1.28, 1.35, 1.42, 1.50, 1.58, 1.67, 1.75, 1.83, 1.92, 2.00, 2.08, 2.17, 2.25, 2.33, 2.42, 2.54];
      const defaultRpmIndex = [800, 1200, 1600, 2000, 2400, 2800, 3200, 3600, 4000, 4400, 4800, 5200, 5600, 6000, 6400, 6800];
      loadLimits = rpms.map(rpm => {
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
        return defaultLimits[limitIdx];
      });
    }

    // Create violation event point arrays
    const createViolationPointArray = (eventList) => {
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
        pointArray[closestIdx] = event.load;
      });
      return pointArray;
    };

    const violationEvents = events.filter(e => e.eventType === 'limit_violation');
    const nearLimitEvents = events.filter(e => e.eventType === 'near_limit');
    const violationPoints = createViolationPointArray(violationEvents);
    const nearLimitPoints = createViolationPointArray(nearLimitEvents);

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

    loads = breakAtGaps(loads, times);
    loadLimits = breakAtGaps(loadLimits, times);

    // Apply smoothing if enabled
    if (window.applyDataSmoothing && window.smoothingConfig) {
      loads = window.applyDataSmoothing(loads, window.smoothingConfig.windowSize, window.smoothingConfig.enabled);
      loadLimits = window.applyDataSmoothing(loadLimits, window.smoothingConfig.windowSize, window.smoothingConfig.enabled);
    }

    // Get zoom state if preserving
    let savedZoom = null;
    if (preserveZoom && this.charts.load) {
      const chart = this.charts.load;
      const xScale = chart.scales.x;
      if (xScale && xScale.min !== undefined && xScale.max !== undefined) {
        savedZoom = { min: xScale.min, max: xScale.max };
      }
    }

    // Destroy existing chart if it exists
    if (this.charts.load) {
      this.charts.load.destroy();
      this.charts.load = null;
    }

    const ctx = document.getElementById('loadlimit-loadChart');
    if (!ctx) return;

    // Store original time range
    if (!this.chartOriginalRanges.load) {
      this.chartOriginalRanges.load = {
        min: Math.min(...times),
        max: Math.max(...times)
      };
    }

    // Calculate y-axis bounds to always show load limit
    const validLoads = loads.filter(v => !isNaN(v) && isFinite(v));
    const validLoadLimits = loadLimits.filter(v => !isNaN(v) && isFinite(v));
    
    let yAxisMax = 2.5; // Default max if no data
    let yAxisMin = 0; // Start from 0
    
    if (validLoads.length > 0 || validLoadLimits.length > 0) {
      const maxLoad = validLoads.length > 0 ? Math.max(...validLoads) : 0;
      const maxLoadLimit = validLoadLimits.length > 0 ? Math.max(...validLoadLimits) : 0;
      yAxisMax = Math.max(maxLoad, maxLoadLimit, 1.5) * 1.15; // Add 15% padding, ensure at least 1.5
    }

    this.charts.load = new Chart(ctx, {
      type: 'line',
      data: {
        labels: times,
        datasets: [
          {
            label: 'Load (g/rev)',
            data: loads,
            borderColor: 'rgb(0, 123, 255)',
            backgroundColor: 'rgba(0, 123, 255, 0.1)',
            borderWidth: 2,
            pointRadius: 0,
            spanGaps: false
          },
          {
            label: 'Load Limit',
            data: loadLimits,
            borderColor: 'rgb(255, 193, 7)',
            backgroundColor: 'rgba(255, 193, 7, 0.1)',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0,
            spanGaps: false
          },
          {
            label: 'Limit Violations',
            data: violationPoints,
            borderColor: 'rgb(220, 53, 69)',
            backgroundColor: 'rgba(220, 53, 69, 0.5)',
            pointRadius: 6,
            pointHoverRadius: 8,
            showLine: false
          },
          {
            label: 'Near Limit',
            data: nearLimitPoints,
            borderColor: 'rgb(255, 193, 7)',
            backgroundColor: 'rgba(255, 193, 7, 0.5)',
            pointRadius: 4,
            pointHoverRadius: 6,
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
                synchronizeChartZoom('loadlimit', ctx.chart);
              }
            },
            pan: {
              enabled: true,
              modifierKey: 'shift',
              mode: 'x',
              onPanComplete: (ctx) => {
                synchronizeChartZoom('loadlimit', ctx.chart);
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
              text: 'Load (g/rev)'
            },
            min: yAxisMin,
            max: yAxisMax,
            ticks: {
              stepSize: 0.1
            }
          }
        }
      }
    });
  },

  updateTable() {
    const analyzer = tabManager.getTabAnalyzer('loadlimit');
    if (!analyzer) return;

    const events = analyzer.getEvents();
    if (!events || events.length === 0) {
      if (this.elements.loadTableBody) {
        this.elements.loadTableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;">No load limit events detected</td></tr>';
      }
      return;
    }

    // Get filters
    const searchTerm = this.elements.searchInput ? this.elements.searchInput.value.toLowerCase() : '';
    const eventTypeFilter = this.elements.eventTypeFilter ? this.elements.eventTypeFilter.value : 'all';

    // Filter events
    let filteredEvents = events;
    if (eventTypeFilter !== 'all') {
      filteredEvents = filteredEvents.filter(e => e.eventType === eventTypeFilter);
    }
    if (searchTerm) {
      filteredEvents = filteredEvents.filter(e => {
        return (
          e.time.toString().includes(searchTerm) ||
          e.load.toFixed(2).includes(searchTerm) ||
          e.loadLimit.toFixed(2).includes(searchTerm) ||
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
    if (this.elements.loadTableBody) {
      this.elements.loadTableBody.innerHTML = filteredEvents.map((event, idx) => {
        const duration = event.duration ? ` (${event.duration.toFixed(3)}s)` : '';
        const severityBadge = this.getSeverityBadge(event.severity);
        const fuelCutBadge = event.fuelCut ? '<span class="severity-badge severity-severe">Fuel Cut</span>' : '';
        
        return `
          <tr data-event-time="${event.time}" data-event-duration="${event.duration || 0}" 
              style="cursor: pointer;" title="Click to zoom to this event">
            <td>${event.time.toFixed(2)}${duration}</td>
            <td>${event.load.toFixed(2)}</td>
            <td>${event.loadLimit.toFixed(2)}</td>
            <td>${(event.loadRatio * 100).toFixed(1)}%</td>
            <td>${event.rpm || 0}</td>
            <td>${(event.throttle || 0).toFixed(1)}%</td>
            <td>${severityBadge}</td>
            <td>${fuelCutBadge}</td>
          </tr>
        `;
      }).join('');

      // Add click handlers for zoom
      this.elements.loadTableBody.querySelectorAll('tr[data-event-time]').forEach(row => {
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

