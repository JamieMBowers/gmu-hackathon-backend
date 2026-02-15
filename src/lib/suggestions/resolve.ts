import { SearchResult } from "../../models/types";
import { normalizeWhitespace, stripLeadingBullets } from "../../services/normalize";
import {
  lookupWorkByDoi,
  lookupWorkByTitle,
  lookupWorkByOpenAlexId,
  mapWorkToSearchResult,
} from "../../services/openalex";

// Basic DOI patterns, mirroring src/services/parse.ts
const DOI_URL_REGEX = /doi\.org\/(10\.\d{4,9}\/\S+)/i;
const DOI_PLAIN_REGEX = /(10\.\d{4,9}\/\S+)/i;

const OPENALEX_URL_REGEX = /openalex\.org\/(W[0-9A-Z]+)/i;
const OPENALEX_ID_REGEX = /^(W[0-9A-Z]+)$/i;

export function extractDoi(item: string): string | undefined {
  const text = item.trim();
  if (!text) return undefined;

  const urlMatch = text.match(DOI_URL_REGEX);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1].trim().replace(/[)\].,;]+$/, "");
  }

  const plainMatch = text.match(DOI_PLAIN_REGEX);
  if (plainMatch && plainMatch[1]) {
    return plainMatch[1].trim().replace(/[)\].,;]+$/, "");
  }

  return undefined;
}

export function extractOpenAlexId(item: string): string | undefined {
  const text = item.trim();
  if (!text) return undefined;

  const urlMatch = text.match(OPENALEX_URL_REGEX);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1].trim();
  }

  const idMatch = text.match(OPENALEX_ID_REGEX);
  if (idMatch && idMatch[1]) {
    return idMatch[1].trim();
  }

  return undefined;
}

export interface ResolveResult {
  works: SearchResult[];
  unresolved: string[];
}

export async function resolveViaOpenAlex(items: string[]): Promise<ResolveResult> {
  const worksByOpenAlexId = new Map<string, SearchResult>();
  const doisSeen = new Set<string>();
  const unresolved: string[] = [];

  for (const raw of items) {
    const original = raw ?? "";
    const trimmed = normalizeWhitespace(original);
    if (!trimmed) {
      continue;
    }

    let resolved = false;

    const doi = extractDoi(trimmed);
    if (doi) {
      const { work } = await lookupWorkByDoi(doi);
      if (work) {
        const mapped = mapWorkToSearchResult(work);
        const openalexId = mapped.openalex_id;
        const doiKey = (mapped.doi ?? "").toLowerCase();

        if (
          !worksByOpenAlexId.has(openalexId) &&
          (!doiKey || !doisSeen.has(doiKey))
        ) {
          worksByOpenAlexId.set(openalexId, mapped);
          if (doiKey) {
            doisSeen.add(doiKey);
          }
        }

        resolved = true;
      }
    }

    if (resolved) {
      continue;
    }

    const openAlexId = extractOpenAlexId(trimmed);
    if (openAlexId) {
      const { work } = await lookupWorkByOpenAlexId(openAlexId);
      if (work) {
        const mapped = mapWorkToSearchResult(work);
        const openalexId = mapped.openalex_id;
        const doiKey = (mapped.doi ?? "").toLowerCase();

        if (
          !worksByOpenAlexId.has(openalexId) &&
          (!doiKey || !doisSeen.has(doiKey))
        ) {
          worksByOpenAlexId.set(openalexId, mapped);
          if (doiKey) {
            doisSeen.add(doiKey);
          }
        }

        resolved = true;
      }
    }

    if (resolved) {
      continue;
    }

    const titleCandidate = stripLeadingBullets(trimmed);
    if (titleCandidate) {
      const { work, lowConfidence } = await lookupWorkByTitle(titleCandidate);
      if (work && !lowConfidence) {
        const mapped = mapWorkToSearchResult(work);
        const openalexId = mapped.openalex_id;
        const doiKey = (mapped.doi ?? "").toLowerCase();

        if (
          !worksByOpenAlexId.has(openalexId) &&
          (!doiKey || !doisSeen.has(doiKey))
        ) {
          worksByOpenAlexId.set(openalexId, mapped);
          if (doiKey) {
            doisSeen.add(doiKey);
          }
        }

        resolved = true;
      }
    }

    if (!resolved) {
      unresolved.push(original);
    }
  }

  return {
    works: Array.from(worksByOpenAlexId.values()),
    unresolved,
  };
}
