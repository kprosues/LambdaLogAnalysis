// Analysis modules are loaded via script tags in index.html
let dataProcessor = null;
let tabManager = null;

// Make dataProcessor globally accessible for tab modules
window.dataProcessor = null;

// Shared smoothing state and utility
window.smoothingConfig = {
  enabled: true, // Enabled by default when log file is loaded
  windowSize: 5 // Moving average window size
};

// Shared smoothing utility function
window.applyDataSmoothing = function(dataArray, windowSize, enabled) {
  if (!enabled || windowSize <= 1) {
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
      // Only include valid numbers (not NaN) in the average
      if (!isNaN(val) && typeof val === 'number') {
        sum += val;
        count++;
      }
    }
    
    // Use original value if no valid neighbors found
    smoothed[i] = count > 0 ? sum / count : value;
  }
  
  return smoothed;
};

// DOM Elements
const openFileBtn = document.getElementById('openFileBtn');
const openTuneFileBtn = document.getElementById('openTuneFileBtn');
const resetZoomBtn = document.getElementById('resetZoomBtn');
const dropZone = document.getElementById('dropZone');
const contentArea = document.getElementById('contentArea');
const loadingIndicator = document.getElementById('loadingIndicator');
const progressSection = document.getElementById('progressSection');
const loadingText = document.getElementById('loadingText');
const progressBar = document.getElementById('progressBar');
const loadingStatus = document.getElementById('loadingStatus');
const fileName = document.getElementById('fileName');
const tuneFileName = document.getElementById('tuneFileName');
const contentLoadingOverlay = document.getElementById('contentLoadingOverlay');

// Global tune file parser instance
let tuneFileParser = null;
window.tuneFileParser = null;

// Initialize
// Initialize dark mode
function initializeDarkMode() {
  // Load saved preference
  const savedDarkMode = localStorage.getItem('darkMode') === 'true';
  if (savedDarkMode) {
    document.body.classList.add('dark-mode');
  }
  
  // Listen for menu toggle
  if (window.electronAPI && window.electronAPI.onToggleDarkMode) {
    window.electronAPI.onToggleDarkMode(() => {
      toggleDarkMode();
    });
  }
}

function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('darkMode', isDark.toString());
}

// Initialize tooltip settings dialog
function initializeTooltipSettings() {
  const settingsModal = document.getElementById('settingsModal');
  const closeSettingsModal = document.getElementById('closeSettingsModal');
  const cancelTooltipSettings = document.getElementById('cancelTooltipSettings');
  const saveTooltipSettings = document.getElementById('saveTooltipSettings');
  const tooltipFieldsList = document.getElementById('tooltipFieldsList');
  
  if (!settingsModal || !tooltipFieldsList) {
    return;
  }
  
  // Listen for menu item click
  if (window.electronAPI && window.electronAPI.onOpenTooltipSettings) {
    window.electronAPI.onOpenTooltipSettings(() => {
      console.log('Tooltip settings menu item clicked');
      openTooltipSettings();
    });
  } else {
    console.warn('electronAPI.onOpenTooltipSettings not available');
  }
  
  // Close modal handlers
  if (closeSettingsModal) {
    closeSettingsModal.addEventListener('click', () => {
      settingsModal.style.display = 'none';
    });
  }
  
  if (cancelTooltipSettings) {
    cancelTooltipSettings.addEventListener('click', () => {
      settingsModal.style.display = 'none';
    });
  }
  
  // Close on outside click
  window.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.style.display = 'none';
    }
  });
  
  // Save settings
  if (saveTooltipSettings) {
    saveTooltipSettings.addEventListener('click', () => {
      saveTooltipSettingsChanges();
      settingsModal.style.display = 'none';
    });
  }
  
  // Listen for tooltip settings changes to update charts
  window.addEventListener('tooltipSettingsChanged', () => {
    updateAllChartTooltips();
  });
}

