import { defineAgent } from '../../agent.js';
import { loadConfig } from '../../config.js';
import { SemanticScholar } from '../../clients/semanticScholar.js';
import type { CitationCheck } from '../../schemas.js';

export const citationVerifier = defineAgent({
  name: 'citation-verifier',
  title: '文献溯源',
  stage: 'deep-research',
  role: 'Verify each cited paper actually exists via the Semantic Scholar API.',
  async run({ ctx, emit }) {
    const cfg = loadConfig();
    const ss = new SemanticScholar(cfg.semanticScholarApiKey);
    const checks: CitationCheck[] = [];

    if (ctx.papers.length === 0) {
      emit({
        type: 'agent.result',
        agent: 'citation-verifier',
        summary: 'No papers to verify.',
        data: [],
      });
      return;
    }

    for (const paper of ctx.papers) {
      emit({
        type: 'agent.output',
        agent: 'citation-verifier',
        delta: `Checking: ${paper.title}\n`,
      });
      const r = await ss.verifyTitle(paper.title);
      checks.push({ title: paper.title, ...r });
      emit({
        type: 'agent.output',
        agent: 'citation-verifier',
        delta: `  → ${r.verified ? '✓ verified' : '✗ unverified'} — ${r.note}\n`,
      });
      // Be polite to the free API (avoid 429).
      await new Promise((res) => setTimeout(res, 1100));
    }

    ctx.citationChecks = checks;
    const ok = checks.filter((c) => c.verified).length;
    ctx.log.push(`citation-verifier: ${ok}/${checks.length} verified`);
    emit({
      type: 'agent.result',
      agent: 'citation-verifier',
      summary: `${ok}/${checks.length} citations verified against Semantic Scholar.`,
      data: checks,
    });
  },
});
