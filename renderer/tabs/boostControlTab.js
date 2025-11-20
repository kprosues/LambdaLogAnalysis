// Boost Control Tab Module
const BoostControlTab = {
  elements: {
    maxOvershoot: null,
    inTargetPercent: null,
    overshootEvents: null,
    undershootEvents: null,
    boostTableBody: null,
    searchInput: null,
    eventTypeFilter: null,
    boostTargetChart: null,
    boostErrorChart: null,
    wastegateChart: null
  },

  charts: {},
  chartOriginalRanges: {},
  currentSort: { column: null, direction: 'asc' },
  showThrottle: true,

  initialize() {
    // Get DOM elements for this tab
    this.elements.maxOvershoot = document.getElementById('boost-maxOvershoot');
    this.elements.inTargetPercent = document.getElementById('boost-inTargetPercent');
    this.elements.overshootEvents = document.getElementById('boost-overshootEvents');
    this.elements.undershootEvents = document.getElementById('boost-undershootEvents');
    this.elements.boostTableBody = document.getElementById('boost-boostTableBody');
    this.elements.searchInput = document.getElementById('boost-searchInput');
    this.elements.eventTypeFilter = document.getElementById('boost-eventTypeFilter');

    // Set up event listeners
    if (this.elements.searchInput) {
      this.elements.searchInput.addEventListener('input', () => this.updateTable());
    }
    if (this.elements.eventTypeFilter) {
      this.elements.eventTypeFilter.addEventListener('change', () => this.updateTable());
    }

    // Set up table sorting
    document.querySelectorAll('#boost-boostTable th[data-sort]').forEach(th => {
      th.addEventListener('click', () => this.handleSort(th.dataset.sort));
    });
    
    // Set up throttle toggle
    const throttleToggle = document.getElementById('boost-showThrottleToggle');
    if (throttleToggle) {
      throttleToggle.addEventListener('change', (e) => {
        this.showThrottle = e.target.checked;
        this.renderCharts(); // Re-render charts with updated throttle visibility
      });
    }
  },

  render(analysisData) {
    if (!analysisData) {
      console.warn('Boost control tab: No analysis data available');
      // Show available columns to help debug
      this.showColumnInfo();
      // Still try to update with empty/default values
      this.updateStatistics();
      this.updateTable();
      return;
    }
    
    // Check for error in analysis
    if (analysisData.error) {
      console.warn('Boost control analysis error:', analysisData.error);
      // Show available columns when there's an error
      this.showColumnInfo();
      // Still render what we can - statistics will show zeros
    }
    
    // Only render charts if they don't exist yet (charts persist across tab switches)
    const chartsExist = this.charts.boostTarget && this.charts.boostError && this.charts.wastegate;
    
    this.updateStatistics();
    
    if (!chartsExist) {
      this.renderCharts();
    }
    
    this.updateTable();
  },
  
  showColumnInfo() {
    // Get available columns from data processor
    // Try multiple ways to access dataProcessor
    let dataProcessor = null;
    const analyzer = tabManager ? tabManager.getTabAnalyzer('boost') : null;
    
    console.log('=== showColumnInfo Debug ===');
    console.log('tabManager:', tabManager);
    console.log('analyzer:', analyzer);
    
    // Method 1: Through analyzer
    if (analyzer && analyzer.dataProcessor) {
      dataProcessor = analyzer.dataProcessor;
      console.log('✓ Got dataProcessor from analyzer');
    }
    // Method 2: From window (global)
    else if (typeof window !== 'undefined' && window.dataProcessor) {
      dataProcessor = window.dataProcessor;
      console.log('✓ Got dataProcessor from window');
    }
    // Method 3: Try direct access (if in same scope)
    else {
      try {
        // This will only work if dataProcessor is in global scope
        const globalDataProcessor = eval('dataProcessor');
        if (globalDataProcessor) {
          dataProcessor = globalDataProcessor;
          console.log('✓ Got dataProcessor from global scope');
        }
      } catch (e) {
        console.log('✗ Could not get dataProcessor from global scope:', e);
      }
    }
    
    if (!dataProcessor) {
      console.error('✗ Data processor not available');
      console.error('Analyzer:', analyzer);
      console.error('Analyzer dataProcessor:', analyzer ? analyzer.dataProcessor : 'N/A');
      console.error('window.dataProcessor:', typeof window !== 'undefined' ? window.dataProcessor : 'window not available');
      
      // Show error in UI
      const statsPanel = document.querySelector('.tab-content[data-tab="boost"] .statistics-panel');
      if (statsPanel) {
        let infoDiv = document.getElementById('boost-column-info');
        if (!infoDiv) {
          infoDiv = document.createElement('div');
          infoDiv.id = 'boost-column-info';
          infoDiv.style.cssText = 'background: #f8d7da; border: 1px solid #dc3545; border-radius: 6px; padding: 15px; margin: 20px 0; color: #721c24;';
          statsPanel.insertBefore(infoDiv, statsPanel.firstChild);
        }
        infoDiv.innerHTML = `
          <h3 style="margin-top: 0; color: #721c24;">❌ Data Processor Not Available</h3>
          <p>Unable to access file data. Please ensure a log file has been loaded.</p>
          <p>Check browser console (F12) for more details.</p>
        `;
      }
      return;
    }
    
    console.log('dataProcessor object:', dataProcessor);
    console.log('dataProcessor.getColumns:', typeof dataProcessor.getColumns);
    console.log('dataProcessor.getData:', typeof dataProcessor.getData);
    
    // Check if methods exist
    if (typeof dataProcessor.getColumns !== 'function') {
      console.error('dataProcessor.getColumns is not a function!');
      console.error('dataProcessor methods:', Object.getOwnPropertyNames(dataProcessor));
      return;
    }
    
    let columns = dataProcessor.getColumns();
    const data = dataProcessor.getData ? dataProcessor.getData() : null;
    
    console.log('Columns result:', columns);
    console.log('Columns type:', Array.isArray(columns) ? 'Array' : typeof columns);
    console.log('Columns length:', Array.isArray(columns) ? columns.length : 'N/A');
    console.log('Data result:', data);
    console.log('Data length:', data ? data.length : 'N/A');
    
    // Check if columns is actually empty or if there's an issue
    if (!Array.isArray(columns)) {
      console.error('Columns is not an array! Type:', typeof columns, 'Value:', columns);
      return;
    }
    
    // If columns is empty but we have data, extract from first row
    if (columns.length === 0 && data && data.length > 0 && data[0]) {
      console.warn('Columns array is empty but data exists! Extracting from first row...');
      columns = Object.keys(data[0]);
      console.warn('Extracted columns from data:', columns);
    }
    
    console.log('=== BOOST CONTROL TAB DEBUG INFO ===');
    console.log('Total columns in file:', columns.length);
    console.log('Total data rows:', data ? data.length : 0);
    console.log('Available columns:', columns);
    
    // Try to find any pressure-related columns
    const pressureColumns = columns.filter(col => {
      const colLower = col.toLowerCase();
      return colLower.includes('pressure') || 
             colLower.includes('boost') || 
             colLower.includes('manifold') ||
             colLower.includes('map') ||
             colLower.includes('wastegate') ||
             colLower.includes('wg');
    });
    
    if (pressureColumns.length > 0) {
      console.log('Potential boost-related columns found:', pressureColumns);
    } else {
      console.log('No obvious boost-related columns found');
    }
    
    // Show sample data from first row
    if (data && data.length > 0) {
      console.log('Sample data from first row:', data[0]);
    }
    
    // Display this info in the UI as well
    const statsPanel = document.querySelector('.tab-content[data-tab="boost"] .statistics-panel');
    if (statsPanel) {
      // Create or update info message
      let infoDiv = document.getElementById('boost-column-info');
      if (!infoDiv) {
        infoDiv = document.createElement('div');
        infoDiv.id = 'boost-column-info';
        infoDiv.style.cssText = 'background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 15px; margin: 20px 0; color: #856404;';
        statsPanel.insertBefore(infoDiv, statsPanel.firstChild);
      }
      
      infoDiv.innerHTML = `
        <h3 style="margin-top: 0; color: #856404;">⚠️ Boost Columns Not Found</h3>
        <p><strong>Total columns in file:</strong> ${columns.length}</p>
        <p><strong>Looking for:</strong></p>
        <ul style="margin: 10px 0;">
          <li>Boost Target (e.g., "Boost Target (kPa)")</li>
          <li>Actual Boost/Manifold Pressure (e.g., "Manifold Absolute Pressure (kPa)")</li>
          <li>Wastegate Duty Cycle (optional)</li>
        </ul>
        <p><strong>Available columns:</strong> Check browser console (F12) for full list</p>
        ${pressureColumns.length > 0 ? `<p><strong>Potential boost-related columns:</strong> ${pressureColumns.join(', ')}</p>` : ''}
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
    const analyzer = tabManager.getTabAnalyzer('boost');
    if (!analyzer) {
      console.warn('Boost analyzer not found');
      return;
    }

    const stats = analyzer.getStatistics();
    if (!stats) {
      console.warn('Boost statistics not available');
      return;
    }
    
    if (this.elements.maxOvershoot) {
      this.elements.maxOvershoot.textContent = stats.maxOvershoot.toFixed(2) + ' kPa';
    }
    if (this.elements.inTargetPercent) {
      this.elements.inTargetPercent.textContent = stats.inTargetPercent.toFixed(2) + '%';
    }
    if (this.elements.overshootEvents) {
      this.elements.overshootEvents.textContent = stats.overshootEvents;
    }
    if (this.elements.undershootEvents) {
      this.elements.undershootEvents.textContent = stats.undershootEvents;
    }
  },

  renderCharts() {
    const analyzer = tabManager.getTabAnalyzer('boost');
    if (!analyzer) {
      console.warn('Boost analyzer not found for charts');
      return;
    }
    
    // Get data processor from analyzer
    const dataProcessor = analyzer.dataProcessor;
    if (!dataProcessor) {
      console.warn('Data processor not available in analyzer');
      return;
    }
    
    const data = dataProcessor.getData();

    const analysisData = tabManager.getCachedAnalysis('boost');
    if (!analysisData) {
      console.warn('No cached boost analysis data');
      return;
    }
    
    if (!data || data.length === 0) {
      console.warn('No data available for boost charts');
      return;
    }
    
    if (analysisData.error) {
      console.warn('Cannot render charts due to analysis error:', analysisData.error);
      return;
    }

    const columns = analysisData.columns;
    
    // Filter data to only show boost conditions (>= 100 kPa)
    // This matches the filtering done in the analyzer
    const filteredData = data.filter(row => {
      const actualBoost = parseFloat(row[columns.actualBoost]) || 0;
      return actualBoost >= 100;
    });
    
    if (filteredData.length === 0) {
      console.warn('No data points above 100 kPa for charts');
      return;
    }

    const times = filteredData.map(row => row['Time (s)']);
    
    // Helper function to break lines at gaps > 1 second
    // Inserts NaN values to break line connections when time gap > 1 second
    // This prevents misleading lines connecting distant data points
    const breakAtGaps = (dataArray, timeArray) => {
      const result = [...dataArray];
      for (let i = 1; i < timeArray.length; i++) {
        const timeDiff = timeArray[i] - timeArray[i - 1];
        if (timeDiff > 1.0) {
          // Set the point before the gap to NaN to break the line
          // This ends the line segment before the gap, preventing connection
          result[i - 1] = NaN;
        }
      }
      return result;
    };
    
    // Get boost data (using filtered data >= 100 kPa)
    const boostTargetsRaw = filteredData.map(row => parseFloat(row[columns.boostTarget]) || 0);
    const actualBoostsRaw = filteredData.map(row => parseFloat(row[columns.actualBoost]) || 0);
    const boostErrorsRaw = filteredData.map((row, idx) => {
      const target = boostTargetsRaw[idx];
      const actual = actualBoostsRaw[idx];
      return actual - target;
    });
    
    const wastegateDCsRaw = columns.wastegate 
      ? filteredData.map(row => parseFloat(row[columns.wastegate]) || 0)
      : null;
    
    // Get throttle position data
    const throttlePositionsRaw = filteredData.map(row => parseFloat(row['Throttle Position (%)']) || 0);
    
    // Break lines at gaps > 1 second
    const boostTargets = breakAtGaps(boostTargetsRaw, times);
    const actualBoosts = breakAtGaps(actualBoostsRaw, times);
    const boostErrors = breakAtGaps(boostErrorsRaw, times);
    const wastegateDCs = wastegateDCsRaw ? breakAtGaps(wastegateDCsRaw, times) : null;
    const throttlePositions = breakAtGaps(throttlePositionsRaw, times);

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
    const overshootEvents = events.filter(e => e.eventType === 'overshoot');
    const undershootEvents = events.filter(e => e.eventType === 'undershoot');

    const overshootPoints = createEventPointArray(overshootEvents, e => e.actualBoost);
    const undershootPoints = createEventPointArray(undershootEvents, e => e.actualBoost);

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

    // Boost Target vs Actual Chart
    if (this.charts.boostTarget) this.charts.boostTarget.destroy();
    const boostTargetChartEl = document.getElementById('boost-boostTargetChart');
    if (boostTargetChartEl) {
      const datasets = [
        {
          label: 'Boost Target',
          data: boostTargets,
          borderColor: 'rgb(0, 123, 255)',
          backgroundColor: 'rgba(0, 123, 255, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          yAxisID: 'y',
          spanGaps: false
        },
        {
          label: 'Actual Boost',
          data: actualBoosts,
          borderColor: 'rgb(40, 167, 69)',
          backgroundColor: 'rgba(40, 167, 69, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          yAxisID: 'y',
          spanGaps: false
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

      if (overshootEvents.length > 0) {
        datasets.push({
          label: 'Overshoot Events',
          data: overshootPoints,
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

      if (undershootEvents.length > 0) {
        datasets.push({
          label: 'Undershoot Events',
          data: undershootPoints,
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
      const boostTargetChartOptions = {
        ...chartOptions,
        scales: {
          ...chartOptions.scales,
          y: {
            type: 'linear',
            position: 'left',
            title: {
              display: true,
              text: 'Boost Pressure (kPa)'
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
      
      this.charts.boostTarget = new Chart(boostTargetChartEl, {
        type: 'line',
        data: {
          labels: times,
          datasets: datasets
        },
        options: boostTargetChartOptions
      });

      if (times.length > 0) {
        this.chartOriginalRanges.boostTarget = {
          min: parseFloat(times[0]),
          max: parseFloat(times[times.length - 1])
        };
      }
    }

    // Boost Error Chart
    if (this.charts.boostError) this.charts.boostError.destroy();
    const boostErrorChartEl = document.getElementById('boost-boostErrorChart');
    if (boostErrorChartEl) {
      const errorDatasets = [
        {
          label: 'Boost Error (kPa)',
          data: boostErrors,
          borderColor: 'rgb(220, 53, 69)',
          backgroundColor: 'rgba(220, 53, 69, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          yAxisID: 'y',
          spanGaps: false
        },
        {
          label: 'Target Line (0)',
          data: new Array(times.length).fill(0),
          borderColor: 'rgb(153, 153, 153)',
          backgroundColor: 'rgba(153, 153, 153, 0.1)',
          borderWidth: 1,
          borderDash: [5, 5],
          pointRadius: 0,
          yAxisID: 'y',
          spanGaps: false
        }
      ];
      
      // Add throttle position if enabled
      if (this.showThrottle) {
        errorDatasets.push({
          label: 'Throttle Position (%)',
          data: throttlePositions,
          borderColor: 'rgb(128, 128, 128)',
          backgroundColor: 'rgba(128, 128, 128, 0.1)',
          borderWidth: 1,
          pointRadius: 0,
          yAxisID: 'y1',
          borderDash: [5, 5]
        });
      }
      
      this.charts.boostError = new Chart(boostErrorChartEl, {
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
                text: 'Error (kPa)'
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
        }
      });

      if (times.length > 0) {
        this.chartOriginalRanges.boostError = {
          min: parseFloat(times[0]),
          max: parseFloat(times[times.length - 1])
        };
      }
    }

    // Wastegate Duty Cycle Chart
    if (wastegateDCs && this.charts.wastegate) this.charts.wastegate.destroy();
    const wastegateChartEl = document.getElementById('boost-wastegateChart');
    if (wastegateChartEl && wastegateDCs) {
      const wastegateDatasets = [
        {
          label: 'Wastegate Duty Cycle (%)',
          data: wastegateDCs,
          borderColor: 'rgb(255, 193, 7)',
          backgroundColor: 'rgba(255, 193, 7, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          yAxisID: 'y',
          spanGaps: false
        },
        {
          label: 'Overshoot Events',
          data: overshootPoints,
          borderColor: 'rgb(220, 53, 69)',
          backgroundColor: 'rgba(220, 53, 69, 0.5)',
          borderWidth: 0,
          pointRadius: 5,
          pointHoverRadius: 7,
          showLine: false,
          spanGaps: false,
          yAxisID: 'y'
        },
        {
          label: 'Undershoot Events',
          data: undershootPoints,
          borderColor: 'rgb(255, 193, 7)',
          backgroundColor: 'rgba(255, 193, 7, 0.5)',
          borderWidth: 0,
          pointRadius: 5,
          pointHoverRadius: 7,
          showLine: false,
          spanGaps: false,
          yAxisID: 'y'
        }
      ];
      
      // Add throttle position if enabled
      if (this.showThrottle) {
        wastegateDatasets.push({
          label: 'Throttle Position (%)',
          data: throttlePositions,
          borderColor: 'rgb(128, 128, 128)',
          backgroundColor: 'rgba(128, 128, 128, 0.1)',
          borderWidth: 1,
          pointRadius: 0,
          yAxisID: 'y1',
          borderDash: [5, 5]
        });
      }
      
      const wastegateChartOptions = {
        ...chartOptions,
        scales: {
          ...chartOptions.scales,
          y: {
            type: 'linear',
            position: 'left',
            title: {
              display: true,
              text: 'Wastegate Duty Cycle (%)'
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
      
      this.charts.wastegate = new Chart(wastegateChartEl, {
        type: 'line',
        data: {
          labels: times,
          datasets: wastegateDatasets
        },
        options: wastegateChartOptions
      });

      if (times.length > 0) {
        this.chartOriginalRanges.wastegate = {
          min: parseFloat(times[0]),
          max: parseFloat(times[times.length - 1])
        };
      }
    }
  },

  updateTable() {
    const analyzer = tabManager.getTabAnalyzer('boost');
    if (!analyzer || !this.elements.boostTableBody) return;
    
    const analysisData = tabManager.getCachedAnalysis('boost');
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
          e.boostTarget.toString().includes(term) ||
          e.actualBoost.toString().includes(term) ||
          e.boostError.toString().includes(term) ||
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
        case 'boostTarget':
          aVal = a.boostTarget;
          bVal = b.boostTarget;
          break;
        case 'actualBoost':
          aVal = a.actualBoost;
          bVal = b.actualBoost;
          break;
        case 'boostError':
          aVal = Math.abs(a.boostError);
          bVal = Math.abs(b.boostError);
          break;
        case 'boostErrorPercent':
          aVal = Math.abs(a.boostErrorPercent);
          bVal = Math.abs(b.boostErrorPercent);
          break;
        case 'wastegateDC':
          aVal = a.wastegateDC || 0;
          bVal = b.wastegateDC || 0;
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
    
    // Clear table
    this.elements.boostTableBody.innerHTML = '';
    
    // Populate table
    sortedEvents.forEach(event => {
      const row = document.createElement('tr');
      const eventTypeClass = event.eventType === 'overshoot' ? 'severity-severe' : 
                            event.eventType === 'undershoot' ? 'severity-mild' : '';
      
      // Display time with duration for grouped events
      const timeDisplay = event.duration && event.duration > 0 
        ? `${event.time.toFixed(2)} (${event.duration.toFixed(3)}s)`
        : event.time.toFixed(2);
      
      // Use maxBoostError if available (for grouped events), otherwise use boostError
      const errorDisplay = event.maxBoostError !== undefined ? event.maxBoostError : event.boostError;
      const errorPercentDisplay = event.maxBoostError !== undefined && event.boostTarget > 0
        ? ((event.maxBoostError / event.boostTarget) * 100).toFixed(2)
        : event.boostErrorPercent.toFixed(2);
      
      row.innerHTML = `
        <td>${timeDisplay}</td>
        <td>${event.boostTarget.toFixed(2)}</td>
        <td>${event.actualBoost.toFixed(2)}</td>
        <td>${errorDisplay.toFixed(2)}</td>
        <td>${errorPercentDisplay}%</td>
        <td>${event.wastegateDC !== null ? event.wastegateDC.toFixed(1) : 'N/A'}</td>
        <td><span class="severity-badge ${eventTypeClass}">${event.eventType}</span></td>
      `;
      this.elements.boostTableBody.appendChild(row);
    });
  },

  handleSort(column) {
    const columnMap = {
      'time': 'time',
      'boostTarget': 'boostTarget',
      'actualBoost': 'actualBoost',
      'boostError': 'boostError',
      'boostErrorPercent': 'boostErrorPercent',
      'wastegateDC': 'wastegateDC',
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
    
    document.querySelectorAll('#boost-boostTable th').forEach(th => {
      th.textContent = th.textContent.replace(' ↑', '').replace(' ↓', '');
      if (th.dataset.sort === column) {
        th.textContent += this.currentSort.direction === 'asc' ? ' ↑' : ' ↓';
      }
    });
    
    this.updateTable();
  }
};