function openTooltipSettings() {
  console.log('openTooltipSettings called');
  const settingsModal = document.getElementById('settingsModal');
  const tooltipFieldsList = document.getElementById('tooltipFieldsList');
  
  if (!settingsModal) {
    console.error('Settings modal not found in DOM');
    alert('Settings modal not found. Please refresh the page.');
    return;
  }
  
  if (!tooltipFieldsList) {
    console.error('Tooltip fields list not found in DOM');
    alert('Tooltip fields list not found. Please refresh the page.');
    return;
  }
  
  if (!window.TooltipConfig) {
    console.error('TooltipConfig not available');
    alert('Tooltip configuration system not loaded. Please refresh the page.');
    return;
  }
  
  console.log('Opening tooltip settings modal');
  
  // Update available fields from current log file
  if (window.dataProcessor) {
    const columns = window.dataProcessor.getColumns();
    if (columns && Array.isArray(columns)) {
      window.TooltipConfig.updateAvailableFields(columns);
    }
  }
  
  // Populate fields list
  tooltipFieldsList.innerHTML = '';
  
  // Add default fields (always enabled, can't be disabled)
  if (window.TooltipConfig.defaultFields && window.TooltipConfig.defaultFields.length > 0) {
    window.TooltipConfig.defaultFields.forEach(fieldName => {
      const item = createTooltipFieldItem(fieldName, true, true);
      tooltipFieldsList.appendChild(item);
    });
  }
  
  // Add separator if there are other fields
  if (window.TooltipConfig.availableFields && window.TooltipConfig.availableFields.length > 0) {
    const separator = document.createElement('div');
    separator.style.cssText = 'height: 1px; background: #ddd; margin: 10px 0;';
    tooltipFieldsList.appendChild(separator);
    
    // Add other available fields
    window.TooltipConfig.availableFields.forEach(fieldName => {
      if (!window.TooltipConfig.defaultFields.includes(fieldName)) {
        const isEnabled = window.TooltipConfig.isEnabled(fieldName);
        const item = createTooltipFieldItem(fieldName, isEnabled, false);
        tooltipFieldsList.appendChild(item);
      }
    });
  } else {
    // Show message if no log file is loaded
    const noDataMsg = document.createElement('p');
    noDataMsg.style.cssText = 'color: #666; font-style: italic; padding: 20px; text-align: center;';
    noDataMsg.textContent = 'No log file loaded. Please load a log file first to see available fields.';
    tooltipFieldsList.appendChild(noDataMsg);
  }
  
  // Show modal
  settingsModal.style.display = 'block';
  console.log('Modal displayed');
}

function createTooltipFieldItem(fieldName, isEnabled, isDefault) {
  const item = document.createElement('div');
  item.className = 'tooltip-field-item';
  
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = `tooltip-field-${fieldName.replace(/[^a-zA-Z0-9]/g, '-')}`;
  checkbox.checked = isEnabled;
  checkbox.disabled = isDefault;
  
  const label = document.createElement('label');
  label.htmlFor = checkbox.id;
  label.textContent = fieldName;
  if (isDefault) {
    label.style.fontWeight = 'bold';
    label.style.color = '#666';
  }
  
  checkbox.addEventListener('change', () => {
    if (!isDefault) {
      window.TooltipConfig.toggleField(fieldName);
    }
  });
  
  item.appendChild(checkbox);
  item.appendChild(label);
  
  return item;
}

function saveTooltipSettingsChanges() {
  // Settings are already saved when toggled, just trigger update
  window.TooltipConfig.notifyChange();
}

