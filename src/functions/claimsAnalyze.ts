import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { z } from "zod";
import { ClaimAnalyzeResponse, EnrichedSource } from "../types/claims";
import { verifyEvidenceSentences, normalizeSpaces } from "../lib/claims/evidence";
import { pickTopK } from "../lib/claims/rank";
import { callAzureOpenAIJson } from "../lib/openai/callAzureOpenAIJson";

// Local declaration to avoid depending on Node typings.
declare const process: {
  env: {
    AZURE_OPENAI_ENDPOINT?: string;
    AZURE_OPENAI_DEPLOYMENT?: string;
    AZURE_OPENAI_API_VERSION?: string;
    AZURE_OPENAI_TEMPERATURE?: string;
    AZURE_OPENAI_TOP_P?: string;
    AZURE_OPENAI_SEED?: string;
    [key: string]: string | undefined;
  };
};

const stanceSchema = z.enum(["supports", "opposes", "mixed", "irrelevant"]);

const enrichedSourceSchema = z.object({
  id: z.string().min(1),
  openalex_id: z.string().optional(),
  doi: z.string().optional(),
  url: z.string().optional(),
  title: z.string().min(1),
  authors: z.array(z.string()),
  year: z.number().int().optional(),
  venue: z.string().optional(),
  cited_by_count: z.number().int().nonnegative(),
  abstract: z.string().nullable(),
  needs_review: z.boolean(),
  apa: z.string(),
  apa_incomplete: z.boolean(),
  apa_missing: z.array(z.string()),
});

const requestSchema = z.object({
  thesis: z.string().min(1).max(4000),
  claims: z.array(z.string().min(1)).min(1).max(6),
  sources: z.array(enrichedSourceSchema).min(1).max(50),
});

const modelEvidenceItemSchema = z.object({
  source_id: z.string().min(1),
  stance: stanceSchema,
  relevance: z.number(),
  evidence_sentences: z.array(z.string().min(1)).min(1),
});

const modelResponseSchema = z.object({
  claim: z.string(),
  evidence: z.array(modelEvidenceItemSchema).max(20),
});

type Stance = z.infer<typeof stanceSchema>;

function buildHeuristicEvidenceForClaim(
  claim: string,
  sources: (EnrichedSource & { normalizedAbstract: string })[]
): Array<{
  source_id: string;
  apa: string;
  relevance: number;
  stance: Stance;
  evidence_sentences: string[];
}> {
  const hits: Array<{
    source_id: string;
    apa: string;
    relevance: number;
    stance: Stance;
    evidence_sentences: string[];
  }> = [];

  const claimLower = claim.toLowerCase();

  for (const s of sources) {
    const abstract = s.normalizedAbstract;
    if (!abstract) {
      continue;
    }

    const sentences = abstract
      .split(/[.!?]\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    if (sentences.length === 0) {
      continue;
    }

    const matched = sentences.filter((sentence) =>
      sentence.toLowerCase().includes(claimLower)
    );

    const evidenceSentences = (matched.length > 0 ? matched : sentences).slice(0, 2);

    hits.push({
      source_id: s.id,
      apa: s.apa,
      relevance: matched.length > 0 ? 0.9 : 0.4,
      stance: "supports",
      evidence_sentences: evidenceSentences,
    });
  }

  return hits;
}

export async function claimsAnalyze(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      context.warn("claims-analyze: invalid JSON body");
      const badRequestResponse: HttpResponseInit = {
        status: 400,
        jsonBody: { error: "Invalid JSON body." },
      };

      return badRequestResponse;
    }

    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      context.warn("claims-analyze: request body failed validation");
      const badRequestResponse: HttpResponseInit = {
        status: 400,
        jsonBody: {
          error: "Request body failed validation.",
        },
      };

      return badRequestResponse;
    }

    const { thesis, claims, sources } = parsed.data;

    context.log(
      `claims-analyze: thesis_len=${thesis.length}, claims=${claims.length}, sources=${sources.length}`
    );
    context.log(`claims-analyze: openai_config=${JSON.stringify(buildOpenAiLogConfig())}`);

    const sourcesWithAbstract: (EnrichedSource & { normalizedAbstract: string })[] = sources
      .filter((s) => s.abstract && s.abstract.trim().length > 0)
      .map((s) => ({ ...s, normalizedAbstract: normalizeSpaces(s.abstract as string) }));

    const sourcesConsidered = sourcesWithAbstract.length;

    if (sourcesConsidered === 0) {
      context.warn("claims-analyze: 0 sources with usable abstracts; returning empty results");
      const response: ClaimAnalyzeResponse & { warning: string } = {
        thesis,
        results: [],
        meta: {
          model: process.env.AZURE_OPENAI_DEPLOYMENT ?? "",
          per_claim_calls: 0,
          sources_considered: 0,
          debug: {
            openai_config: buildOpenAiLogConfig(),
            heuristic_fallback_count: 0,
          },
        },
        warning: "No sources with usable abstracts were available.",
      };

      const successResponse: HttpResponseInit = {
        status: 200,
        jsonBody: response,
      };

      return successResponse;
    }

    const sourceById = new Map<string, EnrichedSource>();
    const abstractById = new Map<string, string>();

    for (const s of sourcesWithAbstract) {
      sourceById.set(s.id, s);
      abstractById.set(s.id, s.normalizedAbstract);
    }

    const results: ClaimAnalyzeResponse["results"] = [];
    let heuristicFallbackCount = 0;

    for (const claim of claims) {
      let hits: {
        source_id: string;
        apa: string;
        relevance: number;
        stance: Stance;
        evidence_sentences: string[];
      }[] = [];

      try {
        const prompt = buildPrompt(thesis, claim, sourcesWithAbstract);

        const modelOutput = await callAzureOpenAIJson(
          prompt,
          modelResponseSchema,
          context
        );

        for (const item of modelOutput.evidence) {
          const source = sourceById.get(item.source_id);
          const abstractText = abstractById.get(item.source_id);

          if (!source || !abstractText) {
            continue;
          }

          const verifiedSentences = verifyEvidenceSentences({
            abstract: abstractText,
            evidence: item.evidence_sentences,
          });

          if (verifiedSentences.length === 0) {
            continue;
          }

          hits.push({
            source_id: source.id,
            apa: source.apa,
            relevance: item.relevance,
            stance: item.stance,
            evidence_sentences: verifiedSentences,
          });
        }
      } catch (err) {
        context.warn(
          `claims-analyze: falling back to heuristic analysis for claim due to error: ${(err as Error).message}`
        );
        heuristicFallbackCount += 1;
        hits = buildHeuristicEvidenceForClaim(claim, sourcesWithAbstract);
      }

      const supporting = hits.filter((h) => h.stance === "supports" || h.stance === "mixed");
      const counter = hits.filter((h) => h.stance === "opposes");

      const top_supporting = pickTopK(supporting, 3);
      const top_counter = pickTopK(counter, 1);

      results.push({
        claim,
        top_supporting,
        top_counter,
      });
    }

    const response: ClaimAnalyzeResponse = {
      thesis,
      results,
      meta: {
        model: process.env.AZURE_OPENAI_DEPLOYMENT ?? "",
        per_claim_calls: claims.length,
        sources_considered: sourcesConsidered,
        debug: {
          openai_config: buildOpenAiLogConfig(),
          heuristic_fallback_count: heuristicFallbackCount,
        },
      },
    };

    context.log(
      `claims-analyze: completed for claims=${claims.length}, sources_considered=${sourcesConsidered}`
    );

    const successResponse: HttpResponseInit = {
      status: 200,
      jsonBody: response,
    };

    return successResponse;
  } catch (err) {
    context.error("claims-analyze: unexpected error while analyzing claims", err as Error);
    const errorResponse: HttpResponseInit = {
      status: 500,
      jsonBody: {
        error: "An unexpected error occurred while analyzing claims.",
      },
    };

    return errorResponse;
  }
}

