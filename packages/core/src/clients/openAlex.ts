import {
  type LitPaper,
  type VerifyResult,
  decideMatch,
  pickBest,
  linkOf,
  sleep,
} from './literature.js';

// OpenAlex — a free, keyless scholarly index with generous rate limits. Used as
// the primary literature source because Semantic Scholar's anonymous API is
// heavily 429-throttled. Adding a contact email joins the faster "polite pool".
const BASE = 'https://api.openalex.org';
const SELECT =
  'id,title,publication_year,authorships,primary_location,cited_by_count,doi,abstract_inverted_index';

/** Reconstruct plain-text abstract from OpenAlex's inverted index. */
function abstractFromIndex(idx: Record<string, number[]> | null | undefined): string | null {
  if (!idx) return null;
  const slots: string[] = [];
  for (const [word, positions] of Object.entries(idx)) {
    for (const p of positions) slots[p] = word;
  }
  const text = slots.filter(Boolean).join(' ').trim();
  return text.length ? text.slice(0, 1500) : null;
}

function toLitPaper(w: any): LitPaper {
  const doi: string | null = w.doi ? String(w.doi).replace(/^https?:\/\/doi\.org\//i, '') : null;
  const venue: string | null = w?.primary_location?.source?.display_name ?? null;
  const authors: string[] = (w.authorships ?? [])
    .map((a: any) => a?.author?.display_name)
    .filter(Boolean);
  return {
    paperId: String(w.id ?? '').replace('https://openalex.org/', '') || (doi ?? ''),
    source: 'openalex',
    title: w.title ?? '',
    year: w.publication_year ?? null,
    venue,
    url: w.id ?? null,
    doi,
    abstract: abstractFromIndex(w.abstract_inverted_index),
    citationCount: w.cited_by_count ?? null,
    authors,
  };
}

export class OpenAlex {
  constructor(
    private mailto?: string,
    private opts: { maxRetries?: number; baseDelayMs?: number } = {},
  ) {}

  private async fetchJson(url: string): Promise<any> {
    const maxRetries = this.opts.maxRetries ?? 4;
    const baseDelay = this.opts.baseDelayMs ?? 700;
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, { headers: { 'User-Agent': this.ua() } });
      } catch (e) {
        lastErr = e as Error;
        await sleep(baseDelay * 2 ** attempt);
        continue;
      }
      if (res.ok) return res.json();
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`OpenAlex ${res.status}`);
        await sleep(baseDelay * 2 ** attempt);
        continue;
      }
      throw new Error(`OpenAlex ${res.status}`);
    }
    throw lastErr ?? new Error('OpenAlex: retries exhausted');
  }

  private ua(): string {
    return this.mailto ? `ARS (mailto:${this.mailto})` : 'ARS';
  }

  private mailtoParam(): string {
    return this.mailto ? `&mailto=${encodeURIComponent(this.mailto)}` : '';
  }

  /** Relevance search over the OpenAlex corpus. */
  async search(query: string, opts: { limit?: number } = {}): Promise<LitPaper[]> {
    const perPage = Math.min(Math.max(opts.limit ?? 10, 1), 50);
    const url =
      `${BASE}/works?search=${encodeURIComponent(query)}` +
      `&per_page=${perPage}&select=${encodeURIComponent(SELECT)}${this.mailtoParam()}`;
    const json = await this.fetchJson(url);
    const results: any[] = json?.results ?? [];
    return results.map(toLitPaper).filter((p) => p.paperId && p.title);
  }

  /**
   * Verify a citation exists in OpenAlex. Searches by title and corroborates
   * with author surnames + year. not_found vs lookup_failed is preserved so a
   * transient failure is never read as fabrication.
   */
  async verifyTitle(
    title: string,
    meta: { authors?: string[]; year?: number | null } = {},
  ): Promise<VerifyResult> {
    try {
      const hits = await this.search(title, { limit: 5 });
      const cand = pickBest({ title, ...meta }, hits);
      if (!cand) {
        return {
          verified: false,
          status: 'not_found',
          matchedTitle: null,
          paperId: null,
          url: null,
          note: 'No match in OpenAlex — likely fabricated or very obscure.',
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
