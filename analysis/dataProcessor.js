// DataProcessor class for parsing and processing ECU log CSV files
// Optimized with chunk-based parsing and binary search

class DataProcessor {
  constructor() {
    this.data = null;
    this.columns = [];
    this._timeIndex = null; // Cached time values for binary search
    this._cachedColumns = new Map(); // Cache for frequently accessed columns
  }

  /**
   * Parse CSV content with optimized chunk-based processing
   * @param {string} csvContent - CSV content string
   * @param {Function} progressCallback - Optional progress callback (0-100)
   * @returns {Promise<Object>} - Parsed data result
   */
  parseCSV(csvContent, progressCallback) {
    return new Promise((resolve, reject) => {
      console.log('parseCSV: Starting parse, content length:', csvContent.length);
      
      const config = window.Config ? window.Config.dataProcessing : {};
      const chunkSize = config.chunkSize || 500;
      const totalSize = csvContent.length;
      const accumulatedData = [];
      let lastProgressUpdate = 0;
      let processedBytes = 0;

      // Throttle progress updates
      const updateProgress = (percent) => {
        if (progressCallback && (percent - lastProgressUpdate >= 1 || percent >= 100)) {
          try {
            progressCallback(Math.min(100, percent));
            lastProgressUpdate = percent;
          } catch (err) {
            console.warn('Progress callback error:', err);
          }
        }
      };

      try {
        Papa.parse(csvContent, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: true,
          // Use chunk mode for better performance with progress
          chunk: (results, parser) => {
            // Accumulate chunk data
            if (results.data && results.data.length > 0) {
              accumulatedData.push(...results.data);
            }

            // Calculate progress based on accumulated rows vs estimated total
            // Estimate total rows: ~100 bytes per row average
            const estimatedTotalRows = Math.max(totalSize / 100, accumulatedData.length);
            const progress = Math.min(90, (accumulatedData.length / estimatedTotalRows) * 90);
            updateProgress(progress);
          },
          complete: (results) => {
            console.log('parseCSV: Parse complete, accumulated rows:', accumulatedData.length);
            updateProgress(95);

            // Process results
            const finalResults = {
              ...results,
              data: accumulatedData,
              meta: results.meta || {}
            };

            this._processParseResults(finalResults, resolve, reject);
          },
          error: (error) => {
            console.error('parseCSV: Parse error:', error);
            reject(new Error(`CSV parsing failed: ${error.message}`));
          },
          // Chunk size configuration
          chunkSize: chunkSize * 1024 // Convert to bytes (approximate)
        });
      } catch (error) {
        console.error('parseCSV: Exception during parse setup:', error);
        reject(new Error(`CSV parsing failed: ${error.message}`));
      }
    });
  }

  /**
   * Process parsed results
   * @private
   */
  _processParseResults(results, resolve, reject) {
    try {
      if (results.errors && results.errors.length > 0) {
        console.warn('CSV parsing warnings:', results.errors);
      }

      const rawData = results.data || [];
      this.columns = results.meta.fields || [];

      // Extract columns from first row if needed
      if (this.columns.length === 0 && rawData.length > 0 && rawData[0]) {
        this.columns = Object.keys(rawData[0]);
        console.log('Columns extracted from data row keys:', this.columns);
      }

      console.log('CSV Columns detected:', this.columns);
      console.log('Raw data rows:', rawData.length);

      // Find time column
      const timeColumn = this._findTimeColumn();
      
      // Filter and process data in a single pass
      this.data = [];
      this._timeIndex = [];
      
      for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row) continue;
        
        const timeValue = row[timeColumn];
        if (timeValue === null || timeValue === undefined || isNaN(timeValue)) {
          continue;
        }
        
        // Process numeric columns (dynamicTyping should handle most of this)
        const processedRow = this._processRow(row);
        
        this.data.push(processedRow);
        this._timeIndex.push(timeValue);
      }

      console.log('Filtered data rows:', this.data.length);

      // Clear caches
      this._cachedColumns.clear();

      // Notify ColumnMapper if available
      if (window.ColumnMapper) {
        window.ColumnMapper.initialize(this.columns);
      }

      resolve({
        data: this.data,
        columns: this.columns,
        rowCount: this.data.length
      });
    } catch (error) {
      console.error('Error processing parse results:', error);
      reject(error);
    }
  }

  /**
   * Find the time column name
   * @private
   */
  _findTimeColumn() {
    const possibleNames = ['Time (s)', 'Time', 'Time(s)', 'Timestamp', 'time'];
    for (const name of possibleNames) {
      if (this.columns.includes(name)) {
        return name;
      }
    }
    // Case-insensitive search
    const found = this.columns.find(col => col.toLowerCase().includes('time'));
    return found || 'Time (s)';
  }

  /**
   * Process a single row, ensuring numeric columns are numbers
   * @private
   */
  _processRow(row) {
    // With dynamicTyping enabled, most values should already be numbers
    // Just handle any edge cases
    const processedRow = { ...row };
    
    // List of columns that must be numeric
    const numericColumns = [
      'Time (s)',
      'Airflow (MAF) (g/s)',
      'Load (MAF) (g/rev)',
      'Manifold Air Pressure - Filtered (kPa)',
      'Mass Air Flow (g/s)',
      'Boost Target (kPa)',
      'Wastegate Duty Cycle (%)',
      'Air/Fuel Sensor #1 (λ)',
      'Injector Pulse Width (ms)',
      'Fuel - Base Multiplier',
      'Power Mode - Fuel Ratio Target (λ)',
      'Fuel Trim - Long Term (%)',
      'Fuel Trim - Short Term (%)',
      'Coolant Temperature (°C)',
      'Intake Air Temperature (°C)',
      'Manifold Absolute Pressure (kPa)',
      'Engine Speed (rpm)',
      'Vehicle Speed (km/h)',
      'System Voltage (V)',
      'Ignition Advance (°)',
      'Ignition Advance - Base (°BTDC)',
      'Ignition Advance Multiplier',
      'Ignition Advance - Fine Learn (°)',
      'Knock Retard (°)',
      'Throttle Position (%)',
      'Mass Air Flow Voltage (V)',
      'Fuel - Acceleration Enrich'
    ];

    // Only convert if value exists and isn't already a number
    for (const col of numericColumns) {
      const val = processedRow[col];
      if (val !== undefined && val !== null && typeof val !== 'number') {
        const num = parseFloat(val);
        processedRow[col] = isNaN(num) ? 0 : num;
      } else if (val === undefined || val === null) {
        processedRow[col] = 0;
      }
    }

    return processedRow;
  }

  /**
   * Get column index
   * @param {string} columnName - Column name
   * @returns {number} - Index or -1
   */
  getColumnIndex(columnName) {
    return this.columns.indexOf(columnName);
  }

  /**
   * Get all data
   * @returns {Object[]} - Data array
   */
  getData() {
    return this.data;
  }

  /**
   * Get all column names
   * @returns {string[]} - Column names
   */
  getColumns() {
    return this.columns;
  }

  /**
   * Get time range
   * @returns {Object} - { min, max }
   */
  getTimeRange() {
    if (!this._timeIndex || this._timeIndex.length === 0) {
      return { min: 0, max: 0 };
    }
    return {
      min: this._timeIndex[0],
      max: this._timeIndex[this._timeIndex.length - 1]
    };
  }

  /**
   * Get value at specific time using binary search (O(log n))
   * @param {number} time - Target time
   * @param {string} columnName - Column name
   * @returns {*} - Value at closest time or null
   */
  getValueAtTime(time, columnName) {
    if (!this.data || !this._timeIndex || this._timeIndex.length === 0) {
      return null;
    }

    const index = this._binarySearchTime(time);
    if (index < 0 || index >= this.data.length) {
      return null;
    }

    return this.data[index][columnName];
  }

  /**
   * Get row at specific time using binary search
   * @param {number} time - Target time
   * @returns {Object|null} - Row data or null
   */
  getRowAtTime(time) {
    if (!this.data || !this._timeIndex || this._timeIndex.length === 0) {
      return null;
    }

    const index = this._binarySearchTime(time);
    if (index < 0 || index >= this.data.length) {
      return null;
    }

    return this.data[index];
  }

  /**
   * Binary search for closest time index
   * @param {number} targetTime - Target time
   * @returns {number} - Index of closest time
   * @private
   */
  _binarySearchTime(targetTime) {
    const times = this._timeIndex;
    if (!times || times.length === 0) return -1;

    let left = 0;
    let right = times.length - 1;

    // Handle edge cases
    if (targetTime <= times[left]) return left;
    if (targetTime >= times[right]) return right;

    // Binary search
    while (left < right - 1) {
      const mid = Math.floor((left + right) / 2);
      const midTime = times[mid];

      if (midTime === targetTime) {
        return mid;
      } else if (midTime < targetTime) {
        left = mid;
      } else {
        right = mid;
      }
    }

    // Return closest between left and right
    const diffLeft = Math.abs(times[left] - targetTime);
    const diffRight = Math.abs(times[right] - targetTime);
    return diffLeft <= diffRight ? left : right;
  }

  /**
   * Get data rows in time range using binary search
   * @param {number} startTime - Start time
   * @param {number} endTime - End time
   * @returns {Object[]} - Array of rows in range
   */
  getDataInTimeRange(startTime, endTime) {
    if (!this.data || !this._timeIndex || this._timeIndex.length === 0) {
      return [];
    }

    const startIdx = this._binarySearchTimeStart(startTime);
    const endIdx = this._binarySearchTimeEnd(endTime);

    if (startIdx < 0 || startIdx > endIdx) {
      return [];
    }

    return this.data.slice(startIdx, endIdx + 1);
  }

  /**
   * Binary search for start of time range
   * @private
   */
  _binarySearchTimeStart(targetTime) {
    const times = this._timeIndex;
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

    return left;
  }

  /**
   * Binary search for end of time range
   * @private
   */
  _binarySearchTimeEnd(targetTime) {
    const times = this._timeIndex;
    if (!times || times.length === 0) return -1;

    let left = 0;
    let right = times.length - 1;

    while (left < right) {
      const mid = Math.floor((left + right + 1) / 2);
      if (times[mid] > targetTime) {
        right = mid - 1;
      } else {
        left = mid;
      }
    }

    return left;
  }

  /**
   * Get cached column array or compute it
   * @param {string} columnName - Column name
   * @returns {number[]} - Array of values
   */
  getColumnArray(columnName) {
    // Check cache
    if (this._cachedColumns.has(columnName)) {
      return this._cachedColumns.get(columnName);
    }

    if (!this.data || !columnName) {
      return [];
    }

    // Extract column values
    const values = this.data.map(row => {
      const val = row[columnName];
      if (typeof val === 'number') return val;
      const num = parseFloat(val);
      return isNaN(num) ? 0 : num;
    });

    // Cache the result
    this._cachedColumns.set(columnName, values);
    return values;
  }

  /**
   * Get time array (frequently used, always cached)
   * @returns {number[]} - Array of time values
   */
  getTimeArray() {
    return this._timeIndex ? [...this._timeIndex] : [];
  }

  /**
   * Clear cached column arrays
   */
  clearCache() {
    this._cachedColumns.clear();
  }

  /**
   * Get data statistics for a column
   * @param {string} columnName - Column name
   * @returns {Object} - { min, max, avg, count }
   */
  getColumnStats(columnName) {
    const values = this.getColumnArray(columnName);
    if (values.length === 0) {
      return { min: 0, max: 0, avg: 0, count: 0 };
    }

    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let count = 0;

    for (const val of values) {
      if (isFinite(val)) {
        if (val < min) min = val;
        if (val > max) max = val;
        sum += val;
        count++;
      }
    }

    return {
      min: count > 0 ? min : 0,
      max: count > 0 ? max : 0,
      avg: count > 0 ? sum / count : 0,
      count
    };
  }
}
