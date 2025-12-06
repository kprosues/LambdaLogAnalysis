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
  showAFR: true, // Always show AFR values (converted from lambda)
  AFR_CONVERSION_FACTOR: 14.7, // 1 lambda = 14.7 AFR
  selectedRow: null, // Track currently selected row

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

    // AFR conversion is always enabled (no toggle)

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
    const analyzer = tabManager ? tabManager.getTabAnalyzer('fueling') : null;
    
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
    const statsPanel = document.querySelector('.tab-content[data-tab="fueling"] .statistics-panel');
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
    const analyzer = tabManager.getTabAnalyzer('fueling');
    if (!analyzer) {
      console.warn('AFR analyzer not found');
      return;
    }

    const stats = analyzer.getStatistics();
    if (!stats) {
      console.warn('AFR statistics not available');
      return;
    }
    
    // Display average deviation percentage from target (open loop mode only)
    if (this.elements.avgError) {
      const avgDeviationPercent = stats.avgDeviationPercent || 0;
      this.elements.avgError.textContent = avgDeviationPercent.toFixed(2) + '%';
    }
    
    // Display max deviation percentage from target
    if (this.elements.maxLean) {
      const maxDeviationPercent = stats.maxDeviationPercent || 0;
      this.elements.maxLean.textContent = maxDeviationPercent.toFixed(2) + '%';
    }
    
    if (this.elements.inTargetPercent) {
      this.elements.inTargetPercent.textContent = stats.inTargetPercent.toFixed(2) + '%';
    }
    if (this.elements.leanRichEvents) {
      this.elements.leanRichEvents.textContent = stats.leanEvents + ' / ' + stats.richEvents;
    }
  },

  renderCharts(preserveZoom = false) {
    const analyzer = tabManager.getTabAnalyzer('fueling');
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

    const analysisData = tabManager.getCachedAnalysis('fueling');
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
    const OPEN_LOOP_THRESHOLD = 0.85; // Target lambda < 0.85 indicates open loop (PE mode)
    
    const times = data.map(row => row['Time (s)']);
    
    // Get RPM data for tooltips
    const rpms = data.map(row => parseFloat(row['Engine Speed (rpm)']) || 0);
    
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
    
    // Get AFR data - filter to only open loop mode (target lambda < 0.85)
    const targetAFRsRaw = data.map((row, idx) => {
      const target = parseFloat(row[columns.targetAFR]) || 0;
      // Only include data points where target lambda < 0.85 (open loop mode)
      return target < OPEN_LOOP_THRESHOLD ? target : NaN;
    });
    const measuredAFRsRaw = data.map((row, idx) => {
      const target = parseFloat(row[columns.targetAFR]) || 0;
      const measured = parseFloat(row[columns.measuredAFR]) || 0;
      // Only include data points where target lambda < 0.85 (open loop mode)
      return target < OPEN_LOOP_THRESHOLD ? measured : NaN;
    });
    const afrErrorsRaw = data.map((row, idx) => {
      const target = targetAFRsRaw[idx];
      const measured = measuredAFRsRaw[idx];
      // Only calculate error for open loop data points
      if (isNaN(target) || isNaN(measured)) {
        return NaN;
      }
      return measured - target;
    });
    
    // Get throttle position data (filtered for open loop mode)
    const throttlePositionsRaw = data.map((row, idx) => {
      const target = parseFloat(row[columns.targetAFR]) || 0;
      // Only include throttle data for open loop mode
      return target < OPEN_LOOP_THRESHOLD ? (parseFloat(row['Throttle Position (%)']) || 0) : NaN;
    });
    
    // Always convert lambda to AFR (AFR = lambda × 14.7)
    const conversionFactor = this.AFR_CONVERSION_FACTOR;
    const targetAFRsForChart = targetAFRsRaw.map(v => v * conversionFactor);
    const measuredAFRsForChart = measuredAFRsRaw.map(v => v * conversionFactor);
    
    // Calculate percent deviation from target for error chart: (error / target) * 100
    const afrErrorPercentRaw = data.map((row, idx) => {
      const target = targetAFRsRaw[idx];
      const error = afrErrorsRaw[idx];
      // Avoid divide by zero - return NaN if target is 0 or invalid
      if (!target || target === 0 || isNaN(target) || isNaN(error)) {
        return NaN;
      }
      return (error / target) * 100;
    });
    
    // Break lines at gaps > 1 second
    let targetAFRs = breakAtGaps(targetAFRsForChart, times);
    let measuredAFRs = breakAtGaps(measuredAFRsForChart, times);
    let afrErrors = breakAtGaps(afrErrorPercentRaw, times); // Now contains percent deviation
    const throttlePositions = breakAtGaps(throttlePositionsRaw, times);
    
    // Apply smoothing if enabled (using shared smoothing utility)
    if (window.applyDataSmoothing && window.smoothingConfig) {
      targetAFRs = window.applyDataSmoothing(targetAFRs, window.smoothingConfig.windowSize, window.smoothingConfig.enabled);
      measuredAFRs = window.applyDataSmoothing(measuredAFRs, window.smoothingConfig.windowSize, window.smoothingConfig.enabled);
      afrErrors = window.applyDataSmoothing(afrErrors, window.smoothingConfig.windowSize, window.smoothingConfig.enabled);
    }

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
            filter: (tooltipItem, data) => {
              // Remove lean events and rich events from tooltip
              const datasetIndex = tooltipItem.datasetIndex;
              const datasetLabel = data.datasets[datasetIndex]?.label || '';
              return datasetLabel !== 'Lean Events' && datasetLabel !== 'Rich Events';
            },
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

    // Target AFR vs Measured AFR Chart
    if (this.charts.target) this.charts.target.destroy();
    const targetChartEl = document.getElementById('afr-targetChart');
    if (targetChartEl) {
      // Always use AFR unit label
      const unitLabel = 'AFR';
      
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

    // AFR Error Chart - shows percent deviation from target
    if (this.charts.error) this.charts.error.destroy();
    const errorChartEl = document.getElementById('afr-errorChart');
    if (errorChartEl) {
      const errorDatasets = [
        {
          label: 'AFR Deviation from Target (%)',
          data: afrErrors, // Already contains percent deviation
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
        // Calculate percent deviation for lean events: (afrError / targetAFR) * 100
        const leanErrorPoints = createEventPointArray(leanEvents, e => {
          if (!e.targetAFR || e.targetAFR === 0 || isNaN(e.targetAFR) || isNaN(e.afrError)) {
            return NaN;
          }
          return (e.afrError / e.targetAFR) * 100;
        });
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
        // Calculate percent deviation for rich events: (afrError / targetAFR) * 100
        const richErrorPoints = createEventPointArray(richEvents, e => {
          if (!e.targetAFR || e.targetAFR === 0 || isNaN(e.targetAFR) || isNaN(e.afrError)) {
            return NaN;
          }
          return (e.afrError / e.targetAFR) * 100;
        });
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
                text: 'Deviation from Target (%)'
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
    const analyzer = tabManager.getTabAnalyzer('fueling');
    if (!analyzer || !this.elements.afrTableBody) return;
    
    const analysisData = tabManager.getCachedAnalysis('fueling');
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
    
     // Always use AFR unit symbol
     const unitSymbol = 'AFR';
     
     // Always apply AFR conversion factor (define before sorting so it can be used in sort logic)
     const conversionFactor = this.AFR_CONVERSION_FACTOR;
     
     // Sort events
     const sortedEvents = [...filteredEvents].sort((a, b) => {
       let aVal, bVal;
       switch (this.currentSort.column) {
         case 'time':
           aVal = a.time;
           bVal = b.time;
           break;
         case 'duration':
           aVal = a.duration || 0;
           bVal = b.duration || 0;
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
           // Calculate error from converted AFR values (same as display)
           // This ensures sorting matches what's displayed
           const aTargetAFRForError = a.targetAFR * conversionFactor;
           const aMeasuredAFRForError = a.measuredAFR * conversionFactor;
           aVal = Math.abs(aMeasuredAFRForError - aTargetAFRForError);
           
           const bTargetAFRForError = b.targetAFR * conversionFactor;
           const bMeasuredAFRForError = b.measuredAFR * conversionFactor;
           bVal = Math.abs(bMeasuredAFRForError - bTargetAFRForError);
           break;
         case 'afrErrorPercent':
           // Calculate error percentage from converted AFR values (same as display)
           // This ensures sorting matches what's displayed
           const aTargetAFR = a.targetAFR * conversionFactor;
           const aMeasuredAFR = a.measuredAFR * conversionFactor;
           const aErrorAFR = aMeasuredAFR - aTargetAFR;
           aVal = aTargetAFR > 0 ? Math.abs((aErrorAFR / aTargetAFR) * 100) : 0;
           
           const bTargetAFR = b.targetAFR * conversionFactor;
           const bMeasuredAFR = b.measuredAFR * conversionFactor;
           const bErrorAFR = bMeasuredAFR - bTargetAFR;
           bVal = bTargetAFR > 0 ? Math.abs((bErrorAFR / bTargetAFR) * 100) : 0;
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
    
    // Column map for header updates
    const columnMap = {
      'time': 'time',
      'duration': 'duration',
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
    
    // Update header labels - use stored base text or extract from original HTML
    // Store base text in data attribute on first run to avoid extraction issues
    document.querySelectorAll('#afr-afrTable th[data-sort="duration"]').forEach(th => {
      if (!th.dataset.baseText) {
        th.dataset.baseText = th.textContent.replace(/ ↑| ↓|↕/g, '').replace(/\(.*?\)/g, '').trim() || 'Duration';
      }
      const baseText = th.dataset.baseText;
      const indicator = currentSortColumn === columnMap['duration'] ? sortIndicator : '';
      th.textContent = `${baseText} ↕${indicator}`;
    });
    document.querySelectorAll('#afr-afrTable th[data-sort="targetAFR"]').forEach(th => {
      if (!th.dataset.baseText) {
        // Store original base text on first access
        th.dataset.baseText = th.textContent.replace(/ ↑| ↓|↕/g, '').replace(/\(.*?\)/g, '').trim() || 'Target AFR';
      }
      const baseText = th.dataset.baseText;
      const indicator = currentSortColumn === columnMap['targetAFR'] ? sortIndicator : '';
      th.textContent = `${baseText} (${unitSymbol}) ↕${indicator}`;
    });
    document.querySelectorAll('#afr-afrTable th[data-sort="measuredAFR"]').forEach(th => {
      if (!th.dataset.baseText) {
        th.dataset.baseText = th.textContent.replace(/ ↑| ↓|↕/g, '').replace(/\(.*?\)/g, '').trim() || 'Measured AFR';
      }
      const baseText = th.dataset.baseText;
      const indicator = currentSortColumn === columnMap['measuredAFR'] ? sortIndicator : '';
      th.textContent = `${baseText} (${unitSymbol}) ↕${indicator}`;
    });
    document.querySelectorAll('#afr-afrTable th[data-sort="afrError"]').forEach(th => {
      if (!th.dataset.baseText) {
        th.dataset.baseText = th.textContent.replace(/ ↑| ↓|↕/g, '').replace(/\(.*?\)/g, '').trim() || 'Error';
      }
      const baseText = th.dataset.baseText;
      const indicator = currentSortColumn === columnMap['afrError'] ? sortIndicator : '';
      th.textContent = `${baseText} (${unitSymbol}) ↕${indicator}`;
    });
    
    // Always apply AFR conversion factor (already set above)
    
    // Clear table and reset selected row
    this.elements.afrTableBody.innerHTML = '';
    this.selectedRow = null;
    
    // Populate table
    sortedEvents.forEach(event => {
      const row = document.createElement('tr');
      const eventTypeClass = event.eventType === 'lean' ? 'severity-mild' : 
                            event.eventType === 'rich' ? 'severity-severe' : '';
      
      // Store event data for click handler
      row.dataset.eventTime = event.time;
      row.dataset.eventDuration = event.duration || 0;
      row.style.cursor = 'pointer';
      row.title = 'Click to zoom to this event';
      
      // Display time
      const timeDisplay = event.time.toFixed(2);
      
      // Display duration in milliseconds for better precision
      const durationMs = event.duration ? (event.duration * 1000) : 0;
      const durationDisplay = durationMs > 0 
        ? durationMs.toFixed(1) + ' ms'
        : '0.0 ms';
      
      // Always convert lambda values to AFR
      const targetDisplay = event.targetAFR * conversionFactor;
      const measuredDisplay = event.measuredAFR * conversionFactor;
      
      // Calculate error as the difference between converted values (to match displayed target/measured)
      // This ensures the error matches what you see: measured - target in AFR units
      const errorDisplay = measuredDisplay - targetDisplay;
      
      // Calculate error percentage from the actual displayed values
      const errorPercentDisplay = targetDisplay > 0
        ? ((errorDisplay / targetDisplay) * 100).toFixed(2)
        : '0.00';
      
      // Always use 1 decimal place for AFR
      const decimalPlaces = 1;
      
      row.innerHTML = `
        <td>${timeDisplay}</td>
        <td>${durationDisplay}</td>
        <td>${targetDisplay.toFixed(decimalPlaces)}</td>
        <td>${measuredDisplay.toFixed(decimalPlaces)}</td>
        <td>${errorDisplay.toFixed(decimalPlaces)}</td>
        <td>${errorPercentDisplay}%</td>
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
      
      this.elements.afrTableBody.appendChild(row);
    });
  },

  handleSort(column) {
    const columnMap = {
      'time': 'time',
      'duration': 'duration',
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
    
    // Update sort indicators - remove all existing arrows first using regex
    document.querySelectorAll('#afr-afrTable th').forEach(th => {
      // Remove all arrow indicators (may be multiple if bug occurred)
      th.textContent = th.textContent.replace(/ ↑+| ↓+/g, '');
      if (th.dataset.sort === column) {
        th.textContent += this.currentSort.direction === 'asc' ? ' ↑' : ' ↓';
      }
    });
    
    this.updateTable();
  }
};

