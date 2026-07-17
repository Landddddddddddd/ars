import { defineAgent } from '../../agent.js';
import { loadConfig } from '../../config.js';
import { LiteratureClient } from '../../clients/literatureClient.js';
import type { CitationCheck } from '../../schemas.js';

export const citationVerifier = defineAgent({
  name: 'citation-verifier',
  title: '文献溯源',
  stage: 'deep-research',
  role: 'Confirm each cited paper exists via the Semantic Scholar API.',
  async run({ ctx, emit }) {
    const cfg = loadConfig();
    const lit = new LiteratureClient({
      semanticScholarApiKey: cfg.semanticScholarApiKey,
      openAlexMailto: cfg.openAlexMailto,
    });
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

      let check: CitationCheck;
      if (paper.paperId) {
        // Already retrieved from a real index (OpenAlex/S2) → known real; no re-query.
        check = {
          title: paper.title,
          verified: true,
          status: 'verified',
          matchedTitle: paper.title,
          paperId: paper.paperId,
          url: paper.url ?? null,
          note: 'Retrieved directly from a scholarly index.',
        };
      } else {
        // Fallback/memory-sourced entry → verify by title + author/year.
        const r = await lit.verifyTitle(paper.title, {
          authors: paper.authors,
          year: paper.year,
        });
        check = { title: paper.title, ...r };
        // Be polite to the shared free API only when we actually hit it.
        await new Promise((res) => setTimeout(res, 1100));
      }

      checks.push(check);
      emit({
        type: 'agent.output',
        agent: 'citation-verifier',
        delta: `  → ${check.verified ? '✓ verified' : check.status === 'lookup_failed' ? '… lookup failed' : '✗ not found'} — ${check.note}\n`,
      });
    }

    ctx.citationChecks = checks;
    const verified = checks.filter((c) => c.status === 'verified' || c.verified).length;
    const failed = checks.filter((c) => c.status === 'lookup_failed').length;
    const notFound = checks.length - verified - failed;
    ctx.log.push(
      `citation-verifier: ${verified} verified, ${notFound} not found, ${failed} lookup-failed`,
    );
    emit({
      type: 'agent.result',
      agent: 'citation-verifier',
      summary:
        `${verified}/${checks.length} verified` +
        (notFound ? `, ${notFound} not found` : '') +
        (failed ? `, ${failed} lookup-failed (transient)` : '') +
        '.',
      data: checks,
    });
  },
});
