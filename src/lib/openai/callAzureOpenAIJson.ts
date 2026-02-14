import { InvocationContext } from "@azure/functions";
import { z } from "zod";

// Local declaration to avoid depending on Node typings.
declare const process: {
  env: {
    AZURE_OPENAI_ENDPOINT?: string;
    AZURE_OPENAI_API_KEY?: string;
    AZURE_OPENAI_DEPLOYMENT?: string;
    AZURE_OPENAI_API_VERSION?: string;
    [key: string]: string | undefined;
  };
};

const DEFAULT_API_VERSION = "2024-02-15-preview";

export async function callAzureOpenAIJson<T>(
  prompt: string,
  schema: z.ZodType<T>,
  ctx: InvocationContext
): Promise<T> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || DEFAULT_API_VERSION;

  if (!endpoint || !apiKey || !deployment) {
    ctx.warn("Azure OpenAI environment variables are not fully configured.");
    throw new Error("Missing Azure OpenAI configuration.");
  }

  const url = `${endpoint.replace(/\/$/, "")}/openai/deployments/${encodeURIComponent(
    deployment
  )}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;

  const body = {
    messages: [
      { role: "system", content: "You output JSON only." },
      { role: "user", content: prompt },
    ],
    temperature: 0.1,
    max_tokens: 900,
    response_format: { type: "json_object" },
  } as const;

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
