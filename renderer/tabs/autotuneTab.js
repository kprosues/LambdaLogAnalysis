// Autotune tab module for running fueling analysis and exporting modified tunes
const AutotuneTab = {
  elements: {
    form: null,
    mode: null,
    minSamples: null,
    changeLimit: null,
    minHitWeight: null,
    minHitWeightValue: null,
    outputName: null,
    baseTuneFile: null,
    clearBaseTune: null,
    baseTuneFileName: null,
    additionalLogs: null,
    clearAdditionalLogs: null,
    additionalLogsList: null,
    additionalLogsStats: null,
    runBtn: null,
    downloadBtn: null,
    message: null,
    heatmap: null,
    heatmapMaxLabel: null,
    // Section wrappers for show/hide
    fuelbaseSections: null,
    mafSections: null,
    // Table-based fuel change displays
    openChangeTable: null,
    openStats: null,
    closedChangeTable: null,
    closedStats: null,
    suggestedTable: null,
    suggestedStats: null,
    mafChangeTable: null,
    mafStats: null
  },
  analysisResult: null,
  baseTuneData: null,
  additionalLogsData: [], // Array to store parsed data from additional logs

  initialize() {
    this.elements.form = document.getElementById('autotune-form');
    this.elements.mode = document.getElementById('autotune-mode');
    this.elements.minSamples = document.getElementById('autotune-minSamples');
    this.elements.changeLimit = document.getElementById('autotune-changeLimit');
    this.elements.minHitWeight = document.getElementById('autotune-minHitWeight');
    this.elements.minHitWeightValue = document.getElementById('autotune-minHitWeight-value');
    this.elements.outputName = document.getElementById('autotune-outputName');
    this.elements.baseTuneFile = document.getElementById('autotune-baseTuneFile');
    this.elements.clearBaseTune = document.getElementById('autotune-clearBaseTune');
    this.elements.baseTuneFileName = document.getElementById('autotune-baseTuneFileName');
    this.elements.additionalLogs = document.getElementById('autotune-additionalLogs');
    this.elements.clearAdditionalLogs = document.getElementById('autotune-clearAdditionalLogs');
    this.elements.additionalLogsList = document.getElementById('autotune-additionalLogsList');
    this.elements.additionalLogsStats = document.getElementById('autotune-additionalLogsStats');
    this.elements.runBtn = document.getElementById('autotune-runBtn');
    this.elements.downloadBtn = document.getElementById('autotune-downloadBtn');
    this.elements.message = document.getElementById('autotune-message');
    this.elements.heatmap = document.getElementById('autotune-heatmap');
    this.elements.heatmapMaxLabel = document.getElementById('heatmap-max-label');
    // Section wrappers for show/hide
    this.elements.fuelbaseSections = document.getElementById('autotune-fuelbase-sections');
    this.elements.mafSections = document.getElementById('autotune-maf-sections');
    // Table-based fuel change displays
    this.elements.openChangeTable = document.getElementById('autotune-openChangeTable');
    this.elements.openStats = document.getElementById('autotune-openStats');
    this.elements.closedChangeTable = document.getElementById('autotune-closedChangeTable');
    this.elements.closedStats = document.getElementById('autotune-closedStats');
    this.elements.suggestedTable = document.getElementById('autotune-suggestedTable');
    this.elements.suggestedStats = document.getElementById('autotune-suggestedStats');
    this.elements.mafChangeTable = document.getElementById('autotune-mafChangeTable');
    this.elements.mafStats = document.getElementById('autotune-mafStats');

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

    // Additional datalogs handlers
    if (this.elements.additionalLogs) {
      this.elements.additionalLogs.addEventListener('change', (e) => {
        this.handleAdditionalLogsChange(e);
      });
    }

    if (this.elements.clearAdditionalLogs) {
      this.elements.clearAdditionalLogs.addEventListener('click', (e) => {
        e.preventDefault();
        this.clearAdditionalLogs();
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

    // Update min hit weight display value when slider changes
    if (this.elements.minHitWeight && this.elements.minHitWeightValue) {
      this.elements.minHitWeight.addEventListener('input', () => {
        const value = parseFloat(this.elements.minHitWeight.value);
        this.elements.minHitWeightValue.textContent = value.toFixed(2);
      });
    }

    // Mode change handler - show/hide appropriate sections
    if (this.elements.mode) {
      this.elements.mode.addEventListener('change', () => {
        this.updateSectionVisibility();
      });
      // Set initial visibility
      this.updateSectionVisibility();
    }
  },

  updateSectionVisibility() {
    const mode = this.elements.mode?.value || 'fuel_base';
    
    if (this.elements.fuelbaseSections) {
      this.elements.fuelbaseSections.style.display = mode === 'fuel_base' ? 'block' : 'none';
    }
    if (this.elements.mafSections) {
      this.elements.mafSections.style.display = mode === 'maf_scale' ? 'block' : 'none';
    }

    // Clear previous analysis when mode changes
    this.analysisResult = null;
    this.toggleDownloadButton(false);
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

  async handleAdditionalLogsChange(event) {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    this.setMessage(`Loading ${files.length} additional datalog(s)...`, 'info');

    let loadedCount = 0;
    let totalRows = 0;

    for (const file of files) {
      try {
        const text = await file.text();
        const parsedData = await this.parseCSVContent(text);
        
        if (parsedData && parsedData.length > 0) {
          this.additionalLogsData.push({
            name: file.name,
            data: parsedData,
            rowCount: parsedData.length
          });
          loadedCount++;
          totalRows += parsedData.length;
        }
      } catch (error) {
        console.error(`Error loading ${file.name}:`, error);
        this.setMessage(`Error loading ${file.name}: ${error.message}`, 'error');
      }
    }

    // Update UI
    this.updateAdditionalLogsList();
    
    if (loadedCount > 0) {
      this.setMessage(`Loaded ${loadedCount} additional datalog(s) with ${totalRows.toLocaleString()} total rows.`, 'success');
    }

    // Clear file input so the same files can be selected again if needed
    if (this.elements.additionalLogs) {
      this.elements.additionalLogs.value = '';
    }

    // Show clear button
    if (this.elements.clearAdditionalLogs && this.additionalLogsData.length > 0) {
      this.elements.clearAdditionalLogs.style.display = 'block';
    }
  },

  async parseCSVContent(csvContent) {
    return new Promise((resolve, reject) => {
      Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        complete: (results) => {
          if (results.errors && results.errors.length > 0) {
            console.warn('CSV parsing warnings:', results.errors);
          }

          // Filter and process data
          let data = results.data || [];
          
          // Filter rows with valid time
          data = data.filter(row => {
            return row && row['Time (s)'] !== null && row['Time (s)'] !== undefined && !isNaN(row['Time (s)']);
          });

          // Convert numeric columns
          const numericColumns = [
            'Time (s)',
            'Engine Speed (rpm)',
            'Load (MAF) (g/rev)',
            'Air/Fuel Sensor #1 (λ)',
            'Power Mode - Fuel Ratio Target (λ)',
            'Fuel Trim - Short Term (%)',
            'Fuel Trim - Long Term (%)',
            'Throttle Position (%)',
            'Mass Air Flow Voltage (V)'
          ];

          data = data.map(row => {
            const processedRow = { ...row };
            numericColumns.forEach(col => {
              if (processedRow[col] !== undefined && processedRow[col] !== null) {
                const num = parseFloat(processedRow[col]);
                processedRow[col] = isNaN(num) ? 0 : num;
              }
            });
            return processedRow;
          });

          resolve(data);
        },
        error: (error) => {
          reject(new Error(`CSV parsing failed: ${error.message}`));
        }
      });
    });
  },

  clearAdditionalLogs() {
    this.additionalLogsData = [];
    this.updateAdditionalLogsList();
    
    if (this.elements.additionalLogs) {
      this.elements.additionalLogs.value = '';
    }
    if (this.elements.clearAdditionalLogs) {
      this.elements.clearAdditionalLogs.style.display = 'none';
    }
    if (this.elements.additionalLogsStats) {
      this.elements.additionalLogsStats.textContent = '';
    }
  },

  removeAdditionalLog(index) {
    if (index >= 0 && index < this.additionalLogsData.length) {
      this.additionalLogsData.splice(index, 1);
      this.updateAdditionalLogsList();
      
      if (this.additionalLogsData.length === 0) {
        if (this.elements.clearAdditionalLogs) {
          this.elements.clearAdditionalLogs.style.display = 'none';
        }
        if (this.elements.additionalLogsStats) {
          this.elements.additionalLogsStats.textContent = '';
        }
      }
    }
  },

  updateAdditionalLogsList() {
    const container = this.elements.additionalLogsList;
    const statsContainer = this.elements.additionalLogsStats;
    
    if (!container) return;

    container.innerHTML = '';

    if (this.additionalLogsData.length === 0) {
      return;
    }

    let totalRows = 0;
    
    this.additionalLogsData.forEach((log, index) => {
      totalRows += log.rowCount;
      
      const item = document.createElement('div');
      item.className = 'additional-log-item';
      
      const info = document.createElement('span');
      info.className = 'additional-log-info';
      info.textContent = `${log.name} (${log.rowCount.toLocaleString()} rows)`;
      
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'additional-log-remove';
      removeBtn.textContent = '×';
      removeBtn.title = 'Remove this datalog';
      removeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.removeAdditionalLog(index);
      });
      
      item.appendChild(info);
      item.appendChild(removeBtn);
      container.appendChild(item);
    });

    // Update stats
    if (statsContainer) {
      statsContainer.textContent = `${this.additionalLogsData.length} additional log(s) loaded with ${totalRows.toLocaleString()} total rows`;
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

    const mode = this.elements.mode?.value || 'fuel_base';
    const minSamples = parseInt(this.elements.minSamples?.value || '150', 10) || 150;
    const changeLimit = parseFloat(this.elements.changeLimit?.value || '5') || 5;
    const minHitWeight = parseFloat(this.elements.minHitWeight?.value || '0') || 0;

    const modeLabel = mode === 'maf_scale' ? 'MAF Calibration' : 'Base Fuel';
    const additionalLogsCount = this.additionalLogsData.length;
    const logMessage = additionalLogsCount > 0 
      ? `Running ${modeLabel} autotune analysis with ${additionalLogsCount} additional log(s)...`
      : `Running ${modeLabel} autotune analysis...`;
    this.setMessage(logMessage, 'info');
    this.toggleDownloadButton(false);

    try {
      const result = window.AutotuneEngine.analyze({ 
        mode, 
        minSamples, 
        changeLimit, 
        minHitWeight,
        additionalLogsData: this.additionalLogsData 
      });
      if (result.error) {
        this.analysisResult = null;
        this.renderHeatmap(null, null, null);
        this.renderFuelChangeTables(null);
        this.setMessage(result.error, 'error');
        return;
      }

      this.analysisResult = {
        ...result,
        outputFileName: this.getOutputFileName()
      };

      // Render appropriate visualizations based on mode
      if (result.mode === 'fuel_base') {
        this.renderHeatmap(result.hitCounts, result.rpmAxis, result.loadAxis);
        this.renderFuelChangeTables(result);
      } else if (result.mode === 'maf_scale') {
        this.renderMafChangeTable(
          this.elements.mafChangeTable,
          this.elements.mafStats,
          result.mafCombinedChanges
        );
      }

      // Build mode-specific summary message
      let summaryMessage;
      const dataSourceInfo = result.additionalLogsCount > 0
        ? `Analyzed ${result.totalDataRows?.toLocaleString() || 0} total rows (${result.primaryDataRows?.toLocaleString() || 0} primary + ${result.additionalDataRows?.toLocaleString() || 0} from ${result.additionalLogsCount} additional log(s)).`
        : null;
      
      if (result.mode === 'fuel_base') {
        summaryMessage = [
          `Analysis complete. ${result.modificationsApplied || 0} fuel base cells updated.`,
          dataSourceInfo,
          result.clampedModifications?.length
            ? `${result.clampedModifications.length} cells were limited to ±${result.changeLimitPercent}% change.`
            : null,
          result.filteredByCenterWeight
            ? `${result.filteredByCenterWeight} samples filtered by min hit weight (${result.minHitWeight?.toFixed(2)}).`
            : null
        ].filter(Boolean).join(' ');
      } else {
        summaryMessage = [
          `Analysis complete. ${result.mafModificationsApplied || 0} MAF calibration cells updated.`,
          dataSourceInfo,
          result.mafClampedModifications?.length
            ? `${result.mafClampedModifications.length} cells were limited to ±${result.changeLimitPercent}% change.`
            : null,
          result.mafFilteredByCenterWeight
            ? `${result.mafFilteredByCenterWeight} samples filtered by min hit weight (${result.minHitWeight?.toFixed(2)}).`
            : null
        ].filter(Boolean).join(' ');
      }

      this.setMessage(summaryMessage || 'Analysis complete.', 'success');
      this.toggleDownloadButton(true);
    } catch (error) {
      console.error('Autotune analysis error:', error);
      this.analysisResult = null;
      this.renderHeatmap(null, null, null);
      this.renderFuelChangeTables(null);
      this.setMessage('An unexpected error occurred while running autotune.', 'error');
      this.toggleDownloadButton(false);
    }
  },

  renderFuelChangeTables(result) {
    // Render open-loop change table
    this.renderFuelChangeTable(
      this.elements.openChangeTable,
      this.elements.openStats,
      result?.openChangeTable,
      result?.rpmAxis,
      result?.loadAxis,
      'open'
    );
    
    // Render closed-loop change table
    this.renderFuelChangeTable(
      this.elements.closedChangeTable,
      this.elements.closedStats,
      result?.closedChangeTable,
      result?.rpmAxis,
      result?.loadAxis,
      'closed'
    );
    
    // Render combined suggested table
    this.renderSuggestedTable(
      this.elements.suggestedTable,
      this.elements.suggestedStats,
      result?.suggestedTable,
      result?.rpmAxis,
      result?.loadAxis
    );

    // Render MAF calibration changes
    this.renderMafChangeTable(
      this.elements.mafChangeTable,
      this.elements.mafStats,
      result?.mafCombinedChanges
    );
  },

  renderFuelChangeTable(container, statsContainer, changeTable, rpmAxis, loadAxis, type) {
    if (!container) return;

    container.innerHTML = '';
    if (statsContainer) statsContainer.innerHTML = '';

    if (!changeTable || !rpmAxis || !loadAxis || !changeTable.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No analysis results yet. Run analysis to see fuel base changes.';
      container.appendChild(empty);
      return;
    }

    // Calculate statistics
    let cellsWithChanges = 0;
    let totalSamples = 0;
    let maxChange = 0;
    let sumChange = 0;

    changeTable.forEach(row => {
      row.forEach(cell => {
        if (cell) {
          cellsWithChanges++;
          totalSamples += cell.samples;
          sumChange += cell.changePct;
          if (Math.abs(cell.changePct) > Math.abs(maxChange)) {
            maxChange = cell.changePct;
          }
        }
      });
    });

    // Create the table
    const table = document.createElement('table');
    table.className = 'fuel-change-table';

    // Create header row with Load axis values
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    const cornerTh = document.createElement('th');
    cornerTh.className = 'corner-header';
    cornerTh.textContent = 'RPM \\ Load';
    cornerTh.title = 'Rows: RPM (rpm), Columns: Load (g/rev)';
    headerRow.appendChild(cornerTh);

    loadAxis.forEach(load => {
      const th = document.createElement('th');
      th.textContent = load.toFixed(2);
      th.title = `Load: ${load.toFixed(3)} g/rev`;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Create body with RPM rows
    const tbody = document.createElement('tbody');
    rpmAxis.forEach((rpm, rpmIdx) => {
      const tr = document.createElement('tr');
      
      const rowTh = document.createElement('th');
      rowTh.className = 'row-header';
      rowTh.textContent = rpm.toFixed(0);
      rowTh.title = `RPM: ${rpm.toFixed(0)}`;
      tr.appendChild(rowTh);

      loadAxis.forEach((load, loadIdx) => {
        const td = document.createElement('td');
        const cell = changeTable[rpmIdx][loadIdx];
        
        if (cell) {
          // Show change percentage in cell
          const changeSign = cell.changePct >= 0 ? '+' : '';
          td.innerHTML = `<div class="cell-value">${cell.suggested.toFixed(1)}</div><div class="cell-change">${changeSign}${cell.changePct.toFixed(1)}%</div>`;
          
          // Build tooltip
          const metricLabel = type === 'open' ? 'Lambda Error' : 'Mean Trim';
          const metricValue = type === 'open' ? cell.meanErrorPct : cell.meanTrim;
          td.title = `RPM: ${rpm.toFixed(0)}, Load: ${load.toFixed(3)} g/rev\n` +
            `Current: ${cell.current.toFixed(2)}\n` +
            `Suggested: ${cell.suggested.toFixed(2)}\n` +
            `Change: ${changeSign}${cell.changePct.toFixed(2)}%\n` +
            `${metricLabel}: ${metricValue?.toFixed(2) || 'N/A'}%\n` +
            `Samples: ${cell.samples.toLocaleString()}`;
          
          // Apply color class based on change direction and magnitude
          td.className = this.getFuelChangeColorClass(cell.changePct);
        } else {
          td.className = 'fuel-cell-no-data';
          td.title = `RPM: ${rpm.toFixed(0)}, Load: ${load.toFixed(3)} g/rev\nNo data meeting threshold`;
        }
        
        tr.appendChild(td);
      });
      
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);

    // Add stats
    if (statsContainer && cellsWithChanges > 0) {
      const avgChange = sumChange / cellsWithChanges;
      const totalCells = rpmAxis.length * loadAxis.length;
      statsContainer.innerHTML = `
        <span><strong>Cells with Changes:</strong> ${cellsWithChanges} / ${totalCells} (${((cellsWithChanges / totalCells) * 100).toFixed(1)}%)</span>
        <span><strong>Total Samples:</strong> ${totalSamples.toLocaleString()}</span>
        <span><strong>Avg Change:</strong> ${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}%</span>
        <span><strong>Max Change:</strong> ${maxChange >= 0 ? '+' : ''}${maxChange.toFixed(2)}%</span>
      `;
    }
  },

  renderSuggestedTable(container, statsContainer, suggestedTable, rpmAxis, loadAxis) {
    if (!container) return;

    container.innerHTML = '';
    if (statsContainer) statsContainer.innerHTML = '';

    if (!suggestedTable || !rpmAxis || !loadAxis || !suggestedTable.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No analysis results yet. Run analysis to see suggested fuel base table.';
      container.appendChild(empty);
      return;
    }

    // Calculate statistics
    let cellsWithChanges = 0;
    let openLoopCells = 0;
    let closedLoopCells = 0;

    suggestedTable.forEach(row => {
      row.forEach(cell => {
        if (cell && cell.hasChange) {
          cellsWithChanges++;
          if (cell.source === 'open') openLoopCells++;
          if (cell.source === 'closed') closedLoopCells++;
        }
      });
    });

    // Create the table
    const table = document.createElement('table');
    table.className = 'fuel-change-table';

    // Create header row with Load axis values
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    const cornerTh = document.createElement('th');
    cornerTh.className = 'corner-header';
    cornerTh.textContent = 'RPM \\ Load';
    cornerTh.title = 'Rows: RPM (rpm), Columns: Load (g/rev)';
    headerRow.appendChild(cornerTh);

    loadAxis.forEach(load => {
      const th = document.createElement('th');
      th.textContent = load.toFixed(2);
      th.title = `Load: ${load.toFixed(3)} g/rev`;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Create body with RPM rows
    const tbody = document.createElement('tbody');
    rpmAxis.forEach((rpm, rpmIdx) => {
      const tr = document.createElement('tr');
      
      const rowTh = document.createElement('th');
      rowTh.className = 'row-header';
      rowTh.textContent = rpm.toFixed(0);
      rowTh.title = `RPM: ${rpm.toFixed(0)}`;
      tr.appendChild(rowTh);

      loadAxis.forEach((load, loadIdx) => {
        const td = document.createElement('td');
        const cell = suggestedTable[rpmIdx][loadIdx];
        
        if (cell) {
          // Show suggested value and change
          td.innerHTML = `<div class="cell-value">${cell.suggested.toFixed(1)}</div>`;
          
          if (cell.hasChange) {
            const changeSign = cell.changePct >= 0 ? '+' : '';
            td.innerHTML += `<div class="cell-change">${changeSign}${cell.changePct.toFixed(1)}%</div>`;
          }
          
          // Build tooltip
          td.title = `RPM: ${rpm.toFixed(0)}, Load: ${load.toFixed(3)} g/rev\n` +
            `Current: ${cell.current.toFixed(2)}\n` +
            `Suggested: ${cell.suggested.toFixed(2)}\n` +
            (cell.hasChange ? `Change: ${cell.changePct >= 0 ? '+' : ''}${cell.changePct.toFixed(2)}%\n` : 'No change\n') +
            (cell.source ? `Source: ${cell.source === 'open' ? 'Open-Loop' : 'Closed-Loop'}\n` : '') +
            (cell.samples ? `Samples: ${cell.samples.toLocaleString()}` : '');
          
          // Apply color class based on source
          if (cell.hasChange && cell.source) {
            td.className = `fuel-cell-source-${cell.source} has-change`;
          } else if (cell.source) {
            td.className = `fuel-cell-source-${cell.source}`;
          } else {
            td.className = 'fuel-cell-neutral';
          }
        } else {
          td.className = 'fuel-cell-neutral';
          td.title = `RPM: ${rpm.toFixed(0)}, Load: ${load.toFixed(3)} g/rev`;
        }
        
        tr.appendChild(td);
      });
      
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);

    // Add stats
    if (statsContainer) {
      const totalCells = rpmAxis.length * loadAxis.length;
      statsContainer.innerHTML = `
        <span><strong>Total Cells Modified:</strong> ${cellsWithChanges} / ${totalCells}</span>
        <span><strong>Open-Loop Changes:</strong> ${openLoopCells}</span>
        <span><strong>Closed-Loop Changes:</strong> ${closedLoopCells}</span>
      `;
    }
  },

  renderMafChangeTable(container, statsContainer, changes) {
    if (!container) return;

    container.innerHTML = '';
    if (statsContainer) statsContainer.innerHTML = '';

    // Show all MAF table rows, not just ones with changes
    const rows = Array.isArray(changes) ? changes : null;

    if (!rows || rows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No analysis results yet. Run analysis to see MAF calibration changes.';
      container.appendChild(empty);
      return;
    }

    const table = document.createElement('table');
    table.className = 'fuel-change-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Voltage (V)', 'Current (g/s)', 'Suggested (g/s)', 'Change (%)', 'Samples', 'Source', 'Metric'].forEach(text => {
      const th = document.createElement('th');
      th.textContent = text;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    let modifiedCells = 0;
    let sumChange = 0;
    let totalSamples = 0;

    rows.forEach(entry => {
      const tr = document.createElement('tr');

      const voltageTd = document.createElement('td');
      voltageTd.textContent = isFinite(entry.voltage) ? entry.voltage.toFixed(2) : '—';
      tr.appendChild(voltageTd);

      const currentTd = document.createElement('td');
      currentTd.textContent = isFinite(entry.current) ? entry.current.toFixed(2) : '—';
      tr.appendChild(currentTd);

      const suggestedTd = document.createElement('td');
      suggestedTd.textContent = isFinite(entry.suggested) ? entry.suggested.toFixed(2) : '—';
      tr.appendChild(suggestedTd);

      const changeTd = document.createElement('td');
      const changeSign = entry.changePct >= 0 ? '+' : '';
      changeTd.textContent = isFinite(entry.changePct)
        ? `${changeSign}${entry.changePct.toFixed(2)}%`
        : '—';
      changeTd.className = this.getFuelChangeColorClass(entry.changePct);
      tr.appendChild(changeTd);

      const samplesTd = document.createElement('td');
      samplesTd.textContent = entry.samples ? entry.samples.toLocaleString() : '0';
      tr.appendChild(samplesTd);

      const sourceTd = document.createElement('td');
      sourceTd.textContent = entry.source
        ? (entry.source === 'open' ? 'Open-Loop' : 'Closed-Loop')
        : '—';
      tr.appendChild(sourceTd);

      const metricTd = document.createElement('td');
      if (entry.metricLabel && entry.metricValue !== undefined && entry.metricValue !== null) {
        metricTd.textContent = `${entry.metricLabel}: ${entry.metricValue.toFixed(2)}%`;
      } else {
        metricTd.textContent = '—';
      }
      tr.appendChild(metricTd);

      tr.title = `Voltage: ${isFinite(entry.voltage) ? entry.voltage.toFixed(2) : 'N/A'} V\n` +
        `Current: ${isFinite(entry.current) ? entry.current.toFixed(2) : 'N/A'} g/s\n` +
        `Suggested: ${isFinite(entry.suggested) ? entry.suggested.toFixed(2) : 'N/A'} g/s\n` +
        `Change: ${isFinite(entry.changePct) ? `${changeSign}${entry.changePct.toFixed(2)}%` : 'N/A'}\n` +
        (entry.metricLabel && entry.metricValue !== undefined && entry.metricValue !== null
          ? `${entry.metricLabel}: ${entry.metricValue.toFixed(2)}%\n`
          : '') +
        `Samples: ${entry.samples ? entry.samples.toLocaleString() : '0'}\n` +
        (entry.source ? `Source: ${entry.source === 'open' ? 'Open-Loop' : 'Closed-Loop'}` : '');

      if (entry.hasChange && isFinite(entry.changePct)) {
        modifiedCells++;
        sumChange += entry.changePct;
      }
      totalSamples += entry.samples || 0;

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.appendChild(table);

    if (statsContainer) {
      const avgChange = modifiedCells > 0 ? sumChange / modifiedCells : 0;
      const rowsWithData = rows.filter(r => r && r.samples > 0).length;
      statsContainer.innerHTML = `
        <span><strong>Rows with Data:</strong> ${rowsWithData} / ${rows.length}</span>
        <span><strong>Rows with Changes:</strong> ${modifiedCells}</span>
        <span><strong>Total Samples:</strong> ${totalSamples.toLocaleString()}</span>
        <span><strong>Avg Change:</strong> ${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}%</span>
      `;
    }
  },

  getFuelChangeColorClass(changePct) {
    if (!isFinite(changePct)) return 'fuel-cell-no-data';
    
    const absChange = Math.abs(changePct);
    
    if (absChange < 0.5) return 'fuel-cell-neutral';
    
    if (changePct < 0) {
      // Decrease (negative change) - red scale
      if (absChange >= 5) return 'fuel-cell-decrease-5';
      if (absChange >= 4) return 'fuel-cell-decrease-4';
      if (absChange >= 3) return 'fuel-cell-decrease-3';
      if (absChange >= 2) return 'fuel-cell-decrease-2';
      return 'fuel-cell-decrease-1';
    } else {
      // Increase (positive change) - green scale
      if (absChange >= 5) return 'fuel-cell-increase-5';
      if (absChange >= 4) return 'fuel-cell-increase-4';
      if (absChange >= 3) return 'fuel-cell-increase-3';
      if (absChange >= 2) return 'fuel-cell-increase-2';
      return 'fuel-cell-increase-1';
    }
  },

  renderHeatmap(hitCounts, rpmAxis, loadAxis) {
    const container = this.elements.heatmap;
    if (!container) return;

    container.innerHTML = '';

    if (!hitCounts || !rpmAxis || !loadAxis || !hitCounts.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No heatmap data available. Run analysis to see fuel table coverage.';
      container.appendChild(empty);
      return;
    }

    // Find max hit count for scaling
    let maxHits = 0;
    let totalHits = 0;
    let cellsWithData = 0;
    hitCounts.forEach(row => {
      row.forEach(count => {
        if (count > maxHits) maxHits = count;
        totalHits += count;
        if (count > 0) cellsWithData++;
      });
    });

    // Update the legend max label
    if (this.elements.heatmapMaxLabel) {
      this.elements.heatmapMaxLabel.textContent = maxHits.toLocaleString();
    }

    // Create the heatmap table
    const table = document.createElement('table');
    table.className = 'heatmap-table';

    // Create header row with Load axis values
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    // Corner cell (RPM \ Load label)
    const cornerTh = document.createElement('th');
    cornerTh.className = 'corner-header';
    cornerTh.textContent = 'RPM \\ Load';
    cornerTh.title = 'Rows: RPM (rpm), Columns: Load (g/rev)';
    headerRow.appendChild(cornerTh);

    // Load axis headers (columns)
    loadAxis.forEach(load => {
      const th = document.createElement('th');
      th.textContent = load.toFixed(2);
      th.title = `Load: ${load.toFixed(3)} g/rev`;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Create body with RPM rows
    const tbody = document.createElement('tbody');
    rpmAxis.forEach((rpm, rpmIdx) => {
      const tr = document.createElement('tr');
      
      // Row header (RPM value)
      const rowTh = document.createElement('th');
      rowTh.className = 'row-header';
      rowTh.textContent = rpm.toFixed(0);
      rowTh.title = `RPM: ${rpm.toFixed(0)}`;
      tr.appendChild(rowTh);

      // Data cells
      loadAxis.forEach((load, loadIdx) => {
        const td = document.createElement('td');
        const hits = hitCounts[rpmIdx][loadIdx];
        td.textContent = hits > 0 ? hits.toLocaleString() : '';
        td.title = `RPM: ${rpm.toFixed(0)}, Load: ${load.toFixed(3)} g/rev\nData hits: ${hits.toLocaleString()}`;
        
        // Calculate color intensity (0-9 scale)
        const colorClass = this.getHeatmapColorClass(hits, maxHits);
        td.className = colorClass;
        
        tr.appendChild(td);
      });
      
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);

    // Add stats summary
    const stats = document.createElement('div');
    stats.className = 'heatmap-stats';
    const totalCells = rpmAxis.length * loadAxis.length;
    const coveragePercent = ((cellsWithData / totalCells) * 100).toFixed(1);
    stats.innerHTML = `
      <span><strong>Total Data Points:</strong> ${totalHits.toLocaleString()}</span>
      <span><strong>Cells with Data:</strong> ${cellsWithData} / ${totalCells} (${coveragePercent}%)</span>
      <span><strong>Max Hits per Cell:</strong> ${maxHits.toLocaleString()}</span>
    `;
    container.appendChild(stats);
  },

  getHeatmapColorClass(hits, maxHits) {
    if (hits === 0 || maxHits === 0) return 'heatmap-cell-0';
    
    // Use logarithmic scaling for better visualization of data distribution
    // This helps when there's a wide range of hit counts
    const logHits = Math.log10(hits + 1);
    const logMax = Math.log10(maxHits + 1);
    const ratio = logHits / logMax;
    
    // Map to 1-9 color classes (0 is reserved for no data)
    const colorIndex = Math.min(9, Math.max(1, Math.ceil(ratio * 9)));
    return `heatmap-cell-${colorIndex}`;
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

