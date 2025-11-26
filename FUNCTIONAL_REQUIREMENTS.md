# ECU Log Analysis Tool - Functional Requirements

This document outlines all functional requirements for the ECU Log Analysis Tool with their acceptance criteria, implementation details, and framework decisions.

---

## Framework and Technology Stack

### Core Framework
- **Electron v28.0.0**: Desktop application framework
  - Main process (`main.js`): Handles file system operations, window management
  - Renderer process (`renderer/`): UI and data visualization
  - Context isolation enabled for security
  - Preload script (`preload.js`) exposes safe IPC APIs

### Dependencies
- **Chart.js v4.4.0**: Charting library for data visualization
- **chartjs-plugin-zoom v2.2.0**: Zoom and pan functionality for charts
- **PapaParse v5.4.1**: CSV parsing library with streaming support
- **electron-builder v26.0.12**: Application packaging and distribution

### Build Configuration
- **Platform Support**: Windows (portable), macOS (dmg/zip), Linux (AppImage/deb)
- **App ID**: `com.eculoganalysis.tool`
- **Product Name**: "ECU Log Analysis Tool"
- **Default Window Size**: 1400x900 pixels

---

## Architecture Overview

### Application Structure
```
ECULogAnalysisTool/
├── main.js                    # Electron main process
├── preload.js                 # Context bridge for IPC
├── package.json               # Dependencies and build config
├── analysis/                  # Analysis engine modules
│   ├── dataProcessor.js      # CSV parsing and data processing
│   ├── knockDetector.js      # Knock event detection logic
│   ├── boostControlAnalyzer.js # Boost control analysis logic
│   ├── afrAnalyzer.js        # Air/Fuel ratio analysis logic
│   ├── fuelTrimAnalyzer.js   # Short term fuel trim analysis logic
│   └── longTermFuelTrimAnalyzer.js # Long term fuel trim analysis logic
└── renderer/                  # UI layer
    ├── index.html            # Main HTML structure
    ├── app.js                # Main application logic
    ├── styles.css            # Styling
    ├── tabManager.js         # Tab management system
    └── tabs/                 # Tab modules
        ├── logScoreTab.js
        ├── knockAnalysisTab.js
        ├── boostControlTab.js
        ├── afrAnalysisTab.js
        ├── fuelTrimTab.js
        └── longTermFuelTrimTab.js
```

### Design Patterns
- **Modular Tab Architecture**: Each analysis type is a self-contained module
- **Separation of Concerns**: Analysis logic separated from UI rendering
- **Caching Strategy**: Analysis results cached per tab to avoid re-computation
- **Event-Driven UI**: Tab switching, filtering, and sorting use event listeners
- **Progressive Data Processing**: Large files processed with progress callbacks

### Data Flow
1. User loads CSV file → Electron main process reads file
2. File content passed to renderer → DataProcessor parses CSV
3. Parsed data stored in DataProcessor instance
4. Analyzers (KnockDetector, BoostControlAnalyzer, AFRAnalyzer, FuelTrimAnalyzer, LongTermFuelTrimAnalyzer) process data
5. Results cached in TabManager
6. Active tab module renders charts, statistics, and tables
7. User interactions (zoom, filter, sort) update UI without re-analysis

---

## **FR1: File Loading and Import**
**Description:** The application must allow users to load ECU log CSV files through a file dialog or drag-and-drop interface.

**Implementation Details:**
- **File Dialog**: Uses Electron's `dialog.showOpenDialog()` with file filters for CSV files
- **IPC Communication**: Main process (`main.js`) handles file reading via `ipcMain.handle('open-file-dialog')`
- **Context Bridge**: `preload.js` exposes `window.electronAPI.openFileDialog()` to renderer process
- **Drag-and-Drop**: Native HTML5 drag-and-drop API with `dragover`, `dragleave`, and `drop` event handlers
- **File Validation**: Checks file extension (`.csv`) before processing
- **Error Handling**: Try-catch blocks with user-friendly alert messages
- **File Reading**: Synchronous file read using `fs.readFileSync()` with UTF-8 encoding

**Acceptance Criteria:**
- User can open a CSV file via "Open Log File" button
- User can drag and drop a CSV file onto the drop zone
- Only CSV files are accepted
- File name is displayed after successful loading
- Error messages are shown for invalid files or read failures
- Drop zone is hidden after successful file load

---

## **FR2: CSV File Parsing**
**Description:** The application must parse ECU log CSV files with progress tracking.

**Implementation Details:**
- **Parser Library**: PapaParse v5.4.1 with streaming support
- **Parsing Configuration**:
  - `header: true` - First row treated as column headers
  - `skipEmptyLines: true` - Empty rows automatically skipped
  - `dynamicTyping: true` - Automatic type conversion for numbers
  - `step` callback - Processes rows incrementally for progress tracking
- **Progress Tracking**: 
  - Uses `results.meta.cursor` to calculate file position percentage
  - Progress updates throttled (every 50 rows or 0.5% change)
  - Progress mapped from 10-40% of total file processing
- **Data Processing**:
  - 27 numeric columns explicitly converted (Time, RPM, Throttle, Knock Retard, AFR, Load, Boost, etc.)
  - Missing/null values default to 0
  - Invalid time values cause row to be filtered out
- **Column Detection**: 
  - Extracts columns from `results.meta.fields`
  - Fallback: Extracts from first data row keys if fields array empty
- **Performance**: 
  - Accumulates data in array during step callback
  - Final data stored in `DataProcessor.data` array
  - Processes large files without blocking UI (async/await pattern)
- **Progress Fallback**: 
  - If cursor is not available, estimates progress based on row count
  - Fallback progress calculation: `(rowCount * 100) / (totalSize / 100)`
  - Progress updates throttled to prevent UI blocking
- **DataProcessor Utility Methods**:
  - `getData()`: Returns parsed data array
  - `getColumns()`: Returns column names array
  - `getColumnIndex(columnName)`: Returns index of column in columns array
  - `getTimeRange()`: Returns `{ min, max }` time range from data
  - `getValueAtTime(time, columnName)`: Finds closest time match and returns value
  - Methods available for analyzers and tab modules to access processed data

**Acceptance Criteria:**
- Parses CSV files with headers correctly
- Handles numeric columns (Time, RPM, Throttle, Knock Retard, AFR, etc.)
- Progress bar shows parsing progress (0-100%)
- Skips empty lines during parsing
- Filters out rows with invalid time values
- Handles various column name formats (case-insensitive matching)
- Processes files with 10,000+ rows without freezing

---

## **FR3: Knock Event Detection**
**Description:** The application must detect and categorize knock events from knock retard values.

**Implementation Details:**
- **Detection Algorithm**: `KnockDetector` class in `analysis/knockDetector.js`
- **Knock Threshold**: `KNOCK_THRESHOLD = -0.0001°` (any negative value indicates knock)
- **Column Matching**: 
  - Primary: "Knock Retard (°)"
  - Alternatives: "Knock Retard (deg)", "Knock Retard", "Knock Retard (degrees)"
  - Case-insensitive fallback search for columns containing "knock" and "retard"
- **Severity Classification**:
  - `severeThreshold = -4.0°` (stored in `severityThresholds.severe`)
  - Severe: `knockRetard < -4.0°`
  - Mild: `knockRetard >= -4.0° && knockRetard < -0.0001°`
- **Event Grouping**:
  - `groupingTimeWindow = 0.1` seconds (100ms)
  - Events within time window merged into single grouped event
  - Most severe knock value (most negative) preserved in grouped event
  - Averages calculated for other parameters (RPM, throttle, load, AFR, etc.)
- **Event Data Structure**:
  ```javascript
  {
    index: number,
    time: number,
    knockRetard: number,
    rpm: number,
    throttle: number,
    load: number,
    afr: number,
    boost: number,
    coolantTemp: number,
    intakeTemp: number,
    severity: 'mild' | 'severe',
    duration?: number,  // For grouped events
    eventCount?: number // Number of data points in group
  }
  ```
- **Grouping Algorithm**: 
  - Sorts events by time
  - Groups consecutive events within 0.1s window
  - Creates aggregated event with most severe knock and averaged parameters

**Acceptance Criteria:**
- Detects knock events when knock retard < -0.0001°
- Categorizes severity:
  - Severe: knock retard < -4.0°
  - Mild: knock retard ≥ -4.0° and < -0.0001°
- Groups events within 0.1 seconds (100ms) into single events
- Captures associated parameters (RPM, throttle, load, AFR, boost, temperatures)
- Handles multiple column name variations for knock retard
- Stores most severe knock value for grouped events

---

## **FR4: Summary Statistics Display**
**Description:** The application must calculate and display summary statistics for knock events.

**Acceptance Criteria:**
- Displays total knock events count
- Displays maximum knock retard (absolute value, in degrees)
- Displays percentage of time with knock events
- Displays count of severe events
- Statistics update after file processing
- Values are properly formatted (e.g., 2 decimal places for degrees, percentage format)

---

## **FR5: Chart Visualization**
**Description:** The application must display multiple interactive charts for data analysis.

**Implementation Details:**
- **Chart Library**: Chart.js v4.4.0 with chartjs-plugin-zoom v2.2.0
- **Chart Type**: Line charts with multiple datasets per chart
- **Chart Configuration**:
  - `responsive: true` - Charts resize with container
  - `maintainAspectRatio: false` - Charts fill container (updated for better fit)
  - `pointRadius: 0` - Continuous lines (no point markers for main data)
  - `spanGaps: false` - Lines break at NaN values (gap breaking)
