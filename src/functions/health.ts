import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

export async function health(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const responseBody = { ok: true };

  const response: HttpResponseInit = {
    status: 200,
    jsonBody: responseBody,
  };

  return response;
}

app.http("health", {
  route: "health",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: health,
});
