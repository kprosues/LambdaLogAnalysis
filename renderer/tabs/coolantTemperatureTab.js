// Coolant Temperature Analysis Tab Module
const CoolantTemperatureTab = {
  elements: {
    minTemp: null,
    maxTemp: null,
    avgTemp: null,
    timeAboveHighSpeedFan: null,
    highTempEvents: null,
    coolantTempTableBody: null,
    searchInput: null,
    severityFilter: null,
    coolantTempChart: null
  },

  charts: {},
  chartOriginalRanges: {},
  currentSort: { column: null, direction: 'asc' },

  initialize() {
    // Get DOM elements for this tab
    this.elements.minTemp = document.getElementById('coolanttemp-minTemp');
    this.elements.maxTemp = document.getElementById('coolanttemp-maxTemp');
    this.elements.avgTemp = document.getElementById('coolanttemp-avgTemp');
    this.elements.timeAboveHighSpeedFan = document.getElementById('coolanttemp-timeAboveHighSpeedFan');
    this.elements.highTempEvents = document.getElementById('coolanttemp-highTempEvents');
    this.elements.coolantTempTableBody = document.getElementById('coolanttemp-coolantTempTableBody');
    this.elements.searchInput = document.getElementById('coolanttemp-searchInput');
    this.elements.severityFilter = document.getElementById('coolanttemp-severityFilter');

    // Set up event listeners
    if (this.elements.searchInput) {
      this.elements.searchInput.addEventListener('input', () => this.updateTable());
    }
    if (this.elements.severityFilter) {
      this.elements.severityFilter.addEventListener('change', () => this.updateTable());
    }

    // Set up table sorting
    document.querySelectorAll('#coolanttemp-coolantTempTable th[data-sort]').forEach(th => {
      th.addEventListener('click', () => this.handleSort(th.dataset.sort));
    });
  },

  render(analysisData) {
    if (!analysisData) {
      console.warn('Coolant temperature tab: No analysis data available');
      this.showColumnInfo();
      this.updateStatistics();
      this.updateTable();
      return;
    }
    
    if (analysisData.error) {
      console.warn('Coolant temperature analysis error:', analysisData.error);
      this.showColumnInfo();
    }
    
    const chartsExist = this.charts.coolantTemp;
    
    this.updateStatistics();
    
    if (!chartsExist) {
      this.renderCharts();
    }
    
    this.updateTable();
  },

  showColumnInfo() {
    let dataProcessor = null;
    const analyzer = tabManager ? tabManager.getTabAnalyzer('coolanttemp') : null;
    
    if (analyzer && analyzer.dataProcessor) {
      dataProcessor = analyzer.dataProcessor;
    } else if (typeof window !== 'undefined' && window.dataProcessor) {
      dataProcessor = window.dataProcessor;
    }
    
    if (!dataProcessor) {
      const statsPanel = document.querySelector('.tab-content[data-tab="coolanttemp"] .statistics-panel');
      if (statsPanel) {
        let infoDiv = document.getElementById('coolanttemp-column-info');
        if (!infoDiv) {
          infoDiv = document.createElement('div');
          infoDiv.id = 'coolanttemp-column-info';
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
    
    const coolantColumns = columns.filter(col => {
      const colLower = col.toLowerCase();
      return colLower.includes('coolant') && (colLower.includes('temp') || colLower.includes('temperature'));
    });
    
    const statsPanel = document.querySelector('.tab-content[data-tab="coolanttemp"] .statistics-panel');
    if (statsPanel) {
      let infoDiv = document.getElementById('coolanttemp-column-info');
      if (!infoDiv) {
        infoDiv = document.createElement('div');
        infoDiv.id = 'coolanttemp-column-info';
        infoDiv.style.cssText = 'background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 15px; margin: 20px 0; color: #856404;';
        statsPanel.insertBefore(infoDiv, statsPanel.firstChild);
      }
      
      infoDiv.innerHTML = `
        <h3 style="margin-top: 0; color: #856404;">⚠️ Coolant Temperature Column Not Found</h3>
        <p><strong>Looking for:</strong> "Coolant Temperature (°C)" or similar</p>
        ${coolantColumns.length > 0 ? `<p><strong>Potential coolant temperature columns:</strong> ${coolantColumns.join(', ')}</p>` : ''}
        <p><strong>Available columns:</strong> Check browser console (F12) for full list</p>
      `;
    }
  },

  updateStatistics() {
    const analyzer = tabManager.getTabAnalyzer('coolanttemp');
    if (!analyzer) {
      console.warn('Coolant temperature analyzer not found');
      return;
    }

    const stats = analyzer.getStatistics();
    if (!stats) {
      console.warn('Coolant temperature statistics not available');
      return;
    }
    
    if (this.elements.minTemp) {
      this.elements.minTemp.textContent = stats.minTemp.toFixed(1) + ' °C';
    }
    if (this.elements.maxTemp) {
      this.elements.maxTemp.textContent = stats.maxTemp.toFixed(1) + ' °C';
    }
    if (this.elements.avgTemp) {
      this.elements.avgTemp.textContent = stats.avgTemp.toFixed(1) + ' °C';
    }
    if (this.elements.timeAboveHighSpeedFan) {
      this.elements.timeAboveHighSpeedFan.textContent = stats.timeAboveHighSpeedFan.toFixed(2) + '%';
    }
    if (this.elements.highTempEvents) {
      this.elements.highTempEvents.textContent = stats.highTempEvents;
    }
  },

  renderCharts(preserveZoom = false) {
    const data = dataProcessor.getData();
    const analyzer = tabManager.getTabAnalyzer('coolanttemp');
    if (!analyzer) return;

    const events = analyzer.getEvents();
    const stats = analyzer.getStatistics();
    
    if (!data || data.length === 0) return;

    // Prepare data
    const times = data.map(row => row['Time (s)']);
    
    // Get RPM data for tooltips
    const rpms = data.map(row => parseFloat(row['Engine Speed (rpm)']) || 0);
    
    let coolantTemps = data.map(row => {
      const col = analyzer.getColumns()?.coolantTemp || 'Coolant Temperature (°C)';
      return parseFloat(row[col] || 0);
    });

    // Create high temperature event point arrays
    const createTempPointArray = (eventList) => {
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
        pointArray[closestIdx] = event.coolantTemp;
      });
      return pointArray;
    };

    const criticalEvents = events.filter(e => e.severity === 'critical');

    const criticalTempPoints = createTempPointArray(criticalEvents);

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

    coolantTemps = breakAtGaps(coolantTemps, times);

    // Apply smoothing if enabled
    if (window.applyDataSmoothing && window.smoothingConfig) {
      coolantTemps = window.applyDataSmoothing(coolantTemps, window.smoothingConfig.windowSize, window.smoothingConfig.enabled);
    }

    // Get zoom state if preserving
    let savedZoom = null;
    if (preserveZoom && this.charts.coolantTemp) {
      const chart = this.charts.coolantTemp;
      const xScale = chart.scales.x;
      if (xScale && xScale.min !== undefined && xScale.max !== undefined) {
        savedZoom = { min: xScale.min, max: xScale.max };
      }
    }

    // Destroy existing chart if it exists
    if (this.charts.coolantTemp) {
      this.charts.coolantTemp.destroy();
      this.charts.coolantTemp = null;
    }

    const ctx = document.getElementById('coolanttemp-coolantTempChart');
    if (!ctx) return;

    // Store original time range
    if (!this.chartOriginalRanges.coolantTemp) {
      this.chartOriginalRanges.coolantTemp = {
        min: Math.min(...times),
        max: Math.max(...times)
      };
    }

    // Get fan threshold for reference line
    const fanHighSpeedOn = stats ? stats.fanHighSpeedOn : 105.0;

    this.charts.coolantTemp = new Chart(ctx, {
      type: 'line',
      data: {
        labels: times,
        datasets: [
          {
            label: 'Coolant Temperature (°C)',
            data: coolantTemps,
            borderColor: 'rgb(0, 123, 255)',
            backgroundColor: 'rgba(0, 123, 255, 0.1)',
            borderWidth: 2,
            pointRadius: 0,
            spanGaps: false
          },
          {
            label: 'High Speed Fan On',
            data: new Array(times.length).fill(fanHighSpeedOn),
            borderColor: 'rgb(220, 53, 69)',
            backgroundColor: 'rgba(220, 53, 69, 0.1)',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0,
            spanGaps: false
          },
          {
            label: 'Critical High Temp',
            data: criticalTempPoints,
            borderColor: 'rgb(220, 53, 69)',
            backgroundColor: 'rgba(220, 53, 69, 0.5)',
            pointRadius: 6,
            pointHoverRadius: 8,
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
                synchronizeChartZoom('coolanttemp', ctx.chart);
              }
            },
            pan: {
              enabled: true,
              modifierKey: 'shift',
              mode: 'x',
              onPanComplete: (ctx) => {
                synchronizeChartZoom('coolanttemp', ctx.chart);
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
    const analyzer = tabManager.getTabAnalyzer('coolanttemp');
    if (!analyzer) return;

    const events = analyzer.getEvents();
    if (!events || events.length === 0) {
      if (this.elements.coolantTempTableBody) {
        this.elements.coolantTempTableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;">No coolant temperature events detected</td></tr>';
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
          e.coolantTemp.toFixed(1).includes(searchTerm) ||
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
    if (this.elements.coolantTempTableBody) {
      this.elements.coolantTempTableBody.innerHTML = filteredEvents.map((event, idx) => {
        const duration = event.duration ? ` (${event.duration.toFixed(3)}s)` : '';
        const severityBadge = this.getSeverityBadge(event.severity);
        const fanStatus = event.aboveHighSpeedFan ? 'High Speed Fan' : '';
        const fanBadge = fanStatus ? `<span class="severity-badge severity-severe">${fanStatus}</span>` : '';
        
        return `
          <tr data-event-time="${event.time}" data-event-duration="${event.duration || 0}" 
              style="cursor: pointer;" title="Click to zoom to this event">
            <td>${event.time.toFixed(2)}${duration}</td>
            <td>${event.coolantTemp.toFixed(1)}</td>
            <td>${event.maxTemp.toFixed(1)}</td>
            <td>${event.rpm || 0}</td>
            <td>${(event.throttle || 0).toFixed(1)}%</td>
            <td>${(event.load || 0).toFixed(2)}</td>
            <td>${severityBadge}</td>
            <td>${fanBadge}</td>
          </tr>
        `;
      }).join('');

      // Add click handlers for zoom
      this.elements.coolantTempTableBody.querySelectorAll('tr[data-event-time]').forEach(row => {
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

