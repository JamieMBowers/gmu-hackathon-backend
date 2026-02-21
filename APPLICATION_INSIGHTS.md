# Application Insights Monitoring Guide

## Overview
Your Function App is now connected to Application Insights with live metrics and custom telemetry.

## Access Application Insights

### Live Metrics Stream (Real-time)
1. Go to Azure Portal: https://portal.azure.com
2. Navigate to your Application Insights resource: `gmu-hack-functions2`
3. Click **Live metrics** in the left menu
4. You'll see:
   - Incoming requests per second
   - Outgoing requests (to OpenAI)
   - CPU & Memory usage
   - Request duration
   - Failure rate

### Custom Metrics Dashboard
The app now tracks these custom metrics:

#### ClaimsAnalysis Metrics
- `claimCount`: Number of claims analyzed per request
- `heuristicFallbackCount`: How many claims fell back to heuristic (should be 0)
- `analysisTimeMs`: Total time to analyze all claims
- `openaiMaxTokens`: Max tokens setting used
- `heuristicFallbackRate`: Percentage of claims that fell back (should be 0%)

#### OpenAICall Metrics
- `durationMs`: How long each OpenAI API call took
- `maxTokens`: Token limit for the call
- `success`: Whether the call succeeded (true/false)
- `errorType`: Type of error if failed (config_missing, http_429, no_json, json_parse, schema_validation)

## Viewing Custom Metrics

### Method 1: Logs Query
1. In Application Insights, click **Logs**
2. Run this query to see claims analysis performance:
```kusto
traces
| where message contains "ClaimsAnalysis"
| extend metricData = parse_json(message)
| project 
    timestamp,
    claimCount = metricData.metrics.claimCount,
    fallbackCount = metricData.metrics.heuristicFallbackCount,
    fallbackRate = metricData.metrics.heuristicFallbackRate,
    analysisTimeMs = metricData.metrics.analysisTimeMs,
    maxTokens = metricData.metrics.openaiMaxTokens
| order by timestamp desc
```

3. Query for OpenAI call performance:
```kusto
traces
| where message contains "OpenAICall"
| extend metricData = parse_json(message)
| project 
    timestamp,
    durationMs = metricData.metrics.durationMs,
    maxTokens = metricData.metrics.maxTokens,
    success = metricData.metrics.success,
    errorType = metricData.metrics.errorType
| order by timestamp desc
```

### Method 2: Failures
1. Click **Failures** to see all errors
2. Filter by operation name: `claims-analyze`
3. View exception details and stack traces

### Method 3: Performance
1. Click **Performance**
2. Select operation: `claims-analyze`
3. See percentiles (p50, p95, p99) for response times
4. Identify slow requests

## Alerts You Should Set Up

### Alert 1: High Heuristic Fallback Rate
- **Metric**: Custom metric query for fallback rate > 0.1 (10%)
- **Action**: Email notification
- **Why**: If OpenAI responses are truncated or failing

### Alert 2: Slow Performance
- **Metric**: claims-analyze response time > 30s
- **Action**: Email notification
- **Why**: Users waiting too long

### Alert 3: High Error Rate
- **Metric**: Failed requests > 5% over 5 minutes
- **Action**: Email notification
- **Why**: Service degradation

## Monitoring After Deployment

After the GitHub Actions deployment completes (~2-3 minutes):

1. **Verify max_tokens fix worked:**
   - Run an analysis with 3-5 claims
   - Check console for `heuristic_fallback_count: 0`
   - All stances should vary (not all "supports")

2. **Check Live Metrics:**
   - Go to Live Metrics in Azure Portal
   - You should see telemetry flowing in real-time
   - Watch for incoming requests when you click "Analyze"

3. **Review custom metrics:**
   - Wait 5-10 minutes for metrics to aggregate
   - Run the Kusto queries above
   - Verify `heuristicFallbackRate` is 0 or very low

## Dashboard Layout (Recommended)

Create a custom dashboard with these tiles:
1. Live metrics stream
2. Request rate (last 30 min)
3. Average response time (last 30 min)
4. Heuristic fallback rate trend (last 24h)
5. OpenAI call success rate (last 24h)
6. Top 5 slowest requests

## Troubleshooting

### If metrics aren't showing:
1. Check `APPLICATIONINSIGHTS_CONNECTION_STRING` is set in Function App settings
2. Verify `host.json` has `enableLiveMetrics: true`
3. Restart Function App in Azure Portal

### If fallback rate is still high:
1. Check OpenAI call error types in logs
2. Verify `AZURE_OPENAI_MAX_TOKENS` app setting is 900
3. Check OpenAI quota/rate limits

### If performance is slow:
1. Check `CLAIMS_ANALYZE_CONCURRENCY` setting (default: 3)
2. Review OpenAI call durations in metrics
3. Consider increasing concurrency if OpenAI calls are fast

## Connection String (Reference)

Your Application Insights connection string is already configured:
```
InstrumentationKey=2c089ee9-a02e-433a-91b1-d500fbe13de4
IngestionEndpoint=https://eastus-8.in.applicationinsights.azure.com/
LiveEndpoint=https://eastus.livediagnostics.monitor.azure.com/
ApplicationId=2d316097-8cc1-4533-8cf4-48ee3701e556
```

This is stored in your Function App's application settings as `APPLICATIONINSIGHTS_CONNECTION_STRING`.