- **Knock Retard Chart**:
  - Dataset 1: Continuous line of all knock retard values (red, `rgb(220, 53, 69)`)
  - Dataset 2: Severe events as points (red, `pointRadius: 6`)
  - Dataset 3: Mild events as points (yellow, `rgb(255, 193, 7)`, `pointRadius: 4`)
  - Knock retard values converted to absolute values for display (negative values shown as positive)
- **RPM vs Knock Chart**:
  - Dataset 1: RPM line (green, `rgb(40, 167, 69)`)
  - Dataset 2: Knock events as points (red, `pointRadius: 5`)
- **Throttle vs Knock Chart**:
  - Dataset 1: Throttle line (blue, `rgb(0, 123, 255)`)
  - Dataset 2: Knock events as points (red, `pointRadius: 5`)
- **AFR vs Knock Chart**:
  - Dataset 1: AFR line (yellow, `rgb(255, 193, 7)`)
  - Dataset 2: Knock events as points (red, `pointRadius: 5`)
- **Event Point Mapping**:
  - Events mapped to closest time index in data array
  - Uses linear search to find minimum time difference
  - NaN values used for non-event points (creates isolated point markers)
- **Performance**: 
  - Charts destroyed and recreated on data update (prevents memory leaks)
  - Chart instances stored in `tab.module.charts` object
  - Original time ranges cached in `tab.module.chartOriginalRanges`

**Acceptance Criteria:**
- **Knock Retard Over Time Chart:**
  - Line chart showing knock retard over time
  - Severe events marked with red points
  - Mild events marked with yellow points
  - Continuous line for all knock retard values
- **Engine Speed vs Knock Events Chart:**
  - RPM line over time
  - Knock events overlaid as red points
- **Throttle Position vs Knock Events Chart:**
  - Throttle position line over time
  - Knock events overlaid as red points
- **Air/Fuel Ratio During Knock Events Chart:**
  - AFR line over time
  - Knock events overlaid as red points
- All charts use time (seconds) as X-axis
- Charts render without errors for large datasets
- Charts are responsive and maintain aspect ratio

---

## **FR6: Chart Interaction (Zoom and Pan)**
**Description:** The application must enable zoom and pan functionality with synchronized views.

**Implementation Details:**
- **Zoom Plugin**: chartjs-plugin-zoom v2.2.0 registered globally
- **Zoom Configuration**:
  - Wheel zoom: `enabled: true`, `modifierKey: 'ctrl'`
  - Pinch zoom: `enabled: true` (touch devices)
  - Drag zoom: `enabled: true`, `modifierKey: null` (no modifier needed)
  - Mode: `'x'` (horizontal zoom only)
- **Pan Configuration**:
  - Enabled: `true`
  - Mode: `'x'` (horizontal pan only)
  - Modifier: `'shift'` key required
- **Synchronization Algorithm** (`synchronizeChartZoom()`):
  - Triggered on `onZoomComplete` and `onPanComplete` callbacks
  - Prevents infinite loops with `_syncing` flag
  - Calculates relative position in original time range
  - Applies same relative zoom to all charts in active tab
  - Detects full zoom (within 1% tolerance) and resets all charts
- **Reset Zoom**:
  - Manual reset function (`resetChartManually()`) clears zoom plugin state
  - Deletes `min`/`max` from scale options
  - Restores original time range from `chartOriginalRanges`
  - Uses `chart.update('none')` to avoid animation
  - Verification step after 50ms to ensure reset succeeded
- **Tab Isolation**: 
  - Each tab maintains independent zoom/pan state
  - Synchronization only affects charts in active tab
  - Original ranges stored per chart per tab

**Acceptance Criteria:**
- User can zoom with Ctrl+Mouse Wheel on any chart
- User can drag to zoom (click and drag on chart)
- User can pan with Shift+Mouse Drag
- Zooming one chart synchronizes all charts to the same time range
- "Reset Zoom" button restores all charts to full time range
- Reset Zoom button appears after file is loaded
- Charts maintain synchronization during zoom/pan operations

---

## **FR7: Knock Events Detail Table**
**Description:** The application must display detailed knock events in a sortable, filterable table.

**Acceptance Criteria:**
- Table displays columns:
  - Time (s) with duration for grouped events
  - Knock Retard (°)
  - RPM
  - Throttle (%)
  - Load (g/rev)
  - A/F Ratio (λ)
  - Severity (with color-coded badges)
- Table is sortable by clicking column headers
- Sort direction toggles (ascending/descending)
- Sort indicators (↑/↓) appear in column headers
- Table updates when filters are applied

---

## **FR8: Search and Filter Functionality**
**Description:** The application must allow users to search and filter knock events.

**Acceptance Criteria:**
- Search input filters events by time, knock retard, RPM, throttle, or severity
- Severity dropdown filters by "All", "Mild", or "Severe"
- Search is case-insensitive
- Filters work together (AND logic)
- Table updates in real-time as user types
- Empty search shows all events matching severity filter

---

## **FR9: Progress Tracking**
**Description:** The application must show progress during file processing.

**Implementation Details:**
- **Progress UI**: Inline progress bar section (not modal) with text and percentage
- **Update Mechanism**: `updateProgress(percent, text)` function
  - Uses `requestAnimationFrame()` for smooth UI updates
  - Clamps percentage to 0-100% range
  - Updates progress bar width via CSS
  - Updates text and percentage display elements
- **Progress Stages**:
  - 0%: "Starting..."
  - 10-40%: "Parsing CSV file..." (mapped from PapaParse progress)
  - 40%: "CSV parsed successfully"
  - 45%: "Analyzing data..."
  - 50%: "Detecting knock events..."
  - 60%: "Analyzing boost control..."
  - 70%: "Analysis complete"
  - 75%: "Updating interface..."
  - 80%: "Rendering charts and statistics..."
  - 100%: "Complete!"
- **Progress Callback**: PapaParse `step` callback provides progress (0-100%)
  - Mapped to 10-40% of total processing
  - Throttled to update every 50 rows or 0.5% change
- **Completion**: Progress bar hidden after 500ms delay to show 100%

**Acceptance Criteria:**
- Progress bar appears during file processing
- Progress updates from 0% to 100%
- Progress text shows current operation:
  - "Starting..."
  - "Parsing CSV file..."
  - "Detecting knock events..."
  - "Updating interface..."
  - "Calculating statistics..."
  - "Rendering charts..."
  - "Updating anomaly table..."
  - "Complete!"
- Progress bar hides after completion (after 500ms delay)
- Progress percentage displays as integer

---

## **FR10: Data Processing and Validation**
**Description:** The application must process and validate ECU log data correctly.

**Acceptance Criteria:**
- Converts numeric columns to proper number types
- Handles missing or null values (defaults to 0)
- Validates time column exists and is numeric
- Filters out invalid rows (missing time)
- Handles various column name formats and encoding issues
- Processes all expected ECU parameters:
  - Time, RPM, Throttle, Knock Retard, AFR, Load, Boost, Temperatures, etc.

---

## **FR11: User Interface Responsiveness**
**Description:** The application UI must remain responsive during processing.

**Acceptance Criteria:**
- UI does not freeze during large file processing
- Loading indicator appears during initial processing
- Progress updates do not block UI
- Charts render without blocking
- Table updates without blocking
- Application handles errors gracefully with user-friendly messages

---

## **FR12: Desktop Application Integration**
**Description:** The application must run as a desktop application using Electron.

**Acceptance Criteria:**
- Application launches as a desktop window (1400x900 default)
- File dialog uses native OS file picker
- Application works on Windows (primary platform)
- Context isolation enabled for security
- Preload script exposes safe Electron APIs
- Application can be packaged as portable executable

---

## **FR13: Tab Navigation System**
**Description:** Provide a tabbed interface to switch between the Log Score overview and all detailed analysis views (Knock Analysis, Boost Control, Air/Fuel Ratio, Short Term Fuel Trim, and Long Term Fuel Trim).

**Acceptance Criteria:**
- Tab navigation buttons are displayed at the top of the content area
- Six tabs are available: "Log Score", "Knock Analysis", "Boost Control", "Air/Fuel Ratio", "Short Term Fuel Trim", and "Long Term Fuel Trim"
- Active tab button is visually highlighted (different styling)
- Clicking a tab button switches to that tab's content
- Only one tab's content is visible at a time
- Tab content sections are properly hidden/shown when switching tabs
- Default active tab is "Log Score" when file is first loaded
- Tab state persists when switching between tabs (data is cached, charts persist)
- Tab buttons remain visible and functional after file processing
- Charts persist across tab switches (not re-rendered if they already exist)

---

## **FR14: Tab Management and Caching**
**Description:** Manage multiple analysis tabs with cached results and proper initialization.

**Implementation Details:**
- **TabManager Initialization**: Created in `DOMContentLoaded` event handler
- **Tab Registration**:
  ```javascript
  tabManager.registerTab('logscore', LogScoreTab, null);
  tabManager.registerTab('knock', KnockAnalysisTab, knockDetector);
  tabManager.registerTab('boost', BoostControlTab, boostAnalyzer);
  tabManager.registerTab('afr', AFRAnalysisTab, afrAnalyzer);
  tabManager.registerTab('fueltrim', FuelTrimTab, fuelTrimAnalyzer);
  tabManager.registerTab('longtermfueltrim', LongTermFuelTrimTab, longTermFuelTrimAnalyzer);
  ```
- **Tab Storage**: `Map<tabId, {module, analyzer, initialized}>`
- **Cache Structure**: `Map<tabId, analysisResults>`
- **Switch Tab Flow**:
  1. Validate tab exists
  2. Update active tab ID
  3. Hide all tab contents/buttons (CSS class manipulation)
  4. Show active tab content/button
  5. Initialize tab if not done (lazy initialization)
  6. Run analysis if not cached
  7. Render tab with cached data (deferred with `setTimeout(0)` for UI responsiveness)
