// Centralized configuration for ECU Log Analysis Tool
// All magic numbers and configurable values should be defined here

(function() {
  'use strict';

  const Config = {
    // ============================================
    // Data Processing
    // ============================================
    dataProcessing: {
      // CSV parsing chunk size (rows per chunk for progress updates)
      chunkSize: 500,
      // Minimum valid time value
      minValidTime: 0,
      // Progress update throttle (ms)
      progressUpdateInterval: 100
    },

    // ============================================
    // Knock Detection
    // ============================================
    knock: {
      // Severity thresholds (degrees, negative values)
      severityThresholds: {
        critical: -6.0,  // < -6° (approaching max -8.0°)
        severe: -4.0,    // < -4°
        moderate: -2.0   // < -2°
      },
      // Group events within this time window (seconds)
      groupingTimeWindow: 0.1,
      // Minimum RPM for valid knock detection
      rpmMin: 1000,
      // Expected recovery rate (°/update)
      retardDecay: 0.2,
      // Maximum knock retard allowed
      retardMax: -8.0,
      // Low load threshold (g/rev)
      sensitivityLowLoad: 0.81,
      // Threshold for detecting knock events (slightly negative)
      knockThreshold: -0.0001,
      // Recovery window duration (seconds)
      recoveryWindow: 2.0,
      // Max data points to check for recovery
      recoveryMaxPoints: 100,
      // Points threshold for persistent knock
      persistentKnockThreshold: 20
    },

    // ============================================
    // Boost Control
    // ============================================
    boost: {
      // Overshoot threshold (kPa above target)
      overshootThreshold: 5.0,
      // Undershoot threshold (kPa below target)
      undershootThreshold: -5.0,
      // Tolerance for "in target" range (±kPa)
      targetTolerance: 10.0,
      // Group events within this time window (seconds)
      groupingTimeWindow: 0.5,
      // Multi-tier error thresholds from boost_error_index
      errorThresholds: [20.3, 11.7, 5.3, 2.1],
      // Minimum boost pressure to analyze (kPa) - below is vacuum/atmospheric
      minBoostPressure: 100,
      // Minimum overshoot duration (seconds)
      minOvershootDuration: 0.25,
      // Minimum undershoot duration (seconds)
      minUndershootDuration: 0.5,
      // Minimum throttle for overshoot events (%)
      minThrottleForOvershoot: 30,
      // Maximum throttle for undershoot filtering (%)
      maxThrottleForUndershoot: 50,
      // Wastegate saturation threshold (%)
      wastegateSaturationThreshold: 0.95,
      // Wastegate minimum threshold (%)
      wastegateMinThreshold: 5.0
    },

    // ============================================
    // AFR Analysis
    // ============================================
    afr: {
      // Group events within this time window (seconds)
      groupingTimeWindow: 0.5,
      // Minimum event duration (seconds)
      minEventDuration: 0.25,
      // Lambda error thresholds
      leanThreshold: 0.02,  // λ above target = lean
      richThreshold: -0.02, // λ below target = rich
      // Valid lambda range
      minValidLambda: 0.6,
      maxValidLambda: 1.5,
      // AFR conversion factor (1 lambda = 14.7 AFR)
      conversionFactor: 14.7
    },

    // ============================================
    // Fuel Trim
    // ============================================
    fuelTrim: {
      // Short term fuel trim thresholds (%)
      shortTerm: {
        positiveThreshold: 10.0,
        negativeThreshold: -10.0,
        groupingTimeWindow: 0.5
      },
      // Long term fuel trim thresholds (%)
      longTerm: {
        positiveThreshold: 5.0,
        negativeThreshold: -5.0,
        groupingTimeWindow: 1.0
      }
    },

    // ============================================
    // IAM Analysis
    // ============================================
    iam: {
      // IAM thresholds (multiplier values 0-1)
      thresholds: {
        critical: 0.5,   // < 50%
        severe: 0.75,    // < 75%
        moderate: 0.9,   // < 90%
        warning: 1.0     // < 100%
      },
      // Minimum IAM drop to create event
      minDropThreshold: 0.01,
      // Time window for grouping (seconds)
      groupingTimeWindow: 1.0
    },

    // ============================================
    // Load Limit
    // ============================================
    loadLimit: {
      // Warning threshold (% of limit)
      warningThreshold: 0.95,
      // Critical threshold (% of limit)
      criticalThreshold: 1.0,
      // Default load limit fallback values
      defaultLimits: [1.28, 1.35, 1.42, 1.50, 1.58, 1.67, 1.75, 1.83, 1.92, 2.00, 2.08, 2.17, 2.25, 2.33, 2.42, 2.54],
      defaultRpmIndex: [800, 1200, 1600, 2000, 2400, 2800, 3200, 3600, 4000, 4400, 4800, 5200, 5600, 6000, 6400, 6800]
    },

    // ============================================
    // Temperature Analysis
    // ============================================
    temperature: {
      // Coolant temperature thresholds (°C)
      coolant: {
        warningTemp: 100,
        criticalTemp: 110,
        groupingTimeWindow: 1.0
      },
      // Intake air temperature thresholds (°C)
      intake: {
        lowThreshold: 0,
        highThreshold: 50,
        criticalThreshold: 60,
        groupingTimeWindow: 0.5
      }
    },

    // ============================================
    // Autotune
    // ============================================
    autotune: {
      // Default minimum samples per cell
      defaultMinSamples: 25,
      // Default change limit (%)
      defaultChangeLimit: 5,
      // Default min hit weight (cell centering)
      defaultMinHitWeight: 0.25,
      // Valid lambda ratio range for open loop
      validLambdaRatioMin: 0.85,
      validLambdaRatioMax: 1.15,
      // Valid PE lambda target range
      validPELambdaMin: 0.7,
      validPELambdaMax: 1.0,
      // Minimum RPM for open loop analysis
      minOpenLoopRPM: 2000,
      // Minimum MAF voltage to include
      minMafVoltage: 0.5,
      // Default max MAF voltage for axis building
      defaultMaxMafVoltage: 5.0
    },

    // ============================================
    // Chart Configuration
    // ============================================
    charts: {
      // Default animation mode for updates
      updateAnimationMode: 'none',
      // Point radius for line charts
      defaultPointRadius: 0,
      // Point radius on hover
      defaultHoverRadius: 4,
      // Line width
      defaultBorderWidth: 2,
      // Event marker point radius
      eventPointRadius: 5,
      // Event marker hover radius
      eventHoverRadius: 7,
      // Severe event marker radius
      severeEventRadius: 6,
      // Severe event hover radius
      severeEventHoverRadius: 8
    },

    // ============================================
    // UI Configuration
    // ============================================
    ui: {
      // Minimum splash screen display time (ms)
      minSplashTime: 1500,
      // Loading overlay minimum display time (ms)
      loadingOverlayMinTime: 300,
      // Progress bar fade out duration (ms)
      progressFadeOutDuration: 500,
      // Progress bar display after completion (ms)
      progressCompletionDelay: 1000,
      // Tab switch loading state delay (ms)
      tabSwitchDelay: 0,
      // Smoothing window size (data points)
      defaultSmoothingWindowSize: 5
    },

    // ============================================
    // Data Smoothing
    // ============================================
    smoothing: {
      // Default enabled state
      defaultEnabled: true,
      // Default window size
      defaultWindowSize: 5
    },

    // ============================================
    // Column Names (for flexible matching)
    // ============================================
    columns: {
      // Time column
      time: 'Time (s)',
      // Engine parameters
      rpm: 'Engine Speed (rpm)',
      throttle: 'Throttle Position (%)',
      load: 'Load (MAF) (g/rev)',
      // Air/Fuel
      afr: 'Air/Fuel Sensor #1 (λ)',
      afrTarget: 'Power Mode - Fuel Ratio Target (λ)',
      // Fuel trims
      stft: 'Fuel Trim - Short Term (%)',
      ltft: 'Fuel Trim - Long Term (%)',
      // Boost
      boostTarget: 'Boost Target (kPa)',
      map: 'Manifold Absolute Pressure (kPa)',
      mapFiltered: 'Manifold Air Pressure - Filtered (kPa)',
      wastegateDC: 'Wastegate Duty Cycle (%)',
      // Knock
      knockRetard: 'Knock Retard (°)',
      // IAM
      iam: 'Ignition Advance Multiplier',
      // Temperatures
      coolantTemp: 'Coolant Temperature (°C)',
      intakeTemp: 'Intake Air Temperature (°C)',
      // MAF
      mafVoltage: 'Mass Air Flow Voltage (V)',
      mafFlow: 'Airflow (MAF) (g/s)'
    },

    // ============================================
    // Column Aliases (for flexible detection)
    // ============================================
    columnAliases: {
      knockRetard: [
        'Knock Retard (°)',
        'Knock Retard (deg)',
        'Knock Retard',
        'Knock Retard (degrees)',
        'KnockRetard',
        'knock retard (°)',
        'knock retard'
      ],
      boostTarget: [
        'Boost Target (kPa)',
        'Boost Target',
        'BoostTarget',
        'Boost Target kPa',
        'Target Boost',
        'Target Boost (kPa)',
        'Boost Setpoint',
        'Desired Boost'
      ],
      actualBoost: [
        'Manifold Absolute Pressure (kPa)',
        'Manifold Air Pressure - Filtered (kPa)',
        'Manifold Air Pressure - Filtered',
        'Manifold Absolute Pressure',
        'Manifold Pressure',
        'MAP',
        'MAP (kPa)',
        'Boost Pressure',
        'Actual Boost'
      ],
      wastegate: [
        'Wastegate Duty Cycle (%)',
        'Wastegate Duty Cycle',
        'Wastegate DC',
        'WG Duty',
        'WG Duty (%)',
        'Wastegate',
        'Wastegate Duty'
      ]
    },

    // ============================================
    // Color Scheme
    // ============================================
    colors: {
      // Chart colors
      primary: 'rgb(0, 123, 255)',
      success: 'rgb(40, 167, 69)',
      warning: 'rgb(255, 193, 7)',
      danger: 'rgb(220, 53, 69)',
      info: 'rgb(23, 162, 184)',
      // Background colors (with alpha)
      primaryBg: 'rgba(0, 123, 255, 0.1)',
      successBg: 'rgba(40, 167, 69, 0.1)',
      warningBg: 'rgba(255, 193, 7, 0.1)',
      dangerBg: 'rgba(220, 53, 69, 0.1)',
      infoBg: 'rgba(23, 162, 184, 0.1)',
      // Event markers
      eventMarker: 'rgba(220, 53, 69, 0.6)',
      severeMarker: 'rgba(220, 53, 69, 0.8)',
      mildMarker: 'rgba(255, 193, 7, 0.8)',
      // Zoom selection
      zoomSelection: 'rgba(0, 0, 0, 0.1)',
      zoomBorder: 'rgba(0, 0, 0, 0.3)'
    }
  };

  // Freeze to prevent accidental modifications
  Object.freeze(Config);
  Object.keys(Config).forEach(key => {
    if (typeof Config[key] === 'object') {
      Object.freeze(Config[key]);
      Object.keys(Config[key]).forEach(subKey => {
        if (typeof Config[key][subKey] === 'object') {
          Object.freeze(Config[key][subKey]);
        }
      });
    }
  });

  // Export to window
  window.Config = Config;
})();

