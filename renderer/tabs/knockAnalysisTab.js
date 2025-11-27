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
    afrChart: null
  },

  charts: {},
  chartOriginalRanges: {},
  currentSort: { column: null, direction: 'asc' },

  initialize() {
    // Get DOM elements for this tab
    this.elements.totalKnockEvents = document.getElementById('knock-totalKnockEvents');
    this.elements.maxKnockRetard = document.getElementById('knock-maxKnockRetard');
    this.elements.timeWithKnock = document.getElementById('knock-timeWithKnock');
    this.elements.severeEvents = document.getElementById('knock-severeEvents');
    this.elements.anomalyTableBody = document.getElementById('knock-anomalyTableBody');
    this.elements.searchInput = document.getElementById('knock-searchInput');
    this.elements.severityFilter = document.getElementById('knock-severityFilter');

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
    
    // Clear table
    this.elements.anomalyTableBody.innerHTML = '';
    
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
      
      // Add click handler to zoom to event
      row.addEventListener('click', () => {
        const eventTime = parseFloat(row.dataset.eventTime);
        const eventDuration = parseFloat(row.dataset.eventDuration);
        if (typeof zoomChartsToEvent === 'function') {
          zoomChartsToEvent(eventTime, eventDuration, 3);
        }
      });
      
      // Add hover effect
      row.addEventListener('mouseenter', () => {
        row.style.backgroundColor = '#e8f4f8';
      });
      row.addEventListener('mouseleave', () => {
        row.style.backgroundColor = '';
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
  }
};

