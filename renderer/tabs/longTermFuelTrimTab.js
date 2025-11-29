// Long Term Fuel Trim Analysis Tab Module
const LongTermFuelTrimTab = {
  elements: {
    avgTrim: null,
    maxDeviation: null,
    inTargetPercent: null,
    abnormalEvents: null,
    fuelTrimTableBody: null,
    searchInput: null,
    eventTypeFilter: null,
    fuelTrimChart: null
  },

  charts: {},
  chartOriginalRanges: {},
  currentSort: { column: null, direction: 'asc' },
  showThrottle: true,
  selectedRow: null, // Track currently selected row

  initialize() {
    // Get DOM elements for this tab
    this.elements.avgTrim = document.getElementById('longtermfueltrim-avgTrim');
    this.elements.maxDeviation = document.getElementById('longtermfueltrim-maxDeviation');
    this.elements.inTargetPercent = document.getElementById('longtermfueltrim-inTargetPercent');
    this.elements.abnormalEvents = document.getElementById('longtermfueltrim-abnormalEvents');
    this.elements.fuelTrimTableBody = document.getElementById('longtermfueltrim-fuelTrimTableBody');
    this.elements.searchInput = document.getElementById('longtermfueltrim-searchInput');
    this.elements.eventTypeFilter = document.getElementById('longtermfueltrim-eventTypeFilter');

    // Set up event listeners
    if (this.elements.searchInput) {
      this.elements.searchInput.addEventListener('input', () => this.updateTable());
    }
    if (this.elements.eventTypeFilter) {
      this.elements.eventTypeFilter.addEventListener('change', () => this.updateTable());
    }

    // Set up table sorting
    document.querySelectorAll('#longtermfueltrim-fuelTrimTable th[data-sort]').forEach(th => {
      th.addEventListener('click', () => this.handleSort(th.dataset.sort));
    });
    
    // Set up throttle toggle
    const throttleToggle = document.getElementById('longtermfueltrim-showThrottleToggle');
    if (throttleToggle) {
      throttleToggle.addEventListener('change', async (e) => {
        this.showThrottle = e.target.checked;
        
        // Show loading overlay immediately
        const tabContent = document.querySelector('.tab-content[data-tab="longtermfueltrim"]');
        if (tabContent) {
          tabContent.classList.add('loading');
          const overlay = tabContent.querySelector('.tab-loading-overlay');
          if (overlay) {
            overlay.style.display = 'flex';
          }
        }
        
        // Use multiple animation frames to ensure overlay is visible before operations
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => setTimeout(resolve, 50));
        
        const startTime = Date.now();
        const minDisplayTime = 300; // Minimum time to show overlay (ms)
        
        try {
          // Re-render charts with updated throttle visibility
          this.renderCharts();
          
          // Ensure minimum display time
          const elapsed = Date.now() - startTime;
          const remainingTime = Math.max(0, minDisplayTime - elapsed);
          await new Promise(resolve => setTimeout(resolve, remainingTime));
        } finally {
          // Hide loading overlay
          if (tabContent) {
            tabContent.classList.remove('loading');
            const overlay = tabContent.querySelector('.tab-loading-overlay');
            if (overlay) {
              overlay.style.display = 'none';
            }
          }
        }
      });
    }
  },

  render(analysisData) {
    if (!analysisData) {
      console.warn('Long term fuel trim tab: No analysis data available');
      this.showColumnInfo();
      this.updateStatistics();
      this.updateTable();
      return;
    }
    
    if (analysisData.error) {
      console.warn('Long term fuel trim analysis error:', analysisData.error);
      this.showColumnInfo();
    }
    
    const chartsExist = this.charts.fuelTrim;
    
    this.updateStatistics();
    
    if (!chartsExist) {
      this.renderCharts();
    }
    
    this.updateTable();
  },
  
  showColumnInfo() {
    let dataProcessor = null;
    const analyzer = tabManager ? tabManager.getTabAnalyzer('longtermfueltrim') : null;
    
    if (analyzer && analyzer.dataProcessor) {
      dataProcessor = analyzer.dataProcessor;
    } else if (typeof window !== 'undefined' && window.dataProcessor) {
      dataProcessor = window.dataProcessor;
    }
    
    if (!dataProcessor) {
      const statsPanel = document.querySelector('.tab-content[data-tab="longtermfueltrim"] .statistics-panel');
      if (statsPanel) {
        let infoDiv = document.getElementById('longtermfueltrim-column-info');
        if (!infoDiv) {
          infoDiv = document.createElement('div');
          infoDiv.id = 'longtermfueltrim-column-info';
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
    
    const trimColumns = columns.filter(col => {
      const colLower = col.toLowerCase();
      return colLower.includes('trim') || colLower.includes('fuel');
    });
    
    const statsPanel = document.querySelector('.tab-content[data-tab="longtermfueltrim"] .statistics-panel');
    if (statsPanel) {
      let infoDiv = document.getElementById('longtermfueltrim-column-info');
      if (!infoDiv) {
        infoDiv = document.createElement('div');
        infoDiv.id = 'longtermfueltrim-column-info';
        infoDiv.style.cssText = 'background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 15px; margin: 20px 0; color: #856404;';
        statsPanel.insertBefore(infoDiv, statsPanel.firstChild);
      }
      
      infoDiv.innerHTML = `
        <h3 style="margin-top: 0; color: #856404;">⚠️ Long Term Fuel Trim Column Not Found</h3>
        <p><strong>Looking for:</strong> "Fuel Trim - Long Term (%)" or similar</p>
        ${trimColumns.length > 0 ? `<p><strong>Potential fuel trim columns:</strong> ${trimColumns.join(', ')}</p>` : ''}
        <p><strong>Available columns:</strong> Check browser console (F12) for full list</p>
      `;
    }
  },

  updateStatistics() {
    const analyzer = tabManager.getTabAnalyzer('longtermfueltrim');
    if (!analyzer) {
      console.warn('Long term fuel trim analyzer not found');
      return;
    }

    const stats = analyzer.getStatistics();
    if (!stats) {
      console.warn('Long term fuel trim statistics not available');
      return;
    }
    
    if (this.elements.avgTrim) {
      this.elements.avgTrim.textContent = stats.avgTrim.toFixed(2) + '%';
    }
    if (this.elements.maxDeviation) {
      const maxDeviation = Math.max(Math.abs(stats.maxPositive), Math.abs(stats.maxNegative));
      this.elements.maxDeviation.textContent = maxDeviation.toFixed(2) + '%';
    }
    if (this.elements.inTargetPercent) {
      this.elements.inTargetPercent.textContent = stats.inTargetPercent.toFixed(2) + '%';
    }
    if (this.elements.abnormalEvents) {
      this.elements.abnormalEvents.textContent = stats.abnormalEvents;
    }
  },

  renderCharts(preserveZoom = false) {
    const analyzer = tabManager.getTabAnalyzer('longtermfueltrim');
    if (!analyzer) {
      console.warn('Long term fuel trim analyzer not found for charts');
      return;
    }
    
    const dataProcessor = analyzer.dataProcessor;
    if (!dataProcessor) {
      console.warn('Data processor not available in analyzer');
      return;
    }
    
    let savedZoomState = {};
    if (preserveZoom) {
      Object.keys(this.charts).forEach(key => {
        const chart = this.charts[key];
        if (chart && chart.scales && chart.scales.x) {
          const scale = chart.scales.x;
          savedZoomState[key] = {
            min: scale.min,
            max: scale.max
          };
        }
      });
    }
    
    const data = dataProcessor.getData();
    const analysisData = tabManager.getCachedAnalysis('longtermfueltrim');
    if (!analysisData) {
      console.warn('No cached long term fuel trim analysis data');
      return;
    }
    
    if (!data || data.length === 0) {
      console.warn('No data available for long term fuel trim charts');
      return;
    }
    
    if (analysisData.error) {
      console.warn('Cannot render charts due to analysis error:', analysisData.error);
      return;
    }

    const columns = analysisData.columns;
    const times = data.map(row => row['Time (s)']);
    
    // Get RPM data for tooltips
    const rpms = data.map(row => parseFloat(row['Engine Speed (rpm)']) || 0);
    
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
    
    const longTermTrimsRaw = data.map(row => parseFloat(row[columns.longTermTrim]) || 0);
    let longTermTrims = breakAtGaps(longTermTrimsRaw, times);

    // Get throttle position data
    const throttlePositionsRaw = data.map(row => parseFloat(row['Throttle Position (%)']) || 0);
    let throttlePositions = breakAtGaps(throttlePositionsRaw, times);

    if (window.applyDataSmoothing && window.smoothingConfig) {
      longTermTrims = window.applyDataSmoothing(longTermTrims, window.smoothingConfig.windowSize, window.smoothingConfig.enabled);
      throttlePositions = window.applyDataSmoothing(throttlePositions, window.smoothingConfig.windowSize, window.smoothingConfig.enabled);
    }

    const createEventPointArray = (events, valueExtractor) => {
      const pointArray = new Array(times.length).fill(NaN);
      events.forEach(event => {
        let closestIdx = 0;
        let minDiff = Math.abs(times[0] - event.time);
        for (let i = 1; i < times.length; i++) {
          const diff = Math.abs(times[i] - event.time);
          if (diff < minDiff) {
            minDiff = diff;
            closestIdx = i;
          }
        }
        pointArray[closestIdx] = valueExtractor(event);
      });
      return pointArray;
    };

    const events = analysisData.events;
    const positiveEvents = events.filter(e => e.eventType === 'positive');
    const negativeEvents = events.filter(e => e.eventType === 'negative');

    const positivePoints = createEventPointArray(positiveEvents, e => e.longTermTrim);
    const negativePoints = createEventPointArray(negativeEvents, e => e.longTermTrim);

    const chartOptions = {
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
            drag: {
              enabled: true,
              modifierKey: null,
              backgroundColor: 'rgba(0, 0, 0, 0.1)',
              borderColor: 'rgba(0, 0, 0, 0.3)',
              borderWidth: 1
            },
            mode: 'x',
            onZoomComplete: (ctx) => {
              synchronizeChartZoom(ctx.chart);
            }
          },
          pan: {
            enabled: true,
            mode: 'x',
            modifierKey: 'shift',
            onPanComplete: (ctx) => {
              synchronizeChartZoom(ctx.chart);
            }
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Time (s)'
          },
          type: 'linear'
        }
      },
      interaction: {
        mode: 'index',
        intersect: false
      }
    };

    // Long Term Fuel Trim Over Time Chart
    if (this.charts.fuelTrim) this.charts.fuelTrim.destroy();
    const fuelTrimChartEl = document.getElementById('longtermfueltrim-fuelTrimChart');
    if (fuelTrimChartEl) {
      const datasets = [
        {
          label: 'Long Term Fuel Trim (%)',
          data: longTermTrims,
          borderColor: 'rgb(0, 123, 255)',
          backgroundColor: 'rgba(0, 123, 255, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          spanGaps: false,
          yAxisID: 'y'
        },
        {
          label: 'Normal Range (+5%)',
          data: new Array(times.length).fill(5),
          borderColor: 'rgb(153, 153, 153)',
          backgroundColor: 'rgba(153, 153, 153, 0.1)',
          borderWidth: 1,
          borderDash: [5, 5],
          pointRadius: 0,
          spanGaps: false,
          yAxisID: 'y'
        },
        {
          label: 'Normal Range (-5%)',
          data: new Array(times.length).fill(-5),
          borderColor: 'rgb(153, 153, 153)',
          backgroundColor: 'rgba(153, 153, 153, 0.1)',
          borderWidth: 1,
          borderDash: [5, 5],
          pointRadius: 0,
          spanGaps: false,
          yAxisID: 'y'
        },
        {
          label: 'Zero Reference',
          data: new Array(times.length).fill(0),
          borderColor: 'rgb(200, 200, 200)',
          backgroundColor: 'rgba(200, 200, 200, 0.1)',
          borderWidth: 1,
          borderDash: [2, 2],
          pointRadius: 0,
          spanGaps: false,
          yAxisID: 'y'
        }
      ];

      // Add throttle position if enabled
      if (this.showThrottle) {
        datasets.push({
          label: 'Throttle Position (%)',
          data: throttlePositions,
          borderColor: 'rgb(128, 128, 128)',
          backgroundColor: 'rgba(128, 128, 128, 0.1)',
          borderWidth: 1,
          pointRadius: 0,
          yAxisID: 'y1',
          borderDash: [5, 5],
          spanGaps: false
        });
      }

      if (positiveEvents.length > 0) {
        datasets.push({
          label: 'Positive Trim Events (>+5%)',
          data: positivePoints,
          borderColor: 'rgb(220, 53, 69)',
          backgroundColor: 'rgba(220, 53, 69, 0.6)',
          borderWidth: 0,
          pointRadius: 6,
          pointHoverRadius: 8,
          showLine: false,
          spanGaps: false,
          yAxisID: 'y'
        });
      }

      if (negativeEvents.length > 0) {
        datasets.push({
          label: 'Negative Trim Events (<-5%)',
          data: negativePoints,
          borderColor: 'rgb(255, 193, 7)',
          backgroundColor: 'rgba(255, 193, 7, 0.6)',
          borderWidth: 0,
          pointRadius: 6,
          pointHoverRadius: 8,
          showLine: false,
          spanGaps: false,
          yAxisID: 'y'
        });
      }
      
      // Chart options with dual Y-axis if throttle is shown
      const fuelTrimChartOptions = {
        ...chartOptions,
        scales: {
          ...chartOptions.scales,
          y: {
            type: 'linear',
            position: 'left',
            title: {
              display: true,
              text: 'Fuel Trim (%)'
            }
          },
          ...(this.showThrottle ? {
            y1: {
              type: 'linear',
              position: 'right',
              title: {
                display: true,
                text: 'Throttle Position (%)'
              },
              grid: {
                drawOnChartArea: false
              }
            }
          } : {})
        }
      };
      
      this.charts.fuelTrim = new Chart(fuelTrimChartEl, {
        type: 'line',
        data: {
          labels: times,
          datasets: datasets
        },
        options: fuelTrimChartOptions
      });

      if (times.length > 0) {
        this.chartOriginalRanges.fuelTrim = {
          min: parseFloat(times[0]),
          max: parseFloat(times[times.length - 1])
        };
      }

      if (preserveZoom && savedZoomState.fuelTrim) {
        setTimeout(() => {
          if (this.charts.fuelTrim && this.charts.fuelTrim.scales && this.charts.fuelTrim.scales.x) {
            this.charts.fuelTrim.zoomScale('x', {
              min: savedZoomState.fuelTrim.min,
              max: savedZoomState.fuelTrim.max
            });
          }
        }, 50);
      }
    }
  },

  updateTable() {
    const analyzer = tabManager.getTabAnalyzer('longtermfueltrim');
    if (!analyzer || !this.elements.fuelTrimTableBody) return;
    
    const analysisData = tabManager.getCachedAnalysis('longtermfueltrim');
    if (!analysisData) return;

    const searchTerm = this.elements.searchInput ? this.elements.searchInput.value : '';
    const eventTypeFilter = this.elements.eventTypeFilter ? this.elements.eventTypeFilter.value : 'all';
    
    let filteredEvents = analysisData.events;
    
    if (eventTypeFilter !== 'all') {
      filteredEvents = filteredEvents.filter(e => e.eventType === eventTypeFilter);
    }
    
    if (searchTerm && searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      filteredEvents = filteredEvents.filter(e => {
        return (
          e.time.toString().includes(term) ||
          e.longTermTrim.toString().includes(term) ||
          e.rpm.toString().includes(term) ||
          e.throttle.toString().includes(term) ||
          e.eventType.toLowerCase().includes(term)
        );
      });
    }
    
    const sortedEvents = [...filteredEvents].sort((a, b) => {
      let aVal, bVal;
      switch (this.currentSort.column) {
        case 'time':
          aVal = a.time;
          bVal = b.time;
          break;
        case 'longTermTrim':
          aVal = Math.abs(a.longTermTrim);
          bVal = Math.abs(b.longTermTrim);
          break;
        case 'rpm':
          aVal = a.rpm;
          bVal = b.rpm;
          break;
        case 'throttle':
          aVal = a.throttle;
          bVal = b.throttle;
          break;
        case 'eventType':
          aVal = a.eventType;
          bVal = b.eventType;
          break;
        default:
          return 0;
      }
      
      if (this.currentSort.direction === 'asc') {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });
    
    this.elements.fuelTrimTableBody.innerHTML = '';
    this.selectedRow = null;
    
    sortedEvents.forEach(event => {
      const row = document.createElement('tr');
      const eventTypeClass = event.eventType === 'positive' ? 'severity-severe' : 
                            event.eventType === 'negative' ? 'severity-mild' : '';
      
      row.dataset.eventTime = event.time;
      row.dataset.eventDuration = event.duration || 0;
      row.style.cursor = 'pointer';
      row.title = 'Click to zoom to this event';
      
      const timeDisplay = event.duration && event.duration > 0 
        ? `${event.time.toFixed(2)} (${event.duration.toFixed(3)}s)`
        : event.time.toFixed(2);
      
      const trimDisplay = event.maxLongTermTrim !== undefined ? event.maxLongTermTrim : event.longTermTrim;
      
      row.innerHTML = `
        <td>${timeDisplay}</td>
        <td>${trimDisplay.toFixed(2)}</td>
        <td>${event.rpm}</td>
        <td>${event.throttle.toFixed(1)}</td>
        <td>${event.load.toFixed(2)}</td>
        <td>${event.afr ? event.afr.toFixed(3) : 'N/A'}</td>
        <td><span class="severity-badge ${eventTypeClass}">${event.eventType}</span></td>
      `;
      
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
        const eventDuration = parseFloat(row.dataset.eventDuration);
        if (typeof zoomChartsToEvent === 'function') {
          zoomChartsToEvent(eventTime, eventDuration, 3);
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
      
      this.elements.fuelTrimTableBody.appendChild(row);
    });
  },

  handleSort(column) {
    const columnMap = {
      'time': 'time',
      'longTermTrim': 'longTermTrim',
      'rpm': 'rpm',
      'throttle': 'throttle',
      'eventType': 'eventType'
    };
    
    const mappedColumn = columnMap[column];
    if (!mappedColumn) return;
    
    if (this.currentSort.column === mappedColumn) {
      this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      this.currentSort.column = mappedColumn;
      this.currentSort.direction = 'asc';
    }
    
    // Update sort indicators - remove all existing arrows first using regex
    document.querySelectorAll('#longtermfueltrim-fuelTrimTable th').forEach(th => {
      // Remove all arrow indicators (may be multiple if bug occurred)
      th.textContent = th.textContent.replace(/ ↑+| ↓+/g, '');
      if (th.dataset.sort === column) {
        th.textContent += this.currentSort.direction === 'asc' ? ' ↑' : ' ↓';
      }
    });
    
    this.updateTable();
  }
};

