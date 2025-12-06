// Autotune tab module for running fueling analysis and exporting modified tunes
const AutotuneTab = {
  elements: {
    form: null,
    minu: null,
    changeLimit: null,
    outputName: null,
    baseTuneFile: null,
    clearBaseTune: null,
    baseTuneFileName: null,
    runBtn: null,
    downloadBtn: null,
    message: null,
    openSummary: null,
    closedSummary: null
  },
  analysisResult: null,
  baseTuneData: null,

  initialize() {
    this.elements.form = document.getElementById('autotune-form');
    this.elements.minSamples = document.getElementById('autotune-minSamples');
    this.elements.changeLimit = document.getElementById('autotune-changeLimit');
    this.elements.outputName = document.getElementById('autotune-outputName');
    this.elements.baseTuneFile = document.getElementById('autotune-baseTuneFile');
    this.elements.clearBaseTune = document.getElementById('autotune-clearBaseTune');
    this.elements.baseTuneFileName = document.getElementById('autotune-baseTuneFileName');
    this.elements.runBtn = document.getElementById('autotune-runBtn');
    this.elements.downloadBtn = document.getElementById('autotune-downloadBtn');
    this.elements.message = document.getElementById('autotune-message');
    this.elements.openSummary = document.getElementById('autotune-openSummary');
    this.elements.closedSummary = document.getElementById('autotune-closedSummary');

    if (this.elements.form) {
      this.elements.form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.runAnalysis();
      });
    }

    if (this.elements.baseTuneFile) {
      this.elements.baseTuneFile.addEventListener('change', (e) => {
        this.handleBaseTuneFileChange(e);
      });
    }

    if (this.elements.clearBaseTune) {
      this.elements.clearBaseTune.addEventListener('click', (e) => {
        e.preventDefault();
        this.clearBaseTuneFile();
      });
    }

    if (this.elements.runBtn) {
      this.elements.runBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.runAnalysis();
      });
    }

    if (this.elements.downloadBtn) {
      this.elements.downloadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.downloadTune();
      });
    }
  },

  async handleBaseTuneFileChange(event) {
    const file = event.target.files[0];
    if (!file) {
      this.clearBaseTuneFile();
      return;
    }

    try {
      const text = await file.text();
      const tuneData = JSON.parse(text);
      
      // Validate it's a tune file
      if (!tuneData.maps || !Array.isArray(tuneData.maps)) {
        throw new Error('Invalid tune file format');
      }

      this.baseTuneData = tuneData;
      this.elements.baseTuneFileName.textContent = `Loaded: ${file.name}`;
      this.elements.baseTuneFileName.style.color = '#28a745';
      if (this.elements.clearBaseTune) {
        this.elements.clearBaseTune.style.display = 'block';
      }
    } catch (error) {
      console.error('Error loading base tune file:', error);
      this.setMessage(`Error loading base tune file: ${error.message}`, 'error');
      this.clearBaseTuneFile();
    }
  },

  clearBaseTuneFile() {
    this.baseTuneData = null;
    if (this.elements.baseTuneFile) {
      this.elements.baseTuneFile.value = '';
    }
    if (this.elements.baseTuneFileName) {
      this.elements.baseTuneFileName.textContent = '';
    }
    if (this.elements.clearBaseTune) {
      this.elements.clearBaseTune.style.display = 'none';
    }
  },

  render() {
    // Nothing to render on tab switch (form driven), but ensure loading overlay hidden
    const content = document.querySelector('.tab-content[data-tab="autotune"]');
    if (content) {
      content.classList.remove('loading');
      const overlay = content.querySelector('.tab-loading-overlay');
      if (overlay) {
        overlay.style.display = 'none';
      }
    }
  },

  setMessage(text, type = 'info') {
    if (!this.elements.message) return;
    this.elements.message.textContent = text;
    this.elements.message.classList.remove('success', 'error');
    if (type === 'success') {
      this.elements.message.classList.add('success');
    } else if (type === 'error') {
      this.elements.message.classList.add('error');
    }
  },

  runAnalysis() {
    if (!window.AutotuneEngine) {
      this.setMessage('Autotune engine not available. Please refresh and try again.', 'error');
      return;
    }

    const minSamples = parseInt(this.elements.minSamples?.value || '150', 10) || 150;
    const changeLimit = parseFloat(this.elements.changeLimit?.value || '5') || 5;

    this.setMessage('Running autotune analysis...', 'info');
    this.toggleDownloadButton(false);

    try {
      const result = window.AutotuneEngine.analyze({ minSamples, changeLimit });
      if (result.error) {
        this.analysisResult = null;
        this.renderSummary(null, null);
        this.setMessage(result.error, 'error');
        return;
      }

      this.analysisResult = {
        ...result,
        outputFileName: this.getOutputFileName()
      };
      this.renderSummary(result.openSummary, result.closedSummary, result.clampedModifications || []);

      const summaryMessage = [
        `Analysis complete. ${result.modificationsApplied || 0} cells updated.`,
        result.clampedModifications?.length
          ? `${result.clampedModifications.length} cells were limited to ±${result.changeLimitPercent}% change.`
          : null
      ].filter(Boolean).join(' ');

      this.setMessage(summaryMessage || 'Analysis complete.', 'success');
      this.toggleDownloadButton(true);

      // Auto-download if output filename is provided (user entered a value in the field)
      const outputNameValue = (this.elements.outputName?.value || '').trim();
      if (outputNameValue) {
        // User provided a custom filename, auto-download with timestamp
        setTimeout(() => {
          this.downloadTune();
        }, 100); // Small delay to ensure UI updates
      }
    } catch (error) {
      console.error('Autotune analysis error:', error);
      this.analysisResult = null;
      this.renderSummary(null, null);
      this.setMessage('An unexpected error occurred while running autotune.', 'error');
      this.toggleDownloadButton(false);
    }
  },

  renderSummary(openRows, closedRows, clampedModifications = []) {
    const changeLimitPercent = this.analysisResult?.changeLimitPercent || 5;
    this.renderTable(this.elements.openSummary, openRows, 'open', clampedModifications, changeLimitPercent);
    this.renderTable(this.elements.closedSummary, closedRows, 'closed', clampedModifications, changeLimitPercent);
  },

  renderTable(container, rows, type, clampedModifications = [], changeLimitPercent = 5) {
    if (!container) return;

    container.innerHTML = '';
    if (!rows || rows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No recommendations available. Adjust your filters or run the analysis again.';
      container.appendChild(empty);
      return;
    }

    const table = document.createElement('table');
    table.className = 'anomaly-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const headers = type === 'open'
      ? ['RPM', 'Load', 'Samples', 'Mean Error (%)', 'Current Fuel Base', 'Suggested Fuel Base']
      : ['RPM', 'Load', 'Samples', 'Mean Trim (%)', 'Current Fuel Base', 'Suggested Fuel Base'];

    headers.forEach(text => {
      const th = document.createElement('th');
      th.textContent = text;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Create a lookup map for clamped modifications by RPM and Load for quick lookup
    // Use precise matching: RPM (integer) and Load (3 decimal places)
    const clampedMap = new Map();
    clampedModifications.forEach(clamped => {
      // Match by RPM (rounded to integer) and Load (3 decimal places)
      const key = `${Math.round(clamped.rpm)}_${parseFloat(clamped.load).toFixed(3)}`;
      clampedMap.set(key, clamped);
    });

    const tbody = document.createElement('tbody');
    rows.forEach(row => {
      const tr = document.createElement('tr');
      
      // Check if this row was clamped (exceeded change limit)
      // Match by RPM (rounded to integer) and Load (3 decimal places)
      const rowKey = `${Math.round(row.rpm)}_${parseFloat(row.load).toFixed(3)}`;
      const clampedInfo = clampedMap.get(rowKey);
      const isClamped = clampedInfo && 
        ((type === 'open' && clampedInfo.source === 'open') || 
         (type === 'closed' && clampedInfo.source === 'closed'));
      
      // Highlight clamped rows (exceeded change limit)
      if (isClamped) {
        tr.style.backgroundColor = '#fff3cd'; // Light yellow background
        tr.style.borderLeft = '4px solid #ffc107'; // Yellow left border
        tr.title = `Change limit exceeded: Suggested ${clampedInfo.changePct.toFixed(1)}% change, clamped to ±${changeLimitPercent}%`;
      }
      
      const cells = type === 'open'
        ? [
          formatNumber(row.rpm, 0),
          formatNumber(row.load, 3),
          row.samples,
          formatNumber(row.meanErrorPct, 2),
          formatNumber(row.currentFuelBase, 2),
          formatNumber(row.suggestedFuelBase, 2)
        ]
        : [
          formatNumber(row.rpm, 0),
          formatNumber(row.load, 3),
          row.samples,
          formatNumber(row.meanTrim, 2),
          formatNumber(row.currentFuelBase, 2),
          formatNumber(row.suggestedFuelBase, 2)
        ];
      cells.forEach(value => {
        const td = document.createElement('td');
        td.textContent = value;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.appendChild(table);
  },

  downloadTune() {
    if (!this.analysisResult) {
      this.setMessage('Run the autotune analysis before downloading a tune file.', 'error');
      return;
    }

    if (!window.AutotuneEngine) {
      this.setMessage('Autotune engine not available. Please refresh and try again.', 'error');
      return;
    }

    const baseFileName = this.getOutputFileName();
    const filename = this.addTimestampToFileName(baseFileName);
    try {
      const response = window.AutotuneEngine.downloadTune(
        this.analysisResult, 
        filename,
        this.baseTuneData
      );
      if (response.error) {
        this.setMessage(response.error, 'error');
        return;
      }
      this.setMessage(`Modified tune downloaded as ${response.fileName}.`, 'success');
    } catch (error) {
      console.error('Download tune error:', error);
      this.setMessage('Failed to download the modified tune file.', 'error');
    }
  },

  toggleDownloadButton(enabled) {
    if (!this.elements.downloadBtn) return;
    this.elements.downloadBtn.disabled = !enabled;
  },

  getOutputFileName() {
    const value = (this.elements.outputName?.value || '').trim();
    if (!value) {
      return 'Keith Proseus_1999JDMSTI_DW740_VF28_21builtStroker_v';
    }
    const lowerValue = value.toLowerCase();
    if (lowerValue.endsWith('.tune') || lowerValue.endsWith('.json')) {
      return value;
    }
    return `${value}.tune`;
  },

  addTimestampToFileName(fileName) {
    if (!fileName) {
      return 'Keith Proseus_1999JDMSTI_DW740_VF28_21builtStroker_.tune';
    }

    // Generate timestamp: YYYYMMDD_HHMMSS
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;

    // Extract base name and extension
    const lowerFileName = fileName.toLowerCase();
    let baseName, extension;
    
    if (lowerFileName.endsWith('.tune')) {
      baseName = fileName.slice(0, -5); // Remove '.tune'
      extension = '.tune';
    } else if (lowerFileName.endsWith('.json')) {
      baseName = fileName.slice(0, -5); // Remove '.json'
      extension = '.json';
    } else {
      // No extension, add .tune
      baseName = fileName;
      extension = '.tune';
    }

    // Add timestamp before extension
    return `${baseName}_${timestamp}${extension}`;
  }
};

function formatNumber(value, decimals) {
  if (!isFinite(value)) {
    return '-';
  }
  return Number(value).toFixed(decimals);
}

