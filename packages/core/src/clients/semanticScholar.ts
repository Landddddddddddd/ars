const BASE = 'https://api.semanticscholar.org/graph/v1';
const FIELDS = 'title,year,venue,authors,externalIds,abstract,citationCount,url';

export interface SSPaper {
  paperId: string;
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── title / author / year matching ────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Drop a subtitle after the first colon so "X: a study of Y" matches "X". */
function baseTitle(s: string): string {
  const cut = s.split(':')[0];
  return normalize(cut.length >= 4 ? cut : s);
}

/** Jaccard-ish token overlap in [0,1] between two strings. */
function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter(Boolean));
  const tb = new Set(b.split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

/** Last-name tokens, lower-cased, for author comparison. */
function surnames(authors: string[]): Set<string> {
  const out = new Set<string>();
  for (const a of authors) {
    const parts = normalize(a).split(' ').filter(Boolean);
    if (parts.length) out.add(parts[parts.length - 1]);
  }
  return out;
}

function surnameOverlap(a: string[], b: string[]): number {
  const sa = surnames(a);
  const sb = surnames(b);
  let n = 0;
  for (const s of sa) if (sb.has(s)) n++;
  return n;
}

/** Decide whether a candidate matches the queried citation. */
function decideMatch(
  query: { title: string; authors?: string[]; year?: number | null },
  cand: SSPaper,
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

function toSSPaper(hit: any): SSPaper {
  const doi = hit?.externalIds?.DOI ?? null;
  return {
    paperId: hit.paperId,
    title: hit.title ?? '',
    year: hit.year ?? null,
    venue: hit.venue || null,
    url: hit.url ?? null,
    doi,
    abstract: hit.abstract ?? null,
    citationCount: hit.citationCount ?? null,
    authors: (hit.authors ?? []).map((a: any) => a.name).filter(Boolean),
  };
}

/** Prefer a resolvable DOI link, fall back to the S2 landing page. */
export function linkOf(p: SSPaper): string | null {
  if (p.doi) return `https://doi.org/${p.doi}`;
  return p.url ?? null;
}

// ── client ─────────────────────────────────────────────────────────────────

export class SemanticScholar {
  constructor(
    private apiKey?: string,
    private opts: { maxRetries?: number; baseDelayMs?: number } = {},
  ) {}

  private headers(): Record<string, string> {
    return this.apiKey ? { 'x-api-key': this.apiKey } : {};
  }

  /**
   * GET with exponential backoff on 429/5xx and network errors. Returns null
   * for 404 when `notFoundOk` (the match endpoint 404s on no-match). Throws
   * only after exhausting retries or on a non-retryable 4xx.
   */
  private async fetchJson(url: string, notFoundOk = false): Promise<any> {
    const maxRetries = this.opts.maxRetries ?? 4;
    const baseDelay = this.opts.baseDelayMs ?? 800;
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, { headers: this.headers() });
      } catch (e) {
        lastErr = e as Error;
        await sleep(baseDelay * 2 ** attempt);
        continue;
      }
      if (res.ok) return res.json();
      if (notFoundOk && res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`Semantic Scholar ${res.status}`);
        await sleep(baseDelay * 2 ** attempt);
        continue;
      }
      throw new Error(`Semantic Scholar ${res.status}`);
    }
    throw lastErr ?? new Error('Semantic Scholar: retries exhausted');
  }

  /** Discovery search: real papers for a topical query, ranked by S2 relevance. */
  async search(query: string, opts: { limit?: number } = {}): Promise<SSPaper[]> {
    const limit = Math.min(Math.max(opts.limit ?? 10, 1), 100);
    const url =
      `${BASE}/paper/search?query=${encodeURIComponent(query)}` +
      `&limit=${limit}&fields=${encodeURIComponent(FIELDS)}`;
    const json = await this.fetchJson(url);
    const data: any[] = json?.data ?? [];
    return data.map(toSSPaper).filter((p) => p.paperId && p.title);
  }

  /** Best exact-title match via the dedicated /match endpoint (404 → null). */
  async matchTitle(title: string): Promise<SSPaper | null> {
    const url =
      `${BASE}/paper/search/match?query=${encodeURIComponent(title)}` +
      `&fields=${encodeURIComponent(FIELDS)}`;
    const json = await this.fetchJson(url, true);
    const hit = json?.data?.[0];
    return hit ? toSSPaper(hit) : null;
  }

  /**
   * Verify a citation exists. Uses the /match endpoint first, then a top-k
   * search fallback, and corroborates with author surnames + year when given.
   * Distinguishes not_found from lookup_failed (transient) so a rate-limit is
   * never mistaken for fabrication.
   */
  async verifyTitle(
    title: string,
    meta: { authors?: string[]; year?: number | null } = {},
  ): Promise<VerifyResult> {
    try {
      let cand = await this.matchTitle(title);
      if (!cand) {
        const hits = await this.search(title, { limit: 5 });
        cand = pickBest({ title, ...meta }, hits);
      }
      if (!cand) {
        return {
          verified: false,
          status: 'not_found',
          matchedTitle: null,
          paperId: null,
          url: null,
          note: 'No match in Semantic Scholar — likely fabricated or very obscure.',
        };
      }
      const { ok, note } = decideMatch({ title, ...meta }, cand);
      return {
        verified: ok,
        status: ok ? 'verified' : 'not_found',
        matchedTitle: cand.title,
        paperId: cand.paperId,
        url: linkOf(cand),
        note,
      };
    } catch (err) {
      return {
        verified: false,
        status: 'lookup_failed',
        matchedTitle: null,
        paperId: null,
        url: null,
        note: `Lookup unavailable (${(err as Error).message}) — transient, not a fabrication verdict.`,
      };
    }
  }
}

/** Choose the best candidate among search hits for a queried citation. */
function pickBest(
  query: { title: string; authors?: string[]; year?: number | null },
  hits: SSPaper[],
): SSPaper | null {
  let best: SSPaper | null = null;
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
  // Require at least a moderate title overlap before proposing a candidate.
  return best && tokenOverlap(baseTitle(query.title), baseTitle(best.title)) >= 0.4 ? best : null;
}
