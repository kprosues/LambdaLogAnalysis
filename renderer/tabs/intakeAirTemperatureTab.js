// Intake Air Temperature Analysis Tab Module
const IntakeAirTemperatureTab = {
  elements: {
    minIAT: null,
    maxIAT: null,
    avgIAT: null,
    highTempEvents: null,
    lowTempEvents: null,
    iatTableBody: null,
    searchInput: null,
    severityFilter: null,
    eventTypeFilter: null,
    iatChart: null
  },

  charts: {},
  chartOriginalRanges: {},
  currentSort: { column: null, direction: 'asc' },
  selectedRow: null, // Track currently selected row

  initialize() {
    // Get DOM elements for this tab
    this.elements.minIAT = document.getElementById('iat-minIAT');
    this.elements.maxIAT = document.getElementById('iat-maxIAT');
    this.elements.avgIAT = document.getElementById('iat-avgIAT');
    this.elements.highTempEvents = document.getElementById('iat-highTempEvents');
    this.elements.lowTempEvents = document.getElementById('iat-lowTempEvents');
    this.elements.iatTableBody = document.getElementById('iat-iatTableBody');
    this.elements.searchInput = document.getElementById('iat-searchInput');
    this.elements.severityFilter = document.getElementById('iat-severityFilter');
    this.elements.eventTypeFilter = document.getElementById('iat-eventTypeFilter');

    // Set up event listeners
    if (this.elements.searchInput) {
      this.elements.searchInput.addEventListener('input', () => this.updateTable());
    }
    if (this.elements.severityFilter) {
      this.elements.severityFilter.addEventListener('change', () => this.updateTable());
    }
    if (this.elements.eventTypeFilter) {
      this.elements.eventTypeFilter.addEventListener('change', () => this.updateTable());
    }

    // Set up table sorting
    document.querySelectorAll('#iat-iatTable th[data-sort]').forEach(th => {
      th.addEventListener('click', () => this.handleSort(th.dataset.sort));
    });
  },

  render(analysisData) {
    if (!analysisData) {
      console.warn('Intake air temperature tab: No analysis data available');
      this.showColumnInfo();
      this.updateStatistics();
      this.updateTable();
      return;
    }
    
    if (analysisData.error) {
      console.warn('Intake air temperature analysis error:', analysisData.error);
      this.showColumnInfo();
    }
    
    const chartsExist = this.charts.iat;
    
    this.updateStatistics();
    
    if (!chartsExist) {
      this.renderCharts();
    }
    
    this.updateTable();
  },

  showColumnInfo() {
    let dataProcessor = null;
    const analyzer = tabManager ? tabManager.getTabAnalyzer('iat') : null;
    
    if (analyzer && analyzer.dataProcessor) {
      dataProcessor = analyzer.dataProcessor;
    } else if (typeof window !== 'undefined' && window.dataProcessor) {
      dataProcessor = window.dataProcessor;
    }
    
    if (!dataProcessor) {
      const statsPanel = document.querySelector('.tab-content[data-tab="iat"] .statistics-panel');
      if (statsPanel) {
        let infoDiv = document.getElementById('iat-column-info');
        if (!infoDiv) {
          infoDiv = document.createElement('div');
          infoDiv.id = 'iat-column-info';
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
    
    const iatColumns = columns.filter(col => {
      const colLower = col.toLowerCase();
      return (colLower.includes('intake') || colLower.includes('iat')) && (colLower.includes('temp') || colLower.includes('temperature'));
    });
    
    const statsPanel = document.querySelector('.tab-content[data-tab="iat"] .statistics-panel');
    if (statsPanel) {
      let infoDiv = document.getElementById('iat-column-info');
      if (!infoDiv) {
        infoDiv = document.createElement('div');
        infoDiv.id = 'iat-column-info';
        infoDiv.style.cssText = 'background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 15px; margin: 20px 0; color: #856404;';
        statsPanel.insertBefore(infoDiv, statsPanel.firstChild);
      }
      
      infoDiv.innerHTML = `
        <h3 style="margin-top: 0; color: #856404;">⚠️ Intake Air Temperature Column Not Found</h3>
        <p><strong>Looking for:</strong> "Intake Air Temperature (°C)" or similar</p>
        ${iatColumns.length > 0 ? `<p><strong>Potential IAT columns:</strong> ${iatColumns.join(', ')}</p>` : ''}
        <p><strong>Available columns:</strong> Check browser console (F12) for full list</p>
      `;
    }
  },

  updateStatistics() {
    const analyzer = tabManager.getTabAnalyzer('iat');
    if (!analyzer) {
      console.warn('Intake air temperature analyzer not found');
      return;
    }

    const stats = analyzer.getStatistics();
    if (!stats) {
      console.warn('Intake air temperature statistics not available');
      return;
    }
    
    if (this.elements.minIAT) {
      this.elements.minIAT.textContent = stats.minIAT.toFixed(1) + ' °C';
    }
    if (this.elements.maxIAT) {
      this.elements.maxIAT.textContent = stats.maxIAT.toFixed(1) + ' °C';
    }
    if (this.elements.avgIAT) {
      this.elements.avgIAT.textContent = stats.avgIAT.toFixed(1) + ' °C';
    }
    if (this.elements.highTempEvents) {
      this.elements.highTempEvents.textContent = stats.highTempEvents;
    }
    if (this.elements.lowTempEvents) {
      this.elements.lowTempEvents.textContent = stats.lowTempEvents;
    }
  },

  renderCharts(preserveZoom = false) {
    const data = dataProcessor.getData();
    const analyzer = tabManager.getTabAnalyzer('iat');
    if (!analyzer) return;

    const events = analyzer.getEvents();
    const stats = analyzer.getStatistics();
    
    if (!data || data.length === 0) return;

    // Prepare data
    const times = data.map(row => row['Time (s)']);
    
    // Get RPM data for tooltips
    const rpms = data.map(row => parseFloat(row['Engine Speed (rpm)']) || 0);
    
    let iats = data.map(row => {
      const col = analyzer.getColumns()?.iat || 'Intake Air Temperature (°C)';
      return parseFloat(row[col] || 0);
    });

    // Create temperature event point arrays
    const createIATPointArray = (eventList) => {
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
        pointArray[closestIdx] = event.iat;
      });
      return pointArray;
    };

    const criticalEvents = events.filter(e => e.severity === 'critical');
    const severeHighEvents = events.filter(e => e.severity === 'severe' && e.eventType === 'high_temp');
    const severeLowEvents = events.filter(e => e.severity === 'severe' && e.eventType === 'low_temp');
    const moderateEvents = events.filter(e => e.severity === 'moderate');
    const mildEvents = events.filter(e => e.severity === 'mild');

    const criticalIATPoints = createIATPointArray(criticalEvents);
    const severeHighIATPoints = createIATPointArray(severeHighEvents);
    const severeLowIATPoints = createIATPointArray(severeLowEvents);
    const moderateIATPoints = createIATPointArray(moderateEvents);
    const mildIATPoints = createIATPointArray(mildEvents);

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

    iats = breakAtGaps(iats, times);

    // Apply smoothing if enabled
    if (window.applyDataSmoothing && window.smoothingConfig) {
      iats = window.applyDataSmoothing(iats, window.smoothingConfig.windowSize, window.smoothingConfig.enabled);
    }

    // Get zoom state if preserving
    let savedZoom = null;
    if (preserveZoom && this.charts.iat) {
      const chart = this.charts.iat;
      const xScale = chart.scales.x;
      if (xScale && xScale.min !== undefined && xScale.max !== undefined) {
        savedZoom = { min: xScale.min, max: xScale.max };
      }
    }

    // Destroy existing chart if it exists
    if (this.charts.iat) {
      this.charts.iat.destroy();
      this.charts.iat = null;
    }

    const ctx = document.getElementById('iat-iatChart');
    if (!ctx) return;

    // Store original time range
    if (!this.chartOriginalRanges.iat) {
      this.chartOriginalRanges.iat = {
        min: Math.min(...times),
        max: Math.max(...times)
      };
    }

    // Get thresholds for reference lines
    const iatHighThreshold = stats ? stats.iatHighThreshold : 80.0;
    const iatLowThreshold = stats ? stats.iatLowThreshold : 0.0;
    const iatCriticalThreshold = stats ? stats.iatCriticalThreshold : 100.0;
    const iatNormalMin = stats ? stats.iatNormalMin : 20.0;
    const iatNormalMax = stats ? stats.iatNormalMax : 60.0;

    this.charts.iat = new Chart(ctx, {
      type: 'line',
      data: {
        labels: times,
        datasets: [
          {
            label: 'Intake Air Temperature (°C)',
            data: iats,
            borderColor: 'rgb(0, 123, 255)',
            backgroundColor: 'rgba(0, 123, 255, 0.1)',
            borderWidth: 2,
            pointRadius: 0,
            spanGaps: false
          },
          {
            label: 'Critical Threshold',
            data: new Array(times.length).fill(iatCriticalThreshold),
            borderColor: 'rgb(220, 53, 69)',
            backgroundColor: 'rgba(220, 53, 69, 0.1)',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0,
            spanGaps: false
          },
          {
            label: 'High Threshold',
            data: new Array(times.length).fill(iatHighThreshold),
            borderColor: 'rgb(255, 193, 7)',
            backgroundColor: 'rgba(255, 193, 7, 0.1)',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0,
            spanGaps: false
          },
          {
            label: 'Normal Range Max',
            data: new Array(times.length).fill(iatNormalMax),
            borderColor: 'rgb(40, 167, 69)',
            backgroundColor: 'rgba(40, 167, 69, 0.05)',
            borderWidth: 1,
            borderDash: [3, 3],
            pointRadius: 0,
            spanGaps: false
          },
          {
            label: 'Normal Range Min',
            data: new Array(times.length).fill(iatNormalMin),
            borderColor: 'rgb(40, 167, 69)',
            backgroundColor: 'rgba(40, 167, 69, 0.05)',
            borderWidth: 1,
            borderDash: [3, 3],
            pointRadius: 0,
            spanGaps: false
          },
          {
            label: 'Low Threshold',
            data: new Array(times.length).fill(iatLowThreshold),
            borderColor: 'rgb(23, 162, 184)',
            backgroundColor: 'rgba(23, 162, 184, 0.1)',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0,
            spanGaps: false
          },
          {
            label: 'Critical High Temp',
            data: criticalIATPoints,
            borderColor: 'rgb(220, 53, 69)',
            backgroundColor: 'rgba(220, 53, 69, 0.5)',
            pointRadius: 6,
            pointHoverRadius: 8,
            showLine: false
          },
          {
            label: 'Severe High Temp',
            data: severeHighIATPoints,
            borderColor: 'rgb(255, 193, 7)',
            backgroundColor: 'rgba(255, 193, 7, 0.5)',
            pointRadius: 4,
            pointHoverRadius: 6,
            showLine: false
          },
          {
            label: 'Severe Low Temp',
            data: severeLowIATPoints,
            borderColor: 'rgb(23, 162, 184)',
            backgroundColor: 'rgba(23, 162, 184, 0.5)',
            pointRadius: 4,
            pointHoverRadius: 6,
            showLine: false
          },
          {
            label: 'Moderate Temp',
            data: moderateIATPoints,
            borderColor: 'rgb(255, 193, 7)',
            backgroundColor: 'rgba(255, 193, 7, 0.3)',
            pointRadius: 3,
            pointHoverRadius: 5,
            showLine: false
          },
          {
            label: 'Mild Temp',
            data: mildIATPoints,
            borderColor: 'rgb(108, 117, 125)',
            backgroundColor: 'rgba(108, 117, 125, 0.2)',
            pointRadius: 2,
            pointHoverRadius: 4,
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
                synchronizeChartZoom('iat', ctx.chart);
              }
            },
            pan: {
              enabled: true,
              modifierKey: 'shift',
              mode: 'x',
              onPanComplete: (ctx) => {
                synchronizeChartZoom('iat', ctx.chart);
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
              text: 'Temperature (°C)'
            }
          }
        }
      }
    });
  },

  updateTable() {
    const analyzer = tabManager.getTabAnalyzer('iat');
    if (!analyzer) return;

    const events = analyzer.getEvents();
    if (!events || events.length === 0) {
      if (this.elements.iatTableBody) {
        this.elements.iatTableBody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 20px;">No intake air temperature events detected</td></tr>';
      }
      return;
    }

    // Get filters
    const searchTerm = this.elements.searchInput ? this.elements.searchInput.value.toLowerCase() : '';
    const severityFilter = this.elements.severityFilter ? this.elements.severityFilter.value : 'all';
    const eventTypeFilter = this.elements.eventTypeFilter ? this.elements.eventTypeFilter.value : 'all';

    // Filter events
    let filteredEvents = events;
    if (severityFilter !== 'all') {
      filteredEvents = filteredEvents.filter(e => e.severity === severityFilter);
    }
    if (eventTypeFilter !== 'all') {
      filteredEvents = filteredEvents.filter(e => {
        if (eventTypeFilter === 'high_temp') return e.eventType === 'high_temp';
        if (eventTypeFilter === 'low_temp') return e.eventType === 'low_temp';
        return true;
      });
    }
    if (searchTerm) {
      filteredEvents = filteredEvents.filter(e => {
        return (
          e.time.toString().includes(searchTerm) ||
          e.iat.toFixed(1).includes(searchTerm) ||
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
    if (this.elements.iatTableBody) {
      // Reset selected row when updating table
      this.selectedRow = null;
      
      this.elements.iatTableBody.innerHTML = filteredEvents.map((event, idx) => {
        const duration = event.duration ? ` (${event.duration.toFixed(3)}s)` : '';
        const severityBadge = this.getSeverityBadge(event.severity);
        const thresholdStatus = event.aboveHighThreshold ? 'Above High' : (event.belowLowThreshold ? 'Below Low' : '');
        const thresholdBadge = thresholdStatus ? `<span class="severity-badge ${event.aboveHighThreshold ? 'severity-severe' : 'severity-moderate'}">${thresholdStatus}</span>` : '';
        
        return `
          <tr data-event-time="${event.time}" data-event-duration="${event.duration || 0}" 
              style="cursor: pointer;" title="Click to zoom to this event in its source tab">
            <td>${event.time.toFixed(2)}${duration}</td>
            <td>${event.iat.toFixed(1)}</td>
            <td>${event.maxIAT.toFixed(1)}</td>
            <td>${event.rpm || 0}</td>
            <td>${(event.throttle || 0).toFixed(1)}%</td>
            <td>${(event.load || 0).toFixed(2)}</td>
            <td>${(event.boost || 0).toFixed(1)}</td>
            <td>${severityBadge}</td>
            <td>${thresholdBadge}</td>
          </tr>
        `;
      }).join('');

      // Add click handlers for zoom
      this.elements.iatTableBody.querySelectorAll('tr[data-event-time]').forEach(row => {
        // Add click handler to zoom to event and highlight row
        row.addEventListener('click', () => {
          // Remove highlight from previously selected row
          if (this.selectedRow && this.selectedRow !== row) {
            this.selectedRow.style.backgroundColor = '';
          }
          
          // Highlight clicked row
          row.style.backgroundColor = '#b3d9ff';
          this.selectedRow = row;
          
          const eventTime = parseFloat(row.dataset.eventTime);
          const eventDuration = parseFloat(row.dataset.eventDuration) || 0;
          if (window.zoomChartsToEvent) {
            window.zoomChartsToEvent(eventTime, eventDuration, 3);
          }
        });
        
        // Add hover effect (only if not selected)
        row.addEventListener('mouseenter', () => {
          if (this.selectedRow !== row) {
            row.style.backgroundColor = '#e8f4f8';
          }
        });
        row.addEventListener('mouseleave', () => {
          if (this.selectedRow !== row) {
            row.style.backgroundColor = '';
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

