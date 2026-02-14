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
      const badRequestResponse: HttpResponseInit = {
        status: 400,
        jsonBody: {
          error: "Invalid JSON body.",
        },
      };

      return badRequestResponse;
    }

    if (!isSourcesParseRequestBody(body)) {
      const badRequestResponse: HttpResponseInit = {
        status: 400,
        jsonBody: {
          error: "Request body must be an object with a non-empty 'pasted' string property.",
        },
      };

      return badRequestResponse;
    }

    const result: ParseResult = parsePastedSources(body.pasted);

    const successResponse: HttpResponseInit = {
      status: 200,
      jsonBody: result,
    };

    return successResponse;
  } catch {
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
