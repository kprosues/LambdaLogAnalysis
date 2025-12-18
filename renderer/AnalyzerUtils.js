// Shared utilities for analyzer classes
// Eliminates code duplication across KnockDetector, BoostControlAnalyzer, etc.

(function() {
  'use strict';

  const AnalyzerUtils = {
    /**
     * Find a column name from a list of possible names (case-insensitive, flexible matching)
     * @param {string[]} columns - Available column names
     * @param {string[]} possibleNames - List of possible column names to match
     * @returns {string|null} - Matched column name or null
     */
    findColumn(columns, possibleNames) {
      if (!columns || !Array.isArray(columns) || !possibleNames || !Array.isArray(possibleNames)) {
        return null;
      }

      // First try exact match
      for (const name of possibleNames) {
        if (columns.includes(name)) {
          return name;
        }
      }

      // Try case-insensitive exact match
      for (const name of possibleNames) {
        const found = columns.find(col => col.toLowerCase() === name.toLowerCase());
        if (found) {
          return found;
        }
      }

      // Try partial matching (case-insensitive)
      const normalize = (str) => str.toLowerCase().replace(/[()°%-\s]/g, '');
      
      for (const name of possibleNames) {
        const normalizedName = normalize(name);
        const found = columns.find(col => {
          const normalizedCol = normalize(col);
          const nameWords = normalizedName.split(/\s+/).filter(w => w.length > 2);
          return nameWords.every(word => normalizedCol.includes(word));
        });
        if (found) {
          return found;
        }
      }

      return null;
    },

    /**
     * Group events by time window
     * @param {Object[]} events - Array of event objects with 'time' property
     * @param {number} timeWindow - Time window in seconds
     * @param {Function} createGroupedEvent - Function to create grouped event from event array
     * @returns {Object[]} - Array of grouped events
     */
    groupEventsByTime(events, timeWindow, createGroupedEvent) {
      if (!events || events.length === 0) {
        return [];
      }

      // Sort events by time
      const sortedEvents = [...events].sort((a, b) => a.time - b.time);
      const groupedEvents = [];
      let currentGroup = [sortedEvents[0]];

      for (let i = 1; i < sortedEvents.length; i++) {
        const currentEvent = sortedEvents[i];
        const lastEventInGroup = currentGroup[currentGroup.length - 1];
        const timeDiff = currentEvent.time - lastEventInGroup.time;

        if (timeDiff <= timeWindow) {
          currentGroup.push(currentEvent);
        } else {
          groupedEvents.push(createGroupedEvent(currentGroup));
          currentGroup = [currentEvent];
        }
      }

      // Don't forget the last group
      if (currentGroup.length > 0) {
        groupedEvents.push(createGroupedEvent(currentGroup));
      }

      return groupedEvents;
    },

    /**
     * Group events by type and time
     * @param {Object[]} events - Array of event objects
     * @param {string} typeProperty - Property name for event type
     * @param {number} timeWindow - Time window in seconds
     * @param {Function} createGroupedEvent - Function to create grouped event
     * @returns {Object[]} - Array of grouped events sorted by time
     */
    groupEventsByTypeAndTime(events, typeProperty, timeWindow, createGroupedEvent) {
      if (!events || events.length === 0) {
        return [];
      }

      // Separate events by type
      const eventsByType = new Map();
      events.forEach(event => {
        const type = event[typeProperty];
        if (!eventsByType.has(type)) {
          eventsByType.set(type, []);
        }
        eventsByType.get(type).push(event);
      });

      // Group each type separately
      const allGrouped = [];
      eventsByType.forEach((typeEvents, type) => {
        const grouped = this.groupEventsByTime(typeEvents, timeWindow, createGroupedEvent);
        allGrouped.push(...grouped);
      });

      // Sort all grouped events by time
      return allGrouped.sort((a, b) => a.time - b.time);
    },

    /**
     * Calculate weighted average
     * @param {number[]} values - Array of values
     * @param {number[]} weights - Array of weights (same length as values)
     * @returns {number} - Weighted average
     */
    weightedAverage(values, weights) {
      if (!values || !weights || values.length === 0 || values.length !== weights.length) {
        return 0;
      }

      let totalWeight = 0;
      let weightedSum = 0;

      for (let i = 0; i < values.length; i++) {
        const val = values[i];
        const weight = weights[i];
        if (isFinite(val) && isFinite(weight) && weight > 0) {
          weightedSum += val * weight;
          totalWeight += weight;
        }
      }

      return totalWeight > 0 ? weightedSum / totalWeight : 0;
    },

    /**
     * Calculate simple average
     * @param {number[]} values - Array of values
     * @returns {number} - Average
     */
    average(values) {
      if (!values || values.length === 0) {
        return 0;
      }

      let sum = 0;
      let count = 0;

      for (const val of values) {
        if (isFinite(val)) {
          sum += val;
          count++;
        }
      }

      return count > 0 ? sum / count : 0;
    },

    /**
     * Calculate statistics for an array of values
     * @param {number[]} values - Array of values
     * @returns {Object} - Statistics object { min, max, avg, sum, count }
     */
    calculateStats(values) {
      if (!values || values.length === 0) {
        return { min: 0, max: 0, avg: 0, sum: 0, count: 0 };
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
        sum,
        count
      };
    },

    /**
     * Binary search to find closest time index
     * @param {Object[]} data - Array of data rows with time values
     * @param {number} targetTime - Target time to find
     * @param {string} timeColumn - Column name for time
     * @returns {number} - Index of closest match
     */
    binarySearchTime(data, targetTime, timeColumn = 'Time (s)') {
      if (!data || data.length === 0) {
        return -1;
      }

      let left = 0;
      let right = data.length - 1;

      // Handle edge cases
      if (targetTime <= data[left][timeColumn]) {
        return left;
      }
      if (targetTime >= data[right][timeColumn]) {
        return right;
      }

      // Binary search
      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const midTime = data[mid][timeColumn];

        if (midTime === targetTime) {
          return mid;
        }

        if (midTime < targetTime) {
          left = mid + 1;
        } else {
          right = mid - 1;
        }
      }

      // Find closest between left and right
      const leftTime = data[Math.max(0, left - 1)][timeColumn];
      const rightTime = data[Math.min(data.length - 1, left)][timeColumn];
      
      if (Math.abs(leftTime - targetTime) <= Math.abs(rightTime - targetTime)) {
        return Math.max(0, left - 1);
      }
      return Math.min(data.length - 1, left);
    },

    /**
     * Filter events by minimum duration
     * @param {Object[]} events - Array of events with duration property
     * @param {number} minDuration - Minimum duration in seconds
     * @returns {Object[]} - Filtered events
     */
    filterByDuration(events, minDuration) {
      if (!events || minDuration <= 0) {
        return events || [];
      }

      return events.filter(event => (event.duration || 0) >= minDuration);
    },

    /**
     * Create a standard error result for analyzers
     * @param {string} message - Error message
     * @param {string} code - Error code
     * @returns {Object} - Error result object
     */
    createErrorResult(message, code = 'ANALYSIS_ERROR') {
      return {
        error: true,
        errorCode: code,
        errorMessage: message,
        events: [],
        statistics: null
      };
    },

    /**
     * Create a standard success result for analyzers
     * @param {Object[]} events - Array of events
     * @param {Object} statistics - Statistics object
     * @param {Object} extra - Additional properties
     * @returns {Object} - Success result object
     */
    createSuccessResult(events, statistics, extra = {}) {
      return {
        error: false,
        events: events || [],
        statistics: statistics || {},
        ...extra
      };
    },

    /**
     * Safe parse float with default
     * @param {*} value - Value to parse
     * @param {number} defaultValue - Default value if parsing fails
     * @returns {number} - Parsed value or default
     */
    safeParseFloat(value, defaultValue = 0) {
      if (typeof value === 'number' && isFinite(value)) {
        return value;
      }
      const parsed = parseFloat(value);
      return isFinite(parsed) ? parsed : defaultValue;
    },

    /**
     * Classify severity based on value and thresholds
     * @param {number} value - Value to classify
     * @param {Object} thresholds - Object with threshold values { critical, severe, moderate }
     * @param {boolean} useAbsolute - Whether to use absolute value
     * @returns {string} - Severity level: 'critical', 'severe', 'moderate', or 'mild'
     */
    classifySeverity(value, thresholds, useAbsolute = false) {
      const v = useAbsolute ? Math.abs(value) : value;
      
      if (thresholds.critical !== undefined && v < thresholds.critical) {
        return 'critical';
      }
      if (thresholds.severe !== undefined && v < thresholds.severe) {
        return 'severe';
      }
      if (thresholds.moderate !== undefined && v < thresholds.moderate) {
        return 'moderate';
      }
      return 'mild';
    },

    /**
     * Apply data smoothing (moving average)
     * @param {number[]} dataArray - Array of values
     * @param {number} windowSize - Window size for moving average
     * @param {boolean} enabled - Whether smoothing is enabled
     * @returns {number[]} - Smoothed array (may be same reference if disabled)
     */
    applySmoothing(dataArray, windowSize, enabled = true) {
      if (!enabled || windowSize <= 1 || !dataArray || dataArray.length === 0) {
        return dataArray;
      }

      const smoothed = new Array(dataArray.length);
      const halfWindow = Math.floor(windowSize / 2);

      for (let i = 0; i < dataArray.length; i++) {
        const value = dataArray[i];

        // Preserve NaN values (gaps) without smoothing
        if (isNaN(value)) {
          smoothed[i] = NaN;
          continue;
        }

        // Calculate moving average
        let sum = 0;
        let count = 0;
        const start = Math.max(0, i - halfWindow);
        const end = Math.min(dataArray.length - 1, i + halfWindow);

        for (let j = start; j <= end; j++) {
          const val = dataArray[j];
          if (!isNaN(val) && typeof val === 'number') {
            sum += val;
            count++;
          }
        }

        smoothed[i] = count > 0 ? sum / count : value;
      }

      return smoothed;
    },

    /**
     * Debounce function
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in ms
     * @returns {Function} - Debounced function
     */
    debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    },

    /**
     * Throttle function
     * @param {Function} func - Function to throttle
     * @param {number} limit - Time limit in ms
     * @returns {Function} - Throttled function
     */
    throttle(func, limit) {
      let inThrottle;
      return function executedFunction(...args) {
        if (!inThrottle) {
          func(...args);
          inThrottle = true;
          setTimeout(() => { inThrottle = false; }, limit);
        }
      };
    }
  };

  // Export to window
  window.AnalyzerUtils = AnalyzerUtils;
})();

