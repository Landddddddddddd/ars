import {
  type LitPaper,
  type VerifyResult,
  decideMatch,
  pickBest,
  linkOf,
  sleep,
} from './literature.js';

const BASE = 'https://api.semanticscholar.org/graph/v1';
const FIELDS = 'title,year,venue,authors,externalIds,abstract,citationCount,url';

// Kept as an alias so existing imports (`SSPaper`) keep working; the shared
// LitPaper is the real type.
export type SSPaper = LitPaper;
export type { VerifyResult, VerifyStatus } from './literature.js';
export { linkOf } from './literature.js';

function toSSPaper(hit: any): LitPaper {
  const doi = hit?.externalIds?.DOI ?? null;
  return {
    paperId: hit.paperId,
    source: 'semanticscholar',
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
  async search(query: string, opts: { limit?: number } = {}): Promise<LitPaper[]> {
    const limit = Math.min(Math.max(opts.limit ?? 10, 1), 100);
    const url =
      `${BASE}/paper/search?query=${encodeURIComponent(query)}` +
      `&limit=${limit}&fields=${encodeURIComponent(FIELDS)}`;
    const json = await this.fetchJson(url);
    const data: any[] = json?.data ?? [];
    return data.map(toSSPaper).filter((p) => p.paperId && p.title);
  }

  /** Best exact-title match via the dedicated /match endpoint (404 → null). */
  async matchTitle(title: string): Promise<LitPaper | null> {
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
