// Boost Control Tab Module
const BoostControlTab = {
  // Conversion factor: 1 kPa = 0.1450377377 PSI
  kPaToPSI(kpa) {
    return kpa * 0.1450377377;
  },

  // Atmospheric pressure constants
  ATMOSPHERIC_PRESSURE_KPA: 101.325,
  ATMOSPHERIC_PRESSURE_PSI: 14.696,

  // Convert kPa absolute to PSI gauge (boost above atmosphere)
  kPaToGaugePSI(kpa) {
    // Gauge pressure = Absolute pressure - Atmospheric pressure
    // Convert to PSI first, then subtract atmospheric PSI
    return this.kPaToPSI(kpa) - this.ATMOSPHERIC_PRESSURE_PSI;
  },

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
    wastegateChart: null,
    // Heatmap elements
    heatmap: null,
    heatmapMaxLabel: null
  },

  charts: {},
  chartOriginalRanges: {},
  currentSort: { column: null, direction: 'asc' },
  showThrottle: true,
  selectedRow: null, // Track currently selected row

  initialize() {
    // Get DOM elements for this tab
    this.elements.maxOvershoot = document.getElementById('boost-maxOvershoot');
    this.elements.inTargetPercent = document.getElementById('boost-inTargetPercent');
    this.elements.overshootEvents = document.getElementById('boost-overshootEvents');
    this.elements.undershootEvents = document.getElementById('boost-undershootEvents');
    this.elements.boostTableBody = document.getElementById('boost-boostTableBody');
    this.elements.searchInput = document.getElementById('boost-searchInput');
    this.elements.eventTypeFilter = document.getElementById('boost-eventTypeFilter');
    // Heatmap elements
    this.elements.heatmap = document.getElementById('boost-heatmap');
    this.elements.heatmapMaxLabel = document.getElementById('boost-heatmap-max-label');

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
      throttleToggle.addEventListener('change', async (e) => {
        this.showThrottle = e.target.checked;
        
        // Show loading overlay immediately
        const tabContent = document.querySelector('.tab-content[data-tab="boost"]');
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
      console.warn('Boost control tab: No analysis data available');
      // Show available columns to help debug
      this.showColumnInfo();
      // Still try to update with empty/default values
      this.updateStatistics();
      this.updateTable();
      this.renderHeatmap();
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
    this.renderHeatmap();
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
      // Max overshoot is already a delta (error), so just convert to PSI directly
      this.elements.maxOvershoot.textContent = this.kPaToPSI(stats.maxOvershoot).toFixed(2) + ' PSI';
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
    
    // Get RPM data for tooltips
    const rpms = filteredData.map(row => parseFloat(row['Engine Speed (rpm)']) || 0);
    
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
    let boostTargets = breakAtGaps(boostTargetsRaw, times);
    let actualBoosts = breakAtGaps(actualBoostsRaw, times);
    let boostErrors = breakAtGaps(boostErrorsRaw, times);
    let wastegateDCs = wastegateDCsRaw ? breakAtGaps(wastegateDCsRaw, times) : null;
    let throttlePositions = breakAtGaps(throttlePositionsRaw, times);

    // Apply smoothing if enabled (using shared smoothing utility)
    if (window.applyDataSmoothing && window.smoothingConfig) {
      boostTargets = window.applyDataSmoothing(boostTargets, window.smoothingConfig.windowSize, window.smoothingConfig.enabled);
      actualBoosts = window.applyDataSmoothing(actualBoosts, window.smoothingConfig.windowSize, window.smoothingConfig.enabled);
      boostErrors = window.applyDataSmoothing(boostErrors, window.smoothingConfig.windowSize, window.smoothingConfig.enabled);
      if (wastegateDCs) {
        wastegateDCs = window.applyDataSmoothing(wastegateDCs, window.smoothingConfig.windowSize, window.smoothingConfig.enabled);
      }
      throttlePositions = window.applyDataSmoothing(throttlePositions, window.smoothingConfig.windowSize, window.smoothingConfig.enabled);
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
    const overshootEvents = events.filter(e => e.eventType === 'overshoot');
    const undershootEvents = events.filter(e => e.eventType === 'undershoot');

    const overshootPoints = createEventPointArray(overshootEvents, e => this.kPaToGaugePSI(e.actualBoost));
    const undershootPoints = createEventPointArray(undershootEvents, e => this.kPaToGaugePSI(e.actualBoost));

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

    // Boost Target vs Actual Chart
    if (this.charts.boostTarget) this.charts.boostTarget.destroy();
    const boostTargetChartEl = document.getElementById('boost-boostTargetChart');
    if (boostTargetChartEl) {
      const datasets = [
        {
          label: 'Boost Target',
          data: boostTargets.map(v => this.kPaToGaugePSI(v)),
          borderColor: 'rgb(0, 123, 255)',
          backgroundColor: 'rgba(0, 123, 255, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          yAxisID: 'y',
          spanGaps: false
        },
        {
          label: 'Actual Boost',
          data: actualBoosts.map(v => this.kPaToGaugePSI(v)),
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
              text: 'Boost Pressure (PSI gauge)'
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
          label: 'Boost Error (PSI)',
          data: boostErrors.map(v => this.kPaToPSI(v)),
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
                text: 'Error (PSI)'
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
          // Calculate error percentage the same way as display (using maxBoostError if available)
          const aErrorForPercent = a.maxBoostError !== undefined ? a.maxBoostError : a.boostError;
          aVal = a.boostTarget > 0 ? Math.abs((aErrorForPercent / a.boostTarget) * 100) : 0;
          
          const bErrorForPercent = b.maxBoostError !== undefined ? b.maxBoostError : b.boostError;
          bVal = b.boostTarget > 0 ? Math.abs((bErrorForPercent / b.boostTarget) * 100) : 0;
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
    
    // Clear table and reset selected row
    this.elements.boostTableBody.innerHTML = '';
    this.selectedRow = null;
    
    // Populate table
    sortedEvents.forEach(event => {
      const row = document.createElement('tr');
      const eventTypeClass = event.eventType === 'overshoot' ? 'severity-severe' : 
                            event.eventType === 'undershoot' ? 'severity-mild' : '';
      
      // Store event data for click handler
      row.dataset.eventTime = event.time;
      row.dataset.eventDuration = event.duration || 0;
      row.style.cursor = 'pointer';
      row.title = 'Click to zoom to this event';
      
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
        <td>${this.kPaToGaugePSI(event.boostTarget).toFixed(2)}</td>
        <td>${this.kPaToGaugePSI(event.actualBoost).toFixed(2)}</td>
        <td>${this.kPaToPSI(errorDisplay).toFixed(2)}</td>
        <td>${errorPercentDisplay}%</td>
        <td>${event.wastegateDC !== null ? event.wastegateDC.toFixed(1) : 'N/A'}</td>
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
    
    // Update sort indicators - remove all existing arrows first using regex
    document.querySelectorAll('#boost-boostTable th').forEach(th => {
      // Remove all arrow indicators (may be multiple if bug occurred)
      th.textContent = th.textContent.replace(/ ↑+| ↓+/g, '');
      if (th.dataset.sort === column) {
        th.textContent += this.currentSort.direction === 'asc' ? ' ↑' : ' ↓';
      }
    });
    
    this.updateTable();
  },

  /**
   * Render the boost target coverage heatmap
   * Shows data points binned by the tune file's boost target table axes (RPM x TPS)
   */
  renderHeatmap() {
    const container = this.elements.heatmap;
    if (!container) return;

    container.innerHTML = '';

    // Check if tune file is loaded
    if (!window.tuneFileParser || !window.tuneFileParser.isLoaded()) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'Load a tune file to see boost target table coverage.';
      container.appendChild(empty);
      return;
    }

    // Check if data processor is available
    if (!window.dataProcessor) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'Load log data to see boost target table coverage.';
      container.appendChild(empty);
      return;
    }

    const data = window.dataProcessor.getData();
    if (!data || data.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No log data available. Load a log file to see boost target table coverage.';
      container.appendChild(empty);
      return;
    }

    // Get boost target table axes from tune file
    const rpmAxis = window.tuneFileParser.getArray('boost_target_rpm_index');
    const tpsAxis = window.tuneFileParser.getArray('boost_target_tps_index');

    if (!rpmAxis || !tpsAxis || rpmAxis.length === 0 || tpsAxis.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'Tune file is missing boost target table axes.';
      container.appendChild(empty);
      return;
    }

    // Compute hit counts - bin data by RPM and TPS
    const hitCounts = this.computeHeatmapHitCounts(data, rpmAxis, tpsAxis);
    if (!hitCounts) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'Unable to compute heatmap data. Check log file has RPM and Throttle Position columns.';
      container.appendChild(empty);
      return;
    }

    // Find max hit count for scaling
    let maxHits = 0;
    let totalHits = 0;
    let cellsWithData = 0;
    hitCounts.forEach(row => {
      row.forEach(count => {
        if (count > maxHits) maxHits = count;
        totalHits += count;
        if (count > 0) cellsWithData++;
      });
    });

    // Update the legend max label
    if (this.elements.heatmapMaxLabel) {
      this.elements.heatmapMaxLabel.textContent = maxHits.toLocaleString();
    }

    // Create the heatmap table
    const table = document.createElement('table');
    table.className = 'heatmap-table';

    // Create header row with TPS axis values
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    // Corner cell (RPM \ TPS label)
    const cornerTh = document.createElement('th');
    cornerTh.className = 'corner-header';
    cornerTh.textContent = 'RPM \\ TPS';
    cornerTh.title = 'Rows: RPM (rpm), Columns: Throttle Position (%)';
    headerRow.appendChild(cornerTh);

    // TPS axis headers (columns)
    tpsAxis.forEach(tps => {
      const th = document.createElement('th');
      th.textContent = tps.toFixed(1) + '%';
      th.title = `Throttle Position: ${tps.toFixed(2)}%`;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Create body with RPM rows
    const tbody = document.createElement('tbody');
    rpmAxis.forEach((rpm, rpmIdx) => {
      const tr = document.createElement('tr');
      
      // Row header (RPM value)
      const rowTh = document.createElement('th');
      rowTh.className = 'row-header';
      rowTh.textContent = rpm.toFixed(0);
      rowTh.title = `RPM: ${rpm.toFixed(0)}`;
      tr.appendChild(rowTh);

      // Data cells
      tpsAxis.forEach((tps, tpsIdx) => {
        const td = document.createElement('td');
        const hits = hitCounts[rpmIdx][tpsIdx];
        td.textContent = hits > 0 ? hits.toLocaleString() : '';
        td.title = `RPM: ${rpm.toFixed(0)}, TPS: ${tps.toFixed(2)}%\nData hits: ${hits.toLocaleString()}`;
        
        // Calculate color intensity (0-9 scale)
        const colorClass = this.getHeatmapColorClass(hits, maxHits);
        td.className = colorClass;
        
        tr.appendChild(td);
      });
      
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);

    // Add stats summary
    const stats = document.createElement('div');
    stats.className = 'heatmap-stats';
    const totalCells = rpmAxis.length * tpsAxis.length;
    const coveragePercent = ((cellsWithData / totalCells) * 100).toFixed(1);
    stats.innerHTML = `
      <span><strong>Total Data Points:</strong> ${totalHits.toLocaleString()}</span>
      <span><strong>Cells with Data:</strong> ${cellsWithData} / ${totalCells} (${coveragePercent}%)</span>
      <span><strong>Max Hits per Cell:</strong> ${maxHits.toLocaleString()}</span>
    `;
    container.appendChild(stats);
  },

  /**
   * Compute hit counts for heatmap by binning data into RPM x TPS cells
   * Only counts data points that are in boost (>= 100 kPa actual boost)
   * @param {Array} data - Log data rows
   * @param {Array} rpmAxis - RPM axis breakpoints from tune file
   * @param {Array} tpsAxis - TPS axis breakpoints from tune file
   * @returns {Array|null} - 2D array of hit counts [rpmIdx][tpsIdx] or null if error
   */
  computeHeatmapHitCounts(data, rpmAxis, tpsAxis) {
    // Initialize hit count matrix
    const hitCounts = Array.from({ length: rpmAxis.length }, () => 
      Array.from({ length: tpsAxis.length }, () => 0)
    );

    // Get column names
    const rpmColumn = 'Engine Speed (rpm)';
    const tpsColumn = 'Throttle Position (%)';
    const boostColumn = 'Manifold Absolute Pressure (kPa)';

    // Check if required columns exist
    const columns = window.dataProcessor.getColumns();
    if (!columns.includes(rpmColumn) || !columns.includes(tpsColumn)) {
      console.warn('Missing required columns for boost heatmap:', { rpmColumn, tpsColumn });
      return null;
    }

    // Process each row
    data.forEach(row => {
      const rpm = parseFloat(row[rpmColumn]);
      const tps = parseFloat(row[tpsColumn]);
      const boost = parseFloat(row[boostColumn]);

      // Skip invalid data
      if (!isFinite(rpm) || !isFinite(tps)) {
        return;
      }

      // Only count data points in boost (>= 100 kPa) if boost column exists
      if (columns.includes(boostColumn) && isFinite(boost) && boost < 100) {
        return;
      }

      // Find RPM index (bin to nearest lower breakpoint)
      const rpmIdx = this.findAxisIndex(rpm, rpmAxis);
      // Find TPS index (bin to nearest lower breakpoint)
      const tpsIdx = this.findAxisIndex(tps, tpsAxis);

      if (rpmIdx !== null && tpsIdx !== null) {
        hitCounts[rpmIdx][tpsIdx] += 1;
      }
    });

    return hitCounts;
  },

  /**
   * Find the axis index for a value (bin to nearest lower breakpoint)
   * Matches the Python axis_index implementation used in autotune
   * @param {number} value - Value to find index for
   * @param {Array} axis - Array of breakpoints
   * @returns {number|null} - Index or null if invalid
   */
  findAxisIndex(value, axis) {
    if (!Array.isArray(axis) || axis.length === 0 || !isFinite(value)) {
      return null;
    }
    
    // Clamp to bounds
    if (value < axis[0]) {
      return 0;
    }
    if (value > axis[axis.length - 1]) {
      return axis.length - 1;
    }
    
    // Find the insertion point (searchsorted right, then subtract 1)
    let insertIdx = axis.length;
    for (let i = 0; i < axis.length; i++) {
      if (axis[i] > value) {
        insertIdx = i;
        break;
      }
    }
    const idx = insertIdx - 1;
    return Math.max(0, Math.min(idx, axis.length - 1));
  },

  /**
   * Get CSS class for heatmap cell based on hit count
   * Uses logarithmic scaling for better visualization
   * @param {number} hits - Number of hits in cell
   * @param {number} maxHits - Maximum hits across all cells
   * @returns {string} - CSS class name
   */
  getHeatmapColorClass(hits, maxHits) {
    if (hits === 0 || maxHits === 0) return 'heatmap-cell-0';
    
    // Use logarithmic scaling for better visualization of data distribution
    const logHits = Math.log10(hits + 1);
    const logMax = Math.log10(maxHits + 1);
    const ratio = logHits / logMax;
    
    // Map to 1-9 color classes (0 is reserved for no data)
    const colorIndex = Math.min(9, Math.max(1, Math.ceil(ratio * 9)));
    return `heatmap-cell-${colorIndex}`;
  }
};

