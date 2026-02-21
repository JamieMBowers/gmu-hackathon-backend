/**
 * Application Insights telemetry helpers for custom metrics and tracking
 */

export interface ClaimAnalysisMetrics {
  claimCount: number;
  heuristicFallbackCount: number;
  analysisTimeMs: number;
  openaiMaxTokens: number;
}

/**
 * Track custom metrics for claims analysis
 * These will appear in Application Insights custom metrics
 */
export function trackClaimsAnalysis(
  context: { log?: (...args: any[]) => void },
  metrics: ClaimAnalysisMetrics
): void {
  try {
    // In Azure Functions, metrics are automatically captured through context logging
    const metricData = JSON.stringify({
      type: 'metric',
      name: 'ClaimsAnalysis',
      metrics: {
        claimCount: metrics.claimCount,
        heuristicFallbackCount: metrics.heuristicFallbackCount,
        analysisTimeMs: metrics.analysisTimeMs,
        openaiMaxTokens: metrics.openaiMaxTokens,
        heuristicFallbackRate:
          metrics.claimCount > 0
            ? metrics.heuristicFallbackCount / metrics.claimCount
            : 0,
      },
    });
    
    if (context.log) {
      context.log(metricData);
    }
  } catch (error) {
    // Silently fail telemetry to avoid breaking the app
  }
}

/**
 * Track OpenAI API call metrics
 */
export function trackOpenAICall(
  context: { log?: (...args: any[]) => void },
  metrics: {
    durationMs: number;
    maxTokens: number;
    success: boolean;
    errorType?: string;
  }
): void {
  try {
    const metricData = JSON.stringify({
      type: 'metric',
      name: 'OpenAICall',
      metrics: {
        durationMs: metrics.durationMs,
        maxTokens: metrics.maxTokens,
        success: metrics.success,
        errorType: metrics.errorType,
      },
    });
    
    if (context.log) {
      context.log(metricData);
    }
  } catch (error) {
    // Silently fail telemetry
  }
}
