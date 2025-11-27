// TuneFileParser class for parsing and accessing ECU tune file data
class TuneFileParser {
  constructor() {
    this.tuneData = null;
    this.version = null;
    this.maps = new Map(); // Map of map ID to map data
    this.metadata = {};
  }

  /**
   * Parse a JSON tune file
   * @param {string} jsonContent - JSON content of the tune file
   * @returns {boolean} - True if parsing successful
   */
  parse(jsonContent) {
    try {
      const data = JSON.parse(jsonContent);
      
      // Extract metadata
      this.metadata = {
        calId: data.cal_id || null,
        carId: data.car_id || null,
        romId: data.rom_id || null,
        version: data.version || null,
        meta: data.meta || {}
      };
      
      this.version = this.metadata.version;
      
      // Extract maps array
      if (data.maps && Array.isArray(data.maps)) {
        data.maps.forEach(map => {
          if (map.id) {
            this.maps.set(map.id, map);
          }
        });
      }
      
      this.tuneData = data;
      return true;
    } catch (error) {
      console.error('Error parsing tune file:', error);
      return false;
    }
  }

  /**
   * Get a map by ID
   * @param {string} mapId - Map identifier
   * @returns {Object|null} - Map data or null if not found
   */
  getMap(mapId) {
    return this.maps.get(mapId) || null;
  }

  /**
   * Get a parameter value by map ID
   * @param {string} mapId - Map identifier
   * @returns {number|Array|null} - Parameter value or null if not found
   */
  getParameter(mapId) {
    const map = this.getMap(mapId);
    if (!map) return null;
    
    // Maps can have 'value' (single value) or 'data' (array/table)
    if (map.value !== undefined) {
      return map.value;
    }
    if (map.data !== undefined) {
      return map.data;
    }
    return null;
  }

  /**
   * Get a 1D array parameter
   * @param {string} mapId - Map identifier
   * @returns {Array|null} - Array of values or null
   */
  getArray(mapId) {
    const param = this.getParameter(mapId);
    if (Array.isArray(param)) {
      return param;
    }
    return null;
  }

  /**
   * Get a 2D table (array of arrays)
   * @param {string} mapId - Map identifier
   * @returns {Array|null} - 2D array or null
   */
  getTable(mapId) {
    const param = this.getParameter(mapId);
    if (Array.isArray(param) && param.length > 0 && Array.isArray(param[0])) {
      return param;
    }
    return null;
  }

  /**
   * Interpolate value from 1D array
   * @param {Array} array - Array of values
   * @param {Array} index - Array of breakpoints
   * @param {number} value - Value to interpolate
   * @param {string} mode - 'clamp' or 'extrapolate' (default: 'clamp')
   * @returns {number} - Interpolated value
   */
  interpolate1D(array, index, value, mode = 'clamp') {
    if (!array || !index || array.length !== index.length) {
      return 0;
    }

    // Clamp to bounds
    if (value <= index[0]) {
      return array[0];
    }
    if (value >= index[index.length - 1]) {
      return array[array.length - 1];
    }

    // Find surrounding points
    let i = 0;
    for (let j = 0; j < index.length - 1; j++) {
      if (value >= index[j] && value <= index[j + 1]) {
        i = j;
        break;
      }
    }

    // Linear interpolation
    const x0 = index[i];
    const x1 = index[i + 1];
    const y0 = array[i];
    const y1 = array[i + 1];
    
    const ratio = (value - x0) / (x1 - x0);
    return y0 + (y1 - y0) * ratio;
  }

  /**
   * Interpolate value from 2D table (bilinear interpolation)
   * @param {Array} table - 2D array (table[row][col])
   * @param {Array} rowIndex - Array of row breakpoints
   * @param {Array} colIndex - Array of column breakpoints
   * @param {number} rowValue - Row value to interpolate
   * @param {number} colValue - Column value to interpolate
   * @param {string} mode - 'clamp' or 'extrapolate' (default: 'clamp')
   * @returns {number} - Interpolated value
   */
  interpolate2D(table, rowIndex, colIndex, rowValue, colValue, mode = 'clamp') {
    if (!table || !rowIndex || !colIndex) {
      return 0;
    }

    const numRows = table.length;
    const numCols = table[0] ? table[0].length : 0;

    if (numRows !== rowIndex.length || numCols !== colIndex.length) {
      console.warn('Table dimensions do not match index lengths');
      return 0;
    }

    // Clamp to bounds
    if (rowValue <= rowIndex[0]) rowValue = rowIndex[0];
    if (rowValue >= rowIndex[rowIndex.length - 1]) rowValue = rowIndex[rowIndex.length - 1];
    if (colValue <= colIndex[0]) colValue = colIndex[0];
    if (colValue >= colIndex[colIndex.length - 1]) colValue = colIndex[colIndex.length - 1];

    // Find surrounding row points
    let row0 = 0, row1 = 0;
    for (let i = 0; i < rowIndex.length - 1; i++) {
      if (rowValue >= rowIndex[i] && rowValue <= rowIndex[i + 1]) {
        row0 = i;
        row1 = i + 1;
        break;
      }
    }

    // Find surrounding column points
    let col0 = 0, col1 = 0;
    for (let i = 0; i < colIndex.length - 1; i++) {
      if (colValue >= colIndex[i] && colValue <= colIndex[i + 1]) {
        col0 = i;
        col1 = i + 1;
        break;
      }
    }

    // Get four corner values
    const v00 = table[row0][col0];
    const v01 = table[row0][col1];
    const v10 = table[row1][col0];
    const v11 = table[row1][col1];

    // Bilinear interpolation
    const rowRatio = (rowValue - rowIndex[row0]) / (rowIndex[row1] - rowIndex[row0]);
    const colRatio = (colValue - colIndex[col0]) / (colIndex[col1] - colIndex[col0]);

    const v0 = v00 + (v01 - v00) * colRatio;
    const v1 = v10 + (v11 - v10) * colRatio;
    return v0 + (v1 - v0) * rowRatio;
  }

