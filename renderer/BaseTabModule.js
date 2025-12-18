// BaseTabModule - Base class with shared functionality for all tab modules
// Reduces code duplication across tab modules

(function() {
  'use strict';

  /**
   * Base class for tab modules
   * Provides common functionality for charts, tables, and event handling
   */
  class BaseTabModule {
    /**
     * Create a new tab module
     * @param {string} tabId - Unique tab identifier
     * @param {Object} options - Configuration options
     */
    constructor(tabId, options = {}) {
      this.tabId = tabId;
      this.options = options;
      
      // DOM element references
      this.elements = {};
      
      // Chart instances
      this.charts = {};
      this.chartOriginalRanges = {};
      
      // Table state
      this.currentSort = { column: null, direction: 'asc' };
      this.selectedRow = null;
      
      // Cached data
      this._cachedAnalysis = null;
    }

    /**
     * Initialize the tab module - override in subclass
     */
    initialize() {
      // Subclasses should override this
      this._setupTableSorting();
    }

    /**
     * Render the tab with analysis data - override in subclass
     * @param {Object} analysisData - Analysis data from analyzer
     */
    render(analysisData) {
      this._cachedAnalysis = analysisData;
      // Subclasses should implement specific rendering
    }

    /**
     * Update statistics display - override in subclass
     */
    updateStatistics() {
      // Subclasses should implement specific statistics
    }

    /**
     * Render charts - override in subclass
     * @param {boolean} preserveZoom - Whether to preserve current zoom level
     */
    renderCharts(preserveZoom = false) {
      // Subclasses should implement specific chart rendering
    }

    /**
     * Update table display - override in subclass
     */
    updateTable() {
      // Subclasses should implement specific table updates
    }

    // ============================================
    // Shared Element Management
    // ============================================

    /**
     * Get element by ID with prefix
     * @param {string} suffix - Element ID suffix
     * @returns {HTMLElement|null}
     */
    getElement(suffix) {
      const id = `${this.tabId}-${suffix}`;
      return document.getElementById(id);
    }

    /**
     * Initialize element references
     * @param {string[]} suffixes - Array of element ID suffixes
     */
    initElements(suffixes) {
      suffixes.forEach(suffix => {
        this.elements[suffix] = this.getElement(suffix);
      });
    }

    /**
     * Set text content of an element
     * @param {string} suffix - Element ID suffix
     * @param {string} text - Text content
     */
    setText(suffix, text) {
      const el = this.elements[suffix] || this.getElement(suffix);
      if (el) {
        el.textContent = text;
      }
    }

    /**
     * Set HTML content of an element
     * @param {string} suffix - Element ID suffix
     * @param {string} html - HTML content
     */
    setHtml(suffix, html) {
      const el = this.elements[suffix] || this.getElement(suffix);
      if (el) {
        el.innerHTML = html;
      }
    }

    // ============================================
    // Shared Chart Methods
    // ============================================

    /**
     * Create a chart with standard options
     * @param {string} canvasId - Canvas element ID (without tab prefix)
     * @param {string} chartKey - Key for storing chart reference
     * @param {Object} chartConfig - Chart.js configuration
     * @returns {Chart|null} - Created chart or null
     */
    createChart(canvasId, chartKey, chartConfig) {
      // Destroy existing chart
      if (this.charts[chartKey]) {
        this.charts[chartKey].destroy();
      }

      const canvas = this.getElement(canvasId);
      if (!canvas) {
        console.warn(`Canvas not found: ${this.tabId}-${canvasId}`);
        return null;
      }

      // Merge with default options
      const options = window.ChartUtils 
        ? window.ChartUtils.createChartOptions(chartConfig.options || {})
        : chartConfig.options || {};

      const chart = new Chart(canvas, {
        ...chartConfig,
        options
      });

      this.charts[chartKey] = chart;
      return chart;
    }

    /**
     * Store original time range for a chart
     * @param {string} chartKey - Chart key
     * @param {number[]} times - Time array
     */
    storeChartRange(chartKey, times) {
      if (times && times.length > 0) {
        this.chartOriginalRanges[chartKey] = {
          min: parseFloat(times[0]),
          max: parseFloat(times[times.length - 1])
        };
      }
    }

    /**
     * Destroy all charts
     */
    destroyAllCharts() {
      Object.keys(this.charts).forEach(key => {
        if (this.charts[key]) {
          try {
            this.charts[key].destroy();
          } catch (e) {
            console.warn('Error destroying chart:', e);
          }
          this.charts[key] = null;
        }
      });
    }

    /**
     * Check if charts exist
     * @returns {boolean}
     */
    hasCharts() {
      return Object.keys(this.charts).some(key => this.charts[key] !== null);
    }

    /**
     * Get common chart data arrays
     * @returns {Object} - { times, rpm, throttle, load, afr }
     */
    getCommonChartData() {
      const dataProcessor = window.dataProcessor || window.AppState?.dataProcessor;
      if (!dataProcessor) return null;

      const data = dataProcessor.getData();
      if (!data || data.length === 0) return null;

      // Use cached column arrays from DataProcessor
      return {
        data,
        times: dataProcessor.getColumnArray('Time (s)'),
        rpm: dataProcessor.getColumnArray('Engine Speed (rpm)'),
        throttle: dataProcessor.getColumnArray('Throttle Position (%)'),
        load: dataProcessor.getColumnArray('Load (MAF) (g/rev)'),
        afr: dataProcessor.getColumnArray('Air/Fuel Sensor #1 (λ)')
      };
    }

    /**
     * Apply smoothing to data array
     * @param {number[]} dataArray - Data array
     * @returns {number[]} - Smoothed array
     */
    applySmoothing(dataArray) {
      const config = window.smoothingConfig || window.AppState?.smoothingConfig;
      if (!config || !config.enabled || config.windowSize <= 1) {
        return dataArray;
      }

      if (window.AnalyzerUtils) {
        return window.AnalyzerUtils.applySmoothing(dataArray, config.windowSize, true);
      }

      // Fallback
      if (window.applyDataSmoothing) {
        return window.applyDataSmoothing(dataArray, config.windowSize, true);
      }

      return dataArray;
    }

    /**
     * Create event point array for chart
     * @param {Object[]} events - Array of events
     * @param {number[]} times - Time array
     * @param {Function} valueExtractor - Function to extract value from event
     * @returns {number[]} - Sparse array with event values
     */
    createEventPoints(events, times, valueExtractor) {
      if (window.ChartUtils) {
        return window.ChartUtils.createEventPointArray(events, times, valueExtractor);
      }

      // Fallback implementation
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
    }

    // ============================================
    // Shared Table Methods
    // ============================================

    /**
     * Setup table sorting
     * @param {string} tableId - Table element ID suffix
     */
    _setupTableSorting() {
      const table = this.getElement('anomalyTable') || 
                   this.getElement('Table') ||
                   document.querySelector(`[data-tab="${this.tabId}"] table`);
      
      if (table) {
        table.querySelectorAll('th[data-sort]').forEach(th => {
          th.style.cursor = 'pointer';
          th.addEventListener('click', () => this.handleSort(th.dataset.sort));
        });
      }
    }

    /**
     * Handle table column sort
     * @param {string} column - Column to sort by
     */
    handleSort(column) {
      if (this.currentSort.column === column) {
        this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        this.currentSort.column = column;
        this.currentSort.direction = 'asc';
      }

      // Update sort indicators
      const tables = document.querySelectorAll(`[data-tab="${this.tabId}"] table`);
      tables.forEach(table => {
        table.querySelectorAll('th[data-sort]').forEach(th => {
          // Remove existing arrows
          th.textContent = th.textContent.replace(/ ↑+| ↓+/g, '');
          if (th.dataset.sort === column) {
            th.textContent += this.currentSort.direction === 'asc' ? ' ↑' : ' ↓';
          }
        });
      });

      // Trigger table update
      this.updateTable();
    }

    /**
     * Sort events array
     * @param {Object[]} events - Events to sort
     * @param {Object} sortConfig - { column, direction, columnMap }
     * @returns {Object[]} - Sorted events
     */
    sortEvents(events, sortConfig = null) {
      const sort = sortConfig || this.currentSort;
      if (!sort.column) return events;

      return [...events].sort((a, b) => {
        let aVal = a[sort.column];
        let bVal = b[sort.column];

        // Handle undefined values
        if (aVal === undefined) aVal = 0;
        if (bVal === undefined) bVal = 0;

        // Numeric comparison
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sort.direction === 'asc' ? aVal - bVal : bVal - aVal;
        }

        // String comparison
        const comparison = String(aVal).localeCompare(String(bVal));
        return sort.direction === 'asc' ? comparison : -comparison;
      });
    }

    /**
     * Create a table row element with event handling
     * @param {Object} event - Event data
     * @param {string[]} columns - Column keys to display
     * @param {Function} formatCell - Function to format cell value (key, value, event) => string
     * @returns {HTMLTableRowElement}
     */
    createEventRow(event, columns, formatCell) {
      const row = document.createElement('tr');
      row.style.cursor = 'pointer';
      row.title = 'Click to zoom to this event';
      row.dataset.eventTime = event.time;
      row.dataset.eventDuration = event.duration || 0;

      // Create cells
      columns.forEach(key => {
        const cell = document.createElement('td');
        const value = event[key];
        cell.innerHTML = formatCell ? formatCell(key, value, event) : this._defaultFormatCell(key, value);
        row.appendChild(cell);
      });

      // Add click handler for zoom
      row.addEventListener('click', () => {
        this._handleRowClick(row, event);
      });

      // Add hover effects
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

      return row;
    }

    /**
     * Handle row click
     * @private
     */
    _handleRowClick(row, event) {
      // Remove highlight from previously selected row
      if (this.selectedRow && this.selectedRow !== row) {
        this.selectedRow.style.backgroundColor = '';
      }

      // Highlight clicked row
      row.style.backgroundColor = '#b3d9ff';
      this.selectedRow = row;

      // Zoom to event
      const eventTime = parseFloat(row.dataset.eventTime);
      const eventDuration = parseFloat(row.dataset.eventDuration);
      if (typeof window.zoomChartsToEvent === 'function') {
        window.zoomChartsToEvent(eventTime, eventDuration, 3);
      }
    }

    /**
     * Default cell formatting
     * @private
     */
    _defaultFormatCell(key, value) {
      if (typeof value === 'number') {
        // Format based on key
        if (key.includes('time') || key === 'time') {
          return value.toFixed(2);
        }
        if (key.includes('rpm') || key === 'rpm') {
          return Math.round(value).toLocaleString();
        }
        if (key.includes('percent') || key.includes('Percent') || key.includes('%')) {
          return value.toFixed(1) + '%';
        }
        return value.toFixed(2);
      }
      return value || '';
    }

    /**
     * Populate table body with events
     * @param {HTMLElement} tbody - Table body element
     * @param {Object[]} events - Events to display
     * @param {string[]} columns - Column keys
     * @param {Function} formatCell - Cell formatter function
     */
    populateTable(tbody, events, columns, formatCell) {
      if (!tbody) return;

      tbody.innerHTML = '';
      this.selectedRow = null;

      if (events.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="${columns.length}" style="text-align: center; padding: 20px; color: #666;">No events found.</td>`;
        tbody.appendChild(row);
        return;
      }

      // Use DocumentFragment for efficient DOM updates
      const fragment = document.createDocumentFragment();
      events.forEach(event => {
        const row = this.createEventRow(event, columns, formatCell);
        fragment.appendChild(row);
      });
      tbody.appendChild(fragment);
    }

    /**
     * Filter events based on search and filter values
     * @param {Object[]} events - Events to filter
     * @param {Object} filters - { search: string, [filterKey]: value }
     * @param {string[]} searchableFields - Fields to search in
     * @returns {Object[]} - Filtered events
     */
    filterEvents(events, filters, searchableFields) {
      let filtered = [...events];

      // Apply custom filters
      Object.entries(filters).forEach(([key, value]) => {
        if (key === 'search' || !value || value === 'all') return;

        filtered = filtered.filter(event => {
          const eventValue = event[key];
          if (Array.isArray(value)) {
            return value.includes(eventValue);
          }
          return eventValue === value;
        });
      });

      // Apply search filter
      if (filters.search && filters.search.trim()) {
        const term = filters.search.toLowerCase().trim();
        filtered = filtered.filter(event => {
          return searchableFields.some(field => {
            const val = event[field];
            if (val === undefined || val === null) return false;
            return String(val).toLowerCase().includes(term);
          });
        });
      }

      return filtered;
    }

    // ============================================
    // Shared Heatmap Methods
    // ============================================

    /**
     * Find axis index for value (bin to nearest lower breakpoint)
     * @param {number} value - Value to find index for
     * @param {number[]} axis - Axis breakpoints
     * @returns {number|null}
     */
    findAxisIndex(value, axis) {
      if (!Array.isArray(axis) || axis.length === 0 || !isFinite(value)) {
        return null;
      }

      if (value < axis[0]) return 0;
      if (value > axis[axis.length - 1]) return axis.length - 1;

      let insertIdx = axis.length;
      for (let i = 0; i < axis.length; i++) {
        if (axis[i] > value) {
          insertIdx = i;
          break;
        }
      }
      return Math.max(0, Math.min(insertIdx - 1, axis.length - 1));
    }

    /**
     * Get heatmap color class based on value
     * @param {number} value - Cell value
     * @param {number} maxValue - Maximum value
     * @returns {string} - CSS class name
     */
    getHeatmapColorClass(value, maxValue) {
      if (value === 0 || maxValue === 0) return 'heatmap-cell-0';

      // Logarithmic scaling
      const logValue = Math.log10(value + 1);
      const logMax = Math.log10(maxValue + 1);
      const ratio = logValue / logMax;

      const colorIndex = Math.min(9, Math.max(1, Math.ceil(ratio * 9)));
      return `heatmap-cell-${colorIndex}`;
    }

    // ============================================
    // Utility Methods
    // ============================================

    /**
     * Get analyzer from tab manager
     * @param {string} analyzerKey - Analyzer key (defaults to tabId)
     * @returns {Object|null}
     */
    getAnalyzer(analyzerKey = null) {
      const key = analyzerKey || this.tabId;
      const tabManager = window.tabManager || window.AppState?.tabManager;
      if (tabManager) {
        return tabManager.getTabAnalyzer(key);
      }
      return null;
    }

    /**
     * Get cached analysis from tab manager
     * @param {string} cacheKey - Cache key (defaults to tabId)
     * @returns {Object|null}
     */
    getCachedAnalysis(cacheKey = null) {
      const key = cacheKey || this.tabId;
      const tabManager = window.tabManager || window.AppState?.tabManager;
      if (tabManager) {
        return tabManager.getCachedAnalysis(key);
      }
      return this._cachedAnalysis;
    }

    /**
     * Create severity badge HTML
     * @param {string} severity - Severity level
     * @returns {string} - HTML string
     */
    createSeverityBadge(severity) {
      const severityClass = `severity-${severity || 'mild'}`;
      return `<span class="severity-badge ${severityClass}">${severity || 'unknown'}</span>`;
    }

    /**
     * Format time with optional duration
     * @param {number} time - Time in seconds
     * @param {number} duration - Duration in seconds (optional)
     * @returns {string}
     */
    formatTime(time, duration = 0) {
      const timeStr = time.toFixed(2);
      if (duration > 0) {
        return `${timeStr} (${duration.toFixed(3)}s)`;
      }
      return timeStr;
    }
  }

  // Export to window
  window.BaseTabModule = BaseTabModule;
})();

