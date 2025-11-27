// Tooltip Configuration Module
// Manages which log file fields are displayed in chart tooltips

const TooltipConfig = {
  // Default enabled fields (always shown)
  // Note: These are display names, actual column matching is done in getFieldValue
  defaultFields: ['RPM'],
  
  // Available fields that can be toggled
  availableFields: [],
  
  // Currently enabled fields (stored in localStorage)
  enabledFields: [],
  
  // Initialize configuration
  init() {
    this.loadSettings();
    // Ensure default fields are always enabled
    this.defaultFields.forEach(field => {
      if (!this.enabledFields.includes(field)) {
        this.enabledFields.push(field);
      }
    });
  },
  
  // Load settings from localStorage
  loadSettings() {
    try {
      const saved = localStorage.getItem('tooltipFields');
      if (saved) {
        this.enabledFields = JSON.parse(saved);
      } else {
        // Default: enable RPM only
        this.enabledFields = [...this.defaultFields];
      }
    } catch (e) {
      console.warn('Error loading tooltip settings:', e);
      this.enabledFields = [...this.defaultFields];
    }
  },
  
  // Save settings to localStorage
  saveSettings() {
    try {
      localStorage.setItem('tooltipFields', JSON.stringify(this.enabledFields));
    } catch (e) {
      console.warn('Error saving tooltip settings:', e);
    }
  },
  
  // Map of display names to actual column names
  fieldNameMap: {},
  
  // Update available fields from log file columns
  updateAvailableFields(columns) {
    if (!columns || !Array.isArray(columns)) {
      return;
    }
    
    // Clear previous mapping
    this.fieldNameMap = {};
    
    // Find RPM column and map it
    const rpmCol = columns.find(col => {
      const colLower = col.toLowerCase();
      return colLower.includes('rpm') || colLower.includes('engine speed');
    });
    if (rpmCol) {
      this.fieldNameMap['RPM'] = rpmCol;
    }
    
    // Get all numeric columns (exclude Time)
    this.availableFields = columns.filter(col => {
      const colLower = col.toLowerCase();
      return col !== 'Time (s)' && 
             !colLower.includes('time') &&
             (colLower.includes('rpm') ||
              colLower.includes('speed') ||
              colLower.includes('throttle') ||
              colLower.includes('load') ||
              colLower.includes('boost') ||
              colLower.includes('pressure') ||
              colLower.includes('temperature') ||
              colLower.includes('temp') ||
              colLower.includes('afr') ||
              colLower.includes('lambda') ||
              colLower.includes('fuel') ||
              colLower.includes('trim') ||
              colLower.includes('knock') ||
              colLower.includes('iam') ||
              colLower.includes('injector') ||
              colLower.includes('ignition') ||
              colLower.includes('timing') ||
              colLower.includes('voltage') ||
              colLower.includes('current') ||
              colLower.includes('duty') ||
              colLower.includes('percent') ||
              colLower.includes('%'));
    });
    
    // Ensure RPM column is in the list if it exists
    if (rpmCol && !this.availableFields.includes(rpmCol)) {
      this.availableFields.unshift(rpmCol);
    }
  },
  
  // Check if a field is enabled
  isEnabled(fieldName) {
    return this.enabledFields.includes(fieldName);
  },
  
  // Enable a field
  enableField(fieldName) {
    if (!this.enabledFields.includes(fieldName)) {
      this.enabledFields.push(fieldName);
      this.saveSettings();
      this.notifyChange();
    }
  },
  
  // Disable a field
  disableField(fieldName) {
    // Don't allow disabling default fields
    if (this.defaultFields.includes(fieldName)) {
      return;
    }
    
    const index = this.enabledFields.indexOf(fieldName);
    if (index > -1) {
      this.enabledFields.splice(index, 1);
      this.saveSettings();
      this.notifyChange();
    }
  },
  
  // Toggle a field
  toggleField(fieldName) {
    if (this.isEnabled(fieldName)) {
      this.disableField(fieldName);
    } else {
      this.enableField(fieldName);
    }
  },
  
  // Notify that settings changed (trigger chart updates)
  notifyChange() {
    // Dispatch custom event
    window.dispatchEvent(new CustomEvent('tooltipSettingsChanged'));
  },
  
  // Get tooltip footer text for a data point
  getTooltipFooter(dataIndex, dataRows) {
    if (!dataRows || dataIndex < 0 || dataIndex >= dataRows.length) {
      return '';
    }
    
    const row = dataRows[dataIndex];
    const lines = [];
    
    // Always show default fields first
    this.defaultFields.forEach(fieldName => {
      const value = this.getFieldValue(row, fieldName);
      if (value !== null && value !== undefined) {
        lines.push(`${fieldName}: ${this.formatValue(value, fieldName)}`);
      }
    });
    
    // Then show other enabled fields
    this.enabledFields.forEach(fieldName => {
      if (!this.defaultFields.includes(fieldName)) {
        const value = this.getFieldValue(row, fieldName);
        if (value !== null && value !== undefined) {
          lines.push(`${fieldName}: ${this.formatValue(value, fieldName)}`);
        }
      }
    });
    
    return lines.join('\n');
  },
  
  // Get field value from data row
  getFieldValue(row, fieldName) {
    // First check if we have a mapped column name
    const actualColumnName = this.fieldNameMap[fieldName] || fieldName;
    
    // Try exact match with mapped name
    if (row[actualColumnName] !== undefined) {
      return row[actualColumnName];
    }
    
    // Try exact match with original field name
    if (row[fieldName] !== undefined) {
      return row[fieldName];
    }
    
    // Try case-insensitive exact match
    const fieldLower = actualColumnName.toLowerCase();
    for (const key in row) {
      if (key.toLowerCase() === fieldLower) {
        return row[key];
      }
    }
    
    // Try partial match for common fields
    if (fieldName === 'RPM') {
      const rpmKey = Object.keys(row).find(k => {
        const kLower = k.toLowerCase();
        return kLower.includes('rpm') || kLower.includes('engine speed');
      });
      if (rpmKey) {
        return row[rpmKey];
      }
    } else {
      // For other fields, try partial match
      const matchingKey = Object.keys(row).find(k => {
        const kLower = k.toLowerCase();
        const fieldLower = fieldName.toLowerCase();
        // Check if field name is contained in column name or vice versa
        return kLower.includes(fieldLower) || fieldLower.includes(kLower);
      });
      if (matchingKey) {
        return row[matchingKey];
      }
    }
    
    return null;
  },
  
  // Format value for display
  formatValue(value, fieldName) {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      return value;
    }
    
    const fieldLower = fieldName.toLowerCase();
    
    // Format based on field type
    if (fieldLower.includes('rpm') || fieldLower.includes('speed')) {
      return Math.round(numValue);
    } else if (fieldLower.includes('percent') || fieldLower.includes('%') || 
                fieldLower.includes('trim') || fieldLower.includes('duty')) {
      return numValue.toFixed(1) + '%';
    } else if (fieldLower.includes('temperature') || fieldLower.includes('temp')) {
      return numValue.toFixed(1) + ' °C';
    } else if (fieldLower.includes('pressure') || fieldLower.includes('boost') || 
               fieldLower.includes('psi') || fieldLower.includes('kpa')) {
      return numValue.toFixed(2);
    } else if (fieldLower.includes('afr') || fieldLower.includes('lambda')) {
      return numValue.toFixed(2);
    } else if (fieldLower.includes('load')) {
      return numValue.toFixed(2);
    } else {
      return numValue.toFixed(2);
    }
  }
};

// Initialize on load
if (typeof window !== 'undefined') {
  window.TooltipConfig = TooltipConfig;
  TooltipConfig.init();
}