- **Cache Clearing**: `clearCache()` called at start of file processing
  - Clears cache Map
  - Resets `initialized` flag for all tabs
- **Error Handling**: Try-catch blocks around initialization and rendering
  - Errors logged to console, don't block tab switching

**Acceptance Criteria:**
- TabManager class initializes on application startup
- Each tab is registered with its module and analyzer
- Tab modules are initialized only once (lazy initialization)
- Analysis results are cached per tab to avoid re-computation
- Cache is cleared when a new file is loaded
- Switching tabs retrieves cached data if available
- If no cached data exists, analysis runs automatically when tab is switched
- Tab state (initialized flag) is properly managed
- Each tab maintains its own chart instances and state

---

## **FR15: Boost Control Analysis**
**Description:** Analyze boost control system accuracy by comparing boost targets to actual boost pressure.

**Implementation Details:**
- **Analyzer Class**: `BoostControlAnalyzer` in `analysis/boostControlAnalyzer.js`
- **Column Detection Algorithm** (`findColumn()`):
  - Multi-stage matching: exact match → case-insensitive → partial match → keyword-based
  - Normalizes strings (removes special chars, spaces, parentheses)
  - Keyword matching: looks for 2+ relevant keywords (e.g., "boost" + "target")
  - Supports 10+ variations for each column type
- **Boost Target Column Variations** (12 variations):
  - "Boost Target (kPa)", "Boost Target", "BoostTarget", "Target Boost", "Boost Setpoint", etc.
- **Actual Boost Column Variations** (13 variations):
  - "Manifold Absolute Pressure (kPa)", "Manifold Air Pressure - Filtered (kPa)", "MAP", "Boost Pressure", etc.
- **Wastegate Column Variations** (12 variations):
  - "Wastegate Duty Cycle (%)", "Wastegate DC", "WG Duty", "Wastegate Duty", etc.
- **Data Filtering**:
  - Filters to only include rows where `actualBoost >= 100 kPa` (excludes atmospheric/vacuum)
  - Skips overshoot events at low throttle (< 30%)
  - Skips undershoot events when throttle ≤ 50%
- **Event Detection Thresholds**:
  - `overshootThreshold = 5.0 kPa` (error > 5.0)
  - `undershootThreshold = -5.0 kPa` (error < -5.0)
  - `targetTolerance = 10.0 kPa` (updated from 2.0 in implementation)
- **Event Grouping**:
  - `groupingTimeWindow = 0.5 seconds` (500ms)
  - Groups events by type (overshoot, undershoot, normal)
  - Filters grouped events by minimum duration:
    - Overshoot: minimum 0.25 seconds
    - Undershoot: minimum 0.5 seconds
- **Error Calculation**:
  - `boostError = actualBoost - boostTarget`
  - `boostErrorPercent = (boostError / boostTarget) * 100` (if target > 0)
- **Statistics Calculated**:
  - Average boost error (absolute value)
  - Maximum overshoot/undershoot
  - Percentage of time within target range
  - Count of overshoot/undershoot events
  - Average wastegate duty cycle
- **Error Handling**:
  - Returns empty result structure if required columns not found (allows tab to render)
  - Logs available columns to console for debugging
  - Shows UI warning message with column detection info

**Acceptance Criteria:**
- Analyzer finds boost-related columns with flexible matching:
  - Boost Target: "Boost Target (kPa)", "Boost Target", "BoostTarget"
  - Actual Boost: "Manifold Absolute Pressure (kPa)", "Manifold Air Pressure - Filtered (kPa)", "Manifold Pressure", "MAP"
  - Wastegate: "Wastegate Duty Cycle (%)", "Wastegate DC", "WG Duty"
- Calculates boost error for each data point (actual - target)
- Calculates boost error percentage relative to target
- Identifies overshoot events (error > 5.0 kPa above target)
- Identifies undershoot events (error < -5.0 kPa below target)
- Determines "in target" range (error within ±10.0 kPa tolerance - implementation detail)
- Analysis completes successfully even if wastegate column is missing
- Handles missing or invalid boost data gracefully (defaults to 0)
- Analysis runs automatically during file processing (at 60% progress)

---

## **FR16: Boost Control Statistics Display**
**Description:** Display summary statistics for boost control performance.

**Acceptance Criteria:**
- Displays maximum overshoot value in kPa
- Displays percentage of time boost was within target range (±2.0 kPa)
- Displays count of overshoot events
- Displays count of undershoot events
- All statistics are formatted with appropriate decimal places (2 decimal places)
- Statistics update when boost control tab is rendered
- Statistics display "0.0" or "0" when no data is available
- Statistics only calculated for data points where actual boost >= 100 kPa (filters out non-boost conditions)

---

## **FR17: Boost Control Chart Visualization**
**Description:** Display interactive charts showing boost control performance over time.

**Implementation Details:**
- **Data Filtering**: Charts only show data where `actualBoost >= 100 kPa` (matches analyzer filtering)
- **Gap Breaking**: `breakAtGaps()` function inserts NaN values when time gap > 1 second (prevents misleading line connections)
- **Boost Target vs Actual Chart**:
  - Dataset 1: Boost Target (blue, `rgb(0, 123, 255)`)
  - Dataset 2: Actual Boost (green, `rgb(40, 167, 69)`)
  - Dataset 3: Throttle Position (gray, dashed, optional toggle)
  - Dataset 4: Overshoot events (red points, `pointRadius: 6`)
  - Dataset 5: Undershoot events (yellow points, `pointRadius: 6`)
  - Dual Y-axis: Left for boost (kPa), Right for throttle (%) when throttle enabled
- **Boost Error Chart**:
  - Dataset 1: Boost Error line (red, `rgb(220, 53, 69)`)
  - Dataset 2: Zero reference line (gray, dashed, `rgb(153, 153, 153)`)
  - Dataset 3: Throttle Position (gray, dashed, optional)
  - Y-axis: "Error (kPa)" with zero line at center
- **Wastegate Chart**:
  - Dataset 1: Wastegate Duty Cycle (yellow, `rgb(255, 193, 7)`)
  - Dataset 2: Overshoot events (red points)
  - Dataset 3: Undershoot events (yellow points)
  - Dataset 4: Throttle Position (gray, dashed, optional)
  - Only renders if wastegate column found
- **Throttle Toggle**: 
  - Checkbox control to show/hide throttle position overlay
  - State stored in `tab.module.showThrottle`
  - Re-renders charts when toggled
- **Chart Options**: Same zoom/pan configuration as knock charts (synchronized within tab)

**Acceptance Criteria:**
- **Boost Target vs Actual Chart:**
  - Displays boost target as blue line
  - Displays actual boost as green line
  - Marks overshoot events with red points
  - Marks undershoot events with yellow points
  - Both lines are continuous over time
- **Boost Error Over Time Chart:**
  - Displays boost error (actual - target) as red line
  - Displays zero reference line (dashed gray line)
  - Y-axis labeled as "Error (kPa)"
  - Shows positive errors (overshoot) above zero line
  - Shows negative errors (undershoot) below zero line
- **Wastegate Duty Cycle Chart:**
  - Displays wastegate duty cycle as yellow line (if data available)
  - Marks overshoot events with red points
  - Marks undershoot events with yellow points
  - Chart is hidden or shows message if wastegate data is not available
- All charts use time (seconds) as X-axis
- Charts support zoom and pan functionality (synchronized within tab)
- Charts persist across tab switches (not re-rendered if they already exist)
- Charts render without errors for large datasets
- Charts are responsive and maintain aspect ratio
- Charts only display data where actual boost >= 100 kPa (filters out non-boost conditions)
- Lines break at time gaps > 1 second (prevents misleading connections between distant data points)
- Throttle position toggle allows showing/hiding throttle overlay on all charts

---

## **FR18: Boost Control Events Detail Table**
**Description:** Display detailed boost control events in a sortable, filterable table.

**Acceptance Criteria:**
- Table displays columns:
  - Time (s) with duration for grouped events - formatted to 2 decimal places, duration to 3 decimal places
  - Boost Target (kPa) - formatted to 2 decimal places
  - Actual Boost (kPa) - formatted to 2 decimal places
  - Error (kPa) - formatted to 2 decimal places (can be positive or negative, shows max error for grouped events)
  - Error (%) - formatted to 2 decimal places with % symbol (shows max error percent for grouped events)
  - Wastegate DC (%) - formatted to 1 decimal place, or "N/A" if not available
  - Event Type - color-coded badge (overshoot=red, undershoot=yellow, normal=default)
- Table is sortable by clicking column headers
- Sort direction toggles (ascending/descending) on repeated clicks
- Sort indicators (↑/↓) appear in column headers
- Table updates when filters are applied
- Table shows only events that deviate from target (overshoot, undershoot, or outside tolerance)
- Table displays grouped events with duration when events are grouped within time windows

---

## **FR19: Boost Control Search and Filter**
**Description:** Search and filter boost control events by various criteria.

**Acceptance Criteria:**
- Search input filters events by:
  - Time value
  - Boost target value
  - Actual boost value
  - Boost error value
  - Event type (overshoot, undershoot, normal)
- Event type dropdown filter with options:
  - "All Event Types" - shows all events
  - "Overshoot" - shows only overshoot events
  - "Undershoot" - shows only undershoot events
  - "Normal" - shows only normal events (within tolerance)
