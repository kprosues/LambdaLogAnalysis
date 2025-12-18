// AppState - Singleton state management
// Replaces global variables with a proper state container

(function() {
  'use strict';

  class AppState {
    constructor() {
      // Data state
      this._dataProcessor = null;
      this._tuneFileParser = null;
      this._tabManager = null;
      
      // Analyzers
      this._analyzers = new Map();
      
      // UI state
      this._globalTimeRange = {
        min: null,
        max: null,
        originalMin: null,
        originalMax: null,
        isZoomed: false
      };
      
      // Smoothing configuration
      this._smoothingConfig = {
        enabled: true,
        windowSize: 5
      };
      
      // Cached column arrays (shared across tabs)
      this._cachedColumns = new Map();
      
      // Event listeners
      this._listeners = new Map();
      
      // Initialize from config
      this._initFromConfig();
    }

    /**
     * Initialize state from config
     */
    _initFromConfig() {
      const config = window.Config;
      if (config) {
        if (config.smoothing) {
          this._smoothingConfig.enabled = config.smoothing.defaultEnabled ?? true;
          this._smoothingConfig.windowSize = config.smoothing.defaultWindowSize ?? 5;
        }
      }
    }

    // ============================================
    // Data Processor
    // ============================================
    
    get dataProcessor() {
      return this._dataProcessor;
    }
    
    set dataProcessor(value) {
      this._dataProcessor = value;
      // Clear cached columns when data changes
      this._cachedColumns.clear();
      // Update ColumnMapper if data is loaded
      if (value && value.getColumns) {
        const columns = value.getColumns();
        if (window.ColumnMapper) {
          window.ColumnMapper.initialize(columns);
        }
      }
      this._emit('dataProcessorChanged', value);
    }

    // ============================================
    // Tune File Parser
    // ============================================
    
    get tuneFileParser() {
      return this._tuneFileParser;
    }
    
    set tuneFileParser(value) {
      this._tuneFileParser = value;
      this._emit('tuneFileParserChanged', value);
    }

    // ============================================
    // Tab Manager
    // ============================================
    
    get tabManager() {
      return this._tabManager;
    }
    
    set tabManager(value) {
      this._tabManager = value;
    }

    // ============================================
    // Analyzers
    // ============================================
    
    setAnalyzer(name, analyzer) {
      this._analyzers.set(name, analyzer);
    }
    
    getAnalyzer(name) {
      return this._analyzers.get(name) || null;
    }
    
    getAllAnalyzers() {
      return this._analyzers;
    }

    // ============================================
    // Time Range
    // ============================================
    
    get globalTimeRange() {
      return { ...this._globalTimeRange };
    }
    
    setGlobalTimeRange(min, max, originalMin, originalMax, isZoomed) {
      this._globalTimeRange.min = min;
      this._globalTimeRange.max = max;
      this._globalTimeRange.originalMin = originalMin;
      this._globalTimeRange.originalMax = originalMax;
      this._globalTimeRange.isZoomed = isZoomed;
      this._emit('timeRangeChanged', this._globalTimeRange);
    }
    
    resetTimeRange() {
      this._globalTimeRange = {
        min: null,
        max: null,
        originalMin: null,
        originalMax: null,
        isZoomed: false
      };
      this._emit('timeRangeChanged', this._globalTimeRange);
    }
    
    isZoomed() {
      return this._globalTimeRange.isZoomed;
    }

    // ============================================
    // Smoothing Config
    // ============================================
    
    get smoothingConfig() {
      return { ...this._smoothingConfig };
    }
    
    setSmoothingEnabled(enabled) {
      this._smoothingConfig.enabled = enabled;
      this._emit('smoothingChanged', this._smoothingConfig);
    }
    
    setSmoothingWindowSize(size) {
      this._smoothingConfig.windowSize = size;
      this._emit('smoothingChanged', this._smoothingConfig);
    }

    // ============================================
    // Cached Column Data
    // ============================================
    
    /**
     * Get cached column data or compute and cache it
     * @param {string} columnKey - Column key (e.g., 'time', 'rpm')
     * @param {Function} computeFn - Function to compute data if not cached
     * @returns {number[]} - Column data array
     */
    getCachedColumn(columnKey, computeFn) {
      if (this._cachedColumns.has(columnKey)) {
        return this._cachedColumns.get(columnKey);
      }
      
      if (computeFn) {
        const data = computeFn();
        this._cachedColumns.set(columnKey, data);
        return data;
      }
      
      return [];
    }
    
    /**
     * Get common column data with caching
     * @param {string} columnKey - Column key
     * @returns {number[]} - Column data array
     */
    getColumnData(columnKey) {
      return this.getCachedColumn(columnKey, () => {
        if (!this._dataProcessor || !window.ColumnMapper) {
          return [];
        }
        const data = this._dataProcessor.getData();
        return window.ColumnMapper.getColumnArray(data, columnKey);
      });
    }
    
    /**
     * Get time data (frequently used)
     * @returns {number[]}
     */
    getTimeData() {
      return this.getColumnData('time');
    }
    
    /**
     * Clear all cached columns
     */
    clearColumnCache() {
      this._cachedColumns.clear();
      if (window.ColumnMapper) {
        window.ColumnMapper.clearCache();
      }
    }

    // ============================================
    // Event System
    // ============================================
    
    /**
     * Subscribe to state changes
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     * @returns {Function} - Unsubscribe function
     */
    on(event, callback) {
      if (!this._listeners.has(event)) {
        this._listeners.set(event, []);
      }
      this._listeners.get(event).push(callback);
      
      // Return unsubscribe function
      return () => {
        const callbacks = this._listeners.get(event);
        if (callbacks) {
          const index = callbacks.indexOf(callback);
          if (index > -1) {
            callbacks.splice(index, 1);
          }
        }
      };
    }
    
    /**
     * Emit event
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    _emit(event, data) {
      const callbacks = this._listeners.get(event);
      if (callbacks) {
        callbacks.forEach(callback => {
          try {
            callback(data);
          } catch (e) {
            console.error(`Error in AppState event listener for ${event}:`, e);
          }
        });
      }
    }

    // ============================================
    // Utility Methods
    // ============================================
    
    /**
     * Check if data is loaded
     * @returns {boolean}
     */
    hasData() {
      return this._dataProcessor !== null && 
             this._dataProcessor.getData && 
             this._dataProcessor.getData().length > 0;
    }
    
    /**
     * Check if tune file is loaded
     * @returns {boolean}
     */
    hasTuneFile() {
      return this._tuneFileParser !== null && 
             this._tuneFileParser.isLoaded && 
             this._tuneFileParser.isLoaded();
    }
    
    /**
     * Get data row count
     * @returns {number}
     */
    getDataRowCount() {
      if (!this._dataProcessor || !this._dataProcessor.getData) {
        return 0;
      }
      const data = this._dataProcessor.getData();
      return data ? data.length : 0;
    }
    
    /**
     * Get time range from data
     * @returns {Object} - { min, max }
     */
    getDataTimeRange() {
      if (!this._dataProcessor || !this._dataProcessor.getTimeRange) {
        return { min: 0, max: 0 };
      }
      return this._dataProcessor.getTimeRange();
    }

    /**
     * Reset all state
     */
    reset() {
      this._dataProcessor = null;
      this._analyzers.clear();
      this._cachedColumns.clear();
      this.resetTimeRange();
      
      if (window.ColumnMapper) {
        window.ColumnMapper.reset();
      }
      
      this._emit('stateReset');
    }
  }

  // Create singleton instance
  const appState = new AppState();

  // Export to window
  window.AppState = appState;

  // Backward compatibility - expose commonly accessed properties
  // These will be deprecated in future versions
  Object.defineProperty(window, 'dataProcessor', {
    get() { return appState.dataProcessor; },
    set(value) { appState.dataProcessor = value; }
  });

  Object.defineProperty(window, 'tuneFileParser', {
    get() { return appState.tuneFileParser; },
    set(value) { appState.tuneFileParser = value; }
  });

  Object.defineProperty(window, 'globalTimeRange', {
    get() { return appState.globalTimeRange; },
    set(value) {
      if (value) {
        appState.setGlobalTimeRange(
          value.min, value.max, 
          value.originalMin, value.originalMax,
          value.isZoomed
        );
      }
    }
  });

  Object.defineProperty(window, 'smoothingConfig', {
    get() { return appState.smoothingConfig; },
    set(value) {
      if (value) {
        if (value.enabled !== undefined) {
          appState.setSmoothingEnabled(value.enabled);
        }
        if (value.windowSize !== undefined) {
          appState.setSmoothingWindowSize(value.windowSize);
        }
      }
    }
  });

  // Expose applyDataSmoothing function using AnalyzerUtils
  window.applyDataSmoothing = function(dataArray, windowSize, enabled) {
    if (window.AnalyzerUtils) {
      return window.AnalyzerUtils.applySmoothing(dataArray, windowSize, enabled);
    }
    // Fallback if AnalyzerUtils not loaded yet
    if (!enabled || windowSize <= 1) return dataArray;
    
    const smoothed = new Array(dataArray.length);
    const halfWindow = Math.floor(windowSize / 2);
    
    for (let i = 0; i < dataArray.length; i++) {
      if (isNaN(dataArray[i])) {
        smoothed[i] = NaN;
        continue;
      }
      let sum = 0, count = 0;
      for (let j = Math.max(0, i - halfWindow); j <= Math.min(dataArray.length - 1, i + halfWindow); j++) {
        if (!isNaN(dataArray[j])) {
          sum += dataArray[j];
          count++;
        }
      }
      smoothed[i] = count > 0 ? sum / count : dataArray[i];
    }
    return smoothed;
  };
})();

