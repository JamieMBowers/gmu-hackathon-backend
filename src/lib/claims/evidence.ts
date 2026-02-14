export function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

interface VerifyEvidenceInput {
  abstract: string;
  evidence: string[];
}

export function verifyEvidenceSentences(input: VerifyEvidenceInput): string[] {
  const normalizedAbstract = normalizeSpaces(input.abstract);

  if (!normalizedAbstract) {
    return [];
  }

  const results: string[] = [];

  for (const raw of input.evidence) {
    if (results.length >= 2) {
      break;
    }

    let candidate = normalizeSpaces(raw);

    // Strip leading/trailing quotes (common ASCII and Unicode quote chars)
    candidate = candidate.replace(/^["'“”‘’]+/, "");
    candidate = candidate.replace(/["'“”‘’]+$/, "");
    candidate = normalizeSpaces(candidate);

    if (!candidate) {
      continue;
    }

    if (normalizedAbstract.includes(candidate)) {
      results.push(candidate);
    }
  }

  return results;
}
