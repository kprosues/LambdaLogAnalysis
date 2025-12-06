// Combined Fuel Trim Tab Module - wraps Short Term and Long Term Fuel Trim functionality
const CombinedFuelTrimTab = {
  // Store references to the wrapped tab modules
  shortTermTab: null,
  longTermTab: null,

  initialize() {
    // Initialize Short Term Fuel Trim tab functionality
    if (typeof FuelTrimTab !== 'undefined') {
      this.shortTermTab = FuelTrimTab;
      this.shortTermTab.initialize();
    } else {
      console.warn('FuelTrimTab not found');
    }

    // Initialize Long Term Fuel Trim tab functionality
    if (typeof LongTermFuelTrimTab !== 'undefined') {
      this.longTermTab = LongTermFuelTrimTab;
      this.longTermTab.initialize();
    } else {
      console.warn('LongTermFuelTrimTab not found');
    }
  },

  render(analysisData) {
    // Note: analysisData parameter is ignored since we need to get both analyses separately
    // Render Short Term Fuel Trim section
    if (this.shortTermTab) {
      const shortTermData = tabManager ? tabManager.getCachedAnalysis('fueltrim') : null;
      this.shortTermTab.render(shortTermData);
    }

    // Render Long Term Fuel Trim section
    if (this.longTermTab) {
      const longTermData = tabManager ? tabManager.getCachedAnalysis('longtermfueltrim') : null;
      this.longTermTab.render(longTermData);
    }
  }
};

