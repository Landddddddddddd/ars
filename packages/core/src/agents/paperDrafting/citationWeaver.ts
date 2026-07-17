import { defineAgent } from '../../agent.js';
import { WovenDraftSchema } from '../../schemas.js';

export const citationWeaver = defineAgent({
  name: 'citation-weaver',
  title: '引用编织',
  stage: 'paper-drafting',
  role: 'Weave verified citations into the draft prose and build the reference list.',
  effort: 'high',
  async run({ ctx, llm, emit }) {
    if (!ctx.draft || ctx.draft.sections.length === 0) {
      emit({
        type: 'agent.result',
        agent: 'citation-weaver',
        summary: 'No draft to weave citations into.',
        data: [],
      });
      return;
    }

    // Only cite papers that were actually verified against Semantic Scholar.
    const verifiedTitles = new Set(
      ctx.citationChecks.filter((c) => c.verified).map((c) => c.title),
    );
    const citable = ctx.papers.filter((p) => verifiedTitles.has(p.title));

    if (citable.length === 0) {
      ctx.log.push('citation-weaver: no verified papers to cite — skipping');
      emit({
        type: 'agent.result',
        agent: 'citation-weaver',
        summary: 'No verified papers available to cite.',
        data: [],
      });
      return;
    }

    const url = (title: string) =>
      ctx.citationChecks.find((c) => c.title === title)?.url ?? null;

    const sources = citable
      .map(
        (p, i) =>
          `${i + 1}. title: ${p.title}\n   authors: ${p.authors.join(', ')}\n   year: ${
            p.year ?? 'n.d.'
          }\n   venue: ${p.venue ?? 'n/a'}`,
      )
      .join('\n');

    const draftJson = JSON.stringify(
      ctx.draft.sections.map((s) => ({ id: s.id, title: s.title, content: s.content })),
    );

    const system =
      'You are a citation editor. You are given draft sections and a list of VERIFIED sources. ' +
      'Insert inline citations of the form [CitationKey] into the prose wherever a claim is ' +
      'supported by one of the sources — ONLY use the provided sources, never invent any. ' +
      'Derive each citationKey as FirstAuthorLastName+Year (e.g. Smith2021); keep it consistent ' +
      'between the inline marker and the reference entry. Return the sections with citations ' +
      'woven in (preserve ids/titles and all prose, only add markers) and a references array ' +
      'containing every source you actually cited.';

    const user = `Verified sources:\n${sources}\n\nDraft sections (JSON):\n${draftJson}`;

    const result = await llm.parse({
      system,
      messages: [{ role: 'user', content: user }],
      schema: WovenDraftSchema,
      effort: 'high',
    });

    // Backfill URLs from the citation checks (the model isn't given them).
    const references = result.references.map((r) => ({
      ...r,
      url: r.url ?? url(r.title),
    }));

    ctx.draft = { ...ctx.draft, sections: result.sections, references };
    ctx.log.push(
      `citation-weaver: wove ${references.length} citations from ${citable.length} verified papers`,
    );
    emit({
      type: 'agent.result',
      agent: 'citation-weaver',
      summary: `Wove ${references.length} verified citations into the draft.`,
      data: references,
    });
  },
});
