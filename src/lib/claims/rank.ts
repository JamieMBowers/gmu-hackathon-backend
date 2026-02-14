import { ClaimStance } from "../../types/claims";

const STANCE_PRIORITY: Record<ClaimStance, number> = {
  supports: 3,
  mixed: 2,
  opposes: 1,
  irrelevant: 0,
};

export function pickTopK<T extends { relevance: number; stance: ClaimStance; source_id: string }>(
  items: readonly T[],
  k: number
): T[] {
  if (k <= 0 || items.length === 0) {
    return [];
  }

  const limit = Math.min(k, items.length);

  // Pair items with original index to keep sort deterministic even for full ties.
  const indexed = items.map((item, index) => ({ item, index }));

  indexed.sort((a, b) => {
    if (a.item.relevance !== b.item.relevance) {
      // Higher relevance first
      return b.item.relevance - a.item.relevance;
    }

    const stanceDiff = STANCE_PRIORITY[b.item.stance] - STANCE_PRIORITY[a.item.stance];
    if (stanceDiff !== 0) {
      // Higher stance priority first
      return stanceDiff;
    }

    if (a.item.source_id < b.item.source_id) return -1;
    if (a.item.source_id > b.item.source_id) return 1;

    // Fall back to original order for complete ties
    return a.index - b.index;
  });

  return indexed.slice(0, limit).map((x) => x.item);
}
