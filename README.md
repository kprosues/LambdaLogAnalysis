# ProjectLambda Log Analysis Tool

> Desktop application for analyzing ProjectLambda Subaru WRX STi ECU log files and detecting anomalies

[![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)](https://github.com/yourusername/ECULogAnalysisTool)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-28.0.0-47848F.svg)](https://www.electronjs.org/)

A comprehensive desktop application built with Electron for analyzing ECU datalog CSV files from ProjectLambda ECU systems. The tool provides detailed analysis of knock events, boost control, air/fuel ratios, fuel trim, IAM, load limits, and temperature monitoring with interactive visualizations and automated tuning recommendations.

## ✨ Features

### 📊 Analysis Capabilities

- **Knock Detection**: Automatic detection and categorization of knock events (mild/severe) with time-based grouping
- **Boost Control Analysis**: Compare boost targets vs actual boost with overshoot/undershoot detection
- **Air/Fuel Ratio Analysis**: Analyze AFR/Lambda accuracy with lean/rich event detection
- **Fuel Trim Analysis**: Short-term and long-term fuel trim monitoring with abnormal condition detection
- **IAM Analysis**: Ignition Advance Multiplier monitoring
- **Load Limit Analysis**: Engine load limit monitoring
- **Temperature Monitoring**: Coolant and intake air temperature analysis
- **Log Score Overview**: Aggregated view of all detected issues with cross-tab navigation

### 🎯 Interactive Visualizations

- **Interactive Charts**: Multiple synchronized charts with zoom and pan capabilities
- **Synchronized Views**: Zoom/pan operations synchronized across all charts in a tab
- **Data Smoothing**: Global toggle for moving average smoothing (5-point window)
- **Gap Breaking**: Automatic line breaks at time gaps > 1 second
- **Click-to-Zoom**: Click table rows to zoom charts to specific events
- **Heatmap Tables**: Visual representation of boost target coverage (RPM × TPS bins)

### 🔧 Advanced Features

- **Autotune Engine**: Analyze datalog data against tune files to generate fuel base adjustments
  - Open-loop (Power Enrichment) and closed-loop fueling analysis
  - Suggested fuel base modifications with change limits
  - Export modified tune files with automatic timestamping
- **Tune File Integration**: Load and analyze `.tune` files alongside datalog data
- **Real-time Filtering**: Search and filter events by multiple criteria
- **Sortable Tables**: Sort events by any column with visual indicators
- **Progress Tracking**: Real-time progress updates during file processing

### 🎨 User Experience

- **Tabbed Interface**: Organized analysis views with independent state management
- **Drag & Drop**: Easy file loading via drag-and-drop or file dialog
- **Responsive Design**: Clean, modern UI that adapts to different screen sizes
- **Loading Overlays**: Visual feedback during processing operations
- **Error Handling**: Graceful error handling with user-friendly messages

## 🚀 Getting Started

### Prerequisites

- **Node.js** 16.x or higher
- **npm** 8.x or higher

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/ECULogAnalysisTool.git
cd ECULogAnalysisTool
```

2. Install dependencies:
```bash
npm install
```

3. Start the application:
```bash
npm start
```

### Building for Production

Build for your platform:

```bash
# Windows (portable executable)
npm run build:win

# macOS (dmg/zip)
npm run build:mac

# Linux (deb package)
npm run build:linux

# All platforms
npm run build
```

Built applications will be available in the `dist/` directory.

## 📖 Usage

### Loading a Log File

1. **File Dialog**: Click "Open Log File" button and select your CSV log file
2. **Drag & Drop**: Drag a CSV file onto the drop zone

The application will automatically:
- Parse the CSV file with progress tracking
- Run all analysis modules
- Display results in the active tab

### Analysis Tabs

Navigate between analysis views using the tab buttons:

- **Log Score**: Overview of all detected issues with filtering and navigation
- **Knock Analysis**: Detailed knock event detection and visualization
- **Boost Control**: Boost target vs actual analysis with heatmap
- **Fueling**: Combined AFR analysis and Autotune engine
- **Fuel Trim**: Combined short-term and long-term fuel trim analysis
- **IAM Analysis**: Ignition Advance Multiplier monitoring
- **Load Limit**: Engine load limit analysis
- **Coolant Temperature**: Coolant temperature monitoring
- **Intake Air Temperature**: Intake air temperature monitoring

### Chart Interactions

- **Zoom**: 
  - `Ctrl + Mouse Wheel` for wheel zoom
  - Click and drag to select zoom area
- **Pan**: `Shift + Mouse Drag` to pan across time
- **Reset**: Click "Reset Zoom" button to restore full view
- **Synchronization**: All charts in a tab zoom/pan together

### Autotune Feature

1. Load both a datalog CSV file and a tune file (`.tune` or JSON)
2. Navigate to the **Fueling** tab → **Autotune** section
3. Configure parameters:
   - **Min Samples**: Minimum data points per RPM/Load cell (default: 5)
   - **Change Limit (%)**: Maximum allowed change from original (default: 5%)
   - **Base Tune File** (optional): Alternative tune file to modify
   - **Output Tune File Name**: Name for exported tune file
4. Click "Run Analysis" to generate recommendations
5. Review open-loop and closed-loop summary tables
6. Download the modified tune file

## 🏗️ Project Structure

```
ECULogAnalysisTool/
├── main.js                    # Electron main process
├── preload.js                 # Context bridge for IPC
├── package.json               # Dependencies and build config
├── analysis/                  # Analysis engine modules
│   ├── dataProcessor.js      # CSV parsing and data processing
│   ├── knockDetector.js      # Knock event detection
│   ├── boostControlAnalyzer.js
│   ├── afrAnalyzer.js
│   ├── fuelTrimAnalyzer.js
│   ├── longTermFuelTrimAnalyzer.js
│   ├── iamAnalyzer.js
│   ├── loadLimitAnalyzer.js
│   ├── coolantTemperatureAnalyzer.js
│   ├── intakeAirTemperatureAnalyzer.js
│   └── tuneFileParser.js
└── renderer/                  # UI layer
    ├── index.html            # Main HTML structure
    ├── app.js                # Main application logic
    ├── styles.css            # Styling
    ├── tabManager.js         # Tab management system
    ├── autotuneEngine.js     # Autotune analysis engine
    └── tabs/                 # Tab modules
        ├── logScoreTab.js
        ├── knockAnalysisTab.js
        ├── boostControlTab.js
        ├── fuelingTab.js
        ├── combinedFuelTrimTab.js
        ├── autotuneTab.js
        ├── iamAnalysisTab.js
        ├── loadLimitTab.js
        ├── coolantTemperatureTab.js
        └── intakeAirTemperatureTab.js
```

## 🛠️ Technology Stack

- **Electron v28.0.0** - Desktop application framework
- **Chart.js v4.4.0** - Charting library for data visualization
- **chartjs-plugin-zoom v2.2.0** - Zoom and pan functionality
- **PapaParse v5.4.1** - CSV parsing with streaming support
- **electron-builder v26.0.12** - Application packaging and distribution

## 📋 Supported Data Columns

The application automatically detects various column name formats. Key columns include:

- **Time**: Time in seconds
- **Engine Speed (RPM)**: Engine RPM
- **Throttle Position**: Throttle percentage
- **Knock Retard**: Knock retard in degrees
- **Air/Fuel Ratio**: AFR/Lambda values
- **Load**: Engine load (g/rev)
- **Boost**: Manifold pressure (kPa)
- **Boost Target**: Target boost pressure (kPa)
- **Wastegate Duty Cycle**: Wastegate control percentage
- **Fuel Trim**: Short-term and long-term fuel trim percentages
- **Temperatures**: Coolant and intake air temperatures

See [FUNCTIONAL_REQUIREMENTS.md](FUNCTIONAL_REQUIREMENTS.md) for complete column detection details.

## 🎯 Key Analysis Features

### Knock Detection
- Threshold: `-0.0001°` (any negative value indicates knock)
- Severity classification: Severe (`< -4.0°`), Mild (`≥ -4.0°`)
- Event grouping: 100ms time window
- Captures associated parameters (RPM, throttle, load, AFR, boost, temperatures)

### Boost Control
- Overshoot threshold: `+5.0 kPa` above target
- Undershoot threshold: `-5.0 kPa` below target
- Target tolerance: `±10.0 kPa`
- Event grouping: 500ms time window
- Filters to actual boost `≥ 100 kPa`

### Air/Fuel Ratio
- Lean threshold: `+0.05 λ` above target
- Rich threshold: `-0.05 λ` below target
- Target tolerance: `±0.02 λ`
- Event grouping: 1000ms time window
- Filters low throttle events (`< 15%`)

### Fuel Trim
- **Short Term**: Abnormal threshold `±10%`
- **Long Term**: Abnormal threshold `±5%`
- Event grouping: 500ms time window
- Tracks positive (adding fuel) and negative (removing fuel) trim events

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📚 Documentation

- [Functional Requirements](FUNCTIONAL_REQUIREMENTS.md) - Complete specification of all features and requirements
- [ECU Tune File Model](resources/ECU_TUNE_FILE_MODEL.md) - Tune file structure documentation

## 🐛 Known Issues

- Large log files (>100MB) may take longer to process
- Some column name variations may not be automatically detected (check console for warnings)

## 🔮 Future Enhancements

- Additional analysis modules
- Export analysis reports (PDF/CSV)
- Customizable thresholds
- Data export functionality
- Multi-file comparison

## 📧 Support

For issues, questions, or feature requests, please open an issue on GitHub.

---

**Note**: This tool is designed specifically for ProjectLambda ECU systems. Compatibility with other ECU systems may vary.