- Search is case-insensitive
- Filters work together (AND logic - both search and event type must match)
- Table updates in real-time as user types in search field
- Empty search shows all events matching event type filter
- Filter state persists when switching tabs and returning

---

## **FR20: Tab-Specific Chart Synchronization**
**Description:** Synchronize zoom and pan operations across charts within the same tab.

**Acceptance Criteria:**
- Zooming one chart in a tab synchronizes all charts in that tab to the same time range
- Panning one chart in a tab synchronizes all charts in that tab
- Charts in different tabs maintain independent zoom/pan states
- "Reset Zoom" button resets zoom for all charts in the active tab only
- Chart synchronization works for both Knock Analysis and Boost Control tabs
- Synchronization does not affect charts in inactive tabs
- Original time ranges are stored per chart per tab

---

## **FR21: Tab Module Architecture**
**Description:** Support modular tab architecture for easy extension with new analysis types.

**Implementation Details:**
- **TabManager Class** (`renderer/tabManager.js`):
  - Manages tab registration, switching, and caching
  - Stores tabs in `Map<tabId, {module, analyzer, initialized}>`
  - Cache: `Map<tabId, analysisResults>`
  - Methods: `registerTab()`, `switchTab()`, `getActiveTab()`, `getCachedAnalysis()`, `clearCache()`, `getTabAnalyzer()`
- **Tab Module Interface**:
  ```javascript
  {
    elements: {},           // DOM element references
    charts: {},              // Chart.js instances
    chartOriginalRanges: {}, // Original time ranges for zoom reset
    currentSort: {},         // Table sorting state
    initialize: function(),  // Setup DOM and event listeners
    render: function(data),  // Main render entry point
    updateStatistics: function(),
    renderCharts: function(),
    updateTable: function(),
    handleSort: function(column)
  }
  ```
- **Module Registration**:
  - Tabs registered in `app.js` on DOMContentLoaded
  - Each tab gets unique ID ('knock', 'boost')
  - Analyzer instance created and passed to tab
  - Module object (KnockAnalysisTab, BoostControlTab) passed to TabManager
- **Element Namespacing**:
  - All DOM elements prefixed with tab ID (e.g., `knock-totalKnockEvents`, `boost-maxOvershoot`)
  - Prevents ID conflicts between tabs
  - Tab content sections use `data-tab` attribute
- **State Management**:
  - Each tab maintains independent state (charts, sort, filters)
  - State preserved when switching tabs
  - State cleared when new file loaded (`clearCache()`)
- **Lazy Initialization**:
  - `initialize()` called only once per tab (on first switch)
  - `initialized` flag prevents re-initialization
  - Charts only rendered if they don't exist (persist across tab switches)
- **Adding New Tabs**:
  1. Create analyzer class (extends analysis logic)
  2. Create tab module object (implements interface)
  3. Add HTML structure in `index.html` with `data-tab` attribute
  4. Register in `app.js`: `tabManager.registerTab('newTab', NewTabModule, newAnalyzer)`

**Acceptance Criteria:**
- Each tab is implemented as a separate module with standard interface:
  - `initialize()` method for setting up DOM elements and event listeners
  - `render(analysisData)` method for rendering tab content
  - `updateStatistics()` method for updating statistics display
  - `renderCharts()` method for rendering charts
  - `updateTable()` method for updating table display
- Tab modules maintain their own chart instances and state
- Tab modules can access shared dataProcessor and tabManager
- Tab modules are registered with TabManager during initialization
- New tabs can be added by creating new module and registering it
- Tab modules handle their own DOM element references (prefixed with tab ID)

---

## **FR23: Tab-Specific UI Elements**
**Description:** Each tab maintains its own UI elements and controls independently.

**Acceptance Criteria:**
- Log Score tab has its own:
  - Summary statistics cards (total issues, critical issues, issues by category)
  - Toggle to include/exclude short-term fuel trim events
  - Multi-filter controls (search, source filter, event type filter, severity filter)
  - Cross-tab navigation cues (row hover state, click-to-switch messaging)
  - Aggregated issues table with per-row severity badges
- Knock Analysis tab has its own:
  - Statistics panel with knock-specific metrics
  - Charts (knock retard, RPM, throttle, AFR)
  - Table with knock events
  - Search input and severity filter
- Boost Control tab has its own:
  - Statistics panel with boost-specific metrics
  - Charts (boost target vs actual, boost error, wastegate)
  - Table with boost control events
  - Search input and event type filter
  - Throttle position toggle
- Air/Fuel Ratio tab has its own:
  - Statistics panel with AFR-specific metrics
  - Charts (target vs measured AFR, AFR error)
  - Table with AFR events
  - Search input and event type filter
  - AFR/Lambda unit toggle
  - Data smoothing toggle
- Short Term Fuel Trim tab has its own:
  - Statistics panel with fuel trim-specific metrics
  - Charts (fuel trim over time)
  - Table with fuel trim events
  - Search input and event type filter
  - Throttle position toggle
- Long Term Fuel Trim tab has its own:
  - Statistics panel with fuel trim-specific metrics
  - Charts (fuel trim over time)
  - Table with fuel trim events
  - Search input and event type filter
  - Throttle position toggle
- UI elements are properly namespaced with tab ID prefix (e.g., "logscore-", "knock-", "boost-", "afr-", "fueltrim-", "longtermfueltrim-")
- Each tab's controls only affect that tab's content
- Switching tabs preserves filter/search state within each tab
- Table sorting state is maintained per tab independently

---

## **FR24: Air/Fuel Ratio Analysis**
**Description:** Analyze air/fuel ratio control accuracy by comparing target AFR to measured AFR.

**Implementation Details:**
- **Analyzer Class**: `AFRAnalyzer` in `analysis/afrAnalyzer.js`
- **Column Detection Algorithm**:
  - Target AFR: "Power Mode - Fuel Ratio Target (λ)", "Fuel Ratio Target", "AFR Target", "Commanded AFR", etc. (14+ variations)
  - Measured AFR: "Air/Fuel Sensor #1 (λ)", "AFR Sensor #1", "Lambda Sensor #1", "O2 Sensor", etc. (14+ variations)
  - Multi-stage matching: exact → case-insensitive → partial → keyword-based
- **Data Filtering**:
  - Skips records where target AFR = 1.0 (stoichiometric/idle state)
  - Skips invalid values (0 or NaN)
  - Filters lean/rich events at low throttle (< 15%)
  - Only counts "time in target" for throttle >= 15%
- **Event Detection Thresholds**:
  - `leanThreshold = 0.05 λ` (measured > target by 0.05)
  - `richThreshold = -0.05 λ` (measured < target by 0.05)
  - `targetTolerance = 0.02 λ` (within ±0.02 is "in target")
- **Event Grouping**:
  - `groupingTimeWindow = 1.0 seconds` (1000ms)
  - Groups events by type (lean, rich, normal) separately
  - Most severe error (largest absolute) preserved in grouped event
  - Duration calculated for grouped events
- **Error Calculation**:
  - `afrError = measuredAFR - targetAFR`
  - Positive error = lean (too much air)
  - Negative error = rich (too much fuel)
- **Statistics Calculated**:
  - Average AFR error (absolute value)
  - Maximum lean deviation (positive error)
  - Maximum rich deviation (negative error)
  - Percentage of time within target range (throttle >= 15%)
  - Count of lean/rich events
- **Unit Conversion**:
  - Lambda (λ) is primary unit
  - AFR conversion: AFR = λ × 14.7
  - Toggle allows switching between lambda and AFR display
- **Error Handling**:
  - Returns empty result structure if required columns not found
  - Logs available columns to console
  - Shows UI warning with column detection info

**Acceptance Criteria:**
- Analyzer finds AFR-related columns with flexible matching:
  - Target AFR: "Power Mode - Fuel Ratio Target (λ)", "Fuel Ratio Target", "AFR Target", "Commanded AFR", etc.
  - Measured AFR: "Air/Fuel Sensor #1 (λ)", "AFR Sensor #1", "Lambda Sensor #1", "O2 Sensor", etc.
- Calculates AFR error for each data point (measured - target)
- Calculates AFR error percentage relative to target
- Identifies lean events (error > 0.05 λ above target)
- Identifies rich events (error < -0.05 λ below target)
- Determines "in target" range (error within ±0.02 λ tolerance)
- Filters out events at low throttle (< 15%)
- Skips stoichiometric target values (λ = 1.0)
- Groups events within 1.0 seconds into single events
- Analysis runs automatically during file processing (at 65% progress)
- Handles missing or invalid AFR data gracefully

---

## **FR25: Global Data Smoothing**
**Description:** Provide a global data smoothing toggle that applies moving average smoothing to all chart data across all tabs.

**Implementation Details:**
- **Global Toggle**: Checkbox in header (`global-smoothDataToggle`)
- **Smoothing Algorithm**: Moving average with configurable window size
  - Default window size: 5 points
  - Preserves NaN values (gaps) without smoothing
  - Only averages valid numeric values
- **Configuration**: Stored in `window.smoothingConfig`:
  ```javascript
  {
    enabled: true,  // Enabled by default when log file is loaded
    windowSize: 5
  }
  ```
- **Smoothing Function**: `window.applyDataSmoothing(dataArray, windowSize, enabled)`
  - Returns original array if disabled or windowSize <= 1
  - Calculates moving average for each point using half-window on each side
  - Handles edge cases (start/end of array)
- **Application**:
  - Applied to all chart data arrays before rendering
  - Applied in Knock Analysis, Boost Control, and AFR tabs
  - Smooths: knock retard, RPM, throttle, AFR, boost targets, boost actual, boost errors, wastegate DC
