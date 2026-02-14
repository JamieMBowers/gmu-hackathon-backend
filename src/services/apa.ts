import { ApaFormatResult, EnrichedSource } from "../models/types";
import { toApaNameFromLastFirst } from "./normalize";

function formatAuthors(authors: string[]): string {
  const maxAuthors = Math.min(authors.length, 6);
  const formatted: string[] = [];

  for (let i = 0; i < maxAuthors; i += 1) {
    formatted.push(toApaNameFromLastFirst(authors[i]!));
  }

  if (authors.length > 6) {
    formatted.push("et al.");
  }

  return formatted.join(", ");
}

export function formatApa(enriched: EnrichedSource): ApaFormatResult {
  const missing: string[] = [];

  if (!enriched.authors || enriched.authors.length === 0) {
    missing.push("authors");
  }

  if (!enriched.year) {
    missing.push("year");
  }

  if (!enriched.title || enriched.title.trim().length === 0) {
    missing.push("title");
  }

  const incomplete = missing.length > 0;

  const authorsPart =
    enriched.authors && enriched.authors.length > 0 ? formatAuthors(enriched.authors) : "";

  const yearPart = enriched.year ? `(${enriched.year}).` : "(n.d.).";
  const titlePart = enriched.title ? `${enriched.title}.` : "";
  const venuePart = enriched.venue ? `${enriched.venue}.` : "";

  let urlPart = "";
  if (enriched.doi) {
    urlPart = enriched.doi.startsWith("http")
      ? enriched.doi
      : `https://doi.org/${enriched.doi}`;
  } else if (enriched.url) {
    urlPart = enriched.url;
  }

  const segments: string[] = [];

  if (authorsPart) {
    segments.push(`${authorsPart}.`);
  }

  segments.push(yearPart);

  if (titlePart) {
    segments.push(titlePart);
  }

  if (venuePart) {
    segments.push(venuePart);
  }

  if (urlPart) {
    segments.push(urlPart);
  }

  const apa = segments.join(" ").trim();

  return {
    apa,
    incomplete,
    missing,
  };
}
