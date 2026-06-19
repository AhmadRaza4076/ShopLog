/**
 * Score how well a customer name matches a search query.
 * Lower is better. Returns null when there is no match.
 *
 * Word-boundary matches rank above arbitrary substrings so "Ali"
 * prefers "Ali Raza" over "Wali Khan" (where "ali" appears inside "Wali").
 */
export function customerNameMatchScore(name: string, query: string): number | null {
  const n = name.trim().toLowerCase();
  const q = query.trim().toLowerCase();
  if (!q) return null;
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  const words = n.split(/\s+/);
  if (words.some((w) => w.startsWith(q))) return 2;
  if (n.includes(q)) return 3;
  return null;
}

export function compareCustomerNameMatch(
  aName: string,
  bName: string,
  query: string
): number {
  const aScore = customerNameMatchScore(aName, query);
  const bScore = customerNameMatchScore(bName, query);
  if (aScore == null && bScore == null) return 0;
  if (aScore == null) return 1;
  if (bScore == null) return -1;
  if (aScore !== bScore) return aScore - bScore;
  return aName.length - bName.length;
}
