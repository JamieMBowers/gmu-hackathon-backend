/**
 * Initialize Azure Monitor OpenTelemetry for Application Insights
 * This must be called before any other imports
 */

import { useAzureMonitor } from "@azure/monitor-opentelemetry";

// Enable Azure Monitor for automatic telemetry collection
useAzureMonitor();

console.log("Azure Monitor OpenTelemetry initialized");
