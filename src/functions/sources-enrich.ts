import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { EnrichResult, EnrichedSource, ParsedSource } from "../models/types";
import { enrichSourceWithOpenAlex } from "../services/openalex";

interface SourcesEnrichRequestBody {
  sources: ParsedSource[];
}

function isParsedSource(value: unknown): value is ParsedSource {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<ParsedSource>;

  if (typeof candidate.id !== "string" || candidate.id.trim().length === 0) {
    return false;
  }

  if (typeof candidate.raw !== "string" || candidate.raw.trim().length === 0) {
    return false;
  }

  if (typeof candidate.title_guess !== "string" || candidate.title_guess.trim().length === 0) {
    return false;
  }

  if (
    candidate.doi !== undefined &&
    (typeof candidate.doi !== "string" || candidate.doi.trim().length === 0)
  ) {
    return false;
  }

  if (
    candidate.url !== undefined &&
    (typeof candidate.url !== "string" || candidate.url.trim().length === 0)
  ) {
    return false;
  }

  return true;
}

function isSourcesEnrichRequestBody(value: unknown): value is SourcesEnrichRequestBody {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<SourcesEnrichRequestBody>;

  if (!Array.isArray(candidate.sources)) {
    return false;
  }

  if (candidate.sources.length === 0) {
    return false;
  }

  return candidate.sources.every(isParsedSource);
}

export async function sourcesEnrich(
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

    if (!isSourcesEnrichRequestBody(body)) {
      const badRequestResponse: HttpResponseInit = {
        status: 400,
        jsonBody: {
          error:
            "Request body must be an object with a non-empty 'sources' array of ParsedSource items.",
        },
      };

      return badRequestResponse;
    }

    const inputSources = body.sources;

    const enriched: EnrichedSource[] = [];
    let withAbstract = 0;
    let needsReviewCount = 0;

    for (const source of inputSources) {
      const enrichedSource = await enrichSourceWithOpenAlex(source);
      enriched.push(enrichedSource);

      if (enrichedSource.abstract) {
        withAbstract += 1;
      }

      if (enrichedSource.needs_review) {
        needsReviewCount += 1;
      }
    }

    const result: EnrichResult = {
      enriched,
      stats: {
        input_count: inputSources.length,
        enriched_count: enriched.length,
        with_abstract: withAbstract,
        needs_review_count: needsReviewCount,
      },
    };

    const successResponse: HttpResponseInit = {
      status: 200,
      jsonBody: result,
    };

    return successResponse;
  } catch {
    const errorResponse: HttpResponseInit = {
      status: 500,
      jsonBody: {
        error: "An unexpected error occurred while enriching sources.",
      },
    };

    return errorResponse;
  }
}

app.http("sources-enrich", {
  route: "sources/enrich",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: sourcesEnrich,
});
