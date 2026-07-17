import { type LitPaper, type VerifyResult, dedupePapers } from './literature.js';
import { OpenAlex } from './openAlex.js';
import { SemanticScholar } from './semanticScholar.js';

/**
 * Unified literature access. OpenAlex is the primary source (keyless, reliable);
 * Semantic Scholar is queried in addition only when an API key is configured
 * (its anonymous endpoint is 429-throttled). Results are merged and de-duped, so
 * one source being down never zeroes out the search.
 */
export class LiteratureClient {
  private openAlex: OpenAlex;
  private s2: SemanticScholar | null;

  constructor(opts: { semanticScholarApiKey?: string; openAlexMailto?: string } = {}) {
    this.openAlex = new OpenAlex(opts.openAlexMailto);
    this.s2 = opts.semanticScholarApiKey ? new SemanticScholar(opts.semanticScholarApiKey) : null;
  }

  /**
   * Search every available source concurrently and merge. Returns papers plus
   * per-source diagnostics so callers can explain an empty result honestly.
   */
  async search(
    query: string,
    opts: { limit?: number } = {},
  ): Promise<{ papers: LitPaper[]; errors: string[] }> {
    const limit = opts.limit ?? 10;
    const tasks: Promise<LitPaper[]>[] = [this.openAlex.search(query, { limit })];
    if (this.s2) tasks.push(this.s2.search(query, { limit }));

    const settled = await Promise.allSettled(tasks);
    const papers: LitPaper[] = [];
    const errors: string[] = [];
    settled.forEach((r, i) => {
      const src = i === 0 ? 'OpenAlex' : 'SemanticScholar';
      if (r.status === 'fulfilled') papers.push(...r.value);
      else errors.push(`${src}: ${(r.reason as Error).message}`);
    });
    return { papers: dedupePapers(papers), errors };
  }

  /** Verify via OpenAlex first; if inconclusive and S2 is available, try S2. */
  async verifyTitle(
    title: string,
    meta: { authors?: string[]; year?: number | null } = {},
  ): Promise<VerifyResult> {
    const primary = await this.openAlex.verifyTitle(title, meta);
    if (primary.verified || !this.s2) return primary;
    const secondary = await this.s2.verifyTitle(title, meta);
    // Prefer a positive verdict from either source; otherwise keep the primary.
    return secondary.verified ? secondary : primary;
  }
}