function buildPrompt(
  thesis: string,
  claim: string,
  sources: (EnrichedSource & { normalizedAbstract: string })[]
): string {
  const lines: string[] = [];

  lines.push("You are analyzing how well research sources relate to a claim.");
  lines.push("You output JSON only.");
  lines.push("");
  lines.push(`Thesis: ${thesis}`);
  lines.push(`Claim: ${claim}`);
  lines.push("");
  lines.push("Sources:");

  for (const s of sources) {
    lines.push(`- id: ${s.id}`);
    lines.push(`  apa: ${s.apa}`);
    lines.push(`  abstract: ${s.normalizedAbstract}`);
    lines.push("");
  }

  lines.push("");
  lines.push("Respond with a JSON object with shape:");
  lines.push(
    '{"claim": string, "evidence": [{"source_id": string, "stance": "supports" | "opposes" | "mixed" | "irrelevant", "relevance": number, "evidence_sentences": string[]}]}'
  );
  lines.push("Where:");
  lines.push("- stance describes how the source relates to the claim.");
  lines.push("- relevance is between 0 and 1 (higher is more relevant).");
  lines.push(
    "- evidence_sentences are short exact substrings copied from the abstract that support your stance."
  );

  return lines.join("\n");
}

function buildOpenAiLogConfig(): {
  endpoint_host: string;
  deployment: string;
  api_version: string;
  temperature: string;
  top_p: string;
  seed: string;
} {
  return {
    endpoint_host: getEndpointHost(process.env.AZURE_OPENAI_ENDPOINT),
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT ?? "",
    api_version: process.env.AZURE_OPENAI_API_VERSION ?? "",
    temperature: process.env.AZURE_OPENAI_TEMPERATURE ?? "",
    top_p: process.env.AZURE_OPENAI_TOP_P ?? "",
    seed: process.env.AZURE_OPENAI_SEED ?? "",
  };
}

function getEndpointHost(endpoint: string | undefined): string {
  if (!endpoint) return "";
  try {
    return new URL(endpoint).host;
  } catch {
    return "";
  }
}

app.http("claims-analyze", {
  route: "claims/analyze",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: claimsAnalyze,
});
