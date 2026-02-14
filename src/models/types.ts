export interface ParsedSource {
  id: string;
  raw: string;
  title_guess: string;
  doi?: string;
  url?: string;
}

export interface ParseStats {
  lines: number;
  parsed: number;
  with_doi: number;
  with_url: number;
}

export interface ParseResult {
  sources: ParsedSource[];
  stats: ParseStats;
}

export interface EnrichedSource {
  id: string;
  openalex_id?: string;
  doi?: string;
  url?: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  cited_by_count: number;
  abstract: string | null;
  needs_review: boolean;
  apa: string;
  apa_incomplete: boolean;
  apa_missing: string[];
}

export interface EnrichStats {
  input_count: number;
  enriched_count: number;
  with_abstract: number;
  needs_review_count: number;
}

export interface EnrichResult {
  enriched: EnrichedSource[];
  stats: EnrichStats;
}

export interface ApaFormatResult {
  apa: string;
  incomplete: boolean;
  missing: string[];
}

export type VenueBadge = "Journal/Conference" | "Preprint" | "Unknown";

export interface SearchResult {
  openalex_id: string;
  title: string;
  year?: number;
  venue?: string;
  venue_badge: VenueBadge;
  doi?: string;
  url?: string;
  authors: string[];
  cited_by_count: number;
  abstract: string | null;
  needs_review: boolean;
}
