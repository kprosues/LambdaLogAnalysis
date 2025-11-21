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
│   └── boostControlAnalyzer.js # Boost control analysis logic
└── renderer/                  # UI layer
    ├── index.html            # Main HTML structure
    ├── app.js                # Main application logic
    ├── styles.css            # Styling
    ├── tabManager.js         # Tab management system
    └── tabs/                 # Tab modules
        ├── knockAnalysisTab.js
        └── boostControlTab.js
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
4. Analyzers (KnockDetector, BoostControlAnalyzer) process data
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
  - `maintainAspectRatio: true` - Preserves aspect ratio
  - `pointRadius: 0` - Continuous lines (no point markers for main data)
  - `spanGaps: false` - Lines break at NaN values
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
**Description:** Provide a tabbed interface to switch between different analysis views (Knock Analysis and Boost Control).

**Acceptance Criteria:**
- Tab navigation buttons are displayed at the top of the content area
- Two tabs are available: "Knock Analysis" and "Boost Control"
- Active tab button is visually highlighted (different styling)
- Clicking a tab button switches to that tab's content
- Only one tab's content is visible at a time
- Tab content sections are properly hidden/shown when switching tabs
- Default active tab is "Knock Analysis" when file is first loaded
- Tab state persists when switching between tabs (data is cached)
- Tab buttons remain visible and functional after file processing

---

## **FR14: Tab Management and Caching**
**Description:** Manage multiple analysis tabs with cached results and proper initialization.

**Implementation Details:**
- **TabManager Initialization**: Created in `DOMContentLoaded` event handler
- **Tab Registration**:
  ```javascript
  tabManager.registerTab('knock', KnockAnalysisTab, knockDetector);
  tabManager.registerTab('boost', BoostControlTab, boostAnalyzer);
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
- Displays average boost error (absolute value) in kPa
- Displays maximum overshoot value in kPa
- Displays maximum undershoot value (absolute value) in kPa
- Displays percentage of time boost was within target range (±2.0 kPa)
- Displays count of overshoot events
- Displays count of undershoot events
- All statistics are formatted with appropriate decimal places (2 decimal places)
- Statistics update when boost control tab is rendered
- Statistics display "0.0" or "0" when no data is available

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
- Charts render without errors for large datasets
- Charts are responsive and maintain aspect ratio

---

## **FR18: Boost Control Events Detail Table**
**Description:** Display detailed boost control events in a sortable, filterable table.

**Acceptance Criteria:**
- Table displays columns:
  - Time (s) - formatted to 2 decimal places
  - Boost Target (kPa) - formatted to 2 decimal places
  - Actual Boost (kPa) - formatted to 2 decimal places
  - Error (kPa) - formatted to 2 decimal places (can be positive or negative)
  - Error (%) - formatted to 2 decimal places with % symbol
  - Wastegate DC (%) - formatted to 1 decimal place, or "N/A" if not available
  - Event Type - color-coded badge (overshoot=red, undershoot=yellow, normal=default)
- Table is sortable by clicking column headers
- Sort direction toggles (ascending/descending) on repeated clicks
- Sort indicators (↑/↓) appear in column headers
- Table updates when filters are applied
- Table shows only events that deviate from target (overshoot, undershoot, or outside tolerance)

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

## **FR22: Multi-Tab File Processing**
**Description:** Process file data for all registered tabs during file loading.

**Acceptance Criteria:**
- When a file is loaded, all registered analyzers are initialized with dataProcessor
- Knock analysis runs during file processing (at 50% progress)
- Boost control analysis runs during file processing (at 60% progress)
- Analysis results are cached for each tab
- Active tab is rendered after file processing completes (at 80% progress)
- Inactive tabs are not rendered until user switches to them
- Cache is cleared when a new file is loaded
- Progress messages indicate which analysis is running
- If an analysis fails, other tabs continue to process

---

## **FR23: Tab-Specific UI Elements**
**Description:** Each tab maintains its own UI elements and controls independently.

**Acceptance Criteria:**
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
- UI elements are properly namespaced with tab ID prefix (e.g., "knock-", "boost-")
- Each tab's controls only affect that tab's content
- Switching tabs preserves filter/search state within each tab
- Table sorting state is maintained per tab independently

---

## **FR22: Multi-Tab File Processing**
**Description:** Process file data for all registered tabs during file loading.

**Implementation Details:**
- **Processing Pipeline** (in `processFile()` function):
  1. CSV Parsing (10-40% progress): `DataProcessor.parseCSV()`
  2. Analyzer Initialization (45% progress): Set `dataProcessor` on all analyzers
  3. Knock Analysis (50% progress): `knockDetector.detectKnockEvents()`
  4. Boost Analysis (60% progress): `boostAnalyzer.analyze()`
  5. UI Update (75% progress): Show content area, hide drop zone
  6. Tab Rendering (80% progress): `tabManager.switchTab(activeTabId)`
  7. Complete (100% progress): Hide progress bar after 500ms delay
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

### Performance Optimizations
- **Progress Throttling**: Updates limited to every 50 rows or 0.5% change
- **Chart Reuse**: Charts only recreated if they don't exist
- **Lazy Rendering**: Inactive tabs not rendered until switched to
- **Data Filtering**: Boost analysis filters to relevant data points (>= 100 kPa)
- **Event Grouping**: Reduces event count for display (knock: 100ms, boost: 500ms windows)

### Data Structures
- **DataProcessor**: Stores parsed CSV data as array of objects
- **Knock Events**: Array of event objects with severity, time, parameters
- **Boost Events**: Array of grouped events with type, error, duration
- **Tab Cache**: Map structure for O(1) lookup of analysis results

### UI/UX Features
- **Responsive Design**: CSS Grid with `auto-fit` and `minmax()` for flexible layouts
- **Visual Feedback**: Hover states, active tab highlighting, drag-over effects
- **Loading States**: Modal spinner + inline progress bar
- **Error Messages**: Inline warnings in boost tab when columns not found
- **Table Interactions**: Sortable columns, real-time search, filter dropdowns

---

## Summary

This document contains 23 functional requirements covering:
- File loading and parsing (FR1-FR2)
- Knock detection and analysis (FR3-FR8)
- Progress tracking and data validation (FR9-FR10)
- UI responsiveness and desktop integration (FR11-FR12)
- Tab navigation and management (FR13-FR14, FR20-FR22)
- Boost control analysis (FR15-FR19)
- Tab-specific UI elements (FR23)

Each requirement includes detailed acceptance criteria and implementation details to ensure proper implementation and testing. The document also includes framework decisions, architecture overview, and technical specifications for developers.

