// Knock Analysis Tab Module
const KnockAnalysisTab = {
  // DOM element references (will be set during initialization)
  elements: {
    totalKnockEvents: null,
    maxKnockRetard: null,
    timeWithKnock: null,
    severeEvents: null,
    anomalyTableBody: null,
    searchInput: null,
    severityFilter: null,
    knockChart: null,
    rpmChart: null,
    throttleChart: null,
    afrChart: null,
    // Heatmap elements
    heatmap: null,
    heatmapMaxLabel: null
  },

  charts: {},
  chartOriginalRanges: {},
  currentSort: { column: null, direction: 'asc' },
  selectedRow: null, // Track currently selected row

  initialize() {
    // Get DOM elements for this tab
    this.elements.totalKnockEvents = document.getElementById('knock-totalKnockEvents');
    this.elements.maxKnockRetard = document.getElementById('knock-maxKnockRetard');
    this.elements.timeWithKnock = document.getElementById('knock-timeWithKnock');
    this.elements.severeEvents = document.getElementById('knock-severeEvents');
    this.elements.anomalyTableBody = document.getElementById('knock-anomalyTableBody');
    this.elements.searchInput = document.getElementById('knock-searchInput');
    this.elements.severityFilter = document.getElementById('knock-severityFilter');
    // Heatmap elements
    this.elements.heatmap = document.getElementById('knock-heatmap');
    this.elements.heatmapMaxLabel = document.getElementById('knock-heatmap-max-label');

    // Set up event listeners
    if (this.elements.searchInput) {
      this.elements.searchInput.addEventListener('input', () => this.updateTable());
    }
    if (this.elements.severityFilter) {
      this.elements.severityFilter.addEventListener('change', () => this.updateTable());
    }

    // Set up table sorting
    document.querySelectorAll('#knock-anomalyTable th[data-sort]').forEach(th => {
      th.addEventListener('click', () => this.handleSort(th.dataset.sort));
    });
  },

  render(analysisData) {
    if (!analysisData) return;
    
    // Only render charts if they don't exist yet (charts persist across tab switches)
    const chartsExist = this.charts.knock && this.charts.rpm && this.charts.throttle && this.charts.afr;
    
    this.updateStatistics();
    
    if (!chartsExist) {
      this.renderCharts();
    }
    
    this.updateTable();
    this.renderHeatmap();
  },

  updateStatistics() {
    const knockDetector = tabManager.getTabAnalyzer('knock');
    if (!knockDetector) return;

    const stats = knockDetector.getStatistics();
    if (!stats) return;
    
    if (this.elements.totalKnockEvents) {
      this.elements.totalKnockEvents.textContent = stats.totalEvents.toLocaleString();
    }
    if (this.elements.maxKnockRetard) {
      this.elements.maxKnockRetard.textContent = Math.abs(stats.maxKnockRetard).toFixed(2) + '°';
    }
    if (this.elements.timeWithKnock) {
      this.elements.timeWithKnock.textContent = stats.timeWithKnock.toFixed(2) + '%';
    }
    if (this.elements.severeEvents) {
      this.elements.severeEvents.textContent = stats.severeEvents;
    }
  },

  renderCharts() {
    const data = dataProcessor.getData();
    const knockDetector = tabManager.getTabAnalyzer('knock');
    if (!knockDetector) return;

    const events = knockDetector.getKnockEvents();
    
    if (!data || data.length === 0) return;

    // Prepare data
    const times = data.map(row => row['Time (s)']);
    let knockRetards = data.map(row => {
      const val = row['Knock Retard (°)'] || 0;
      return val < 0 ? Math.abs(val) : 0;
    });
    let rpms = data.map(row => row['Engine Speed (rpm)'] || 0);
    let throttles = data.map(row => row['Throttle Position (%)'] || 0);
    let afrs = data.map(row => row['Air/Fuel Sensor #1 (λ)'] || 0);

    // Create knock event point arrays
    const createKnockPointArray = (events, dataArray, valueExtractor) => {
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
        const value = valueExtractor(event);
        pointArray[closestIdx] = typeof value === 'number' && value < 0 ? Math.abs(value) : value;
      });
      return pointArray;
    };

    const knockRpmPoints = createKnockPointArray(events, rpms, e => e.rpm);
    const knockThrottlePoints = createKnockPointArray(events, throttles, e => e.throttle);
    const knockAfrPoints = createKnockPointArray(events, afrs, e => e.afr);

    const severeEvents = events.filter(e => e.severity === 'severe');
    const mildEvents = events.filter(e => e.severity === 'mild');

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
        pointArray[closestIdx] = Math.abs(event.knockRetard);
      });
      return pointArray;
    };

    const severeKnockPoints = createSeverityPointArray(severeEvents);
    const mildKnockPoints = createSeverityPointArray(mildEvents);

    // Apply smoothing if enabled (using shared smoothing utility)
    if (window.applyDataSmoothing && window.smoothingConfig) {
      knockRetards = window.applyDataSmoothing(knockRetards, window.smoothingConfig.windowSize, window.smoothingConfig.enabled);
      rpms = window.applyDataSmoothing(rpms, window.smoothingConfig.windowSize, window.smoothingConfig.enabled);
      throttles = window.applyDataSmoothing(throttles, window.smoothingConfig.windowSize, window.smoothingConfig.enabled);
      afrs = window.applyDataSmoothing(afrs, window.smoothingConfig.windowSize, window.smoothingConfig.enabled);
    }

    // Chart configuration with zoom
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

    // Knock Retard Chart
    if (this.charts.knock) this.charts.knock.destroy();
    const knockChartEl = document.getElementById('knock-knockChart');
    if (knockChartEl) {
      const knockDatasets = [{
        label: 'Knock Retard (°)',
        data: knockRetards,
        borderColor: 'rgb(220, 53, 69)',
        backgroundColor: 'rgba(220, 53, 69, 0.1)',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4
      }];

      if (severeEvents.length > 0) {
        knockDatasets.push({
          label: 'Severe Knock',
          data: severeKnockPoints,
          borderColor: 'rgb(220, 53, 69)',
          backgroundColor: 'rgba(220, 53, 69, 0.8)',
          borderWidth: 0,
          pointRadius: 6,
          pointHoverRadius: 8,
          showLine: false,
          spanGaps: false
        });
      }

      if (mildEvents.length > 0) {
        knockDatasets.push({
          label: 'Mild Knock',
          data: mildKnockPoints,
          borderColor: 'rgb(255, 193, 7)',
          backgroundColor: 'rgba(255, 193, 7, 0.8)',
          borderWidth: 0,
          pointRadius: 4,
          pointHoverRadius: 6,
          showLine: false,
          spanGaps: false
        });
      }

      this.charts.knock = new Chart(knockChartEl, {
        type: 'line',
        data: {
          labels: times,
          datasets: knockDatasets
        },
        options: chartOptions
      });

      if (times.length > 0) {
        this.chartOriginalRanges.knock = {
          min: parseFloat(times[0]),
          max: parseFloat(times[times.length - 1])
        };
      }
    }

    // RPM vs Knock Chart
    if (this.charts.rpm) this.charts.rpm.destroy();
    const rpmChartEl = document.getElementById('knock-rpmChart');
    if (rpmChartEl) {
      this.charts.rpm = new Chart(rpmChartEl, {
        type: 'line',
        data: {
          labels: times,
          datasets: [
            {
              label: 'Engine Speed (RPM)',
              data: rpms,
              borderColor: 'rgb(40, 167, 69)',
              backgroundColor: 'rgba(40, 167, 69, 0.1)',
              borderWidth: 2,
              pointRadius: 0
            },
            {
              label: 'Knock Events',
              data: knockRpmPoints,
              borderColor: 'rgb(220, 53, 69)',
              backgroundColor: 'rgba(220, 53, 69, 0.6)',
              borderWidth: 0,
              pointRadius: 5,
              pointHoverRadius: 7,
              showLine: false,
              spanGaps: false
            }
          ]
        },
        options: chartOptions
      });

      if (times.length > 0) {
        this.chartOriginalRanges.rpm = {
          min: parseFloat(times[0]),
          max: parseFloat(times[times.length - 1])
        };
      }
    }

    // Throttle vs Knock Chart
    if (this.charts.throttle) this.charts.throttle.destroy();
    const throttleChartEl = document.getElementById('knock-throttleChart');
    if (throttleChartEl) {
      this.charts.throttle = new Chart(throttleChartEl, {
        type: 'line',
        data: {
          labels: times,
          datasets: [
            {
              label: 'Throttle Position (%)',
              data: throttles,
              borderColor: 'rgb(0, 123, 255)',
              backgroundColor: 'rgba(0, 123, 255, 0.1)',
              borderWidth: 2,
              pointRadius: 0
            },
            {
              label: 'Knock Events',
              data: knockThrottlePoints,
              borderColor: 'rgb(220, 53, 69)',
              backgroundColor: 'rgba(220, 53, 69, 0.6)',
              borderWidth: 0,
              pointRadius: 5,
              pointHoverRadius: 7,
              showLine: false,
              spanGaps: false
            }
          ]
        },
        options: chartOptions
      });

      if (times.length > 0) {
        this.chartOriginalRanges.throttle = {
          min: parseFloat(times[0]),
          max: parseFloat(times[times.length - 1])
        };
      }
    }

    // AFR vs Knock Chart
    if (this.charts.afr) this.charts.afr.destroy();
    const afrChartEl = document.getElementById('knock-afrChart');
    if (afrChartEl) {
      this.charts.afr = new Chart(afrChartEl, {
        type: 'line',
        data: {
          labels: times,
          datasets: [
            {
              label: 'Air/Fuel Ratio (λ)',
              data: afrs,
              borderColor: 'rgb(255, 193, 7)',
              backgroundColor: 'rgba(255, 193, 7, 0.1)',
              borderWidth: 2,
              pointRadius: 0
            },
            {
              label: 'Knock Events',
              data: knockAfrPoints,
              borderColor: 'rgb(220, 53, 69)',
              backgroundColor: 'rgba(220, 53, 69, 0.6)',
              borderWidth: 0,
              pointRadius: 5,
              pointHoverRadius: 7,
              showLine: false,
              spanGaps: false
            }
          ]
        },
        options: chartOptions
      });

      if (times.length > 0) {
        this.chartOriginalRanges.afr = {
          min: parseFloat(times[0]),
          max: parseFloat(times[times.length - 1])
        };
      }
    }
  },

  updateTable() {
    const knockDetector = tabManager.getTabAnalyzer('knock');
    if (!knockDetector || !this.elements.anomalyTableBody) return;
    
    const searchTerm = this.elements.searchInput ? this.elements.searchInput.value : '';
    const severity = this.elements.severityFilter ? this.elements.severityFilter.value : 'all';
    
    const filteredEvents = knockDetector.filterEvents(searchTerm, severity);
    
    // Clear table and reset selected row
    this.elements.anomalyTableBody.innerHTML = '';
    this.selectedRow = null;
    
    // Sort events
    const sortedEvents = [...filteredEvents].sort((a, b) => {
      let aVal, bVal;
      switch (this.currentSort.column) {
        case 'time':
          aVal = a.time;
          bVal = b.time;
          break;
        case 'knockRetard':
          aVal = Math.abs(a.knockRetard);
          bVal = Math.abs(b.knockRetard);
          break;
        case 'rpm':
          aVal = a.rpm;
          bVal = b.rpm;
          break;
        case 'throttle':
          aVal = a.throttle;
          bVal = b.throttle;
          break;
        case 'load':
          aVal = a.load;
          bVal = b.load;
          break;
        case 'afr':
          aVal = a.afr;
          bVal = b.afr;
          break;
        case 'severity':
          aVal = a.severity;
          bVal = b.severity;
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
    
    // Populate table
    sortedEvents.forEach(event => {
      const row = document.createElement('tr');
      // Store event data for click handler
      row.dataset.eventTime = event.time;
      row.dataset.eventDuration = event.duration || 0;
      row.style.cursor = 'pointer';
      row.title = 'Click to zoom to this event';
      
      // Display time with duration for grouped events (FR7)
      const timeDisplay = event.duration && event.duration > 0 
        ? `${event.time.toFixed(2)} (${event.duration.toFixed(3)}s)`
        : event.time.toFixed(2);
      row.innerHTML = `
        <td>${timeDisplay}</td>
        <td>${Math.abs(event.knockRetard).toFixed(2)}</td>
        <td>${Math.round(event.rpm)}</td>
        <td>${event.throttle.toFixed(1)}</td>
        <td>${event.load.toFixed(2)}</td>
        <td>${event.afr.toFixed(3)}</td>
        <td><span class="severity-badge severity-${event.severity}">${event.severity}</span></td>
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
      
      this.elements.anomalyTableBody.appendChild(row);
    });
  },

  handleSort(column) {
    const columnMap = {
      'time': 'time',
      'knockRetard': 'knockRetard',
      'rpm': 'rpm',
      'throttle': 'throttle',
      'load': 'load',
      'afr': 'afr',
      'severity': 'severity'
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
    document.querySelectorAll('#knock-anomalyTable th').forEach(th => {
      // Remove all arrow indicators (may be multiple if bug occurred)
      th.textContent = th.textContent.replace(/ ↑+| ↓+/g, '');
      if (th.dataset.sort === column) {
        th.textContent += this.currentSort.direction === 'asc' ? ' ↑' : ' ↓';
      }
    });
    
    this.updateTable();
  },

  /**
   * Render the base spark table coverage heatmap
   * Shows data points binned by the tune file's base_spark_mt table axes (RPM x Load)
   * Highlights knock events in bright red
   */
  renderHeatmap() {
    const container = this.elements.heatmap;
    if (!container) return;

    container.innerHTML = '';

    // Check if tune file is loaded
    if (!window.tuneFileParser || !window.tuneFileParser.isLoaded()) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'Load a tune file to see spark table coverage.';
      container.appendChild(empty);
      return;
    }

    // Check if data processor is available
    if (!window.dataProcessor) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'Load log data to see spark table coverage.';
      container.appendChild(empty);
      return;
    }

    const data = window.dataProcessor.getData();
    if (!data || data.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No log data available. Load a log file to see spark table coverage.';
      container.appendChild(empty);
      return;
    }

    // Get base spark table axes from tune file
    const rpmAxis = window.tuneFileParser.getArray('base_spark_rpm_index');
    const loadAxis = window.tuneFileParser.getArray('base_spark_map_index');

    if (!rpmAxis || !loadAxis || rpmAxis.length === 0 || loadAxis.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'Tune file is missing base spark table axes.';
      container.appendChild(empty);
      return;
    }

    // Get knock events
    const knockDetector = tabManager.getTabAnalyzer('knock');
    const knockEvents = knockDetector ? knockDetector.getKnockEvents() : [];

    // Compute hit counts and knock event bins
    const result = this.computeHeatmapHitCounts(data, rpmAxis, loadAxis, knockEvents);
    if (!result) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'Unable to compute heatmap data. Check log file has RPM and Load columns.';
      container.appendChild(empty);
      return;
    }

    const { hitCounts, knockEventBins } = result;

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

    // Create header row with Load axis values
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    // Corner cell (RPM \ Load label)
    const cornerTh = document.createElement('th');
    cornerTh.className = 'corner-header';
    cornerTh.textContent = 'RPM \\ Load';
    cornerTh.title = 'Rows: RPM (rpm), Columns: Load (g/rev)';
    headerRow.appendChild(cornerTh);

    // Load axis headers (columns)
    loadAxis.forEach(load => {
      const th = document.createElement('th');
      th.textContent = load.toFixed(2);
      th.title = `Load: ${load.toFixed(3)} g/rev`;
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
      loadAxis.forEach((load, loadIdx) => {
        const td = document.createElement('td');
        const hits = hitCounts[rpmIdx][loadIdx];
        const hasKnock = knockEventBins[rpmIdx][loadIdx] > 0;
        
        td.textContent = hits > 0 ? hits.toLocaleString() : '';
        
        // Build tooltip
        let tooltip = `RPM: ${rpm.toFixed(0)}, Load: ${load.toFixed(3)} g/rev\nData hits: ${hits.toLocaleString()}`;
        if (hasKnock) {
          tooltip += `\nKnock events: ${knockEventBins[rpmIdx][loadIdx]}`;
        }
        td.title = tooltip;
        
        // Apply color class - bright red for knock events, otherwise use normal heatmap colors
        if (hasKnock) {
          td.className = 'heatmap-cell-knock';
        } else {
          const colorClass = this.getHeatmapColorClass(hits, maxHits);
          td.className = colorClass;
        }
        
        tr.appendChild(td);
      });
      
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);

    // Add stats summary
    const stats = document.createElement('div');
    stats.className = 'heatmap-stats';
    const totalCells = rpmAxis.length * loadAxis.length;
    const coveragePercent = ((cellsWithData / totalCells) * 100).toFixed(1);
    const cellsWithKnock = knockEventBins.reduce((sum, row) => 
      sum + row.reduce((rowSum, count) => rowSum + (count > 0 ? 1 : 0), 0), 0
    );
    stats.innerHTML = `
      <span><strong>Total Data Points:</strong> ${totalHits.toLocaleString()}</span>
      <span><strong>Cells with Data:</strong> ${cellsWithData} / ${totalCells} (${coveragePercent}%)</span>
      <span><strong>Max Hits per Cell:</strong> ${maxHits.toLocaleString()}</span>
      <span><strong>Cells with Knock Events:</strong> ${cellsWithKnock}</span>
    `;
    container.appendChild(stats);
  },

  /**
   * Compute hit counts for heatmap by binning data into RPM x Load cells
   * Also tracks which cells contain knock events
   * @param {Array} data - Log data rows
   * @param {Array} rpmAxis - RPM axis breakpoints from tune file
   * @param {Array} loadAxis - Load axis breakpoints from tune file
   * @param {Array} knockEvents - Array of knock event objects with rpm and load properties
   * @returns {Object|null} - Object with hitCounts and knockEventBins arrays, or null if error
   */
  computeHeatmapHitCounts(data, rpmAxis, loadAxis, knockEvents) {
    // Initialize hit count matrix
    const hitCounts = Array.from({ length: rpmAxis.length }, () => 
      Array.from({ length: loadAxis.length }, () => 0)
    );
    
    // Initialize knock event bin matrix
    const knockEventBins = Array.from({ length: rpmAxis.length }, () => 
      Array.from({ length: loadAxis.length }, () => 0)
    );

    // Get column names
    const rpmColumn = 'Engine Speed (rpm)';
    const loadColumn = 'Load (MAF) (g/rev)';

    // Check if required columns exist
    const columns = window.dataProcessor.getColumns();
    if (!columns.includes(rpmColumn) || !columns.includes(loadColumn)) {
      console.warn('Missing required columns for knock heatmap:', { rpmColumn, loadColumn });
      return null;
    }

    // Process each row
    data.forEach(row => {
      const rpm = parseFloat(row[rpmColumn]);
      const load = parseFloat(row[loadColumn]);

      // Skip invalid data
      if (!isFinite(rpm) || !isFinite(load)) {
        return;
      }

      // Find RPM index (bin to nearest lower breakpoint)
      const rpmIdx = this.findAxisIndex(rpm, rpmAxis);
      // Find Load index (bin to nearest lower breakpoint)
      const loadIdx = this.findAxisIndex(load, loadAxis);

      if (rpmIdx !== null && loadIdx !== null) {
        hitCounts[rpmIdx][loadIdx] += 1;
      }
    });

    // Process knock events - bin them into the same grid
    knockEvents.forEach(event => {
      if (!isFinite(event.rpm) || !isFinite(event.load)) {
        return;
      }

      const rpmIdx = this.findAxisIndex(event.rpm, rpmAxis);
      const loadIdx = this.findAxisIndex(event.load, loadAxis);

      if (rpmIdx !== null && loadIdx !== null) {
        knockEventBins[rpmIdx][loadIdx] += 1;
      }
    });

    return { hitCounts, knockEventBins };
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

