import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { z } from "zod";
import { searchOpenAlexWorks, resolveSuggestedWorks } from "../services/openalex";
import { callAzureOpenAIJson } from "../lib/openai/callAzureOpenAIJson";

const requestSchema = z.object({
  query: z.string().min(1),
  thesis: z.string().min(1).max(4000).optional(),
  claims: z.array(z.string().min(1)).max(6).optional(),
});

const suggestionSchema: z.ZodType<
  {
    dois: string[];
    titles: { title: string; year?: number }[];
  }
> = z.object({
  dois: z.array(z.string().min(1)).max(20),
  titles: z
    .array(
      z.object({
        title: z.string().min(1),
        year: z.number().int().optional(),
      })
    )
    .max(20),
});

type SuggestionSchemaType = z.infer<typeof suggestionSchema>;

async function getSuggestions(
  body: z.infer<typeof requestSchema>,
  ctx: InvocationContext
): Promise<SuggestionSchemaType | null> {
  try {
    const joinedClaims = (body.claims ?? []).join("; ");

    const userPromptParts: string[] = [];
    userPromptParts.push("You are helping suggest academic works for a literature search.");
    userPromptParts.push(
      "You will receive a user query, and optionally a thesis and a few claims."
    );
    userPromptParts.push(
      "Using ONLY this information and your broad knowledge, suggest 6-10 highly relevant, reputable scholarly works."
    );
    userPromptParts.push(
      "Prefer works with DOIs and that are likely to be indexed in OpenAlex."
    );
    userPromptParts.push(
      "Return a JSON object with two properties: 'dois' and 'titles'."
    );
    userPromptParts.push(
      "'dois' is an array of DOI strings (like '10.1038/nature12373')."
    );
    userPromptParts.push(
      "'titles' is an array of objects with 'title' (string) and optional 'year' (integer)."
    );
    userPromptParts.push("Do not include URLs, HTML, or natural language explanation.");
    userPromptParts.push("Output strictly valid JSON that matches the schema.");

    const content: string[] = [];
    content.push(`Query: ${body.query}`);
    if (body.thesis) {
      content.push(`Thesis: ${body.thesis}`);
    }
    if (joinedClaims.length > 0) {
      content.push(`Claims: ${joinedClaims}`);
    }

    const prompt = `${userPromptParts.join(" ")}\n\n${content.join("\n")}`;

    const result = await callAzureOpenAIJson<SuggestionSchemaType>(
      prompt,
      suggestionSchema,
      ctx
    );

    return result;
  } catch (err) {
    ctx.warn?.(`getSuggestions failed, continuing without suggestions: ${String(err)}`);
    return null;
  }
}

export async function searchCombined(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const body = await request.json().catch(() => null);
  if (!body) {
    return {
      status: 400,
      jsonBody: { error: "Invalid JSON body" },
    };
  }

  const parseResult = requestSchema.safeParse(body);
  if (!parseResult.success) {
    return {
      status: 400,
      jsonBody: { error: "Invalid request body", details: parseResult.error.flatten() },
    };
  }

  const validated = parseResult.data;
  const trimmedQuery = validated.query.trim();
  if (!trimmedQuery) {
    return {
      status: 400,
      jsonBody: { error: "Query must not be empty" },
    };
  }

  context.log(
    `search-combined: query="${trimmedQuery}", hasThesis=${!!validated.thesis}, claims=${
      validated.claims?.length ?? 0
    }`
  );

  const [primary, suggestions] = await Promise.all([
    searchOpenAlexWorks({
      query: trimmedQuery,
      limit: 20,
      excludePreprints: true,
    }),
    getSuggestions(validated, context),
  ]);

  const primaryResults = primary.results;

  let suggestedResults: typeof primaryResults = [];
  let suggestionMeta = {
    suggestion_count: 0,
    resolved: 0,
    unresolved: 0,
  };

  if (suggestions) {
    try {
      const resolved = await resolveSuggestedWorks({
        dois: suggestions.dois ?? [],
        titles: suggestions.titles ?? [],
      });

      const primaryIds = new Set(primaryResults.map((r) => r.openalex_id));
      const primaryDois = new Set(
        primaryResults
          .map((r) => (r.doi ?? "").toLowerCase())
          .filter((d) => d.length > 0)
      );

      suggestedResults = resolved.works.filter((w) => {
        const doiKey = (w.doi ?? "").toLowerCase();
        if (primaryIds.has(w.openalex_id)) return false;
        if (doiKey && primaryDois.has(doiKey)) return false;
        return true;
      });

      suggestionMeta = {
        suggestion_count: suggestedResults.length,
        resolved: resolved.resolved,
        unresolved: resolved.unresolved,
      };
    } catch (err) {
      context.warn?.(
        `resolveSuggestedWorks failed, returning primary results only: ${String(err)}`
      );
    }
  }

  context.log(
    `search-combined: returned=${primaryResults.length}, suggested=${suggestedResults.length}, rateLimited=${primary.rateLimited}`
  );

  return {
    status: 200,
    jsonBody: {
      results: primaryResults,
      suggested: suggestedResults,
      meta: {
        query: trimmedQuery,
        returned: primaryResults.length,
        rate_limited: primary.rateLimited,
        suggestions: suggestionMeta,
      },
    },
  };
}

app.http("search-combined", {
  route: "search/combined",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: searchCombined,
});
