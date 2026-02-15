import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { parsePastedSources } from "../services/parse";
import { ParseResult } from "../models/types";

interface SourcesParseRequestBody {
  pasted: string;
}

function isSourcesParseRequestBody(value: unknown): value is SourcesParseRequestBody {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<SourcesParseRequestBody>;
  return typeof candidate.pasted === "string" && candidate.pasted.trim().length > 0;
}

export async function sourcesParse(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      context.warn("sources-parse: invalid JSON body");
      const badRequestResponse: HttpResponseInit = {
        status: 400,
        jsonBody: {
          error: "Invalid JSON body.",
        },
      };

      return badRequestResponse;
    }

    if (!isSourcesParseRequestBody(body)) {
      context.warn("sources-parse: invalid request shape (missing or empty 'pasted')");
      const badRequestResponse: HttpResponseInit = {
        status: 400,
        jsonBody: {
          error: "Request body must be an object with a non-empty 'pasted' string property.",
        },
      };

      return badRequestResponse;
    }

    const pastedLength = body.pasted.length;
    const result: ParseResult = parsePastedSources(body.pasted);

    context.log(
      `sources-parse: parsed=${result.stats.parsed}/${result.stats.lines}, with_doi=${result.stats.with_doi}, with_url=${result.stats.with_url}, pasted_length=${pastedLength}`
    );

    const successResponse: HttpResponseInit = {
      status: 200,
      jsonBody: result,
    };

    return successResponse;
  } catch (err) {
    context.error("sources-parse: unexpected error while parsing sources", err as Error);
    const errorResponse: HttpResponseInit = {
      status: 500,
      jsonBody: {
        error: "An unexpected error occurred while parsing sources.",
      },
    };

    return errorResponse;
  }
}

app.http("sources-parse", {
  route: "sources/parse",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: sourcesParse,
});
