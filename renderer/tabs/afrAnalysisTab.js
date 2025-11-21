// Air/Fuel Ratio Analysis Tab Module
const AFRAnalysisTab = {
  elements: {
    avgError: null,
    maxLean: null,
    inTargetPercent: null,
    leanRichEvents: null,
    afrTableBody: null,
    searchInput: null,
    eventTypeFilter: null,
    targetChart: null,
    errorChart: null
  },

  charts: {},
  chartOriginalRanges: {},
  currentSort: { column: null, direction: 'asc' },
  showAFR: false, // Toggle between lambda and AFR values
  AFR_CONVERSION_FACTOR: 14.7, // 1 lambda = 14.7 AFR
  smoothData: false, // Toggle for data smoothing
  smoothingWindow: 5, // Moving average window size for smoothing

  initialize() {
    // Get DOM elements for this tab
    this.elements.avgError = document.getElementById('afr-avgError');
    this.elements.maxLean = document.getElementById('afr-maxLean');
    this.elements.inTargetPercent = document.getElementById('afr-inTargetPercent');
    this.elements.leanRichEvents = document.getElementById('afr-leanRichEvents');
    this.elements.afrTableBody = document.getElementById('afr-afrTableBody');
    this.elements.searchInput = document.getElementById('afr-searchInput');
    this.elements.eventTypeFilter = document.getElementById('afr-eventTypeFilter');

    // Set up event listeners
    if (this.elements.searchInput) {
      this.elements.searchInput.addEventListener('input', () => this.updateTable());
    }
    if (this.elements.eventTypeFilter) {
      this.elements.eventTypeFilter.addEventListener('change', () => this.updateTable());
    }

    // Set up AFR toggle
    const afrToggle = document.getElementById('afr-showAFRToggle');
    if (afrToggle) {
      afrToggle.addEventListener('change', (e) => {
        this.showAFR = e.target.checked;
        this.updateStatistics(); // Update statistics with new units
        this.renderCharts(true); // Re-render charts with updated units, preserve zoom
        this.updateTable(); // Re-render table with updated units
      });
    }

    // Set up smoothing toggle
    const smoothToggle = document.getElementById('afr-smoothDataToggle');
    if (smoothToggle) {
      smoothToggle.addEventListener('change', (e) => {
        this.smoothData = e.target.checked;
        this.renderCharts(true); // Re-render charts with smoothing applied, preserve zoom
      });
    }

    // Set up table sorting
    document.querySelectorAll('#afr-afrTable th[data-sort]').forEach(th => {
      th.addEventListener('click', () => this.handleSort(th.dataset.sort));
    });
  },

  render(analysisData) {
    if (!analysisData) {
      console.warn('AFR analysis tab: No analysis data available');
      this.showColumnInfo();
      this.updateStatistics();
      this.updateTable();
      return;
    }
    
    // Check for error in analysis
    if (analysisData.error) {
      console.warn('AFR analysis error:', analysisData.error);
      this.showColumnInfo();
    }
    
    // Only render charts if they don't exist yet (charts persist across tab switches)
    const chartsExist = this.charts.target && this.charts.error;
    
    this.updateStatistics();
    
    if (!chartsExist) {
      this.renderCharts();
    }
    
    this.updateTable();
  },
  
  showColumnInfo() {
    // Get available columns from data processor
    let dataProcessor = null;
    const analyzer = tabManager ? tabManager.getTabAnalyzer('afr') : null;
    
    if (analyzer && analyzer.dataProcessor) {
      dataProcessor = analyzer.dataProcessor;
    } else if (typeof window !== 'undefined' && window.dataProcessor) {
      dataProcessor = window.dataProcessor;
    }
    
    if (!dataProcessor) {
      return;
    }
    
    let columns = dataProcessor.getColumns();
    const data = dataProcessor.getData ? dataProcessor.getData() : null;
    
    if (!Array.isArray(columns)) {
      return;
    }
    
    if (columns.length === 0 && data && data.length > 0 && data[0]) {
      columns = Object.keys(data[0]);
    }
    
    // Display this info in the UI as well
    const statsPanel = document.querySelector('.tab-content[data-tab="afr"] .statistics-panel');
    if (statsPanel) {
      let infoDiv = document.getElementById('afr-column-info');
      if (!infoDiv) {
        infoDiv = document.createElement('div');
        infoDiv.id = 'afr-column-info';
        infoDiv.style.cssText = 'background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 15px; margin: 20px 0; color: #856404;';
        statsPanel.insertBefore(infoDiv, statsPanel.firstChild);
      }
      
      infoDiv.innerHTML = `
        <h3 style="margin-top: 0; color: #856404;">⚠️ AFR Columns Not Found</h3>
        <p><strong>Total columns in file:</strong> ${columns.length}</p>
        <p><strong>Looking for:</strong></p>
        <ul style="margin: 10px 0;">
          <li>Target AFR (e.g., "Power Mode - Fuel Ratio Target (λ)")</li>
          <li>Measured AFR (e.g., "Air/Fuel Sensor #1 (λ)")</li>
        </ul>
        <p><strong>Available columns:</strong> Check browser console (F12) for full list</p>
        <details style="margin-top: 10px;">
          <summary style="cursor: pointer; font-weight: bold;">Show All Columns</summary>
          <div style="max-height: 200px; overflow-y: auto; margin-top: 10px; padding: 10px; background: white; border-radius: 4px;">
            <ul style="columns: 3; column-gap: 20px; list-style: none; padding: 0;">
              ${columns.map(col => `<li style="break-inside: avoid; margin: 5px 0;">${col}</li>`).join('')}
            </ul>
          </div>
        </details>
      `;
    }
  },

  updateStatistics() {
    const analyzer = tabManager.getTabAnalyzer('afr');
    if (!analyzer) {
      console.warn('AFR analyzer not found');
      return;
    }

    const stats = analyzer.getStatistics();
    if (!stats) {
      console.warn('AFR statistics not available');
      return;
    }
    
    // Apply conversion factor if AFR mode is enabled
    const conversionFactor = this.showAFR ? this.AFR_CONVERSION_FACTOR : 1.0;
    const unitLabel = this.showAFR ? 'AFR' : 'λ';
    const decimalPlaces = this.showAFR ? 1 : 3;
    
    if (this.elements.avgError) {
      const avgError = stats.avgErrorAbs * conversionFactor;
      this.elements.avgError.textContent = avgError.toFixed(decimalPlaces) + ' ' + unitLabel;
    }
    if (this.elements.maxLean) {
      // Show max deviation (absolute value of maxRich, or maxLean)
      const maxDeviation = Math.max(Math.abs(stats.maxRich), Math.abs(stats.maxLean)) * conversionFactor;
      this.elements.maxLean.textContent = maxDeviation.toFixed(decimalPlaces) + ' ' + unitLabel;
    }
    if (this.elements.inTargetPercent) {
      this.elements.inTargetPercent.textContent = stats.inTargetPercent.toFixed(2) + '%';
    }
    if (this.elements.leanRichEvents) {
      this.elements.leanRichEvents.textContent = stats.leanEvents + ' / ' + stats.richEvents;
    }
  },

  renderCharts(preserveZoom = false) {
    const analyzer = tabManager.getTabAnalyzer('afr');
    if (!analyzer) {
      console.warn('AFR analyzer not found for charts');
      return;
    }
    
    const dataProcessor = analyzer.dataProcessor;
    if (!dataProcessor) {
      console.warn('Data processor not available in analyzer');
      return;
    }
    
    // Save current zoom state if preserving zoom
    let savedZoomState = {};
    if (preserveZoom) {
      Object.keys(this.charts).forEach(key => {
        const chart = this.charts[key];
        if (chart && chart.scales && chart.scales.x) {
          // Get current zoom from the scale object (actual displayed values)
          const scale = chart.scales.x;
          savedZoomState[key] = {
            min: scale.min,
            max: scale.max
          };
        }
      });
    }
    
    const data = dataProcessor.getData();

    const analysisData = tabManager.getCachedAnalysis('afr');
    if (!analysisData) {
      console.warn('No cached AFR analysis data');
      return;
    }
    
    if (!data || data.length === 0) {
      console.warn('No data available for AFR charts');
      return;
    }
    
    if (analysisData.error) {
      console.warn('Cannot render charts due to analysis error:', analysisData.error);
      return;
    }

    const columns = analysisData.columns;
    
    const times = data.map(row => row['Time (s)']);
    
    // Helper function to break lines at gaps > 1 second
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
    
    // Helper function to apply moving average smoothing to data array
    const applySmoothing = (dataArray, windowSize, enabled) => {
      if (!enabled || windowSize <= 1) {
        return dataArray;
      }
      
      const smoothed = new Array(dataArray.length);
      const halfWindow = Math.floor(windowSize / 2);
      
      for (let i = 0; i < dataArray.length; i++) {
        const value = dataArray[i];
        
        // Preserve NaN values (gaps) without smoothing
        if (isNaN(value)) {
          smoothed[i] = NaN;
          continue;
        }
        
        // Calculate moving average
        let sum = 0;
        let count = 0;
        const start = Math.max(0, i - halfWindow);
        const end = Math.min(dataArray.length - 1, i + halfWindow);
        
        for (let j = start; j <= end; j++) {
          const val = dataArray[j];
          // Only include valid numbers (not NaN) in the average
          if (!isNaN(val) && typeof val === 'number') {
            sum += val;
            count++;
          }
        }
        
        // Use original value if no valid neighbors found
        smoothed[i] = count > 0 ? sum / count : value;
      }
      
      return smoothed;
    };
    
    // Get AFR data
    const targetAFRsRaw = data.map(row => parseFloat(row[columns.targetAFR]) || 0);
    const measuredAFRsRaw = data.map(row => parseFloat(row[columns.measuredAFR]) || 0);
    const afrErrorsRaw = data.map((row, idx) => {
      const target = targetAFRsRaw[idx];
      const measured = measuredAFRsRaw[idx];
      return measured - target;
    });
    
    // Get throttle position data
    const throttlePositionsRaw = data.map(row => parseFloat(row['Throttle Position (%)']) || 0);
    
    // Convert lambda to AFR if toggle is enabled (AFR = lambda × 14.7)
    const conversionFactor = this.showAFR ? this.AFR_CONVERSION_FACTOR : 1.0;
    const targetAFRsForChart = targetAFRsRaw.map(v => v * conversionFactor);
    const measuredAFRsForChart = measuredAFRsRaw.map(v => v * conversionFactor);
    const afrErrorsForChart = afrErrorsRaw.map(v => v * conversionFactor);
    
    // Break lines at gaps > 1 second
    let targetAFRs = breakAtGaps(targetAFRsForChart, times);
    let measuredAFRs = breakAtGaps(measuredAFRsForChart, times);
    let afrErrors = breakAtGaps(afrErrorsForChart, times);
    const throttlePositions = breakAtGaps(throttlePositionsRaw, times);
    
    // Apply smoothing if enabled
    targetAFRs = applySmoothing(targetAFRs, this.smoothingWindow, this.smoothData);
    measuredAFRs = applySmoothing(measuredAFRs, this.smoothingWindow, this.smoothData);
    afrErrors = applySmoothing(afrErrors, this.smoothingWindow, this.smoothData);

    // Create event point arrays
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
    const leanEvents = events.filter(e => e.eventType === 'lean');
    const richEvents = events.filter(e => e.eventType === 'rich');

    // Convert event points for charts (apply AFR conversion if enabled)
    const leanPoints = createEventPointArray(leanEvents, e => e.measuredAFR * conversionFactor);
    const richPoints = createEventPointArray(richEvents, e => e.measuredAFR * conversionFactor);

    // Chart configuration
    const chartOptions = {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: true,
          position: 'top'
        },
        tooltip: {
          mode: 'index',
          intersect: false
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

    // Target AFR vs Measured AFR Chart
    if (this.charts.target) this.charts.target.destroy();
    const targetChartEl = document.getElementById('afr-targetChart');
    if (targetChartEl) {
      // Set unit label based on toggle state
      const unitLabel = this.showAFR ? 'AFR' : 'λ';
      
      const datasets = [
        {
          label: `Target AFR (${unitLabel})`,
          data: targetAFRs,
          borderColor: 'rgb(0, 123, 255)',
          backgroundColor: 'rgba(0, 123, 255, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          spanGaps: false
        },
        {
          label: `Measured AFR (${unitLabel})`,
          data: measuredAFRs,
          borderColor: 'rgb(40, 167, 69)',
          backgroundColor: 'rgba(40, 167, 69, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          spanGaps: false
        }
      ];
      
      if (leanEvents.length > 0) {
        datasets.push({
          label: 'Lean Events',
          data: leanPoints,
          borderColor: 'rgb(255, 193, 7)',
          backgroundColor: 'rgba(255, 193, 7, 0.6)',
          borderWidth: 0,
          pointRadius: 6,
          pointHoverRadius: 8,
          showLine: false,
          spanGaps: false
        });
      }

      if (richEvents.length > 0) {
        datasets.push({
          label: 'Rich Events',
          data: richPoints,
          borderColor: 'rgb(220, 53, 69)',
          backgroundColor: 'rgba(220, 53, 69, 0.6)',
          borderWidth: 0,
          pointRadius: 6,
          pointHoverRadius: 8,
          showLine: false,
          spanGaps: false
        });
      }

      // Add throttle position
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

      const targetChartOptions = {
        ...chartOptions,
        scales: {
          ...chartOptions.scales,
          y: {
            type: 'linear',
            position: 'left',
            title: {
              display: true,
              text: `Air/Fuel Ratio (${unitLabel})`
            }
          },
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
        }
      };
      
      this.charts.target = new Chart(targetChartEl, {
        type: 'line',
        data: {
          labels: times,
          datasets: datasets
        },
        options: targetChartOptions
      });

      if (times.length > 0) {
        this.chartOriginalRanges.target = {
          min: parseFloat(times[0]),
          max: parseFloat(times[times.length - 1])
        };
      }
      
      // Restore zoom state if preserving zoom
      if (preserveZoom && savedZoomState.target) {
        const savedZoom = savedZoomState.target;
        // Use a small delay to ensure chart is fully initialized
        setTimeout(() => {
          if (this.charts.target && this.charts.target.scales && this.charts.target.scales.x) {
            this.charts.target.options.scales.x.min = savedZoom.min;
            this.charts.target.options.scales.x.max = savedZoom.max;
            // Also update the scale object directly
            if (this.charts.target.scales.x.options) {
              this.charts.target.scales.x.options.min = savedZoom.min;
              this.charts.target.scales.x.options.max = savedZoom.max;
            }
            this.charts.target.update('none');
          }
        }, 50);
      }
    }

    // AFR Error Chart
    if (this.charts.error) this.charts.error.destroy();
    const errorChartEl = document.getElementById('afr-errorChart');
    if (errorChartEl) {
      // Set unit label for error chart
      const errorUnitLabel = this.showAFR ? 'AFR' : 'λ';
      
      const errorDatasets = [
        {
          label: `AFR Error (${errorUnitLabel})`,
          data: afrErrors,
          borderColor: 'rgb(220, 53, 69)',
          backgroundColor: 'rgba(220, 53, 69, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          spanGaps: false
        },
        {
          label: 'Zero Reference',
          data: new Array(times.length).fill(0),
          borderColor: 'rgb(153, 153, 153)',
          backgroundColor: 'rgba(153, 153, 153, 0.1)',
          borderWidth: 1,
          borderDash: [5, 5],
          pointRadius: 0,
          spanGaps: false
        }
      ];
      
      if (leanEvents.length > 0) {
        const leanErrorPoints = createEventPointArray(leanEvents, e => e.afrError * conversionFactor);
        errorDatasets.push({
          label: 'Lean Events',
          data: leanErrorPoints,
          borderColor: 'rgb(255, 193, 7)',
          backgroundColor: 'rgba(255, 193, 7, 0.6)',
          borderWidth: 0,
          pointRadius: 5,
          pointHoverRadius: 7,
          showLine: false,
          spanGaps: false
        });
      }

      if (richEvents.length > 0) {
        const richErrorPoints = createEventPointArray(richEvents, e => e.afrError * conversionFactor);
        errorDatasets.push({
          label: 'Rich Events',
          data: richErrorPoints,
          borderColor: 'rgb(220, 53, 69)',
          backgroundColor: 'rgba(220, 53, 69, 0.6)',
          borderWidth: 0,
          pointRadius: 5,
          pointHoverRadius: 7,
          showLine: false,
          spanGaps: false
        });
      }

      // Add throttle position
      errorDatasets.push({
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
      
      this.charts.error = new Chart(errorChartEl, {
        type: 'line',
        data: {
          labels: times,
          datasets: errorDatasets
        },
        options: {
          ...chartOptions,
          scales: {
            ...chartOptions.scales,
            y: {
              type: 'linear',
              position: 'left',
              title: {
                display: true,
                text: `Error (${errorUnitLabel})`
              }
            },
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
          }
        }
      });

      if (times.length > 0) {
        this.chartOriginalRanges.error = {
          min: parseFloat(times[0]),
          max: parseFloat(times[times.length - 1])
        };
      }
      
      // Restore zoom state if preserving zoom
      if (preserveZoom && savedZoomState.error) {
        const savedZoom = savedZoomState.error;
        // Use a small delay to ensure chart is fully initialized
        setTimeout(() => {
          if (this.charts.error && this.charts.error.scales && this.charts.error.scales.x) {
            this.charts.error.options.scales.x.min = savedZoom.min;
            this.charts.error.options.scales.x.max = savedZoom.max;
            // Also update the scale object directly
            if (this.charts.error.scales.x.options) {
              this.charts.error.scales.x.options.min = savedZoom.min;
              this.charts.error.scales.x.options.max = savedZoom.max;
            }
            this.charts.error.update('none');
          }
        }, 50);
      }
    }
  },

  updateTable() {
    const analyzer = tabManager.getTabAnalyzer('afr');
    if (!analyzer || !this.elements.afrTableBody) return;
    
    const analysisData = tabManager.getCachedAnalysis('afr');
    if (!analysisData) return;

    const searchTerm = this.elements.searchInput ? this.elements.searchInput.value : '';
    const eventTypeFilter = this.elements.eventTypeFilter ? this.elements.eventTypeFilter.value : 'all';
    
    let filteredEvents = analysisData.events;
    
    // Apply event type filter
    if (eventTypeFilter !== 'all') {
      filteredEvents = filteredEvents.filter(e => e.eventType === eventTypeFilter);
    }
    
    // Apply search filter
    if (searchTerm && searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      filteredEvents = filteredEvents.filter(e => {
        return (
          e.time.toString().includes(term) ||
          e.targetAFR.toString().includes(term) ||
          e.measuredAFR.toString().includes(term) ||
          e.afrError.toString().includes(term) ||
          e.eventType.toLowerCase().includes(term)
        );
      });
    }
    
    // Sort events
    const sortedEvents = [...filteredEvents].sort((a, b) => {
      let aVal, bVal;
      switch (this.currentSort.column) {
        case 'time':
          aVal = a.time;
          bVal = b.time;
          break;
        case 'targetAFR':
          aVal = a.targetAFR;
          bVal = b.targetAFR;
          break;
        case 'measuredAFR':
          aVal = a.measuredAFR;
          bVal = b.measuredAFR;
          break;
        case 'afrError':
          aVal = Math.abs(a.afrError);
          bVal = Math.abs(b.afrError);
          break;
        case 'afrErrorPercent':
          aVal = Math.abs(a.afrErrorPercent);
          bVal = Math.abs(b.afrErrorPercent);
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
    
    // Update table headers based on toggle state
    const unitSymbol = this.showAFR ? 'AFR' : 'λ';
    
    // Column map for header updates
    const columnMap = {
      'time': 'time',
      'targetAFR': 'targetAFR',
      'measuredAFR': 'measuredAFR',
      'afrError': 'afrError',
      'afrErrorPercent': 'afrErrorPercent',
      'eventType': 'eventType'
    };
    
    // Get current sort state
    const currentSortColumn = this.currentSort.column;
    const sortIndicator = currentSortColumn && this.currentSort.direction === 'asc' ? ' ↑' : 
                         currentSortColumn ? ' ↓' : '';
    
    // Update header labels
    document.querySelectorAll('#afr-afrTable th[data-sort="targetAFR"]').forEach(th => {
      const baseText = th.textContent.replace(' ↑', '').replace(' ↓', '').replace(/\(.*\)/, '').trim();
      const indicator = currentSortColumn === columnMap['targetAFR'] ? sortIndicator : '';
      th.textContent = `${baseText} (${unitSymbol}) ↕${indicator}`;
    });
    document.querySelectorAll('#afr-afrTable th[data-sort="measuredAFR"]').forEach(th => {
      const baseText = th.textContent.replace(' ↑', '').replace(' ↓', '').replace(/\(.*\)/, '').trim();
      const indicator = currentSortColumn === columnMap['measuredAFR'] ? sortIndicator : '';
      th.textContent = `${baseText} (${unitSymbol}) ↕${indicator}`;
    });
    document.querySelectorAll('#afr-afrTable th[data-sort="afrError"]').forEach(th => {
      const baseText = th.textContent.replace(' ↑', '').replace(' ↓', '').replace(/\(.*\)/, '').trim();
      const indicator = currentSortColumn === columnMap['afrError'] ? sortIndicator : '';
      th.textContent = `${baseText} (${unitSymbol}) ↕${indicator}`;
    });
    
    // Apply conversion factor if AFR mode is enabled
    const conversionFactor = this.showAFR ? this.AFR_CONVERSION_FACTOR : 1.0;
    
    // Clear table
    this.elements.afrTableBody.innerHTML = '';
    
    // Populate table
    sortedEvents.forEach(event => {
      const row = document.createElement('tr');
      const eventTypeClass = event.eventType === 'lean' ? 'severity-mild' : 
                            event.eventType === 'rich' ? 'severity-severe' : '';
      
      // Display time with duration for grouped events
      const timeDisplay = event.duration && event.duration > 0 
        ? `${event.time.toFixed(2)} (${event.duration.toFixed(3)}s)`
        : event.time.toFixed(2);
      
      // Convert values if AFR mode is enabled
      const targetDisplay = event.targetAFR * conversionFactor;
      const measuredDisplay = event.measuredAFR * conversionFactor;
      
      // Use maxAFRError if available (for grouped events), otherwise use afrError
      const errorDisplay = (event.maxAFRError !== undefined ? event.maxAFRError : event.afrError) * conversionFactor;
      const errorPercentDisplay = event.maxAFRError !== undefined && event.targetAFR > 0
        ? ((event.maxAFRError / event.targetAFR) * 100).toFixed(2)
        : event.afrErrorPercent.toFixed(2);
      
      // Adjust decimal places based on unit (AFR needs fewer decimals, lambda needs more)
      const decimalPlaces = this.showAFR ? 1 : 3;
      
      row.innerHTML = `
        <td>${timeDisplay}</td>
        <td>${targetDisplay.toFixed(decimalPlaces)}</td>
        <td>${measuredDisplay.toFixed(decimalPlaces)}</td>
        <td>${errorDisplay.toFixed(decimalPlaces)}</td>
        <td>${errorPercentDisplay}%</td>
        <td><span class="severity-badge ${eventTypeClass}">${event.eventType}</span></td>
      `;
      this.elements.afrTableBody.appendChild(row);
    });
  },

  handleSort(column) {
    const columnMap = {
      'time': 'time',
      'targetAFR': 'targetAFR',
      'measuredAFR': 'measuredAFR',
      'afrError': 'afrError',
      'afrErrorPercent': 'afrErrorPercent',
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
    
    document.querySelectorAll('#afr-afrTable th').forEach(th => {
      th.textContent = th.textContent.replace(' ↑', '').replace(' ↓', '');
      if (th.dataset.sort === column) {
        th.textContent += this.currentSort.direction === 'asc' ? ' ↑' : ' ↓';
      }
    });
    
    this.updateTable();
  }
};

