// DataProcessor class for parsing and processing ECU log CSV files
class DataProcessor {
  constructor() {
    this.data = null;
    this.columns = [];
  }

  parseCSV(csvContent, progressCallback) {
    return new Promise((resolve, reject) => {
      console.log('parseCSV: Starting parse, content length:', csvContent.length);
      const totalSize = csvContent.length;
      let lastProgressUpdate = 0;
      const accumulatedData = [];
      
      // If no progress callback, use simple parsing without step
      if (!progressCallback) {
        Papa.parse(csvContent, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: true,
          complete: (results) => {
            this.processParseResults(results, [], resolve);
          },
          error: (error) => {
            console.error('parseCSV: Parse error:', error);
            reject(new Error(`CSV parsing failed: ${error.message}`));
          }
        });
        return;
      }
      
      // With progress callback, use step to track progress
      try {
        Papa.parse(csvContent, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: true,
          step: (results, parser) => {
            // Accumulate data
            if (results.data) {
              accumulatedData.push(results.data);
            }
            
            // Report progress more frequently - update every 50 rows or based on cursor
            const shouldUpdate = accumulatedData.length % 50 === 0;
            
            if (results.meta && results.meta.cursor && totalSize > 0) {
              try {
                const currentProgress = Math.min(90, (results.meta.cursor / totalSize) * 100);
                // Update if progress changed by at least 0.5% or every 50 rows
                if (shouldUpdate || currentProgress - lastProgressUpdate >= 0.5) {
                  progressCallback(currentProgress);
                  lastProgressUpdate = currentProgress;
                }
              } catch (err) {
                console.warn('Progress callback error:', err);
              }
            } else if (shouldUpdate && totalSize > 0) {
              // Fallback: estimate progress based on row count if cursor not available
              // Rough estimate: assume average row size
              try {
                const estimatedProgress = Math.min(90, (accumulatedData.length * 100) / (totalSize / 100));
                if (estimatedProgress - lastProgressUpdate >= 1) {
                  progressCallback(estimatedProgress);
                  lastProgressUpdate = estimatedProgress;
                }
              } catch (err) {
                console.warn('Progress callback error (fallback):', err);
              }
            }
          },
          complete: (results) => {
            console.log('parseCSV: Parse complete, accumulated rows:', accumulatedData.length);
            // Ensure we show 100% when complete
            if (progressCallback) {
              try {
                progressCallback(100);
              } catch (err) {
                console.warn('Progress callback error on complete:', err);
              }
            }
            
            // Create results object with accumulated data
            const finalResults = {
              ...results,
              data: accumulatedData
            };
            
            this.processParseResults(finalResults, accumulatedData, resolve);
          },
          error: (error) => {
            console.error('parseCSV: Parse error:', error);
            reject(new Error(`CSV parsing failed: ${error.message}`));
          }
        });
      } catch (error) {
        console.error('parseCSV: Exception during parse setup:', error);
        reject(new Error(`CSV parsing failed: ${error.message}`));
      }
    });
  }

  processParseResults(results, accumulatedData, resolve) {
    if (results.errors && results.errors.length > 0) {
      console.warn('CSV parsing warnings:', results.errors);
    }
    
    // Use accumulated data if available (from step callback), otherwise use results.data
    const rawData = accumulatedData.length > 0 ? accumulatedData : (results.data || []);
    
    this.data = rawData;
    this.columns = results.meta.fields || [];
    
    // If columns array is empty but we have data, extract columns from first row
    if (this.columns.length === 0 && this.data.length > 0 && this.data[0]) {
      this.columns = Object.keys(this.data[0]);
      console.log('Columns extracted from data row keys:', this.columns);
    }
    
    // Debug: Log column names
    console.log('CSV Columns detected:', this.columns);
    console.log('Raw data rows:', this.data.length);
    
    // Clean and validate data
    this.data = this.data.filter(row => {
      // Ensure time column exists and is valid
      return row && row['Time (s)'] !== null && row['Time (s)'] !== undefined && !isNaN(row['Time (s)']);
    });

    console.log('Filtered data rows:', this.data.length);

    // Convert numeric columns
    this.data = this.data.map(row => {
      const processedRow = { ...row };
      
      // Process numeric columns
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

      numericColumns.forEach(col => {
        if (processedRow[col] !== undefined && processedRow[col] !== null) {
          const num = parseFloat(processedRow[col]);
          processedRow[col] = isNaN(num) ? 0 : num;
        } else {
          processedRow[col] = 0;
        }
      });

      return processedRow;
    });

    console.log('parseCSV: Data processed, resolving promise');
    resolve({
      data: this.data,
      columns: this.columns,
      rowCount: this.data.length
    });
  }

  getColumnIndex(columnName) {
    return this.columns.indexOf(columnName);
  }

  getData() {
    return this.data;
  }

  getColumns() {
    return this.columns;
  }

  getTimeRange() {
    if (!this.data || this.data.length === 0) {
      return { min: 0, max: 0 };
    }
    
    const times = this.data.map(row => row['Time (s)']).filter(t => !isNaN(t));
    return {
      min: Math.min(...times),
      max: Math.max(...times)
    };
  }

  getValueAtTime(time, columnName) {
    if (!this.data) return null;
    
    // Find closest time match
    let closest = null;
    let minDiff = Infinity;
    
    for (const row of this.data) {
      const diff = Math.abs(row['Time (s)'] - time);
      if (diff < minDiff) {
        minDiff = diff;
        closest = row;
      }
    }
    
    return closest ? closest[columnName] : null;
  }
}

