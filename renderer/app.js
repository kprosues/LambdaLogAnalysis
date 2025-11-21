// Analysis modules are loaded via script tags in index.html
let dataProcessor = null;
let tabManager = null;

// Make dataProcessor globally accessible for tab modules
window.dataProcessor = null;

// DOM Elements
const openFileBtn = document.getElementById('openFileBtn');
const resetZoomBtn = document.getElementById('resetZoomBtn');
const dropZone = document.getElementById('dropZone');
const contentArea = document.getElementById('contentArea');
const loadingIndicator = document.getElementById('loadingIndicator');
const progressSection = document.getElementById('progressSection');
const loadingText = document.getElementById('loadingText');
const progressBar = document.getElementById('progressBar');
const loadingStatus = document.getElementById('loadingStatus');
const fileName = document.getElementById('fileName');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Ensure all DOM elements are available
  if (!openFileBtn) {
    console.error('Open file button not found');
    return;
  }
  
  // Initialize TabManager
  tabManager = new TabManager();
  
  // Register tabs
  const knockDetector = new KnockDetector(null); // Will be set when data is loaded
  const boostAnalyzer = new BoostControlAnalyzer(null); // Will be set when data is loaded
  const afrAnalyzer = new AFRAnalyzer(null); // Will be set when data is loaded
  
  tabManager.registerTab('knock', KnockAnalysisTab, knockDetector);
  tabManager.registerTab('boost', BoostControlTab, boostAnalyzer);
  tabManager.registerTab('afr', AFRAnalysisTab, afrAnalyzer);
  
  setupEventListeners();
  
  // Set default active tab
  tabManager.switchTab('knock');
});

function setupEventListeners() {
  // Open file button
  if (openFileBtn) {
    openFileBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleOpenFile();
    });
  } else {
    console.error('Open file button not found during setup');
  }
  
  // Reset zoom button - attach listener when button is available
  // The button exists in DOM but is hidden initially
  if (resetZoomBtn) {
    resetZoomBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('Reset zoom button clicked');
      resetChartZoom();
    });
  } else {
    console.warn('Reset zoom button not found during setup');
  }
  
  // Drag and drop
  if (dropZone) {
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDrop);
    dropZone.addEventListener('click', (e) => {
      e.preventDefault();
      handleOpenFile();
    });
  }
  
  // Tab button clicks - use event delegation on contentArea to ensure it always works
  if (contentArea) {
    contentArea.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('.tab-btn');
      if (tabBtn) {
        e.preventDefault();
        e.stopPropagation();
        const tabId = tabBtn.dataset.tab;
        if (tabId && tabManager) {
          console.log('Switching to tab:', tabId);
          tabManager.switchTab(tabId);
        } else {
          console.warn('Tab switch failed:', { tabId, hasTabManager: !!tabManager });
        }
      }
    });
  } else {
    // Fallback: direct listeners if contentArea doesn't exist yet
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const tabId = btn.dataset.tab;
        if (tabId && tabManager) {
          console.log('Switching to tab:', tabId);
          tabManager.switchTab(tabId);
        }
      });
    });
  }
}