- **Zoom Preservation**: When smoothing toggle changes, charts re-render while preserving zoom state
  - `renderCharts(true)` parameter enables zoom preservation
  - Saved zoom state restored after chart re-creation

**Acceptance Criteria:**
- Global "Enable Data Smoothing" checkbox is visible in header
- Smoothing is enabled by default when log file is loaded
- Toggle state persists during session (until file reload)
- Smoothing applies to all charts in all tabs when enabled
- Moving average window size is 5 points (default)
- NaN values (gaps) are preserved without smoothing
- Charts re-render immediately when toggle changes
- Zoom state is preserved when smoothing is toggled
- Smoothing does not affect event markers (points)
- Smoothing can be enabled/disabled independently of other settings

---

## **FR26: Click-to-Zoom on Table Rows**
**Description:** Enable users to click table rows to zoom charts to that specific event.

**Implementation Details:**
- **Table Row Enhancement**: 
  - Each table row stores event data in `data-*` attributes:
    - `data-event-time`: Event start time
    - `data-event-duration`: Event duration (if grouped)
  - Cursor changes to pointer on hover
  - Tooltip: "Click to zoom to this event"
  - Hover effect: Background color change (`#e8f4f8`)
- **Zoom Function**: `zoomChartsToEvent(eventTime, eventDuration, bufferSeconds)`
  - Calculates zoom range: event time ± buffer, or event time + duration ± buffer
  - Default buffer: 3 seconds
  - Applies zoom to all charts in active tab
  - Uses `zoomToTimeRange()` helper function
  - Synchronizes all charts after zoom
- **Implementation**:
  - Works in all tabs (Knock Analysis, Boost Control, AFR)
  - Event listener added to each table row in `updateTable()`
  - Click handler calls `window.zoomChartsToEvent()`
  - Function is globally accessible via `window.zoomChartsToEvent`
- **Visual Feedback**:
  - Row hover: background color change
  - Cursor: pointer
  - Tooltip text

**Acceptance Criteria:**
- Table rows are clickable (cursor changes to pointer)
- Clicking a table row zooms all charts in the active tab to that event
- Zoom includes buffer time (3 seconds) before and after event
- For grouped events, zoom includes the full event duration plus buffer
- Charts are synchronized after zoom
- Visual feedback on hover (background color change, cursor pointer)
- Tooltip indicates click-to-zoom functionality
- Works in all tabs (Knock Analysis, Boost Control, AFR)
- Does not affect charts in inactive tabs

---

## **FR27: Throttle Position Display**
**Description:** Display throttle position overlay on boost control charts for context.

**Implementation Details:**
- **Toggle Control**: Checkbox in boost control tab header (`boost-showThrottleToggle`)
- **State Management**: Stored in `tab.module.showThrottle` (default: true)
- **Chart Integration**:
  - Added as additional dataset to all boost charts
  - Color: gray (`rgb(128, 128, 128)`)
  - Style: dashed line (`borderDash: [5, 5]`)
  - Width: 1px (thinner than main data)
  - Point radius: 0 (continuous line)
- **Dual Y-Axis**:
  - Left Y-axis: Primary data (boost pressure, error, wastegate DC)
  - Right Y-axis: Throttle position (%)
  - Grid lines: Only shown for left axis (right axis grid disabled)
- **Chart Updates**:
  - Charts re-render when toggle changes
  - Data applied through breakAtGaps and smoothing functions
  - Works on all boost charts: Target vs Actual, Error, Wastegate

**Acceptance Criteria:**
- "Show Throttle Position" checkbox is visible in boost control tab header
- Checkbox is checked by default
- When enabled, throttle position displayed on all boost control charts
- Throttle line is gray and dashed for visual distinction
- Dual Y-axis: Left for primary data, Right for throttle (%)
- Throttle line breaks at time gaps > 1 second
- Throttle line respects data smoothing toggle
- Charts update immediately when toggle changes
- Toggle state persists when switching tabs and returning

---

## **FR28: Chart Gap Breaking**
**Description:** Break chart lines at time gaps greater than 1 second to prevent misleading connections between distant data points.

**Implementation Details:**
- **Gap Detection**: `breakAtGaps(dataArray, timeArray)` helper function
  - Iterates through time array
  - Detects gaps > 1.0 second between consecutive points
  - Inserts NaN value at point before gap
- **Chart Behavior**:
  - Chart.js `spanGaps: false` setting prevents line connection across NaN
  - Creates visual break in line at gap
- **Application**:
  - Applied to all time-series data arrays before chart rendering
  - Used in Knock Analysis, Boost Control, and AFR tabs
  - Applied before smoothing (smoothing preserves NaN values)

**Acceptance Criteria:**
- Chart lines break at time gaps greater than 1 second
- No misleading line connections between distant data points
- Gap breaks visible in all charts (knock, boost, AFR)
- Gap breaking applies to all data series (not just events)
- Gap breaks preserved when data smoothing is enabled (NaN values not smoothed)
- Gap breaking does not affect event markers (points)

---

## **FR29: Boost Control Data Filtering**
**Description:** Filter boost control data to only show relevant boost conditions (actual boost >= 100 kPa).

**Implementation Details:**
- **Filtering Logic**: 
  - Applied during chart rendering and event analysis
  - Condition: `actualBoost >= 100 kPa`
  - Filters out atmospheric pressure, vacuum, and low boost conditions
- **Application**:
  - Filters data before creating charts
  - Statistics only calculated for filtered data
  - Events only created for filtered data points
- **Rationale**:
  - Reduces noise from idle/low throttle periods
  - Focuses analysis on actual boost conditions
  - Improves chart clarity and relevance

**Acceptance Criteria:**
- Charts only display data where actual boost >= 100 kPa
- Statistics only calculated for filtered data
- Events only created for filtered data points
- Filtering applies to all boost control charts
- Filtering reduces visual clutter from non-boost periods
- User is aware filtering is applied (through chart data range)

---

## **FR22: Multi-Tab File Processing**
**Description:** Process file data for all registered tabs during file loading.

**Implementation Details:**
- **Processing Pipeline** (in `processFile()` function):
  1. CSV Parsing (10-40% progress): `DataProcessor.parseCSV()`
  2. Analyzer Initialization (45% progress): Set `dataProcessor` on all analyzers
  3. Knock Analysis (50% progress): `knockDetector.detectKnockEvents()`
  4. Boost Analysis (60% progress): `boostAnalyzer.analyze()`
  5. AFR Analysis (65% progress): `afrAnalyzer.analyze()`
  6. Short Term Fuel Trim Analysis (67% progress): `fuelTrimAnalyzer.analyze()`
  7. Long Term Fuel Trim Analysis (68% progress): `longTermFuelTrimAnalyzer.analyze()`
  8. UI Update (75% progress): Show content area, hide drop zone
  9. Tab Rendering (80% progress): `tabManager.switchTab(activeTabId)`
  10. Complete (100% progress): Hide progress bar after 500ms delay
- **Cache Management**:
  - Cache cleared at start: `tabManager.clearCache()`
  - Results stored: `tabManager.cache.set('knock', {events})` and `tabManager.cache.set('boost', analysisResults)`
  - Cache persists until new file loaded
- **Error Handling**:
  - Each analysis wrapped in try-catch
  - Failed analysis doesn't block other tabs
  - Error logged to console, null result cached
- **Progress Updates**:
  - Uses `requestAnimationFrame()` for smooth UI updates
  - Progress clamped to 0-100%
  - Text messages indicate current operation
- **Global Data Access**:
  - `dataProcessor` stored in `window.dataProcessor` for tab module access
  - Analyzers receive `dataProcessor` reference via property assignment

**Acceptance Criteria:**
- When a file is loaded, all registered analyzers are initialized with dataProcessor
- Knock analysis runs during file processing (at 50% progress)
- Boost control analysis runs during file processing (at 60% progress)
- AFR analysis runs during file processing (at 65% progress)
- Short term fuel trim analysis runs during file processing (at 67% progress)
- Long term fuel trim analysis runs during file processing (at 68% progress)
- Analysis results are cached for each tab
- Active tab is rendered after file processing completes (at 80% progress)
- Inactive tabs are not rendered until user switches to them
- Cache is cleared when a new file is loaded
- Progress messages indicate which analysis is running
- If an analysis fails, other tabs continue to process

---

## Additional Implementation Notes

### Error Handling Strategy
- **File Loading**: Try-catch with user alerts for file read errors
- **CSV Parsing**: Promise rejection with error messages
- **Column Detection**: Graceful fallbacks with console warnings
- **Chart Rendering**: Null checks before chart creation
- **Tab Switching**: Error logging without blocking UI
- **Column Info Display**: User-friendly UI warnings when required columns are not found
  - Visual warning panel displayed in statistics section with yellow/amber styling
  - Shows which columns are being searched for
  - Displays available columns in expandable/collapsible details section
  - Highlights potential matching columns (e.g., pressure-related for boost)
  - Provides console logging for debugging (F12)
  - Implemented in all analysis tabs (Boost, AFR, Fuel Trim, Long Term Fuel Trim)
  - Allows tabs to render with empty/default values when columns missing
  - Returns empty result structures instead of null to prevent crashes

### Performance Optimizations
- **Progress Throttling**: Updates limited to every 50 rows or 0.5% change
- **Chart Reuse**: Charts only recreated if they don't exist
- **Lazy Rendering**: Inactive tabs not rendered until switched to
- **Data Filtering**: Boost analysis filters to relevant data points (>= 100 kPa)
- **Event Grouping**: Reduces event count for display (knock: 100ms, boost: 500ms, AFR: 1000ms, fuel trim: 500ms windows)

