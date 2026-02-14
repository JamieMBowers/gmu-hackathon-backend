import { ParsedSource } from "../models/types";

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function stripLeadingBullets(text: string): string {
  let result = text.trim();
  result = result.replace(/^[-*•\u2022]\s+/, "");
  result = result.replace(/^\(?\d+[).]\s+/, "");
  result = result.replace(/^\[\d+\]\s+/, "");
  return result.trim();
}

export function titleTokens(title: string): string[] {
  const cleaned = title.toLowerCase().replace(/[^a-z0-9\s]+/g, " ");
  return cleaned
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function tokenOverlapRatio(a: string, b: string): number {
  const aTokens = titleTokens(a);
  const bTokens = titleTokens(b);

  if (aTokens.length === 0 || bTokens.length === 0) {
    return 0;
  }

  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);

  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) {
      intersection += 1;
    }
  }

  const maxSize = Math.max(aSet.size, bSet.size);
  return maxSize === 0 ? 0 : intersection / maxSize;
}

export function toLastFirst(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) {
    return "";
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return parts[0];
  }

  const last = parts[parts.length - 1];
  const firstMiddle = parts.slice(0, -1).join(" ");
  return `${last}, ${firstMiddle}`;
}

export function toApaNameFromLastFirst(lastFirst: string): string {
  const trimmed = lastFirst.trim();
  if (!trimmed) {
    return "";
  }

  const [lastPart, rest] = trimmed.split(",", 2);
  if (!rest) {
    return lastPart.trim();
  }

  const givenNames = rest
    .trim()
    .split(/\s+/)
    .filter((n) => n.length > 0);

  const initials = givenNames
    .map((name) => `${name[0]!.toUpperCase()}.`)
    .join(" ");

  return `${lastPart.trim()}, ${initials}`;
}

export function withStableIds(sources: Omit<ParsedSource, "id">[]): ParsedSource[] {
  return sources.map((source, index) => ({
    ...source,
    id: `source-${index + 1}`,
  }));
}
