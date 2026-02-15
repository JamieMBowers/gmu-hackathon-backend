import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { z } from "zod";
import { resolveViaOpenAlex } from "../lib/suggestions/resolve";

const requestSchema = z.object({
  items: z.array(z.string().min(1)).min(1),
});

export async function suggestionsResolve(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return {
        status: 400,
        jsonBody: { error: "Invalid JSON body." },
      };
    }

    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return {
        status: 400,
        jsonBody: {
          error: "Request body failed validation.",
        },
      };
    }

    const { items } = parsed.data;

    context.log(`suggestions-resolve: items=${items.length}`);

    try {
      const { works, unresolved } = await resolveViaOpenAlex(items);

      return {
        status: 200,
        jsonBody: {
          works,
          unresolved,
        },
      };
    } catch (err) {
      context.warn?.(
        `suggestions-resolve: resolveViaOpenAlex failed, returning empty works. Error: ${String(
          err
        )}`
      );

      return {
        status: 200,
        jsonBody: {
          works: [],
          unresolved: items,
        },
      };
    }
  } catch (err) {
    context.error("suggestions-resolve: unexpected error", err as Error);
    return {
      status: 500,
      jsonBody: {
        error: "An unexpected error occurred while resolving suggestions.",
      },
    };
  }
}

app.http("suggestions-resolve", {
  route: "suggestions/resolve",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: suggestionsResolve,
});
