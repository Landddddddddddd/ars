// Shared literature types + title/author/year matching, used by every source
// client (Semantic Scholar, OpenAlex, …) so verification behaves identically
// regardless of which API returned a candidate.

export interface LitPaper {
  paperId: string;
  source: 'semanticscholar' | 'openalex';
  title: string;
  year: number | null;
  venue: string | null;
  url: string | null;
  doi: string | null;
  abstract: string | null;
  citationCount: number | null;
  authors: string[];
}

export type VerifyStatus = 'verified' | 'not_found' | 'lookup_failed';

export interface VerifyResult {
  verified: boolean;
  status: VerifyStatus;
  matchedTitle: string | null;
  paperId: string | null;
  url: string | null;
  note: string;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Drop a subtitle after the first colon so "X: a study of Y" matches "X". */
export function baseTitle(s: string): string {
  const cut = s.split(':')[0];
  return normalize(cut.length >= 4 ? cut : s);
}

/** Jaccard-ish token overlap in [0,1] between two strings. */
export function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter(Boolean));
  const tb = new Set(b.split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

function surnames(authors: string[]): Set<string> {
  const out = new Set<string>();
  for (const a of authors) {
    const parts = normalize(a).split(' ').filter(Boolean);
    if (parts.length) out.add(parts[parts.length - 1]);
  }
  return out;
}

export function surnameOverlap(a: string[], b: string[]): number {
  const sa = surnames(a);
  const sb = surnames(b);
  let n = 0;
  for (const s of sa) if (sb.has(s)) n++;
  return n;
}

/** Decide whether a candidate matches the queried citation. */
export function decideMatch(
  query: { title: string; authors?: string[]; year?: number | null },
  cand: LitPaper,
): { ok: boolean; note: string } {
  const simFull = tokenOverlap(normalize(query.title), normalize(cand.title));
  const simBase = tokenOverlap(baseTitle(query.title), baseTitle(cand.title));
  const authHit = query.authors?.length ? surnameOverlap(query.authors, cand.authors) : 0;
  const yearKnown = query.year != null && cand.year != null;
  const yearClose = yearKnown ? Math.abs((query.year as number) - (cand.year as number)) <= 1 : false;

  const strong = simFull >= 0.9 || simBase >= 0.75;
  const corroborated = simBase >= 0.5 && authHit >= 1 && (!yearKnown || yearClose);
  const ok = strong || corroborated;

  const bits = [
    `title≈${simFull.toFixed(2)}`,
    `base≈${simBase.toFixed(2)}`,
    query.authors?.length ? `authors matched=${authHit}` : null,
    yearKnown ? `year Δ=${Math.abs((query.year as number) - (cand.year as number))}` : null,
  ].filter(Boolean);

  return {
    ok,
    note: ok
      ? `Matched (${bits.join(', ')}).`
      : `Closest hit "${cand.title}" too weak (${bits.join(', ')}) — verify manually.`,
  };
}

/** Choose the best candidate among search hits for a queried citation. */
export function pickBest(
  query: { title: string; authors?: string[]; year?: number | null },
  hits: LitPaper[],
): LitPaper | null {
  let best: LitPaper | null = null;
  let bestScore = 0;
  for (const h of hits) {
    const simBase = tokenOverlap(baseTitle(query.title), baseTitle(h.title));
    const authHit = query.authors?.length ? surnameOverlap(query.authors, h.authors) : 0;
    const yearClose =
      query.year != null && h.year != null && Math.abs(query.year - h.year) <= 1 ? 1 : 0;
    const score = simBase + 0.3 * (authHit > 0 ? 1 : 0) + 0.1 * yearClose;
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }
  return best && tokenOverlap(baseTitle(query.title), baseTitle(best.title)) >= 0.4 ? best : null;
}

/** Prefer a resolvable DOI link, fall back to the source landing page. */
export function linkOf(p: LitPaper): string | null {
  if (p.doi) return `https://doi.org/${p.doi}`;
  return p.url ?? null;
}

/** Merge candidates from multiple sources, de-duping by DOI then title. */
export function dedupePapers(papers: LitPaper[]): LitPaper[] {
  const byKey = new Map<string, LitPaper>();
  for (const p of papers) {
    const key = p.doi ? `doi:${p.doi.toLowerCase()}` : `title:${baseTitle(p.title)}`;
    const existing = byKey.get(key);
    // Keep the richer record (prefer one with an abstract, then higher citations).
    if (
      !existing ||
      (!existing.abstract && p.abstract) ||
      (p.citationCount ?? 0) > (existing.citationCount ?? 0)
    ) {
      byKey.set(key, p);
    }
  }
  return [...byKey.values()];
}
