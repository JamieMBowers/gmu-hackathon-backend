import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

declare const process: {
  env: Record<string, string | undefined>;
};

export async function configDebug(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const baseUrl = process.env.OPENALEX_BASE_URL;
  const mailto = process.env.OPENALEX_MAILTO;

  const responseBody = {
    openalex_base_url_present: typeof baseUrl === "string" && baseUrl.trim().length > 0,
    openalex_mailto_present: typeof mailto === "string" && mailto.trim().length > 0,
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