  /**
   * Get base spark timing for given RPM and Load
   * @param {number} rpm - Engine RPM
   * @param {number} load - Engine load (g/rev)
   * @param {string} transmission - 'at', 'mt', or 'aet' (default: 'mt')
   * @returns {number} - Base spark timing in degrees
   */
  getBaseSpark(rpm, load, transmission = 'mt') {
    const mapId = `base_spark_${transmission}`;
    const rpmIndexId = 'base_spark_rpm_index';
    const loadIndexId = 'base_spark_map_index';

    const table = this.getTable(mapId);
    const rpmIndex = this.getArray(rpmIndexId);
    const loadIndex = this.getArray(loadIndexId);

    if (!table || !rpmIndex || !loadIndex) {
      return 0;
    }

    return this.interpolate2D(table, rpmIndex, loadIndex, rpm, load);
  }

  /**
   * Get boost target for given RPM and TPS
   * @param {number} rpm - Engine RPM
   * @param {number} tps - Throttle position (%)
   * @returns {number} - Boost target in kPa
   */
  getBoostTarget(rpm, tps) {
    const table = this.getTable('boost_target');
    const rpmIndex = this.getArray('boost_target_rpm_index');
    const tpsIndex = this.getArray('boost_target_tps_index');

    if (!table || !rpmIndex || !tpsIndex) {
      return 0;
    }

    return this.interpolate2D(table, rpmIndex, tpsIndex, rpm, tps);
  }

  /**
   * Get boost limit for given RPM
   * @param {number} rpm - Engine RPM
   * @returns {number} - Boost limit in kPa
   */
  getBoostLimit(rpm) {
    const limitArray = this.getArray('boost_limit');
    const rpmIndex = this.getArray('base_spark_rpm_index'); // Uses same RPM index

    if (!limitArray || !rpmIndex) {
      // Default fallback values from documentation
      return 234.7; // Max value from base file
    }

    return this.interpolate1D(limitArray, rpmIndex, rpm);
  }

  /**
   * Get load limit for given RPM
   * @param {number} rpm - Engine RPM
   * @returns {number} - Load limit in g/rev
   */
  getLoadLimit(rpm) {
    const limitArray = this.getArray('load_max');
    const rpmIndex = this.getArray('base_spark_rpm_index'); // Uses same RPM index

    if (!limitArray || !rpmIndex) {
      // Default fallback: use documented range
      // Base file: 1.28 to 2.54 g/rev, increases with RPM
      const defaultLimits = [1.28, 1.35, 1.42, 1.50, 1.58, 1.67, 1.75, 1.83, 1.92, 2.00, 2.08, 2.17, 2.25, 2.33, 2.42, 2.54];
      const defaultRpmIndex = [800, 1200, 1600, 2000, 2400, 2800, 3200, 3600, 4000, 4400, 4800, 5200, 5600, 6000, 6400, 6800];
      return this.interpolate1D(defaultLimits, defaultRpmIndex, rpm);
    }

    return this.interpolate1D(limitArray, rpmIndex, rpm);
  }

  /**
   * Get PE (Power Enrichment) lambda target for given RPM and Load
   * @param {number} rpm - Engine RPM
   * @param {number} load - Engine load (g/rev)
   * @param {string} mode - 'initial', 'safe', or 'final' (default: 'initial')
   * @returns {number} - Lambda target
   */
  getPETarget(rpm, load, mode = 'initial') {
    const mapId = `pe_${mode}`;
    const rpmIndexId = 'pe_rpm_index';
    const loadIndexId = 'pe_load_index';

    const table = this.getTable(mapId);
    const rpmIndex = this.getArray(rpmIndexId);
    const loadIndex = this.getArray(loadIndexId);

    if (!table || !rpmIndex || !loadIndex) {
      return 1.0; // Default to stoichiometric
    }

    return this.interpolate2D(table, rpmIndex, loadIndex, rpm, load);
  }

