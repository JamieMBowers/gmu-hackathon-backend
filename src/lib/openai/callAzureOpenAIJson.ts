import { InvocationContext } from "@azure/functions";
import { z } from "zod";

// Local declaration to avoid depending on Node typings.
declare const process: {
  env: {
    AZURE_OPENAI_ENDPOINT?: string;
    AZURE_OPENAI_API_KEY?: string;
    AZURE_OPENAI_DEPLOYMENT?: string;
    AZURE_OPENAI_API_VERSION?: string;
    AZURE_OPENAI_TEMPERATURE?: string;
    AZURE_OPENAI_TOP_P?: string;
    AZURE_OPENAI_SEED?: string;
    AZURE_OPENAI_MAX_TOKENS?: string;
    [key: string]: string | undefined;
  };
};

const DEFAULT_API_VERSION = "2024-02-15-preview";
const DEFAULT_TEMPERATURE = 0;
const DEFAULT_TOP_P = 1;
const DEFAULT_MAX_TOKENS = 450;

export async function callAzureOpenAIJson<T>(
  prompt: string,
  schema: z.ZodType<T>,
  ctx: InvocationContext
): Promise<T> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || DEFAULT_API_VERSION;
  const temperature = readNumberEnv(process.env.AZURE_OPENAI_TEMPERATURE, DEFAULT_TEMPERATURE);
  const topP = readNumberEnv(process.env.AZURE_OPENAI_TOP_P, DEFAULT_TOP_P);
  const seed = readIntegerEnv(process.env.AZURE_OPENAI_SEED);
  const maxTokens = readIntegerEnv(process.env.AZURE_OPENAI_MAX_TOKENS, DEFAULT_MAX_TOKENS);

  if (!endpoint || !apiKey || !deployment) {
    ctx.warn("Azure OpenAI environment variables are not fully configured.");
    throw new Error("Missing Azure OpenAI configuration.");
  }

  const url = `${endpoint.replace(/\/$/, "")}/openai/deployments/${encodeURIComponent(
    deployment
  )}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;

  const body: Record<string, unknown> = {
    messages: [
      { role: "system", content: "You output JSON only." },
      { role: "user", content: prompt },
    ],
    temperature,
    top_p: topP,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
  };

  if (seed !== undefined) {
    body.seed = seed;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    ctx.warn(
      `Azure OpenAI request failed: ${res.status} ${res.statusText} - ${text?.slice(
        0,
        500
      )}`
    );
    throw new Error(`Azure OpenAI request failed with status ${res.status}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{
      message?: { content?: string | null };
    }>;
  };

  const content = data.choices?.[0]?.message?.content ?? "";

  const jsonText = extractFirstJsonObject(content);
  if (!jsonText) {
    ctx.warn(`Azure OpenAI response did not contain a JSON object: ${content.slice(0, 500)}`);
    throw new Error("Azure OpenAI response did not contain JSON.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    ctx.warn(`Failed to parse JSON from Azure OpenAI: ${(err as Error).message}`);
    throw new Error("Invalid JSON from Azure OpenAI.");
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    ctx.warn(
      `Azure OpenAI JSON validation failed: ${JSON.stringify(
        result.error.flatten(),
        null,
        2
      )}`
    );
    throw new Error("Azure OpenAI JSON did not match expected schema.");
  }

  return result.data;
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\") {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1).trim();
      }
    }
  }

  return null;
}

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