async function handleOpenFile() {
  console.log('handleOpenFile called');
  
  if (!window.electronAPI) {
    alert('Electron API not available. Please run this application in Electron.');
    return;
  }

  try {
    const result = await window.electronAPI.openFileDialog();
    console.log('File dialog result:', result);
    
    if (result && result.success) {
      await processFile(result.content, result.path);
    } else if (result && !result.canceled) {
      alert(`Error opening file: ${result.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Error in handleOpenFile:', error);
    alert(`Error opening file: ${error.message}`);
  }
}

function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.add('drag-over');
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove('drag-over');
}

async function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove('drag-over');
  
  const files = e.dataTransfer.files;
  if (files.length > 0 && files[0].name.endsWith('.csv')) {
    const file = files[0];
    const reader = new FileReader();
    
    reader.onload = async (event) => {
      await processFile(event.target.result, file.name);
    };
    
    reader.readAsText(file);
  } else {
    alert('Please drop a CSV file.');
  }
}

async function processFile(content, filePath) {
  try {
    console.log('processFile started');
    
    // Show progress bar immediately (part of page, not modal)
    if (progressSection) {
      progressSection.style.display = 'block';
    }
    updateProgress(0, 'Starting...');
    
    // Show loading modal only briefly for initial feedback
    showLoading(true);
    // Hide modal quickly, keep progress bar visible
    setTimeout(() => {
      if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
      }
    }, 100);
    
    // Step 1: Parse CSV (40% of progress)
    console.log('Starting CSV parse...');
    updateProgress(10, 'Parsing CSV file...');
    dataProcessor = new DataProcessor();
    // Make globally accessible
    window.dataProcessor = dataProcessor;
    
    // Create progress callback that safely handles errors
    const progressCallback = (progress) => {
      try {
        // PapaParse progress is 0-100, map to 10-40% of total
        const mappedProgress = 10 + (progress * 0.3);
        console.log('CSV parse progress:', progress, '->', mappedProgress);
        updateProgress(mappedProgress, 'Parsing CSV file...');
      } catch (err) {
        console.warn('Progress update error:', err);
      }
    };
    
    console.log('Calling parseCSV...');
    const parseResult = await dataProcessor.parseCSV(content, progressCallback);
    console.log('CSV parse completed:', parseResult);
    
    updateProgress(40, 'CSV parsed successfully');
    
    // Debug: Log column names to console
    console.log('Parsed columns:', dataProcessor.getColumns());
    console.log('Total rows:', parseResult.rowCount);
    
    // Step 2: Initialize analyzers and run analysis (30% of progress)
    updateProgress(45, 'Analyzing data...');
    
    // Clear tab cache
    tabManager.clearCache();
    
    // Update analyzers with data processor
    const knockDetector = tabManager.getTabAnalyzer('knock');
    const boostAnalyzer = tabManager.getTabAnalyzer('boost');
    const afrAnalyzer = tabManager.getTabAnalyzer('afr');
    
    console.log('Setting dataProcessor on analyzers...');
    console.log('dataProcessor:', dataProcessor);
    console.log('dataProcessor columns:', dataProcessor ? dataProcessor.getColumns() : 'N/A');
    
    if (knockDetector) {
      knockDetector.dataProcessor = dataProcessor;
      console.log('✓ Set dataProcessor on knockDetector');
    }
    if (boostAnalyzer) {
      boostAnalyzer.dataProcessor = dataProcessor;
      console.log('✓ Set dataProcessor on boostAnalyzer');
      console.log('boostAnalyzer.dataProcessor:', boostAnalyzer.dataProcessor);
      console.log('boostAnalyzer.dataProcessor columns:', boostAnalyzer.dataProcessor ? boostAnalyzer.dataProcessor.getColumns() : 'N/A');
    }
    if (afrAnalyzer) {
      afrAnalyzer.dataProcessor = dataProcessor;
      console.log('✓ Set dataProcessor on afrAnalyzer');
    }
    
    // Run knock analysis
    updateProgress(50, 'Detecting knock events...');
    if (knockDetector) {
      const knockEvents = knockDetector.detectKnockEvents();
      console.log('Detected knock events:', knockEvents.length);
      tabManager.cache.set('knock', { events: knockEvents });
    }
    
    // Run boost control analysis
    updateProgress(60, 'Analyzing boost control...');
    if (boostAnalyzer) {
      const boostAnalysis = boostAnalyzer.analyze();
      console.log('Boost analysis complete:', boostAnalysis ? 'success' : 'failed');
      if (boostAnalysis) {
        console.log('Boost analysis results:', {
          events: boostAnalysis.events?.length || 0,
          hasStats: !!boostAnalysis.statistics,
          hasColumns: !!boostAnalysis.columns,
          error: boostAnalysis.error
        });
        tabManager.cache.set('boost', boostAnalysis);
      } else {
        console.error('Boost analysis returned null');
      }
    } else {
      console.error('Boost analyzer not available');
    }
    
    // Run AFR analysis
    updateProgress(65, 'Analyzing air/fuel ratio...');
    if (afrAnalyzer) {
      const afrAnalysis = afrAnalyzer.analyze();
      console.log('AFR analysis complete:', afrAnalysis ? 'success' : 'failed');
      if (afrAnalysis) {
        console.log('AFR analysis results:', {
          events: afrAnalysis.events?.length || 0,
          hasStats: !!afrAnalysis.statistics,
          hasColumns: !!afrAnalysis.columns,
          error: afrAnalysis.error
        });
        tabManager.cache.set('afr', afrAnalysis);
      } else {
        console.error('AFR analysis returned null');
      }
    } else {
      console.error('AFR analyzer not available');
    }
    
    updateProgress(70, 'Analysis complete');
    
    // Step 3: Update UI (10% of progress)
    console.log('Updating UI...');
    updateProgress(75, 'Updating interface...');
    await new Promise(resolve => setTimeout(resolve, 10));
    
    fileName.textContent = filePath.split(/[\\/]/).pop();
    dropZone.style.display = 'none';
    contentArea.style.display = 'block';
    
    // Show reset zoom button
    if (resetZoomBtn) {
      resetZoomBtn.style.display = 'inline-block';
    }
    
    // Step 4: Render active tab (15% of progress)
    console.log('Rendering active tab...');
    updateProgress(80, 'Rendering charts and statistics...');
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Render the active tab (default is 'knock')
    const activeTabId = tabManager.getActiveTab() || 'knock';
    tabManager.switchTab(activeTabId);
    
    // Complete
    console.log('File processing complete!');
    updateProgress(100, 'Complete!');
    
    // Hide progress bar after a brief delay to show 100%
    setTimeout(() => {
      if (progressSection) {
        progressSection.style.display = 'none';
      }
      showLoading(false);
    }, 500);
    
  } catch (error) {
    console.error('Error processing file:', error);
    alert(`Error processing file: ${error.message}`);
    showLoading(false);
  }
}

// These functions are now handled by tab modules
// Keeping for backward compatibility but they should not be called directly
function updateStatistics() {
  const activeTabId = tabManager.getActiveTab();
  const tab = tabManager.tabs.get(activeTabId);
  if (tab && tab.module && tab.module.updateStatistics) {
    tab.module.updateStatistics();
  }
}

function renderCharts() {
  const activeTabId = tabManager.getActiveTab();
  const tab = tabManager.tabs.get(activeTabId);
  if (tab && tab.module && tab.module.renderCharts) {
    tab.module.renderCharts();
  }
}

function updateTable() {
  const activeTabId = tabManager.getActiveTab();
  const tab = tabManager.tabs.get(activeTabId);
  if (tab && tab.module && tab.module.updateTable) {
    tab.module.updateTable();
  }
}


function showLoading(show) {
  // Show/hide the modal spinner (for initial loading state)
  if (loadingIndicator) {
    loadingIndicator.style.display = show ? 'flex' : 'none';
  }
  
  // Show/hide the progress bar section (part of the page)
  if (progressSection) {
    progressSection.style.display = show ? 'block' : 'none';
  }
  
  if (show) {
    updateProgress(0, 'Starting...');
  } else {
    // Reset progress when hiding
    updateProgress(0, '');
  }
}

function updateProgress(percent, text) {
  try {
    const clampedPercent = Math.min(100, Math.max(0, percent));
    
    // Use requestAnimationFrame to ensure UI updates are visible
    requestAnimationFrame(() => {
      if (progressBar) {
        progressBar.style.width = `${clampedPercent}%`;
      } else {
        console.warn('progressBar element not found');
      }
      
      if (loadingStatus) {
        loadingStatus.textContent = `${Math.round(clampedPercent)}%`;
      } else {
        console.warn('loadingStatus element not found');
      }
      
      if (loadingText && text) {
        loadingText.textContent = text;
      } else if (text) {
        console.warn('loadingText element not found');
      }
    });
  } catch (error) {
    console.error('Error updating progress:', error);
  }
}

function resetChartZoom() {
  console.log('resetChartZoom called');
  
  const activeTabId = tabManager.getActiveTab();
  if (!activeTabId) {
    console.warn('No active tab');
    return;
  }
  
  const tab = tabManager.tabs.get(activeTabId);
  if (!tab || !tab.module) {
    console.warn('Active tab module not found');
    return;
  }
  
  const charts = tab.module.charts || {};
  const chartOriginalRanges = tab.module.chartOriginalRanges || {};
  
  // Check if charts exist
  if (!charts || Object.keys(charts).length === 0) {
    console.warn('No charts available to reset');
    return;
  }
  
  // Reset all charts to show full data range
  Object.keys(charts).forEach(key => {
    const chart = charts[key];
    if (!chart) {
      console.warn(`Chart ${key} is null`);
      return;
    }
    
    const originalRange = chartOriginalRanges[key];
    if (!originalRange) {
      console.warn(`No original range for ${key}`);
      return;
    }
    
    // Always use manual reset to ensure consistent behavior
    resetChartManually(chart, originalRange);
  });
}

function resetChartManually(chart, originalRange) {
  // Manual reset: properly clear zoom plugin state and restore original range
  if (!chart.options?.scales?.x) {
    return;
  }
  
  // Clear any zoom plugin internal state by resetting the zoom limits
  if (chart.options.plugins?.zoom?.limits?.x) {
    chart.options.plugins.zoom.limits.x.min = originalRange.min;
    chart.options.plugins.zoom.limits.x.max = originalRange.max;
  }
  
  // Delete min/max from scale options to clear current zoom
  delete chart.options.scales.x.min;
  delete chart.options.scales.x.max;
  
  // Also clear from the scale object itself if it exists
  if (chart.scales?.x) {
    // Force the scale to recalculate by clearing its cached min/max
    if (chart.scales.x.options) {
      delete chart.scales.x.options.min;
      delete chart.scales.x.options.max;
    }
  }
  
  // Update chart to clear zoom state
  chart.update('none');
  
  // Now set to original range
  chart.options.scales.x.min = originalRange.min;
  chart.options.scales.x.max = originalRange.max;
  
  // Update again with new range
  chart.update('none');
  
  // Verify the reset worked
  setTimeout(() => {
    const scale = chart.scales?.x;
    if (scale && (scale.min !== originalRange.min || scale.max !== originalRange.max)) {
      // Force reset again if it didn't work
      scale.min = originalRange.min;
      scale.max = originalRange.max;
      if (chart.options?.scales?.x) {
        chart.options.scales.x.min = originalRange.min;
        chart.options.scales.x.max = originalRange.max;
      }
      chart.update('none');
    }
  }, 50);
}

function synchronizeChartZoom(sourceChart) {
  // Prevent infinite loop by checking if we're already synchronizing
  if (sourceChart._syncing) {
    return;
  }
  
  // Get the X-axis scale from the source chart
  const sourceScale = sourceChart.scales.x;
  if (!sourceScale) {
    return;
  }
  
  // Get the min and max values from the source chart's X-axis
  const min = sourceScale.min;
  const max = sourceScale.max;
  
  const activeTabId = tabManager.getActiveTab();
  if (!activeTabId) {
    return;
  }
  
  const tab = tabManager.tabs.get(activeTabId);
  if (!tab || !tab.module) {
    return;
  }
  
  const charts = tab.module.charts || {};
  const chartOriginalRanges = tab.module.chartOriginalRanges || {};
  
  // Find which chart this is
  let sourceChartKey = null;
  Object.keys(charts).forEach(key => {
    if (charts[key] === sourceChart) {
      sourceChartKey = key;
    }
  });
  
  if (!sourceChartKey || !chartOriginalRanges[sourceChartKey]) {
    return;
  }
  
  const originalMin = chartOriginalRanges[sourceChartKey].min;
  const originalMax = chartOriginalRanges[sourceChartKey].max;
  const originalRange = originalMax - originalMin;
  const currentRange = max - min;
  
  // Check if we're at full zoom (within 1% tolerance)
  const isFullZoom = Math.abs(currentRange - originalRange) / originalRange < 0.01;
  
  // Apply the same zoom to all other charts in this tab
  Object.keys(charts).forEach(key => {
    if (charts[key] && charts[key] !== sourceChart) {
      const targetChart = charts[key];
      targetChart._syncing = true; // Prevent recursive sync
      
      if (isFullZoom) {
        // Reset zoom on all charts using manual reset
        const targetOriginal = chartOriginalRanges[key];
        if (targetOriginal) {
          resetChartManually(targetChart, targetOriginal);
        }
      } else {
        // Calculate the relative position in the original range
        const sourceRelativeMin = (min - originalMin) / originalRange;
        const sourceRelativeMax = (max - originalMin) / originalRange;
        
        // Apply same relative zoom to target chart
        const targetOriginal = chartOriginalRanges[key];
        if (targetOriginal) {
          const targetMin = targetOriginal.min + (sourceRelativeMin * (targetOriginal.max - targetOriginal.min));
          const targetMax = targetOriginal.min + (sourceRelativeMax * (targetOriginal.max - targetOriginal.min));
          
          // Apply zoom
          if (targetChart.options?.scales?.x) {
            targetChart.options.scales.x.min = targetMin;
            targetChart.options.scales.x.max = targetMax;
          }
          targetChart.update('none');
        }
      }
      
      targetChart._syncing = false;
    }
  });
  
  sourceChart._syncing = false;
}