  /**
   * Get PE enable thresholds
   * @returns {Object} - Object with load and TPS thresholds
   */
  getPEEnableThresholds() {
    const loadArray = this.getArray('pe_enable_load');
    const tpsArray = this.getArray('pe_enable_tps');
    const rpmIndex = this.getArray('base_spark_rpm_index');

    return {
      load: loadArray,
      tps: tpsArray,
      rpmIndex: rpmIndex
    };
  }

  /**
   * Check if PE mode should be active
   * @param {number} rpm - Engine RPM
   * @param {number} load - Engine load (g/rev)
   * @param {number} tps - Throttle position (%)
   * @returns {boolean} - True if PE mode should be active
   */
  isPEModeActive(rpm, load, tps) {
    const thresholds = this.getPEEnableThresholds();
    if (!thresholds.load || !thresholds.tps || !thresholds.rpmIndex) {
      return false;
    }

    // Find RPM index position
    let rpmIdx = 0;
    for (let i = 0; i < thresholds.rpmIndex.length - 1; i++) {
      if (rpm >= thresholds.rpmIndex[i] && rpm < thresholds.rpmIndex[i + 1]) {
        rpmIdx = i;
        break;
      }
      if (rpm >= thresholds.rpmIndex[thresholds.rpmIndex.length - 1]) {
        rpmIdx = thresholds.rpmIndex.length - 1;
        break;
      }
    }
    if (rpmIdx >= thresholds.rpmIndex.length) {
      rpmIdx = thresholds.rpmIndex.length - 1;
    }

    const loadThreshold = thresholds.load[rpmIdx] || 0;
    const tpsThreshold = thresholds.tps[rpmIdx] || 0;

    return load >= loadThreshold && tps >= tpsThreshold;
  }

  /**
   * Get boost error index thresholds
   * @returns {Array} - Array of error thresholds in kPa: [20.3, 11.7, 5.3, 2.1]
   */
  getBoostErrorIndex() {
    const errorIndex = this.getArray('boost_error_index');
    if (errorIndex && errorIndex.length > 0) {
      return errorIndex;
    }
    // Default fallback from documentation
    return [20.3, 11.7, 5.3, 2.1];
  }

  /**
   * Get knock parameters
   * @returns {Object} - Knock parameters
   */
  getKnockParameters() {
    return {
      retardMax: this.getParameter('knock_retard_max') || -8.0,
      retardAttack: this.getParameter('knock_retard_attack') || -1.0,
      retardDecay: this.getParameter('knock_retard_decay') || 0.2,
      rpmMin: this.getArray('knock_rpm_min')?.[0] || 1000,
      sensitivityLowLoad: this.getParameter('knock_sensitivity_low_load') || 0.81,
      sensitivityLowLoadFactor: this.getParameter('knock_sensitivity_low_load_factor') || 196.9
    };
  }

  /**
   * Get rev limit for given gear
   * @param {number} gear - Gear number (0-4, 0 = neutral)
   * @returns {number} - Rev limit in RPM
   */
  getRevLimit(gear = 0) {
    const revLimits = this.getArray('rev_limit');
    if (revLimits && gear >= 0 && gear < revLimits.length) {
      return revLimits[gear];
    }
    // Default fallback
    return 8000;
  }

  /**
   * Check if tune file is loaded
   * @returns {boolean} - True if tune file is loaded
   */
  isLoaded() {
    return this.tuneData !== null && this.maps.size > 0;
  }

  /**
   * Get tune file version
   * @returns {string|null} - Version string or null
   */
  getVersion() {
    return this.version;
  }

  /**
   * Get metadata
   * @returns {Object} - Metadata object
   */
  getMetadata() {
    return this.metadata;
  }

  /**
   * Get fan temperature thresholds
   * @returns {Object} - Fan temperature thresholds
   */
  getFanTemperatures() {
    const fanTempTable = this.getTable('fan_temp');
    if (fanTempTable && fanTempTable.length >= 2 && fanTempTable[0].length >= 2 && fanTempTable[1].length >= 2) {
      // fan_temp is 2x2: [low_speed_on, low_speed_off], [high_speed_on, high_speed_off]
      return {
        lowSpeedOn: fanTempTable[0][0] || 95.0,
        lowSpeedOff: fanTempTable[0][1] || 90.0,
        highSpeedOn: fanTempTable[1][0] || 105.0,
        highSpeedOff: fanTempTable[1][1] || 100.0
      };
    }
    // Default fallback values
    return {
      lowSpeedOn: 95.0,
      lowSpeedOff: 90.0,
      highSpeedOn: 105.0,
      highSpeedOff: 100.0
    };
  }
}

