import { EnrichedSource, ParsedSource, SearchResult, VenueBadge } from "../models/types";
import { normalizeWhitespace, stripLeadingBullets, tokenOverlapRatio, toLastFirst } from "./normalize";
import { formatApa } from "./apa";

declare const process: {
  env: Record<string, string | undefined>;
};

const OPENALEX_BASE_URL = (process.env.OPENALEX_BASE_URL ?? "https://api.openalex.org").replace(/\/+$/, "");
const OPENALEX_MAILTO = process.env.OPENALEX_MAILTO;
const REQUEST_TIMEOUT_MS = 10_000;

interface OpenAlexAuthorship {
  author?: {
    display_name?: string | null;
  } | null;
}

interface OpenAlexHostVenue {
  display_name?: string | null;
}

interface OpenAlexPrimaryLocationSource {
  display_name?: string | null;
}

interface OpenAlexPrimaryLocation {
  landing_page_url?: string | null;
  source?: OpenAlexPrimaryLocationSource | null;
}

export interface OpenAlexWork {
  id: string;
  doi?: string | null;
  display_name?: string | null;
  title?: string | null;
  publication_year?: number | null;
  host_venue?: OpenAlexHostVenue | null;
  primary_location?: OpenAlexPrimaryLocation | null;
  cited_by_count?: number | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  authorships?: OpenAlexAuthorship[] | null;
}

interface OpenAlexSearchResponse {
  results?: OpenAlexWork[];
}

interface WorkLookupResult {
  work: OpenAlexWork | null;
  rateLimited: boolean;
  lowConfidence: boolean;
}

interface SearchWorksOptions {
  query: string;
  limit: number;
  fromYear?: number;
  toYear?: number;
  excludePreprints: boolean;
}

interface SearchWorksResult {
  results: SearchResult[];
  rateLimited: boolean;
}

interface SuggestedTitleCandidate {
  title: string;
  year?: number;
}

interface SuggestedCandidates {
  dois: string[];
  titles: SuggestedTitleCandidate[];
}

