const BASE = 'https://api.semanticscholar.org/graph/v1';

export interface SSPaper {
  paperId: string;
  title: string;
  year: number | null;
  url: string | null;
  authors: string[];
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Token-overlap similarity in [0,1] between two titles. */
function similarity(a: string, b: string): number {
  const ta = new Set(normalize(a).split(' ').filter(Boolean));
  const tb = new Set(normalize(b).split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

export class SemanticScholar {
  constructor(private apiKey?: string) {}

  private headers(): Record<string, string> {
    return this.apiKey ? { 'x-api-key': this.apiKey } : {};
  }

  async searchTop(query: string): Promise<SSPaper | null> {
    const url =
      `${BASE}/paper/search?query=${encodeURIComponent(query)}` +
      `&limit=1&fields=title,year,url,authors`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) {
      // 429 rate-limit or transient — treat as "unknown", not "fake".
      throw new Error(`Semantic Scholar ${res.status}`);
    }
    const json: any = await res.json();
    const hit = json?.data?.[0];
    if (!hit) return null;
    return {
      paperId: hit.paperId,
      title: hit.title,
      year: hit.year ?? null,
      url: hit.url ?? null,
      authors: (hit.authors ?? []).map((a: any) => a.name),
    };
  }

  /** Verify a citation title exists. Returns match + a note. */
  async verifyTitle(title: string): Promise<{
    verified: boolean;
    matchedTitle: string | null;
    paperId: string | null;
    url: string | null;
    note: string;
  }> {
    try {
      const top = await this.searchTop(title);
      if (!top) {
        return {
          verified: false,
          matchedTitle: null,
          paperId: null,
          url: null,
          note: 'No match found in Semantic Scholar — possibly fabricated or very obscure.',
        };
      }
      const sim = similarity(title, top.title);
      const verified = sim >= 0.6;
      return {
        verified,
        matchedTitle: top.title,
        paperId: top.paperId,
        url: top.url,
        note: verified
          ? `Matched (title similarity ${sim.toFixed(2)}).`
          : `Closest match had low similarity (${sim.toFixed(2)}) — verify manually.`,
      };
    } catch (err) {
      return {
        verified: false,
        matchedTitle: null,
        paperId: null,
        url: null,
        note: `Lookup unavailable (${(err as Error).message}) — could not verify.`,
      };
    }
  }
}