### Data Structures
- **DataProcessor**: Stores parsed CSV data as array of objects
  - Provides utility methods: `getData()`, `getColumns()`, `getColumnIndex()`, `getTimeRange()`, `getValueAtTime()`
  - Accessible globally via `window.dataProcessor` for tab modules
- **Knock Events**: Array of event objects with severity, time, parameters
- **Boost Events**: Array of grouped events with type, error, duration
- **AFR Events**: Array of grouped events with type (lean/rich), error, duration
- **Fuel Trim Events**: Array of grouped events with type (positive/negative), trim value, duration
- **Tab Cache**: Map structure for O(1) lookup of analysis results

### UI/UX Design System

#### Color Palette
- **Primary Background**: `#f5f5f5` (light gray)
- **Content Background**: `white` (`#ffffff`)
- **Primary Text**: `#333` (dark gray)
- **Secondary Text**: `#666` (medium gray)
- **Tertiary Text**: `#999` (light gray)
- **Primary Accent**: `#333` (dark gray for buttons, headers)
- **Secondary Accent**: `#666` (medium gray for secondary buttons)
- **Chart Background**: `#f8f9fa` (very light gray)
- **Border Color**: `#e0e0e0` (light border gray)
- **Hover Background**: `#f5f5f5` (light gray)
- **Active Tab Border**: `#333` (dark gray, 3px solid)
- **Stat Card Background**: `#333` (dark gray with white text)
- **Table Header**: `#333` (dark gray with white text)
- **Row Hover**: `#f5f5f5` (light gray)
- **Loading Overlay**: `rgba(100, 100, 100, 0.85)` (semi-transparent gray)
- **Progress Bar**: `#333` (dark gray) with gradient overlay
- **Severity Badges**:
  - Mild: `#e0e0e0` background, `#333` text
  - Moderate: `#ccc` background, `#333` text
  - Severe: `#999` background, white text

#### Typography
- **Font Family**: System font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif`)
- **Heading 1**: 28px, font-weight 600, color `#333`
- **Heading 2**: 22px, font-weight 600, color `#333`
- **Heading 3**: 16px, font-weight 500, color `#555`
- **Body Text**: 14px, font-weight 400, color `#333`
- **Stat Value**: 32px, font-weight 700, white text on dark background
- **Stat Label**: 14px, opacity 0.9, white text on dark background
- **File Name**: 14px, italic, color `#666`
- **Button Text**: 14px, font-weight 500
- **Table Header**: 14px, font-weight 600, white text
- **Table Cell**: 14px, font-weight 400

#### Spacing and Layout
- **Container Padding**: 20px
- **Header Padding**: 20px 30px
- **Content Area Padding**: 30px
- **Section Margins**: 30px bottom margin
- **Grid Gaps**: 20px (stats grid, charts container)
- **Button Padding**: 10px 20px (primary/secondary), 6px 12px (reset zoom)
- **Table Cell Padding**: 12px 15px (body), 15px (header)
- **Stat Card Padding**: 20px
- **Chart Wrapper Padding**: 20px
- **Border Radius**: 
  - Large: 12px (header, content area, drop zone)
  - Medium: 8px (stat cards, chart wrappers, tables, progress section)
  - Small: 6px (buttons, inputs, selects)
  - Badge: 12px (severity badges)

#### Component Styling

**Buttons**
- **Primary Button** (`.btn-primary`):
  - Background: `#333`, color: white
  - Hover: `#555` background, `translateY(-2px)`, shadow `0 4px 8px rgba(0, 0, 0, 0.2)`
  - Transition: `all 0.3s ease`
- **Secondary Button** (`.btn-secondary`):
  - Background: `#666`, color: white
  - Hover: `#555` background, `translateY(-2px)`, shadow
  - Transition: `all 0.3s ease`
- **Reset Zoom Button** (`.reset-zoom-btn`):
  - Background: `#666`, color: white
  - Hover: `#555` background, `translateY(-1px)`, shadow
  - Active: `translateY(0)`

**Tab Navigation**
- **Tab Container**: Flexbox layout, border-bottom `2px solid #e0e0e0`
- **Tab Button** (`.tab-btn`):
  - Padding: `12px 24px`
  - Color: `#666` (inactive), `#333` (active)
  - Border-bottom: `3px solid transparent` (inactive), `3px solid #333` (active)
  - Hover: `#333` color, `#f5f5f5` background
  - Active: `#333` color, `font-weight: 600`
  - Transition: `all 0.3s ease`

**Statistics Cards**
- **Stat Card** (`.stat-card`):
  - Background: `#333`, color: white
  - Border-radius: `8px`
  - Box-shadow: `0 2px 4px rgba(0, 0, 0, 0.1)`
  - Text-align: center
  - Grid: `repeat(auto-fit, minmax(200px, 1fr))` with 20px gap

**Charts**
- **Chart Wrapper** (`.chart-wrapper`):
  - Background: `#f8f9fa`
  - Padding: `20px`
  - Border-radius: `8px`
  - Box-shadow: `0 2px 4px rgba(0, 0, 0, 0.05)`
- **Chart Canvas**: Fixed height `400px`, width `100%`
- **Chart Header**: Flexbox, space-between alignment

**Tables**
- **Table Container** (`.table-container`):
  - Overflow-x: auto
  - Border-radius: `8px`
  - Box-shadow: `0 2px 4px rgba(0, 0, 0, 0.05)`
- **Table Header** (`.anomaly-table thead`):
  - Background: `#333`, color: white
  - Cursor: pointer (sortable)
  - User-select: none
  - Hover: `rgba(255, 255, 255, 0.1)` background
- **Table Rows** (`.anomaly-table tbody tr`):
  - Border-bottom: `1px solid #e0e0e0`
  - Transition: `background-color 0.2s`
  - Hover: `#f5f5f5` background
  - Clickable rows: pointer cursor, hover background `#e8f4f8`

**Form Controls**
- **Search Input** (`.search-input`):
  - Flex: 1 (takes available space)
  - Border: `2px solid #e0e0e0`
  - Border-radius: `6px`
  - Focus: border-color `#666`
  - Transition: `border-color 0.3s`
- **Filter Select** (`.filter-select`):
  - Padding: `10px 15px`
  - Border: `2px solid #e0e0e0`
  - Border-radius: `6px`
  - Background: white
  - Cursor: pointer
  - Focus: border-color `#666`
  - Transition: `border-color 0.3s`

**Drop Zone**
- **Drop Zone** (`.drop-zone`):
  - Background: white
  - Border: `3px dashed #999`
  - Border-radius: `12px`
  - Padding: `60px`
  - Text-align: center
  - Cursor: pointer
  - Transition: `all 0.3s ease`
  - Hover: `#f5f5f5` background, `#666` border-color
  - Drag-over: `#e0e0e0` background, `#333` border-color, `scale(1.02)`

**Loading States**
- **Content Loading Overlay** (`.content-loading-overlay`):
  - Position: absolute, full coverage
  - Background: `rgba(100, 100, 100, 0.85)`
  - Z-index: 100
  - Flexbox: column, centered
  - Padding-top: `80px`
- **Tab Loading Overlay** (`.tab-loading-overlay`):
  - Position: absolute, full coverage
  - Background: `rgba(100, 100, 100, 0.85)`
  - Z-index: 50
  - Flexbox: column, centered
  - Padding-top: `60px`
- **Loading State** (`.loading`):
  - Opacity: `0.5`
  - Filter: `grayscale(0.3)`
  - Pointer-events: none
  - Transition: `opacity 0.3s ease, filter 0.3s ease`
- **Spinner**:
  - Border: `4px solid rgba(255, 255, 255, 0.3)`
  - Border-top: `4px solid white`
  - Border-radius: `50%`
  - Size: `50px` (content overlay), `40px` (tab overlay)
  - Animation: `spin 1s linear infinite`

**Progress Bar**
- **Progress Section** (`.progress-section`):
  - Background: white
  - Padding: `15px 20px`
  - Border-radius: `8px`
  - Box-shadow: `0 2px 4px rgba(0, 0, 0, 0.1)`
- **Progress Bar** (`.progress-bar`):
  - Background: `#333`
  - Border-radius: `10px`
  - Height: `20px`
  - Transition: `width 0.4s ease-out`
  - Box-shadow: `0 1px 3px rgba(0, 0, 0, 0.2)`

**Severity Badges**
- **Base Badge** (`.severity-badge`):
  - Display: inline-block
  - Padding: `4px 12px`
  - Border-radius: `12px`
  - Font-size: `12px`
  - Font-weight: `600`
  - Text-transform: uppercase
- **Severity Classes** (used in analysis tabs):
  - `.severity-mild`: `#e0e0e0` background, `#333` text
  - `.severity-moderate`: `#ccc` background, `#333` text
  - `.severity-severe`: `#999` background, white text
- **Log Score Badge Classes** (used in Log Score tab):
  - `.badge-severe`: Severe issues (high priority)
  - `.badge-warning`: High severity issues
  - `.badge-info`: Low severity issues
  - `.badge-mild`: Mild severity issues
  - `.badge-default`: Default/unknown severity
  - Note: These classes are dynamically applied in `logScoreTab.js` and should be styled consistently with severity-badge patterns

#### Interactive States and Transitions
- **Hover Effects**: 
  - Buttons: `translateY(-2px)` with shadow
  - Tab buttons: color change, background highlight
  - Table rows: background color change
  - Table headers: semi-transparent white overlay
- **Active States**:
  - Tab buttons: bold font, colored border
  - Buttons: `translateY(0)` on active
