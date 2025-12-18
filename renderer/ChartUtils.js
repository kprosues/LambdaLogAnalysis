// Shared chart configuration and utilities
// Eliminates duplicate chart options across tab modules

(function() {
  'use strict';

  const ChartUtils = {
    // Cache for chart instances by tab
    chartCache: new Map(),

    /**
     * Create standard chart options with zoom support
     * @param {Object} overrides - Override specific options
     * @returns {Object} - Chart.js options object
     */
    createChartOptions(overrides = {}) {
      const config = window.Config || {};
      const colors = config.colors || {};
      
      const baseOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false, // Disable animations for performance
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              boxWidth: 12,
              padding: 10,
              font: {
                size: 11
              }
            }
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
                backgroundColor: colors.zoomSelection || 'rgba(0, 0, 0, 0.1)',
                borderColor: colors.zoomBorder || 'rgba(0, 0, 0, 0.3)',
                borderWidth: 1
              },
              mode: 'x',
              onZoomComplete: (ctx) => {
                if (typeof synchronizeChartZoom === 'function') {
                  synchronizeChartZoom(ctx.chart);
                }
              }
            },
            pan: {
              enabled: true,
              mode: 'x',
              modifierKey: 'shift',
              onPanComplete: (ctx) => {
                if (typeof synchronizeChartZoom === 'function') {
                  synchronizeChartZoom(ctx.chart);
                }
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
          },
          y: {
            title: {
              display: true
            }
          }
        },
        interaction: {
          mode: 'index',
          intersect: false
        },
        elements: {
          point: {
            radius: 0,
            hoverRadius: 4
          },
          line: {
            tension: 0,
            borderWidth: 2
          }
        }
      };

      // Deep merge overrides
      return this.deepMerge(baseOptions, overrides);
    },

    /**
     * Deep merge two objects
     * @param {Object} target - Target object
     * @param {Object} source - Source object
     * @returns {Object} - Merged object
     */
    deepMerge(target, source) {
      const output = { ...target };
      
      if (this.isObject(target) && this.isObject(source)) {
        Object.keys(source).forEach(key => {
          if (this.isObject(source[key])) {
            if (!(key in target)) {
              Object.assign(output, { [key]: source[key] });
            } else {
              output[key] = this.deepMerge(target[key], source[key]);
            }
          } else {
            Object.assign(output, { [key]: source[key] });
          }
        });
      }
      
      return output;
    },

    /**
     * Check if value is a plain object
     * @param {*} item - Value to check
     * @returns {boolean}
     */
    isObject(item) {
      return item && typeof item === 'object' && !Array.isArray(item);
    },

    /**
     * Create a standard line dataset
     * @param {Object} config - Dataset configuration
     * @returns {Object} - Chart.js dataset object
     */
    createLineDataset(config) {
      const colors = (window.Config || {}).colors || {};
      
      return {
        label: config.label || 'Data',
        data: config.data || [],
        borderColor: config.color || colors.primary || 'rgb(0, 123, 255)',
        backgroundColor: config.backgroundColor || this.addAlpha(config.color || colors.primary, 0.1),
        borderWidth: config.borderWidth || 2,
        pointRadius: config.pointRadius || 0,
        pointHoverRadius: config.hoverRadius || 4,
        fill: config.fill !== undefined ? config.fill : false,
        tension: config.tension || 0,
        yAxisID: config.yAxisID || 'y',
        hidden: config.hidden || false
      };
    },

    /**
     * Create a scatter/event marker dataset
     * @param {Object} config - Dataset configuration
     * @returns {Object} - Chart.js dataset object
     */
    createEventDataset(config) {
      const colors = (window.Config || {}).colors || {};
      
      return {
        label: config.label || 'Events',
        data: config.data || [],
        borderColor: config.color || colors.danger || 'rgb(220, 53, 69)',
        backgroundColor: config.backgroundColor || this.addAlpha(config.color || colors.danger, 0.6),
        borderWidth: config.borderWidth || 0,
        pointRadius: config.pointRadius || 5,
        pointHoverRadius: config.hoverRadius || 7,
        showLine: false,
        spanGaps: false,
        yAxisID: config.yAxisID || 'y'
      };
    },

    /**
     * Add alpha channel to color
     * @param {string} color - RGB color string
     * @param {number} alpha - Alpha value (0-1)
     * @returns {string} - RGBA color string
     */
    addAlpha(color, alpha) {
      if (!color) return `rgba(0, 0, 0, ${alpha})`;
      
      // Handle rgb format
      if (color.startsWith('rgb(')) {
        return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
      }
      // Handle rgba format - update alpha
      if (color.startsWith('rgba(')) {
        return color.replace(/,\s*[\d.]+\)$/, `, ${alpha})`);
      }
      // Handle hex format
      if (color.startsWith('#')) {
        const hex = color.slice(1);
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
      return color;
    },

    /**
     * Create event point array from events (sparse array with NaN for non-events)
     * @param {Object[]} events - Array of event objects
     * @param {number[]} times - Array of time values
     * @param {Function} valueExtractor - Function to extract value from event
     * @returns {number[]} - Sparse array with values at event positions
     */
    createEventPointArray(events, times, valueExtractor) {
      const pointArray = new Array(times.length).fill(NaN);
      
      events.forEach(event => {
        // Binary search for closest time index
        const closestIdx = this.findClosestTimeIndex(times, event.time);
        if (closestIdx >= 0) {
          const value = valueExtractor(event);
          pointArray[closestIdx] = typeof value === 'number' ? value : NaN;
        }
      });
      
      return pointArray;
    },

    /**
     * Find closest time index using binary search
     * @param {number[]} times - Array of time values (sorted)
     * @param {number} targetTime - Target time to find
     * @returns {number} - Index of closest match
     */
    findClosestTimeIndex(times, targetTime) {
      if (!times || times.length === 0) return -1;

      let left = 0;
      let right = times.length - 1;

      while (left < right) {
        const mid = Math.floor((left + right) / 2);
        if (times[mid] < targetTime) {
          left = mid + 1;
        } else {
          right = mid;
        }
      }

      // Check if left-1 is closer
      if (left > 0) {
        const diffLeft = Math.abs(times[left] - targetTime);
        const diffPrev = Math.abs(times[left - 1] - targetTime);
        if (diffPrev < diffLeft) {
          return left - 1;
        }
      }

      return left;
    },

    /**
     * Destroy chart and clean up
     * @param {Chart} chart - Chart instance
     */
    destroyChart(chart) {
      if (chart) {
        try {
          chart.destroy();
        } catch (e) {
          console.warn('Error destroying chart:', e);
        }
      }
    },

    /**
     * Safely destroy all charts in an object
     * @param {Object} charts - Object containing chart instances
     */
    destroyAllCharts(charts) {
      if (!charts) return;
      
      Object.keys(charts).forEach(key => {
        this.destroyChart(charts[key]);
        charts[key] = null;
      });
    },

    /**
     * Store original range for a chart
     * @param {Object} rangeStore - Object to store ranges in
     * @param {string} chartKey - Key for the chart
     * @param {number[]} times - Array of time values
     */
    storeOriginalRange(rangeStore, chartKey, times) {
      if (times && times.length > 0) {
        rangeStore[chartKey] = {
          min: parseFloat(times[0]),
          max: parseFloat(times[times.length - 1])
        };
      }
    },

    /**
     * Batch update multiple charts (minimizes reflows)
     * @param {Chart[]} charts - Array of chart instances
     * @param {string} mode - Update mode ('none', 'resize', 'reset', etc.)
     */
    batchUpdateCharts(charts, mode = 'none') {
      if (!charts || !Array.isArray(charts)) return;
      
      requestAnimationFrame(() => {
        charts.forEach(chart => {
          if (chart) {
            try {
              chart.update(mode);
            } catch (e) {
              console.warn('Error updating chart:', e);
            }
          }
        });
      });
    },

    /**
     * Extract column data from dataset with optional smoothing
     * @param {Object[]} data - Data array
     * @param {string} columnName - Column name
     * @param {boolean} smooth - Whether to apply smoothing
     * @returns {number[]} - Array of values
     */
    extractColumnData(data, columnName, smooth = false) {
      if (!data || !columnName) return [];
      
      const values = data.map(row => {
        const val = row[columnName];
        return typeof val === 'number' ? val : (parseFloat(val) || 0);
      });
      
      if (smooth && window.smoothingConfig && window.smoothingConfig.enabled) {
        return window.AnalyzerUtils 
          ? window.AnalyzerUtils.applySmoothing(values, window.smoothingConfig.windowSize, true)
          : values;
      }
      
      return values;
    },

    /**
     * Create a dual-axis Y scale configuration
     * @param {Object} leftConfig - Left Y axis config { title, min, max }
     * @param {Object} rightConfig - Right Y axis config { title, min, max }
     * @returns {Object} - Scales configuration
     */
    createDualYAxis(leftConfig, rightConfig) {
      return {
        y: {
          type: 'linear',
          position: 'left',
          title: {
            display: true,
            text: leftConfig.title || 'Value'
          },
          min: leftConfig.min,
          max: leftConfig.max
        },
        y1: {
          type: 'linear',
          position: 'right',
          title: {
            display: true,
            text: rightConfig.title || 'Value'
          },
          min: rightConfig.min,
          max: rightConfig.max,
          grid: {
            drawOnChartArea: false
          }
        }
      };
    },

    /**
     * Create threshold line annotation (for reference lines)
     * @param {number} value - Y value for the line
     * @param {string} label - Label text
     * @param {string} color - Line color
     * @returns {Object} - Chart.js annotation config
     */
    createThresholdLine(value, label, color = 'rgba(255, 0, 0, 0.5)') {
      return {
        type: 'line',
        yMin: value,
        yMax: value,
        borderColor: color,
        borderWidth: 2,
        borderDash: [5, 5],
        label: {
          content: label,
          enabled: true,
          position: 'end'
        }
      };
    },

    /**
     * Get standard color palette
     * @returns {string[]} - Array of colors
     */
    getColorPalette() {
      return [
        'rgb(0, 123, 255)',    // Primary blue
        'rgb(40, 167, 69)',    // Success green
        'rgb(255, 193, 7)',    // Warning yellow
        'rgb(220, 53, 69)',    // Danger red
        'rgb(23, 162, 184)',   // Info cyan
        'rgb(102, 16, 242)',   // Purple
        'rgb(253, 126, 20)',   // Orange
        'rgb(32, 201, 151)',   // Teal
        'rgb(111, 66, 193)',   // Violet
        'rgb(214, 51, 132)'    // Pink
      ];
    },

    /**
     * Get color by index (wraps around palette)
     * @param {number} index - Color index
     * @returns {string} - Color string
     */
    getColorByIndex(index) {
      const palette = this.getColorPalette();
      return palette[index % palette.length];
    }
  };

  // Export to window
  window.ChartUtils = ChartUtils;
})();

