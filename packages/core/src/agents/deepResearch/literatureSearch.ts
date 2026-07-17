import * as z from 'zod/v4';
import { defineAgent } from '../../agent.js';
import { loadConfig } from '../../config.js';
import { LiteratureClient } from '../../clients/literatureClient.js';
import { linkOf, type LitPaper } from '../../clients/literature.js';
import type { Paper } from '../../schemas.js';

// The LLM turns the topic into real search queries...
const QueriesSchema = z.object({
  queries: z.array(z.string()).min(1).max(4),
});

// ...and then selects from REAL retrieved candidates by paperId, writing only
// the relevance summary and key findings. It never emits bibliographic fields
// (title/authors/year/venue) — those come from Semantic Scholar, so they cannot
// be hallucinated. This is the whole point of the retrieve-then-select design.
const SelectionSchema = z.object({
  selections: z
    .array(
      z.object({
        paperId: z.string(),
        summary: z.string(),
        keyFindings: z.array(z.string()),
      }),
    )
    .max(8),
});

export const literatureSearch = defineAgent({
  name: 'literature-search',
  title: '文献调研',
  stage: 'deep-research',
  role: 'Retrieve real literature from Semantic Scholar, then select the most relevant.',
  effort: 'medium',
  async run({ ctx, llm, emit }) {
    const cfg = loadConfig();
    const lit = new LiteratureClient({
      semanticScholarApiKey: cfg.semanticScholarApiKey,
      openAlexMailto: cfg.openAlexMailto,
    });

    // 1. Topic → 2–4 targeted search queries.
    const { queries } = await llm.parse({
      system:
        'You are a research librarian. Turn the research topic into 2–4 precise ' +
        'English search queries suitable for an academic search engine (Semantic ' +
        'Scholar). Use key concepts and their common synonyms; keep each query short ' +
        '(3–8 words). Do not invent paper titles — produce search queries only.',
      messages: [{ role: 'user', content: `Research topic: ${ctx.topic}` }],
      schema: QueriesSchema,
      effort: 'low',
    });
    emit({
      type: 'agent.output',
      agent: 'literature-search',
      delta: `Queries: ${queries.join(' | ')}\n`,
    });

    // 2. Retrieve REAL candidates from all sources (OpenAlex + S2 if keyed);
    //    dedupe by paperId. Transient failures on one query don't sink the others.
    const byId = new Map<string, LitPaper>();
    const sourceErrors = new Set<string>();
    for (const q of queries) {
      emit({ type: 'agent.output', agent: 'literature-search', delta: `Searching: ${q}\n` });
      const { papers, errors } = await lit.search(q, { limit: 10 });
      for (const h of papers) byId.set(h.paperId, h);
      for (const e of errors) sourceErrors.add(e);
      if (papers.length === 0 && errors.length > 0) {
        emit({
          type: 'agent.output',
          agent: 'literature-search',
          delta: `  ⚠ search failed (${errors.join('; ')})\n`,
        });
      }
    }
    const candidates = [...byId.values()].sort(
      (a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0),
    );

    // 3. No real candidates → refuse to fabricate. Emit an honest empty result.
    if (candidates.length === 0) {
      ctx.papers = [];
      const why =
        sourceErrors.size > 0
          ? `Literature sources errored (${[...sourceErrors].join('; ')}).`
          : 'No matching papers were returned for these queries.';
      ctx.log.push(`literature-search: 0 papers — ${why}`);
      emit({
        type: 'agent.result',
        agent: 'literature-search',
        summary: `No papers retrieved — ${why} (Not fabricating a list.)`,
        data: [],
      });
      return;
    }

    // 4. LLM selects the 5–8 most relevant from the REAL candidate list.
    const list = candidates
      .map(
        (c) =>
          `[${c.paperId}] ${c.title} — ${c.authors.slice(0, 4).join(', ')}` +
          ` (${c.year ?? 'n.d.'})${c.venue ? `, ${c.venue}` : ''}` +
          (c.abstract ? `\n    abstract: ${c.abstract.slice(0, 400)}` : ''),
      )
      .join('\n');
    const { selections } = await llm.parse({
      system:
        'You are an expert reviewer. From the CANDIDATE papers below (all real, ' +
        'retrieved from Semantic Scholar), select the 5–8 most relevant to the topic. ' +
        'Use ONLY the exact paperId values provided — never invent one. For each ' +
        'selection write a one-sentence relevance summary and 1–3 key findings, ' +
        'grounded in the given title/abstract. Do not restate the bibliographic fields.',
      messages: [
        { role: 'user', content: `Topic: ${ctx.topic}\n\nCANDIDATES:\n${list}` },
      ],
      schema: SelectionSchema,
      effort: 'medium',
    });

    // 5. Build Paper[] from REAL metadata; drop any hallucinated paperId.
    const papers: Paper[] = [];
    for (const sel of selections) {
      const c = byId.get(sel.paperId);
      if (!c) continue; // guard: id not in the retrieved set → discard
      papers.push({
        title: c.title,
        authors: c.authors,
        year: c.year,
        venue: c.venue,
        summary: sel.summary,
        keyFindings: sel.keyFindings,
        paperId: c.paperId,
        url: linkOf(c),
      });
    }

    ctx.papers = papers;
    ctx.log.push(
      `literature-search: retrieved ${candidates.length} candidates, selected ${papers.length}`,
    );
    emit({
      type: 'agent.result',
      agent: 'literature-search',
      summary: `Selected ${papers.length} of ${candidates.length} retrieved papers.`,
      data: papers,
    });
  },
});