interface SuggestedWorksResult {
  works: SearchResult[];
  resolved: number;
  unresolved: number;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function mapOpenAlexWorkToSearchResult(work: OpenAlexWork): SearchResult {
  const venueName =
    work.host_venue?.display_name ?? work.primary_location?.source?.display_name ?? null;
  const venue_badge = classifyVenueBadge(venueName);

  const year = work.publication_year ?? undefined;
  const doi = work.doi ?? undefined;

  const doiUrl =
    doi !== undefined
      ? doi.startsWith("http")
        ? doi
        : `https://doi.org/${doi}`
      : undefined;

  const urlCandidate = doiUrl ?? work.primary_location?.landing_page_url ?? undefined;

  const rawAuthorNames = (work.authorships ?? [])
    .map((a) => a.author?.display_name ?? "")
    .map((name) => normalizeWhitespace(name))
    .filter((name) => name.length > 0);

  const authors = rawAuthorNames.map((name) => toLastFirst(name));

  const abstract = reconstructAbstract(work.abstract_inverted_index);

  const title = (work.display_name ?? work.title ?? "").trim();

  const needsReview =
    title.length === 0 || abstract === null || venue_badge === "Unknown";

  const venue = venueName ?? undefined;

  return {
    openalex_id: work.id,
    title,
    year,
    venue,
    venue_badge,
    doi,
    url: urlCandidate,
    authors,
    cited_by_count: work.cited_by_count ?? 0,
    abstract,
    needs_review: needsReview,
  };
}

function reconstructAbstract(index: Record<string, number[]> | null | undefined): string | null {
  if (!index) {
    return null;
  }

  const positions: string[] = [];

  for (const [word, indices] of Object.entries(index)) {
    for (const idx of indices) {
      positions[idx] = word;
    }
  }

  const text = positions.join(" ").trim();
  return text || null;
}

function classifyVenueBadge(name: string | null | undefined): VenueBadge {
  if (!name) {
    return "Unknown";
  }

  const lower = name.toLowerCase();
  if (/(arxiv|biorxiv|medrxiv|ssrn)/.test(lower)) {
    return "Preprint";
  }

  return "Journal/Conference";
}

function buildFallbackEnriched(source: ParsedSource, rateLimited: boolean): EnrichedSource {
  const title = source.title_guess;
  const doi = source.doi;
  const url = doi
    ? doi.startsWith("http")
      ? doi
      : `https://doi.org/${doi}`
    : source.url;

  const base: EnrichedSource = {
    id: source.id,
    openalex_id: undefined,
    doi,
    url,
    title,
    authors: [],
    year: undefined,
    venue: undefined,
    cited_by_count: 0,
    abstract: null,
    needs_review: true,
    apa: "",
    apa_incomplete: true,
    apa_missing: [],
  };

  const apa = formatApa(base);

  return {
    ...base,
    apa: apa.apa,
    apa_incomplete: apa.incomplete,
    apa_missing: apa.missing,
  };
}

function buildEnrichedFromWork(
  source: ParsedSource,
  work: OpenAlexWork,
  needsReview: boolean
): EnrichedSource {
  const titleFromWork = work.display_name ?? work.title ?? source.title_guess;

  const doi = work.doi ?? source.doi;

  const urlFromDoi = doi
    ? doi.startsWith("http")
      ? doi
      : `https://doi.org/${doi}`
    : undefined;

  const url =
    urlFromDoi ??
    work.primary_location?.landing_page_url ??
    source.url;

  const rawAuthorNames = (work.authorships ?? [])
    .map((a) => a.author?.display_name ?? "")
    .map((name) => normalizeWhitespace(name))
    .filter((name) => name.length > 0);

  const authors = rawAuthorNames.map((name) => toLastFirst(name));

  const abstract = reconstructAbstract(work.abstract_inverted_index);

  const venue =
    work.host_venue?.display_name ??
    work.primary_location?.source?.display_name ??
    undefined;

  const base: EnrichedSource = {
    id: source.id,
    openalex_id: work.id,
    doi: doi ?? undefined,
    url,
    title: titleFromWork,
    authors,
    year: work.publication_year ?? undefined,
    venue,
    cited_by_count: work.cited_by_count ?? 0,
    abstract,
    needs_review: needsReview,
    apa: "",
    apa_incomplete: true,
    apa_missing: [],
  };

  const apa = formatApa(base);

  return {
    ...base,
    apa: apa.apa,
    apa_incomplete: apa.incomplete,
    apa_missing: apa.missing,
  };
}

export async function lookupWorkByDoi(doi: string): Promise<WorkLookupResult> {
  const encodedDoi = encodeURIComponent(doi.trim());
  const url = new URL(`/works/doi:${encodedDoi}`, OPENALEX_BASE_URL);
  if (OPENALEX_MAILTO && OPENALEX_MAILTO.trim().length > 0) {
    url.searchParams.set("mailto", OPENALEX_MAILTO);
  }

  try {
    const response = await fetchWithTimeout(url.toString());

    if (response.status === 429) {
      return { work: null, rateLimited: true, lowConfidence: false };
    }

    if (!response.ok) {
      return { work: null, rateLimited: false, lowConfidence: false };
    }

    const work = (await response.json()) as OpenAlexWork;
    return { work, rateLimited: false, lowConfidence: false };
  } catch {
    return { work: null, rateLimited: false, lowConfidence: false };
  }
}

export async function lookupWorkByTitle(title: string): Promise<WorkLookupResult> {
  const cleanedTitle = stripLeadingBullets(normalizeWhitespace(title));
  const params = new URLSearchParams({ search: cleanedTitle, "per-page": "5" });
  const url = new URL("/works", OPENALEX_BASE_URL);
  url.search = params.toString();
  if (OPENALEX_MAILTO && OPENALEX_MAILTO.trim().length > 0) {
    url.searchParams.set("mailto", OPENALEX_MAILTO);
  }

  try {
    const response = await fetchWithTimeout(url.toString());

    if (response.status === 429) {
      return { work: null, rateLimited: true, lowConfidence: false };
    }

    if (!response.ok) {
      return { work: null, rateLimited: false, lowConfidence: false };
    }

    const data = (await response.json()) as OpenAlexSearchResponse;
    const first = data.results && data.results.length > 0 ? data.results[0] : null;

    if (!first) {
      return { work: null, rateLimited: false, lowConfidence: false };
    }

    const returnedTitle = first.display_name ?? first.title ?? "";
    const overlap = tokenOverlapRatio(cleanedTitle, returnedTitle);
    const lowConfidence = overlap < 0.6;

    return { work: first, rateLimited: false, lowConfidence };
  } catch {
    return { work: null, rateLimited: false, lowConfidence: false };
  }
}

export async function enrichSourceWithOpenAlex(source: ParsedSource): Promise<EnrichedSource> {
  const hasDoi = typeof source.doi === "string" && source.doi.trim().length > 0;

  if (!source.title_guess || source.title_guess.trim().length === 0) {
    // Ensure we always have a title_guess so downstream logic works.
    source = { ...source, title_guess: stripLeadingBullets(normalizeWhitespace(source.raw)) };
  }

  if (hasDoi) {
    const { work, rateLimited } = await lookupWorkByDoi(source.doi!);

    if (work) {
      return buildEnrichedFromWork(source, work, false);
    }

    return buildFallbackEnriched(source, rateLimited);
  }

  const { work, rateLimited, lowConfidence } = await lookupWorkByTitle(source.title_guess);

  if (work) {
    return buildEnrichedFromWork(source, work, rateLimited || lowConfidence);
  }

  return buildFallbackEnriched(source, rateLimited);
}

export async function searchOpenAlexWorks(options: SearchWorksOptions): Promise<SearchWorksResult> {
  const { query, limit, fromYear, toYear, excludePreprints } = options;

  const normalizedQuery = normalizeWhitespace(query);
  const perPage = Math.min(Math.max(limit, 1), 25);

  const params = new URLSearchParams({
    search: normalizedQuery,
    "per-page": perPage.toString(),
  });

  const url = new URL("/works", OPENALEX_BASE_URL);
  url.search = params.toString();

  if (OPENALEX_MAILTO && OPENALEX_MAILTO.trim().length > 0) {
    url.searchParams.set("mailto", OPENALEX_MAILTO);
  }

  try {
    const response = await fetchWithTimeout(url.toString());

    if (response.status === 429) {
      return { results: [], rateLimited: true };
    }

    if (!response.ok) {
      return { results: [], rateLimited: false };
    }

    const data = (await response.json()) as OpenAlexSearchResponse;
    const works = data.results ?? [];

    const mapped: SearchResult[] = works.map((work) => mapOpenAlexWorkToSearchResult(work));

    const filteredByYear = mapped.filter((item) => {
      if (fromYear !== undefined && item.year !== undefined && item.year < fromYear) {
        return false;
      }

      if (toYear !== undefined && item.year !== undefined && item.year > toYear) {
        return false;
      }

      return true;
    });

    const filteredByPreprint = excludePreprints
      ? filteredByYear.filter((item) => item.venue_badge !== "Preprint")
      : filteredByYear;

    return { results: filteredByPreprint, rateLimited: false };
  } catch {
    return { results: [], rateLimited: false };
  }
}

export async function lookupWorkByOpenAlexId(id: string): Promise<WorkLookupResult> {
  const trimmed = id.trim();
  if (!trimmed) {
    return { work: null, rateLimited: false, lowConfidence: false };
  }

  let url: URL;

  if (/^https?:\/\//i.test(trimmed)) {
    url = new URL(trimmed);
  } else {
    url = new URL(`/works/${encodeURIComponent(trimmed)}`, OPENALEX_BASE_URL);
  }

  if (OPENALEX_MAILTO && OPENALEX_MAILTO.trim().length > 0) {
    url.searchParams.set("mailto", OPENALEX_MAILTO);
  }

  try {
    const response = await fetchWithTimeout(url.toString());

    if (response.status === 429) {
      return { work: null, rateLimited: true, lowConfidence: false };
    }

    if (!response.ok) {
      return { work: null, rateLimited: false, lowConfidence: false };
    }

    const work = (await response.json()) as OpenAlexWork;
    return { work, rateLimited: false, lowConfidence: false };
  } catch {
    return { work: null, rateLimited: false, lowConfidence: false };
  }
}

export async function resolveSuggestedWorks(
  candidates: SuggestedCandidates
): Promise<SuggestedWorksResult> {
  const doiSet = new Set<string>();
  const titleSet = new Set<string>();

  const normalizedDois = candidates.dois
    .map((d) => d.trim())
    .filter((d) => d.length > 0)
    .filter((d) => {
      const lower = d.toLowerCase();
      if (doiSet.has(lower)) return false;
      doiSet.add(lower);
      return true;
    });

  const normalizedTitles = candidates.titles.filter((t) => {
    const key = t.title.trim().toLowerCase();
    if (!key) return false;
    if (titleSet.has(key)) return false;
    titleSet.add(key);
    return true;
  });

  const totalCandidates = normalizedDois.length + normalizedTitles.length;

  const seenOpenAlexIds = new Set<string>();
  const seenDoiValues = new Set<string>();
  const works: SearchResult[] = [];

  for (const doi of normalizedDois) {
    const { work } = await lookupWorkByDoi(doi);
    if (!work) {
      continue;
    }

    const mapped = mapOpenAlexWorkToSearchResult(work);
    const doiKey = (mapped.doi ?? "").toLowerCase();

    if (seenOpenAlexIds.has(mapped.openalex_id) || (doiKey && seenDoiValues.has(doiKey))) {
      continue;
    }

    seenOpenAlexIds.add(mapped.openalex_id);
    if (doiKey) {
      seenDoiValues.add(doiKey);
    }
    works.push(mapped);
  }

  for (const t of normalizedTitles) {
    const { work, lowConfidence } = await lookupWorkByTitle(t.title);
    if (!work || lowConfidence) {
      continue;
    }

    const mapped = mapOpenAlexWorkToSearchResult(work);
    const doiKey = (mapped.doi ?? "").toLowerCase();

    if (seenOpenAlexIds.has(mapped.openalex_id) || (doiKey && seenDoiValues.has(doiKey))) {
      continue;
    }

    seenOpenAlexIds.add(mapped.openalex_id);
    if (doiKey) {
      seenDoiValues.add(doiKey);
    }
    works.push(mapped);
  }

  const uniqueWorks = works;

  const resolved = uniqueWorks.length;
  const unresolved = Math.max(totalCandidates - resolved, 0);

  return {
    works: uniqueWorks,
    resolved,
    unresolved,
  };
}

export function mapWorkToSearchResult(work: OpenAlexWork): SearchResult {
  return mapOpenAlexWorkToSearchResult(work);
}
