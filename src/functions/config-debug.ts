import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

declare const process: {
  env: Record<string, string | undefined>;
};

function readNumberEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readIntegerEnv(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getEndpointHost(endpoint: string | undefined): string {
  if (!endpoint) return "";
  try {
    return new URL(endpoint).host;
  } catch {
    return "";
  }
}

export async function configDebug(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const baseUrl = process.env.OPENALEX_BASE_URL;
  const mailto = process.env.OPENALEX_MAILTO;
  const openaiEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const openaiDeployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const openaiApiVersion = process.env.AZURE_OPENAI_API_VERSION;
  const openaiTemperature = process.env.AZURE_OPENAI_TEMPERATURE;
  const openaiTopP = process.env.AZURE_OPENAI_TOP_P;
  const openaiSeed = process.env.AZURE_OPENAI_SEED;

  const temperature = readNumberEnv(openaiTemperature, 0);
  const topP = readNumberEnv(openaiTopP, 1);
  const seed = readIntegerEnv(openaiSeed);

  const responseBody = {
    openalex_base_url_present: typeof baseUrl === "string" && baseUrl.trim().length > 0,
    openalex_mailto_present: typeof mailto === "string" && mailto.trim().length > 0,
    openai_endpoint_host: getEndpointHost(openaiEndpoint),
    openai_deployment: openaiDeployment ?? "",
    openai_api_version: openaiApiVersion ?? "",
    openai_temperature: temperature,
    openai_top_p: topP,
    openai_seed: seed ?? null,
  };

  const response: HttpResponseInit = {
    status: 200,
    jsonBody: responseBody,
  };

  return response;
}

app.http("config-debug", {
  route: "config/debug",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: configDebug,
});
