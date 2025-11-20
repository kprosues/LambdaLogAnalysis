# ECU Log Analysis Tool - Functional Requirements

This document outlines all functional requirements for the ECU Log Analysis Tool with their acceptance criteria.

---

## **FR1: File Loading and Import**
**Description:** The application must allow users to load ECU log CSV files through a file dialog or drag-and-drop interface.

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

**Acceptance Criteria:**
- Analyzer finds boost-related columns with flexible matching:
  - Boost Target: "Boost Target (kPa)", "Boost Target", "BoostTarget"
  - Actual Boost: "Manifold Absolute Pressure (kPa)", "Manifold Air Pressure - Filtered (kPa)", "Manifold Pressure", "MAP"
  - Wastegate: "Wastegate Duty Cycle (%)", "Wastegate DC", "WG Duty"
- Calculates boost error for each data point (actual - target)
- Calculates boost error percentage relative to target
- Identifies overshoot events (error > 5.0 kPa above target)
- Identifies undershoot events (error < -5.0 kPa below target)
- Determines "in target" range (error within ±2.0 kPa tolerance)
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

## Summary

This document contains 23 functional requirements covering:
- File loading and parsing (FR1-FR2)
- Knock detection and analysis (FR3-FR8)
- Progress tracking and data validation (FR9-FR10)
- UI responsiveness and desktop integration (FR11-FR12)
- Tab navigation and management (FR13-FR14, FR20-FR22)
- Boost control analysis (FR15-FR19)
- Tab-specific UI elements (FR23)

Each requirement includes detailed acceptance criteria to ensure proper implementation and testing.

