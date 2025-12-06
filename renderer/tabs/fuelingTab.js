// Combined Fueling Tab Module - wraps AFR Analysis and Autotune functionality
const FuelingTab = {
  // Store references to the wrapped tab modules
  afrTab: null,
  autotuneTab: null,

  initialize() {
    // Initialize AFR Analysis tab functionality
    if (typeof AFRAnalysisTab !== 'undefined') {
      this.afrTab = AFRAnalysisTab;
      this.afrTab.initialize();
    } else {
      console.warn('AFRAnalysisTab not found');
    }

    // Initialize Autotune tab functionality
    if (typeof AutotuneTab !== 'undefined') {
      this.autotuneTab = AutotuneTab;
      this.autotuneTab.initialize();
    } else {
      console.warn('AutotuneTab not found');
    }
  },

  render(analysisData) {
    // Render AFR analysis section
    if (this.afrTab) {
      this.afrTab.render(analysisData);
    }

    // Render Autotune section (form-driven, doesn't need analysis data)
    if (this.autotuneTab) {
      this.autotuneTab.render();
    }
  }
};