- **Focus States**:
  - Inputs/selects: border color change to `#666`
  - Outline: none (custom border styling)
- **Transitions**: 
  - Most interactive elements: `0.3s ease`
  - Table rows: `0.2s` for background color
  - Progress bar: `0.4s ease-out`

#### Responsive Design
- **Breakpoint**: `768px` (mobile/tablet)
- **Mobile Adaptations**:
  - Header: flex-direction column, centered text
  - Charts: height reduced to `300px`
  - Stats grid: `repeat(2, 1fr)` (2 columns)
  - Charts container: single column layout

#### Visual Feedback Patterns
- **Hover States**: Background color changes, cursor pointer, subtle transforms
- **Active Tab Highlighting**: Bold font, colored bottom border
- **Drag-over Effects**: Scale transform, color change
- **Loading Indicators**: Spinner animation, overlay with opacity/grayscale
- **Sort Indicators**: Arrow symbols (↑ ↓) appended to column headers
- **Clickable Rows**: Pointer cursor, hover background `#e8f4f8`, tooltip text
- **Error/Warning Panels**: Yellow/amber background, expandable details sections

#### Accessibility Considerations
- **Color Contrast**: High contrast text on backgrounds (white on `#333`, `#333` on white)
- **Interactive Elements**: Clear hover states, pointer cursor, focus indicators
- **Text Sizing**: Minimum 12px font size, readable hierarchy
- **User Selection**: Disabled on sortable headers (`user-select: none`)
- **Keyboard Navigation**: Focus states on form controls

---

## **FR30: Short Term Fuel Trim Analysis**
**Description:** Analyze short term fuel trim values to identify abnormal conditions where fuel trim exceeds ±10%.

**Implementation Details:**
- **Analyzer Class**: `FuelTrimAnalyzer` in `analysis/fuelTrimAnalyzer.js`
- **Column Detection Algorithm**:
  - Short Term Fuel Trim: "Fuel Trim - Short Term (%)", "Short Term Fuel Trim", "STFT (%)", "STFT", etc. (12+ variations)
  - Multi-stage matching: exact → case-insensitive → partial → keyword-based
- **Abnormal Threshold**: `abnormalThreshold = 10.0%` (values exceeding ±10% are considered abnormal)
- **Event Classification**:
  - Positive trim (>+10%): Adding fuel (rich condition, ECU trying to lean out)
  - Negative trim (<-10%): Removing fuel (lean condition, ECU trying to enrich)
  - Normal: Within ±10% range
- **Event Grouping**:
  - `groupingTimeWindow = 0.5 seconds` (500ms)
  - Groups events by type (positive, negative) separately
  - Most severe trim value (largest absolute) preserved in grouped event
  - Duration calculated for grouped events
- **Statistics Calculated**:
  - Average fuel trim (absolute value)
  - Maximum positive trim deviation
  - Maximum negative trim deviation
  - Percentage of time within target range (±10%)
  - Count of abnormal events (positive and negative)
- **Error Handling**:
  - Returns empty result structure if required column not found
  - Logs available columns to console
  - Shows UI warning with column detection info

**Acceptance Criteria:**
- Analyzer finds short term fuel trim column with flexible matching:
  - "Fuel Trim - Short Term (%)", "Short Term Fuel Trim", "STFT (%)", "STFT", etc.
- Identifies abnormal events when fuel trim > +10% (positive trim)
- Identifies abnormal events when fuel trim < -10% (negative trim)
- Determines "in target" range (within ±10% tolerance)
- Groups events within 0.5 seconds into single events
- Analysis runs automatically during file processing (at 67% progress)
- Handles missing or invalid fuel trim data gracefully
- Statistics display correctly formatted values with percentage symbols

---

## **FR31: Short Term Fuel Trim Statistics Display**
**Description:** Display summary statistics for short term fuel trim performance.

**Acceptance Criteria:**
- Displays average fuel trim value in percentage
- Displays maximum deviation (largest absolute value of positive or negative trim)
- Displays percentage of time fuel trim was within target range (±10%)
- Displays count of abnormal events (exceeding ±10%)
- All statistics are formatted with appropriate decimal places (2 decimal places for percentages)
- Statistics update when fuel trim tab is rendered
- Statistics display "0.0%" or "0" when no data is available

---

## **FR32: Short Term Fuel Trim Chart Visualization**
**Description:** Display interactive chart showing short term fuel trim values over time.

**Implementation Details:**
- **Short Term Fuel Trim Over Time Chart**:
  - Dataset 1: Short Term Fuel Trim line (blue, `rgb(0, 123, 255)`)
  - Dataset 2: Normal range upper limit (+10%) (gray, dashed)
  - Dataset 3: Normal range lower limit (-10%) (gray, dashed)
  - Dataset 4: Zero reference line (light gray, dashed)
  - Dataset 5: Throttle Position (gray, dashed, optional toggle, dual Y-axis)
  - Dataset 6: Positive trim events (>+10%) (red points, `pointRadius: 6`)
  - Dataset 7: Negative trim events (<-10%) (yellow points, `pointRadius: 6`)
- **Chart Options**: Same zoom/pan configuration as other tabs (synchronized within tab)
- **Gap Breaking**: Lines break at time gaps > 1 second
- **Data Smoothing**: Respects global data smoothing toggle
- **Throttle Toggle**: Optional throttle position overlay on chart (dual Y-axis, checkbox in chart header)
- **Dual Y-Axis**: Left axis for fuel trim (%), right axis for throttle (%) when throttle enabled

**Acceptance Criteria:**
- **Short Term Fuel Trim Over Time Chart:**
  - Displays fuel trim as continuous blue line
  - Shows normal range limits (±10%) as dashed gray lines
  - Shows zero reference line (light gray, dashed)
  - Optional throttle position overlay (gray, dashed) with dual Y-axis
  - Marks positive trim events (>+10%) with red points
  - Marks negative trim events (<-10%) with yellow points
- Chart uses time (seconds) as X-axis
- Chart supports zoom and pan functionality (synchronized within tab)
- Chart persists across tab switches
- Chart renders without errors for large datasets
- Chart is responsive and maintains aspect ratio
- Lines break at time gaps > 1 second
- Chart respects global data smoothing toggle
- Throttle toggle checkbox is visible in chart section header

---

## **FR33: Short Term Fuel Trim Events Detail Table**
**Description:** Display detailed fuel trim events in a sortable, filterable table.

**Acceptance Criteria:**
- Table displays columns:
  - Time (s) with duration for grouped events - formatted to 2 decimal places, duration to 3 decimal places
  - Fuel Trim (%) - formatted to 2 decimal places (shows max trim for grouped events)
  - RPM - integer format
  - Throttle (%) - formatted to 1 decimal place
  - Load (g/rev) - formatted to 2 decimal places
  - A/F Ratio (λ) - formatted to 3 decimal places, or "N/A" if not available
  - Event Type - color-coded badge (positive=red, negative=yellow)
- Table is sortable by clicking column headers
- Sort direction toggles (ascending/descending) on repeated clicks
- Sort indicators (↑/↓) appear in column headers
- Table updates when filters are applied
- Table shows only abnormal events (exceeding ±10%)
- Table displays grouped events with duration when events are grouped within time windows
- Table rows are clickable to zoom charts to event (FR26)

---

## **FR34: Short Term Fuel Trim Search and Filter**
**Description:** Search and filter fuel trim events by various criteria.

**Acceptance Criteria:**
- Search input filters events by:
  - Time value
  - Fuel trim value
  - RPM value
  - Throttle value
  - Event type (positive, negative)
- Event type dropdown filter with options:
  - "All Event Types" - shows all abnormal events
  - "Positive (>+10%)" - shows only positive trim events
  - "Negative (<-10%)" - shows only negative trim events
- Search is case-insensitive
- Filters work together (AND logic - both search and event type must match)
- Table updates in real-time as user types in search field
- Empty search shows all events matching event type filter
- Filter state persists when switching tabs and returning

---

## **FR35: Long Term Fuel Trim Analysis**
**Description:** Analyze long term fuel trim values to identify abnormal conditions where fuel trim exceeds ±5%.

**Implementation Details:**
- **Analyzer Class**: `LongTermFuelTrimAnalyzer` in `analysis/longTermFuelTrimAnalyzer.js`
- **Column Detection Algorithm**:
  - Long Term Fuel Trim: "Fuel Trim - Long Term (%)", "Long Term Fuel Trim", "LTFT (%)", "LTFT", etc. (12+ variations)
  - Multi-stage matching: exact → case-insensitive → partial → keyword-based
- **Abnormal Threshold**: `abnormalThreshold = 5.0%` (values exceeding ±5% are considered abnormal - stricter than short term)
- **Event Classification**:
  - Positive trim (>+5%): Adding fuel (rich condition, ECU trying to lean out)
  - Negative trim (<-5%): Removing fuel (lean condition, ECU trying to enrich)
  - Normal: Within ±5% range
- **Event Grouping**:
  - `groupingTimeWindow = 0.5 seconds` (500ms)
  - Groups events by type (positive, negative) separately
  - Most severe trim value (largest absolute) preserved in grouped event
  - Duration calculated for grouped events
- **Statistics Calculated**:
  - Average fuel trim (absolute value)
  - Maximum positive trim deviation
  - Maximum negative trim deviation
  - Percentage of time within target range (±5%)
  - Count of abnormal events (positive and negative)
- **Error Handling**:
  - Returns empty result structure if required column not found
  - Logs available columns to console
  - Shows UI warning with column detection info