function updateAllChartTooltips() {
  // Trigger re-render of all charts to update tooltips
  if (window.tabManager) {
    const activeTabId = window.tabManager.getActiveTab();
    if (activeTabId) {
      const tab = window.tabManager.tabs.get(activeTabId);
      if (tab && tab.module && tab.module.renderCharts) {
        // Re-render charts with preserved zoom
        tab.module.renderCharts(true);
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Initialize dark mode first
  initializeDarkMode();
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
  const fuelTrimAnalyzer = new FuelTrimAnalyzer(null); // Will be set when data is loaded
  const longTermFuelTrimAnalyzer = new LongTermFuelTrimAnalyzer(null); // Will be set when data is loaded
  const iamAnalyzer = new IAMAnalyzer(null); // Will be set when data is loaded
  const loadLimitAnalyzer = new LoadLimitAnalyzer(null); // Will be set when data is loaded
  const coolantTemperatureAnalyzer = new CoolantTemperatureAnalyzer(null); // Will be set when data is loaded
  const intakeAirTemperatureAnalyzer = new IntakeAirTemperatureAnalyzer(null); // Will be set when data is loaded
  
  tabManager.registerTab('logscore', LogScoreTab, null); // No analyzer needed
  tabManager.registerTab('knock', KnockAnalysisTab, knockDetector);
  tabManager.registerTab('boost', BoostControlTab, boostAnalyzer);
  tabManager.registerTab('afr', AFRAnalysisTab, afrAnalyzer);
  tabManager.registerTab('autotune', AutotuneTab, null);
  tabManager.registerTab('fueltrim', FuelTrimTab, fuelTrimAnalyzer);
  tabManager.registerTab('longtermfueltrim', LongTermFuelTrimTab, longTermFuelTrimAnalyzer);
  tabManager.registerTab('iam', IAMAnalysisTab, iamAnalyzer);
  tabManager.registerTab('loadlimit', LoadLimitTab, loadLimitAnalyzer);
  tabManager.registerTab('coolanttemp', CoolantTemperatureTab, coolantTemperatureAnalyzer);
  tabManager.registerTab('iat', IntakeAirTemperatureTab, intakeAirTemperatureAnalyzer);
  
  setupEventListeners();
  
  // Initially disable log file button until tune file is loaded
  if (openFileBtn) {
    openFileBtn.disabled = true;
    openFileBtn.classList.remove('btn-primary');
    openFileBtn.classList.add('btn-secondary');
    openFileBtn.title = 'Please load a tune file first';
  }
  
  // Set default active tab
  tabManager.switchTab('logscore');
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

  // Open tune file button
  if (openTuneFileBtn) {
    openTuneFileBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleOpenTuneFile();
    });
  } else {
    console.warn('Open tune file button not found during setup');
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
  
  // Initialize tooltip settings dialog
  initializeTooltipSettings();
  
  // Add button click handler as fallback
  const openTooltipSettingsBtn = document.getElementById('openTooltipSettingsBtn');
  if (openTooltipSettingsBtn) {
    openTooltipSettingsBtn.addEventListener('click', () => {
      openTooltipSettings();
    });
  }
  
  // Global smoothing toggle
  const smoothDataToggle = document.getElementById('global-smoothDataToggle');
  if (smoothDataToggle) {
    smoothDataToggle.addEventListener('change', async (e) => {
      window.smoothingConfig.enabled = e.target.checked;
      
      // Re-render charts in the active tab
      const activeTabId = tabManager.getActiveTab();
      if (activeTabId) {
        // Show loading overlay for active tab
        const tabContent = document.querySelector(`.tab-content[data-tab="${activeTabId}"]`);
        if (tabContent) {
          tabContent.classList.add('loading');
          const overlay = tabContent.querySelector('.tab-loading-overlay');
          if (overlay) {
            overlay.style.display = 'flex';
          }
        }
        
        // Use multiple animation frames to ensure overlay is visible before operations
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => setTimeout(resolve, 50));
        
        const startTime = Date.now();
        const minDisplayTime = 300; // Minimum time to show overlay (ms)
        
        try {
          const tab = tabManager.tabs.get(activeTabId);
          if (tab && tab.module && tab.module.renderCharts) {
            // Preserve zoom when re-rendering
            tab.module.renderCharts(true);
          }
          
          // Ensure minimum display time
          const elapsed = Date.now() - startTime;
          const remainingTime = Math.max(0, minDisplayTime - elapsed);
          await new Promise(resolve => setTimeout(resolve, remainingTime));
        } finally {
          // Hide loading overlay
          if (tabContent) {
            tabContent.classList.remove('loading');
            const overlay = tabContent.querySelector('.tab-loading-overlay');
            if (overlay) {
              overlay.style.display = 'none';
            }
          }
        }
      }
    });
  }
}

async function handleOpenFile() {
  console.log('handleOpenFile called');
  
  if (!window.electronAPI) {
    alert('Electron API not available. Please run this application in Electron.');
    return;
  }

  // Check if tune file is loaded
  if (!window.tuneFileParser || !window.tuneFileParser.isLoaded()) {
    alert('Please load a tune file first before opening a log file.\n\nClick "Load Tune File" to select a tune file.');
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

async function handleOpenTuneFile() {
  console.log('handleOpenTuneFile called');
  
  if (!window.electronAPI) {
    alert('Electron API not available. Please run this application in Electron.');
    return;
  }

  try {
    const result = await window.electronAPI.openTuneFileDialog();
    console.log('Tune file dialog result:', result);
    
    if (result && result.success) {
      // Parse tune file
      tuneFileParser = new TuneFileParser();
      const parseSuccess = tuneFileParser.parse(result.content);
      
      if (parseSuccess && tuneFileParser.isLoaded()) {
        window.tuneFileParser = tuneFileParser;
        
        // Update UI
        if (tuneFileName) {
          const fileName = result.path ? result.path.split(/[/\\]/).pop() : 'Tune file loaded';
          tuneFileName.textContent = fileName;
          tuneFileName.style.display = 'inline';
        }
        
        // Enable log file button now that tune file is loaded
        if (openFileBtn) {
          openFileBtn.disabled = false;
          openFileBtn.classList.remove('btn-secondary');
          openFileBtn.classList.add('btn-primary');
          openFileBtn.title = '';
        }
        
        // Add green checkmark to tune file button
        if (openTuneFileBtn) {
          openTuneFileBtn.classList.add('btn-success');
        }
        
        console.log('Tune file loaded successfully. Version:', tuneFileParser.getVersion());
        console.log('Maps loaded:', tuneFileParser.maps.size);
        
        // If log file is already loaded, clear cache so analyzers can re-run with tune file
        if (dataProcessor && dataProcessor.data && tabManager) {
          console.log('Log file already loaded. Clear cache to re-run analysis with tune file.');
          tabManager.clearCache();
          // Re-run analysis for active tab
          const activeTabId = tabManager.getActiveTab();
          if (activeTabId) {
            tabManager.switchTab(activeTabId);
          }
        }
      } else {
        alert('Error parsing tune file. Please ensure it is a valid JSON tune file.');
        tuneFileParser = null;
        window.tuneFileParser = null;
        if (tuneFileName) {
          tuneFileName.style.display = 'none';
        }
        // Keep log file button disabled if tune file failed to load
        if (openFileBtn) {
          openFileBtn.disabled = true;
          openFileBtn.classList.remove('btn-primary', 'btn-success');
          openFileBtn.classList.add('btn-secondary');
          openFileBtn.title = 'Please load a tune file first';
        }
        
        // Remove green checkmark from tune file button on error
        if (openTuneFileBtn) {
          openTuneFileBtn.classList.remove('btn-success');
        }
      }
    } else if (result && !result.canceled) {
      alert(`Error opening tune file: ${result.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Error in handleOpenTuneFile:', error);
    alert(`Error opening tune file: ${error.message}`);
    tuneFileParser = null;
    window.tuneFileParser = null;
    if (tuneFileName) {
      tuneFileName.style.display = 'none';
    }
    // Keep log file button disabled if tune file failed to load
    if (openFileBtn) {
      openFileBtn.disabled = true;
      openFileBtn.classList.remove('btn-primary', 'btn-success');
      openFileBtn.classList.add('btn-secondary');
      openFileBtn.title = 'Please load a tune file first';
    }
    
    // Remove green checkmark from tune file button on error
    if (openTuneFileBtn) {
      openTuneFileBtn.classList.remove('btn-success');
    }
  }
}

function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  if (dropZone) {
    dropZone.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  if (dropZone) {
    dropZone.classList.remove('drag-over');
  }
}

async function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  if (dropZone) {
    dropZone.classList.remove('drag-over');
  }
  
  // Check if tune file is loaded
  if (!window.tuneFileParser || !window.tuneFileParser.isLoaded()) {
    alert('Please load a tune file first before opening a log file.\n\nClick "Load Tune File" to select a tune file.');
    return;
  }
  
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
    
    // Remove checkmark from log file button while processing
    if (openFileBtn) {
      openFileBtn.classList.remove('btn-success');
    }
    
    // Show progress bar immediately (part of page, not modal)
    if (progressSection) {
      progressSection.style.display = 'block';
    }
    updateProgress(0, 'Starting...');
    
    // Show content area early with loading state
    if (contentArea) {
      contentArea.style.display = 'block';
      contentArea.classList.add('loading');
    }
    if (contentLoadingOverlay) {
      contentLoadingOverlay.style.display = 'flex';
    }
    
    // Step 1: Parse CSV (40% of progress)
    console.log('Starting CSV parse...');
    updateProgress(10, 'Parsing CSV file...');
    dataProcessor = new DataProcessor();
    // Make globally accessible
    window.dataProcessor = dataProcessor;
    
    // Update tooltip config with available fields
    if (window.TooltipConfig && dataProcessor) {
      const columns = dataProcessor.getColumns();
      if (columns) {
        window.TooltipConfig.updateAvailableFields(columns);
      }
    }
    
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
    const fuelTrimAnalyzer = tabManager.getTabAnalyzer('fueltrim');
    const longTermFuelTrimAnalyzer = tabManager.getTabAnalyzer('longtermfueltrim');
    const iamAnalyzer = tabManager.getTabAnalyzer('iam');
    const loadLimitAnalyzer = tabManager.getTabAnalyzer('loadlimit');
    const coolantTemperatureAnalyzer = tabManager.getTabAnalyzer('coolanttemp');
    const intakeAirTemperatureAnalyzer = tabManager.getTabAnalyzer('iat');
    
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
    if (fuelTrimAnalyzer) {
      fuelTrimAnalyzer.dataProcessor = dataProcessor;
      console.log('✓ Set dataProcessor on fuelTrimAnalyzer');
    }
    if (longTermFuelTrimAnalyzer) {
      longTermFuelTrimAnalyzer.dataProcessor = dataProcessor;
      console.log('✓ Set dataProcessor on longTermFuelTrimAnalyzer');
    }
    if (iamAnalyzer) {
      iamAnalyzer.dataProcessor = dataProcessor;
      console.log('✓ Set dataProcessor on iamAnalyzer');
    }
    if (loadLimitAnalyzer) {
      loadLimitAnalyzer.dataProcessor = dataProcessor;
      console.log('✓ Set dataProcessor on loadLimitAnalyzer');
    }
    if (coolantTemperatureAnalyzer) {
      coolantTemperatureAnalyzer.dataProcessor = dataProcessor;
      console.log('✓ Set dataProcessor on coolantTemperatureAnalyzer');
    }
    if (intakeAirTemperatureAnalyzer) {
      intakeAirTemperatureAnalyzer.dataProcessor = dataProcessor;
      console.log('✓ Set dataProcessor on intakeAirTemperatureAnalyzer');
    }
    
    // Make knockDetector globally accessible for IAM correlation
    window.knockDetector = knockDetector;
    
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
    
    // Run fuel trim analysis
    updateProgress(67, 'Analyzing short term fuel trim...');
    if (fuelTrimAnalyzer) {
      const fuelTrimAnalysis = fuelTrimAnalyzer.analyze();
      console.log('Fuel trim analysis complete:', fuelTrimAnalysis ? 'success' : 'failed');
      if (fuelTrimAnalysis) {
        console.log('Fuel trim analysis results:', {
          events: fuelTrimAnalysis.events?.length || 0,
          hasStats: !!fuelTrimAnalysis.statistics,
          hasColumns: !!fuelTrimAnalysis.columns,
          error: fuelTrimAnalysis.error
        });
        tabManager.cache.set('fueltrim', fuelTrimAnalysis);
      } else {
        console.error('Fuel trim analysis returned null');
      }
    } else {
      console.error('Fuel trim analyzer not available');
    }
    
    // Run long term fuel trim analysis
    updateProgress(68, 'Analyzing long term fuel trim...');
    if (longTermFuelTrimAnalyzer) {
      const longTermFuelTrimAnalysis = longTermFuelTrimAnalyzer.analyze();
      console.log('Long term fuel trim analysis complete:', longTermFuelTrimAnalysis ? 'success' : 'failed');
      if (longTermFuelTrimAnalysis) {
        console.log('Long term fuel trim analysis results:', {
          events: longTermFuelTrimAnalysis.events?.length || 0,
          hasStats: !!longTermFuelTrimAnalysis.statistics,
          hasColumns: !!longTermFuelTrimAnalysis.columns,
          error: longTermFuelTrimAnalysis.error
        });
        tabManager.cache.set('longtermfueltrim', longTermFuelTrimAnalysis);
      } else {
        console.error('Long term fuel trim analysis returned null');
      }
    } else {
      console.error('Long term fuel trim analyzer not available');
    }
    
    // Run IAM analysis
    updateProgress(70, 'Analyzing IAM...');
    if (iamAnalyzer) {
      const iamAnalysis = iamAnalyzer.analyze();
      console.log('IAM analysis complete:', iamAnalysis ? 'success' : 'failed');
      if (iamAnalysis) {
        console.log('IAM analysis results:', {
          events: iamAnalysis.events?.length || 0,
          hasStats: !!iamAnalysis.statistics,
          hasColumns: !!iamAnalysis.columns,
          error: iamAnalysis.error
        });
        tabManager.cache.set('iam', iamAnalysis);
      } else {
        console.error('IAM analysis returned null');
      }
    } else {
      console.error('IAM analyzer not available');
    }
    
    // Run load limit analysis
    updateProgress(72, 'Analyzing load limits...');
    if (loadLimitAnalyzer) {
      const loadLimitAnalysis = loadLimitAnalyzer.analyze();
      console.log('Load limit analysis complete:', loadLimitAnalysis ? 'success' : 'failed');
      if (loadLimitAnalysis) {
        console.log('Load limit analysis results:', {
          events: loadLimitAnalysis.events?.length || 0,
          hasStats: !!loadLimitAnalysis.statistics,
          hasColumns: !!loadLimitAnalysis.columns,
          error: loadLimitAnalysis.error
        });
        tabManager.cache.set('loadlimit', loadLimitAnalysis);
      } else {
        console.error('Load limit analysis returned null');
      }
    } else {
      console.error('Load limit analyzer not available');
    }
    
    // Run coolant temperature analysis
    updateProgress(74, 'Analyzing coolant temperature...');
    if (coolantTemperatureAnalyzer) {
      const coolantTempAnalysis = coolantTemperatureAnalyzer.analyze();
      console.log('Coolant temperature analysis complete:', coolantTempAnalysis ? 'success' : 'failed');
      if (coolantTempAnalysis) {
        console.log('Coolant temperature analysis results:', {
          events: coolantTempAnalysis.events?.length || 0,
          hasStats: !!coolantTempAnalysis.statistics,
          hasColumns: !!coolantTempAnalysis.columns,
          error: coolantTempAnalysis.error
        });
        tabManager.cache.set('coolanttemp', coolantTempAnalysis);
      } else {
        console.error('Coolant temperature analysis returned null');
      }
    } else {
      console.error('Coolant temperature analyzer not available');
    }
    
    // Run intake air temperature analysis
    updateProgress(74, 'Analyzing intake air temperature...');
    if (intakeAirTemperatureAnalyzer) {
      const iatAnalysis = intakeAirTemperatureAnalyzer.analyze();
      console.log('Intake air temperature analysis complete:', iatAnalysis ? 'success' : 'failed');
      if (iatAnalysis) {
        console.log('Intake air temperature analysis results:', {
          events: iatAnalysis.events?.length || 0,
          hasStats: !!iatAnalysis.statistics,
          hasColumns: !!iatAnalysis.columns,
          error: iatAnalysis.error
        });
        tabManager.cache.set('iat', iatAnalysis);
      } else {
        console.error('Intake air temperature analysis returned null');
      }
    } else {
      console.error('Intake air temperature analyzer not available');
    }
    
    updateProgress(75, 'Analysis complete');
    
    // Step 3: Update UI (10% of progress)
    console.log('Updating UI...');
    updateProgress(75, 'Updating interface...');
    await new Promise(resolve => setTimeout(resolve, 10));
    
    fileName.textContent = filePath.split(/[\\/]/).pop();
    if (dropZone) {
      dropZone.style.display = 'none';
    }
    
    // Enable data smoothing by default when log file is loaded
    window.smoothingConfig.enabled = true;
    const smoothDataToggle = document.getElementById('global-smoothDataToggle');
    if (smoothDataToggle) {
      smoothDataToggle.checked = true;
    }
    
    // Show reset zoom button
    if (resetZoomBtn) {
      resetZoomBtn.style.display = 'inline-block';
    }
    
    // Step 4: Render active tab (15% of progress)
    console.log('Rendering active tab...');
    updateProgress(80, 'Rendering charts and statistics...');
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Render the active tab (default is 'logscore')
    const activeTabId = tabManager.getActiveTab() || 'logscore';
    tabManager.switchTab(activeTabId);
    
    // Smooth progress to completion
    updateProgress(90, 'Finalizing...');
    await new Promise(resolve => setTimeout(resolve, 200));
    
    updateProgress(95, 'Almost complete...');
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Complete
    console.log('File processing complete!');
    updateProgress(100, 'Complete!');
    
    // Add green checkmark to log file button
    if (openFileBtn) {
      openFileBtn.classList.add('btn-success');
    }
    
    // Remove loading state from content area
    if (contentArea) {
      contentArea.classList.remove('loading');
    }
    if (contentLoadingOverlay) {
      contentLoadingOverlay.style.display = 'none';
    }
    
    // Keep progress bar visible longer to show completion, then fade out smoothly
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Smooth fade out
    if (progressSection) {
      progressSection.style.transition = 'opacity 0.5s ease-out';
      progressSection.style.opacity = '0';
      setTimeout(() => {
        if (progressSection) {
          progressSection.style.display = 'none';
          progressSection.style.opacity = '1';
          progressSection.style.transition = '';
        }
        showLoading(false);
      }, 500);
    } else {
      showLoading(false);
    }
    
  } catch (error) {
    console.error('Error processing file:', error);
    alert(`Error processing file: ${error.message}`);
    showLoading(false);
    // Remove loading state on error
    if (contentArea) {
      contentArea.classList.remove('loading');
    }
    if (contentLoadingOverlay) {
      contentLoadingOverlay.style.display = 'none';
    }
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

function zoomToTimeRange(chart, targetMin, targetMax, originalRange) {
  // Zoom chart to a specific time range
  if (!chart.options?.scales?.x) {
    return;
  }
  
  // Ensure we don't zoom beyond original range
  const min = Math.max(targetMin, originalRange.min);
  const max = Math.min(targetMax, originalRange.max);
  
  // Update zoom limits
  if (chart.options.plugins?.zoom?.limits?.x) {
    chart.options.plugins.zoom.limits.x.min = originalRange.min;
    chart.options.plugins.zoom.limits.x.max = originalRange.max;
  }
  
  // Set the new range
  chart.options.scales.x.min = min;
  chart.options.scales.x.max = max;
  
  // Also update the scale object directly
  if (chart.scales?.x) {
    if (chart.scales.x.options) {
      chart.scales.x.options.min = min;
      chart.scales.x.options.max = max;
    }
    chart.scales.x.min = min;
    chart.scales.x.max = max;
  }
  
  // Update chart
  chart.update('none');
}

function zoomChartsToEvent(eventTime, eventDuration = 0, bufferSeconds = 3) {
  // Zoom all charts in the active tab to show the event with buffer
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
  
  if (!charts || Object.keys(charts).length === 0) {
    console.warn('No charts available to zoom');
    return;
  }
  
  // Calculate zoom range: event time ± buffer, or event time + duration ± buffer
  const eventStart = eventTime;
  const eventEnd = eventTime + (eventDuration || 0);
  const zoomMin = Math.max(eventStart - bufferSeconds, 0);
  const zoomMax = eventEnd + bufferSeconds;
  
  // Apply zoom to all charts
  Object.keys(charts).forEach(key => {
    const chart = charts[key];
    if (!chart) {
      return;
    }
    
    const originalRange = chartOriginalRanges[key];
    if (!originalRange) {
      return;
    }
    
    zoomToTimeRange(chart, zoomMin, zoomMax, originalRange);
  });
  
  // Synchronize all charts to ensure they're in sync
  const firstChart = Object.values(charts)[0];
  if (firstChart) {
    synchronizeChartZoom(firstChart);
  }
}

// Make zoomChartsToEvent globally accessible for tab modules
window.zoomChartsToEvent = zoomChartsToEvent;

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

