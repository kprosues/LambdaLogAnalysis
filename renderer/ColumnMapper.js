// ColumnMapper - Centralized column detection and caching
// Detects all columns once at data load time and provides consistent mappings

(function() {
  'use strict';

  class ColumnMapper {
    constructor() {
      this.reset();
    }

    /**
     * Reset all cached mappings
     */
    reset() {
      this._columns = [];
      this._mappings = new Map();
      this._cachedArrays = new Map();
      this._initialized = false;
    }

    /**
     * Initialize mapper with column names from data processor
     * @param {string[]} columns - Array of column names
     */
    initialize(columns) {
      if (!columns || !Array.isArray(columns)) {
        console.warn('ColumnMapper: Invalid columns array');
        return;
      }

      this.reset();
      this._columns = columns;
      this._detectAllColumns();
      this._initialized = true;
      
      console.log('ColumnMapper initialized with', this._mappings.size, 'detected columns');
    }

    /**
     * Detect all known column types
     */
    _detectAllColumns() {
      const config = window.Config || {};
      const aliases = config.columnAliases || {};

      // Standard columns from config
      const standardColumns = config.columns || {};
      
      // Map each standard column
      Object.entries(standardColumns).forEach(([key, name]) => {
        if (this._columns.includes(name)) {
          this._mappings.set(key, name);
        }
      });

      // Try aliases for columns not yet mapped
      Object.entries(aliases).forEach(([key, possibleNames]) => {
        if (!this._mappings.has(key)) {
          const found = this._findColumn(possibleNames);
          if (found) {
            this._mappings.set(key, found);
          }
        }
      });

      // Additional detection for common columns
      this._detectAdditionalColumns();
    }

    /**
     * Detect additional columns not in config
     */
    _detectAdditionalColumns() {
      // Time column (critical)
      if (!this._mappings.has('time')) {
        const timeCol = this._findColumn(['Time (s)', 'Time', 'Time(s)', 'Timestamp']);
        if (timeCol) {
          this._mappings.set('time', timeCol);
        }
      }

      // RPM
      if (!this._mappings.has('rpm')) {
        const rpmCol = this._findColumn([
          'Engine Speed (rpm)', 'Engine Speed', 'RPM', 'Engine RPM',
          'Engine Speed(rpm)', 'EngineSpeed'
        ]);
        if (rpmCol) {
          this._mappings.set('rpm', rpmCol);
        }
      }

      // Load
      if (!this._mappings.has('load')) {
        const loadCol = this._findColumn([
          'Load (MAF) (g/rev)', 'Load (g/rev)', 'Load', 'MAF Load',
          'Engine Load', 'Calculated Load'
        ]);
        if (loadCol) {
          this._mappings.set('load', loadCol);
        }
      }

      // Throttle
      if (!this._mappings.has('throttle')) {
        const throttleCol = this._findColumn([
          'Throttle Position (%)', 'Throttle Position', 'TPS',
          'Throttle (%)', 'Accelerator Position'
        ]);
        if (throttleCol) {
          this._mappings.set('throttle', throttleCol);
        }
      }

      // AFR
      if (!this._mappings.has('afr')) {
        const afrCol = this._findColumn([
          'Air/Fuel Sensor #1 (λ)', 'Air/Fuel Ratio', 'Lambda',
          'AFR', 'Wideband O2', 'O2 Sensor'
        ]);
        if (afrCol) {
          this._mappings.set('afr', afrCol);
        }
      }

      // Knock Retard
      if (!this._mappings.has('knockRetard')) {
        const knockCol = this._findColumn([
          'Knock Retard (°)', 'Knock Retard (deg)', 'Knock Retard',
          'Knock Timing', 'KnockRetard'
        ]);
        if (knockCol) {
          this._mappings.set('knockRetard', knockCol);
        }
      }

      // Boost/MAP columns
      if (!this._mappings.has('map')) {
        const mapCol = this._findColumn([
          'Manifold Absolute Pressure (kPa)', 'Manifold Air Pressure - Filtered (kPa)',
          'MAP', 'MAP (kPa)', 'Boost Pressure', 'Manifold Pressure'
        ]);
        if (mapCol) {
          this._mappings.set('map', mapCol);
        }
      }

      // Boost Target
      if (!this._mappings.has('boostTarget')) {
        const boostTargetCol = this._findColumn([
          'Boost Target (kPa)', 'Boost Target', 'Target Boost',
          'Boost Setpoint', 'Desired Boost'
        ]);
        if (boostTargetCol) {
          this._mappings.set('boostTarget', boostTargetCol);
        }
      }

      // Wastegate
      if (!this._mappings.has('wastegateDC')) {
        const wgCol = this._findColumn([
          'Wastegate Duty Cycle (%)', 'Wastegate DC', 'WG Duty',
          'Wastegate Duty', 'Wastegate'
        ]);
        if (wgCol) {
          this._mappings.set('wastegateDC', wgCol);
        }
      }

      // Fuel Trims
      if (!this._mappings.has('stft')) {
        const stftCol = this._findColumn([
          'Fuel Trim - Short Term (%)', 'Short Term Fuel Trim',
          'STFT', 'Short Term Trim'
        ]);
        if (stftCol) {
          this._mappings.set('stft', stftCol);
        }
      }

      if (!this._mappings.has('ltft')) {
        const ltftCol = this._findColumn([
          'Fuel Trim - Long Term (%)', 'Long Term Fuel Trim',
          'LTFT', 'Long Term Trim'
        ]);
        if (ltftCol) {
          this._mappings.set('ltft', ltftCol);
        }
      }

      // IAM
      if (!this._mappings.has('iam')) {
        const iamCol = this._findColumn([
          'Ignition Advance Multiplier', 'IAM', 'Ignition Multiplier',
          'Timing Multiplier'
        ]);
        if (iamCol) {
          this._mappings.set('iam', iamCol);
        }
      }

      // Temperatures
      if (!this._mappings.has('coolantTemp')) {
        const coolantCol = this._findColumn([
          'Coolant Temperature (°C)', 'Coolant Temp', 'ECT',
          'Engine Coolant Temperature', 'Water Temperature'
        ]);
        if (coolantCol) {
          this._mappings.set('coolantTemp', coolantCol);
        }
      }

      if (!this._mappings.has('intakeTemp')) {
        const iatCol = this._findColumn([
          'Intake Air Temperature (°C)', 'Intake Air Temp', 'IAT',
          'Air Intake Temperature', 'Charge Air Temperature'
        ]);
        if (iatCol) {
          this._mappings.set('intakeTemp', iatCol);
        }
      }

      // MAF Voltage
      if (!this._mappings.has('mafVoltage')) {
        const mafVCol = this._findColumn([
          'Mass Air Flow Voltage (V)', 'MAF Voltage', 'MAF V',
          'Mass Air Flow Voltage'
        ]);
        if (mafVCol) {
          this._mappings.set('mafVoltage', mafVCol);
        }
      }

      // AFR Target
      if (!this._mappings.has('afrTarget')) {
        const afrTargetCol = this._findColumn([
          'Power Mode - Fuel Ratio Target (λ)', 'AFR Target',
          'Lambda Target', 'Target Lambda', 'Fuel Target'
        ]);
        if (afrTargetCol) {
          this._mappings.set('afrTarget', afrTargetCol);
        }
      }
    }

    /**
     * Find column from list of possible names
     * @param {string[]} possibleNames - Array of possible column names
     * @returns {string|null} - Found column name or null
     */
    _findColumn(possibleNames) {
      // Exact match first
      for (const name of possibleNames) {
        if (this._columns.includes(name)) {
          return name;
        }
      }

      // Case-insensitive match
      for (const name of possibleNames) {
        const found = this._columns.find(col => 
          col.toLowerCase() === name.toLowerCase()
        );
        if (found) return found;
      }

      // Partial match (keywords)
      for (const name of possibleNames) {
        const keywords = name.toLowerCase().split(/[\s()%-]+/).filter(w => w.length > 2);
        const found = this._columns.find(col => {
          const colLower = col.toLowerCase();
          return keywords.every(kw => colLower.includes(kw));
        });
        if (found) return found;
      }

      return null;
    }

    /**
     * Get the actual column name for a key
     * @param {string} key - Column key (e.g., 'rpm', 'load', 'throttle')
     * @returns {string|null} - Actual column name or null
     */
    getColumn(key) {
      return this._mappings.get(key) || null;
    }

    /**
     * Check if a column exists
     * @param {string} key - Column key
     * @returns {boolean}
     */
    hasColumn(key) {
      return this._mappings.has(key);
    }

    /**
     * Get value from row by key
     * @param {Object} row - Data row
     * @param {string} key - Column key
     * @param {*} defaultValue - Default value if column not found
     * @returns {*} - Value from row or default
     */
    getValue(row, key, defaultValue = 0) {
      const colName = this.getColumn(key);
      if (!colName || !row) return defaultValue;
      
      const val = row[colName];
      if (val === undefined || val === null) return defaultValue;
      
      // Try to convert to number if it looks like a number
      if (typeof val === 'string') {
        const num = parseFloat(val);
        return isNaN(num) ? val : num;
      }
      
      return val;
    }

    /**
     * Get all values for a column key from data array (cached)
     * @param {Object[]} data - Data array
     * @param {string} key - Column key
     * @returns {number[]} - Array of values
     */
    getColumnArray(data, key) {
      if (!data || !this._initialized) return [];
      
      // Check cache
      const cacheKey = `${key}_${data.length}`;
      if (this._cachedArrays.has(cacheKey)) {
        return this._cachedArrays.get(cacheKey);
      }

      const colName = this.getColumn(key);
      if (!colName) return [];

      const values = data.map(row => {
        const val = row[colName];
        if (typeof val === 'number') return val;
        const num = parseFloat(val);
        return isNaN(num) ? 0 : num;
      });

      // Cache the result
      this._cachedArrays.set(cacheKey, values);
      return values;
    }

    /**
     * Clear cached arrays (call when data changes)
     */
    clearCache() {
      this._cachedArrays.clear();
    }

    /**
     * Get all detected column mappings
     * @returns {Object} - Object with key -> column name mappings
     */
    getAllMappings() {
      const mappings = {};
      this._mappings.forEach((value, key) => {
        mappings[key] = value;
      });
      return mappings;
    }

    /**
     * Get all original columns
     * @returns {string[]} - Array of column names
     */
    getColumns() {
      return [...this._columns];
    }

    /**
     * Check if mapper is initialized
     * @returns {boolean}
     */
    isInitialized() {
      return this._initialized;
    }

    /**
     * Get required columns check result
     * @param {string[]} requiredKeys - Array of required column keys
     * @returns {Object} - { valid: boolean, missing: string[] }
     */
    checkRequiredColumns(requiredKeys) {
      const missing = requiredKeys.filter(key => !this.hasColumn(key));
      return {
        valid: missing.length === 0,
        missing
      };
    }
  }

  // Create singleton instance
  const columnMapper = new ColumnMapper();

  // Export to window
  window.ColumnMapper = columnMapper;
})();