**Acceptance Criteria:**
- Analyzer finds long term fuel trim column with flexible matching:
  - "Fuel Trim - Long Term (%)", "Long Term Fuel Trim", "LTFT (%)", "LTFT", etc.
- Identifies abnormal events when fuel trim > +5% (positive trim)
- Identifies abnormal events when fuel trim < -5% (negative trim)
- Determines "in target" range (within ±5% tolerance)
- Groups events within 0.5 seconds into single events
- Analysis runs automatically during file processing (at 68% progress)
- Handles missing or invalid fuel trim data gracefully
- Statistics display correctly formatted values with percentage symbols

---

## **FR36: Long Term Fuel Trim Statistics Display**
**Description:** Display summary statistics for long term fuel trim performance.

**Acceptance Criteria:**
- Displays average fuel trim value in percentage
- Displays maximum deviation (largest absolute value of positive or negative trim)
- Displays percentage of time fuel trim was within target range (±5%)
- Displays count of abnormal events (exceeding ±5%)
- All statistics are formatted with appropriate decimal places (2 decimal places for percentages)
- Statistics update when fuel trim tab is rendered
- Statistics display "0.0%" or "0" when no data is available

---

## **FR37: Long Term Fuel Trim Chart Visualization**
**Description:** Display interactive chart showing long term fuel trim values over time.

**Implementation Details:**
- **Long Term Fuel Trim Over Time Chart**:
  - Dataset 1: Long Term Fuel Trim line (blue, `rgb(0, 123, 255)`)
  - Dataset 2: Normal range upper limit (+5%) (gray, dashed)
  - Dataset 3: Normal range lower limit (-5%) (gray, dashed)
  - Dataset 4: Zero reference line (light gray, dashed)
  - Dataset 5: Throttle Position (gray, dashed, optional toggle, dual Y-axis)
  - Dataset 6: Positive trim events (>+5%) (red points, `pointRadius: 6`)
  - Dataset 7: Negative trim events (<-5%) (yellow points, `pointRadius: 6`)
- **Chart Options**: Same zoom/pan configuration as other tabs (synchronized within tab)
- **Gap Breaking**: Lines break at time gaps > 1 second
- **Data Smoothing**: Respects global data smoothing toggle
- **Throttle Toggle**: Optional throttle position overlay on chart (dual Y-axis, checkbox in chart header)
- **Dual Y-Axis**: Left axis for fuel trim (%), right axis for throttle (%) when throttle enabled

**Acceptance Criteria:**
- **Long Term Fuel Trim Over Time Chart:**
  - Displays fuel trim as continuous blue line
  - Shows normal range limits (±5%) as dashed gray lines
  - Shows zero reference line (light gray, dashed)
  - Optional throttle position overlay (gray, dashed) with dual Y-axis
  - Marks positive trim events (>+5%) with red points
  - Marks negative trim events (<-5%) with yellow points
- Chart uses time (seconds) as X-axis
- Chart supports zoom and pan functionality (synchronized within tab)
- Chart persists across tab switches
- Chart renders without errors for large datasets
- Chart is responsive and maintains aspect ratio
- Lines break at time gaps > 1 second
- Chart respects global data smoothing toggle
- Throttle toggle checkbox is visible in chart section header

---

## **FR38: Long Term Fuel Trim Events Detail Table**
**Description:** Display detailed fuel trim events in a sortable, filterable table.

**Acceptance Criteria:**
- Table displays columns:
  - Time (s) with duration for grouped events - formatted to 2 decimal places, duration to 3 decimal places
  - Fuel Trim (%) - formatted to 2 decimal places (shows max trim for grouped events)
  - RPM - integer format
  - Throttle (%) - formatted to 1 decimal place
  - Load (g/rev) - formatted to 2 decimal places
  - A/F Ratio (λ) - formatted to 3 decimal places, or "N/A" if not available
  - Event Type - color-coded badge (positive=red, negative=yellow)
- Table is sortable by clicking column headers
- Sort direction toggles (ascending/descending) on repeated clicks
- Sort indicators (↑/↓) appear in column headers
- Table updates when filters are applied
- Table shows only abnormal events (exceeding ±5%)
- Table displays grouped events with duration when events are grouped within time windows
- Table rows are clickable to zoom charts to event (FR26)

---

## **FR39: Long Term Fuel Trim Search and Filter**
**Description:** Search and filter fuel trim events by various criteria.

**Acceptance Criteria:**
- Search input filters events by:
  - Time value
  - Fuel trim value
  - RPM value
  - Throttle value
  - Event type (positive, negative)
- Event type dropdown filter with options:
  - "All Event Types" - shows all abnormal events
  - "Positive (>+5%)" - shows only positive trim events
  - "Negative (<-5%)" - shows only negative trim events
- Search is case-insensitive
- Filters work together (AND logic - both search and event type must match)
- Table updates in real-time as user types in search field
- Empty search shows all events matching event type filter
- Filter state persists when switching tabs and returning

---

## **FR40: Loading Overlays and Visual Feedback**
**Description:** Provide visual feedback during chart rendering and UI operations to indicate processing state.

**Implementation Details:**
- **Content Loading Overlay**:
  - Displayed during initial file processing (before tab rendering)
  - Full-screen overlay with spinner and "Processing log file..." message
  - Gray background (`rgba(100, 100, 100, 0.85)`) with semi-transparent effect
  - Applied to entire content area during file loading
  - Automatically hidden after file processing completes
- **Tab Loading Overlay**:
  - Displayed per-tab during chart re-rendering operations
  - Shown when toggling features (smoothing, throttle, AFR units)
  - Tab-specific overlay with spinner and "Loading data..." message
  - Applied only to active tab content
  - Minimum display time: 300ms to ensure visibility
  - Uses `requestAnimationFrame()` for smooth transitions
- **Loading State Management**:
  - Tab content gets `.loading` class during operations
  - Loading class applies opacity reduction and grayscale filter
  - Overlay displayed via flexbox with centered spinner
  - Overlay hidden automatically after operation completes
- **Application Points**:
  - Global data smoothing toggle
  - Tab-specific feature toggles (throttle position, AFR units)
  - Chart re-rendering operations
  - Tab switching (during initial render)

**Acceptance Criteria:**
- Content loading overlay appears during file processing
- Tab loading overlay appears during chart re-rendering operations
- Loading overlays show spinner animation and descriptive text
- Overlays are automatically hidden after operations complete
- Loading state applies visual feedback (opacity, grayscale) to content
- Minimum display time ensures overlays are visible (300ms)
- Overlays do not block user interactions after completion
- Loading state is properly cleaned up on errors

---

## **FR41: Log Score Aggregation and Navigation**
**Description:** Provide a Log Score overview tab that consolidates analyzer outputs into a single, filterable issue list with cross-tab navigation.

**Implementation Details:**
- Implemented in `renderer/tabs/logScoreTab.js` as a TabManager module without its own analyzer.
- `compileAllIssues()` reads cached results from Knock, Boost, AFR, Short Term Fuel Trim, and Long Term Fuel Trim analyzers; short term trim events are gated by the `showShortTermTrim` toggle.
- Statistics cards surface total issues, critical issues, and per-source counts based on the aggregated dataset.
- Filter controls include: search input, source dropdown, event type dropdown, severity dropdown, and the short-term trim toggle. All filters call `updateTable()` and `updateStatistics()`.
- Table rows contain severity badges, formatted values (units and +/- signs), tooltips, and store `data-event-time` / `data-event-duration` attributes for zooming.
- Clicking a row switches to the originating tab (`tabManager.switchTab(sourceId)`) and invokes `window.zoomChartsToEvent()` after a short timeout so charts zoom to the relevant time range.
- Sorting state is preserved per column; headers show ascending/descending indicators and sorting reuses the in-memory `compiledIssues` array.

**Acceptance Criteria:**
- After processing a log file, the Log Score tab automatically displays up-to-date statistics and a populated issues table.
- A checkbox labeled "Show Short Term Fuel Trim" exists, is off by default, and immediately adds/removes STFT events (and recomputes statistics) when toggled.
- Source, event type, severity, and search filters apply simultaneously (AND logic); clearing a filter restores the corresponding dimension.
- Column headers (Time, Source, Event Type, Severity, Value) are clickable to sort ascending/descending, and the current direction is indicated in the header text.
- Table rows highlight on hover, display a pointer cursor plus tooltip, and are clickable to jump to the related tab and zoom its charts around the event (using a 3-second buffer and any stored duration).
- Filter and sort selections persist when the user navigates to another tab and later returns to Log Score during the same session.

---

## Summary

This document contains 41 functional requirements covering:
- File loading and parsing (FR1-FR2)
- Knock detection and analysis (FR3-FR8)
- Progress tracking and data validation (FR9-FR10)
- UI responsiveness and desktop integration (FR11-FR12)
- Tab navigation and management (FR13-FR14, FR20-FR23)
- Boost control analysis (FR15-FR19)
- Air/Fuel ratio analysis (FR24)
- Short Term Fuel Trim analysis (FR30-FR34)
- Long Term Fuel Trim analysis (FR35-FR39)
- Global data smoothing (FR25)
- Click-to-zoom on table rows (FR26)
- Throttle position display (FR27)
- Chart gap breaking (FR28)
- Boost control data filtering (FR29)
- Tab-specific UI elements (FR23)
- Loading overlays and visual feedback (FR40)
- Log Score aggregation and navigation (FR41)

Each requirement includes detailed acceptance criteria and implementation details to ensure proper implementation and testing. The document also includes framework decisions, architecture overview, technical specifications for developers, and a comprehensive UI/UX Design System section documenting color palettes, typography, spacing, component styling, interactive states, and responsive design patterns.

