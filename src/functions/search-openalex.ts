import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { SearchResult } from "../models/types";
import { searchOpenAlexWorks } from "../services/openalex";

interface SearchOpenAlexRequestBody {
  query: string;
  limit?: number;
  exclude_preprints?: boolean;
  from_year?: number;
  to_year?: number;
}

function isSearchOpenAlexRequestBody(value: unknown): value is SearchOpenAlexRequestBody {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<SearchOpenAlexRequestBody>;

  if (typeof candidate.query !== "string") {
    return false;
  }

  return true;
}

export async function searchOpenAlex(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      const badRequest: HttpResponseInit = {
        status: 400,
        jsonBody: {
          error: "Invalid JSON body.",
        },
      };

      return badRequest;
    }

    if (!isSearchOpenAlexRequestBody(body)) {
      const badRequest: HttpResponseInit = {
        status: 400,
        jsonBody: {
          error:
            "Request body must be an object with a 'query' string and optional numeric/boolean filters.",
        },
      };

      return badRequest;
    }

    const trimmedQuery = body.query.trim();
    if (trimmedQuery.length === 0) {
      const badRequest: HttpResponseInit = {
        status: 400,
        jsonBody: {
          error: "The 'query' field must be a non-empty string.",
        },
      };

      return badRequest;
    }

    let limit = 20;
    if (typeof body.limit === "number" && Number.isFinite(body.limit)) {
      limit = Math.max(1, Math.min(25, Math.floor(body.limit)));
    }

    const excludePreprints =
      typeof body.exclude_preprints === "boolean" ? body.exclude_preprints : true;

    const fromYear =
      typeof body.from_year === "number" && Number.isInteger(body.from_year)
        ? body.from_year
        : undefined;

    const toYear =
      typeof body.to_year === "number" && Number.isInteger(body.to_year)
        ? body.to_year
        : undefined;

    const { results, rateLimited } = await searchOpenAlexWorks({
      query: trimmedQuery,
      limit,
      fromYear,
      toYear,
      excludePreprints,
    });

    if (rateLimited) {
      const rateLimitedResponse: HttpResponseInit = {
        status: 502,
        jsonBody: {
          error: "OpenAlex rate limit, try again",
        },
      };

      return rateLimitedResponse;
    }

    const responseBody: {
      results: SearchResult[];
      stats: { query: string; returned: number };
    } = {
      results,
      stats: {
        query: trimmedQuery,
        returned: results.length,
      },
    };

    const okResponse: HttpResponseInit = {
      status: 200,
      jsonBody: responseBody,
    };

    return okResponse;
  } catch {
    const errorResponse: HttpResponseInit = {
      status: 500,
      jsonBody: {
        error: "An unexpected error occurred while searching OpenAlex.",
      },
    };

    return errorResponse;
  }
}

app.http("search-openalex", {
  route: "search/openalex",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: searchOpenAlex,
});
