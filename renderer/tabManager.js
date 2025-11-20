// TabManager class for managing multiple analysis tabs
class TabManager {
  constructor() {
    this.tabs = new Map();
    this.activeTabId = null;
    this.cache = new Map(); // Cache analysis results per tab
  }

  registerTab(tabId, tabModule, analyzer) {
    this.tabs.set(tabId, {
      module: tabModule,
      analyzer: analyzer,
      initialized: false
    });
  }

  switchTab(tabId) {
    if (!this.tabs.has(tabId)) {
      console.error(`Tab ${tabId} not found. Available tabs:`, Array.from(this.tabs.keys()));
      return;
    }

    // Update active tab
    this.activeTabId = tabId;
    const tab = this.tabs.get(tabId);

    // Update UI - hide all tab contents and buttons
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('active');
    });

    // Show active tab content and button
    const activeContent = document.querySelector(`.tab-content[data-tab="${tabId}"]`);
    const activeButton = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    
    if (activeContent) {
      activeContent.classList.add('active');
    } else {
      console.error(`Tab content not found for tab: ${tabId}`);
    }
    
    if (activeButton) {
      activeButton.classList.add('active');
    } else {
      console.error(`Tab button not found for tab: ${tabId}`);
    }

    // Initialize tab if not already done
    if (!tab.initialized && tab.module && tab.module.initialize) {
      try {
        tab.module.initialize();
        tab.initialized = true;
      } catch (error) {
        console.error(`Error initializing tab ${tabId}:`, error);
      }
    }

    // Run analysis if not cached
    if (!this.cache.has(tabId) && tab.analyzer) {
      try {
        const analysisResult = tab.analyzer.analyze ? tab.analyzer.analyze() : null;
        this.cache.set(tabId, analysisResult);
      } catch (error) {
        console.error(`Error running analysis for tab ${tabId}:`, error);
      }
    }

    // Render the active tab (defer to avoid blocking UI during tab switch)
    if (tab.module && tab.module.render) {
      // Use setTimeout to allow UI to update first, then render
      setTimeout(() => {
        try {
          tab.module.render(this.cache.get(tabId));
        } catch (error) {
          console.error(`Error rendering tab ${tabId}:`, error);
        }
      }, 0);
    } else {
      console.warn(`Tab ${tabId} module or render method not available`);
    }
  }

  getActiveTab() {
    return this.activeTabId;
  }

  getCachedAnalysis(tabId) {
    return this.cache.get(tabId);
  }

  clearCache() {
    this.cache.clear();
    // Reset initialized state for all tabs
    this.tabs.forEach(tab => {
      tab.initialized = false;
    });
  }

  getTabAnalyzer(tabId) {
    const tab = this.tabs.get(tabId);
    return tab ? tab.analyzer : null;
  }
}

