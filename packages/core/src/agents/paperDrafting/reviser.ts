import { defineAgent } from '../../agent.js';
import { DraftSectionSetSchema } from '../../schemas.js';

export const reviser = defineAgent({
  name: 'reviser',
  title: '修订',
  stage: 'paper-drafting',
  role: 'Revise the draft to address the internal review, preserving citations.',
  effort: 'high',
  async run({ ctx, llm, emit }) {
    if (!ctx.draft) {
      emit({
        type: 'agent.result',
        agent: 'reviser',
        summary: 'No draft to revise.',
        data: [],
      });
      return;
    }

    if (ctx.draftReview.length === 0) {
      ctx.log.push('reviser: no review items — keeping draft as-is');
      emit({
        type: 'agent.result',
        agent: 'reviser',
        summary: 'No review items to address; draft unchanged.',
        data: ctx.draft.sections,
      });
      return;
    }

    const review = ctx.draftReview
      .map((c, i) => `${i + 1}. [${c.severity}] ${c.issue}\n   Target: ${c.target}\n   Fix: ${c.suggestion}`)
      .join('\n');

    const draftJson = JSON.stringify(
      ctx.draft.sections.map((s) => ({ id: s.id, title: s.title, content: s.content })),
    );

    const system =
      'You are the revising author. Address the reviewer items by rewriting the affected ' +
      'sections. Preserve section ids and titles, keep all existing inline citation markers ' +
      '(e.g. [Smith2021]) intact, and do not remove supported content. Return the FULL set of ' +
      'sections (revised where needed, unchanged otherwise).';

    const user = `Reviewer items:\n${review}\n\nCurrent sections (JSON):\n${draftJson}`;

    const result = await llm.parse({
      system,
      messages: [{ role: 'user', content: user }],
      schema: DraftSectionSetSchema,
      effort: 'high',
    });

    ctx.draft = { ...ctx.draft, sections: result.sections };
    ctx.log.push(`reviser: revised ${result.sections.length} sections`);
    emit({
      type: 'agent.result',
      agent: 'reviser',
      summary: `Revised the draft (${result.sections.length} sections).`,
      data: result.sections,
    });
  },
});
