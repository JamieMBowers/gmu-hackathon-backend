import { ParseResult, ParsedSource, ParseStats } from "../models/types";
import { stripLeadingBullets } from "./normalize";

const DOI_URL_REGEX = /doi\.org\/(10\.\d{4,9}\/\S+)/i;
const DOI_PLAIN_REGEX = /(10\.\d{4,9}\/\S+)/i;
const URL_REGEX = /(https?:\/\/\S+)/i;

function extractDoi(text: string): string | undefined {
  const fromUrlMatch = text.match(DOI_URL_REGEX);
  if (fromUrlMatch && fromUrlMatch[1]) {
    return fromUrlMatch[1].trim().replace(/[)\].,;]+$/, "");
  }

  const plainMatch = text.match(DOI_PLAIN_REGEX);
  if (plainMatch && plainMatch[1]) {
    return plainMatch[1].trim().replace(/[)\].,;]+$/, "");
  }

  return undefined;
}

function extractUrl(text: string): string | undefined {
  const match = text.match(URL_REGEX);
  if (!match || !match[1]) {
    return undefined;
  }

  const url = match[1].trim().replace(/[)\].,;]+$/, "");
  return url;
}

function guessTitle(text: string): string {
  const stripped = stripLeadingBullets(text);
  const result = stripped.trim();
  return result || text.trim();
}

export function parsePastedSources(pasted: string): ParseResult {
  const lines = pasted.split(/\r?\n/);

  const sources: ParsedSource[] = [];
  let nonEmptyLineCount = 0;
  let withDoiCount = 0;
  let withUrlCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    nonEmptyLineCount += 1;

    const doi = extractDoi(trimmed);
    const url = extractUrl(trimmed);
    const titleGuess = guessTitle(trimmed);

    const source: ParsedSource = {
      id: `source-${sources.length + 1}`,
      raw: line,
      title_guess: titleGuess,
      doi,
      url,
    };

    if (doi) {
      withDoiCount += 1;
    }

    if (url) {
      withUrlCount += 1;
    }

    sources.push(source);
  }

  const stats: ParseStats = {
    lines: nonEmptyLineCount,
    parsed: sources.length,
    with_doi: withDoiCount,
    with_url: withUrlCount,
  };

  return {
    sources,
    stats,
  };
}
