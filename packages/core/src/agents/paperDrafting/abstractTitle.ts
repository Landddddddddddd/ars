import { defineAgent } from '../../agent.js';
import { AbstractTitleSchema } from '../../schemas.js';
import { assembleMarkdown } from '../../draft.js';

export const abstractTitle = defineAgent({
  name: 'abstract-title',
  title: '摘要与标题',
  stage: 'paper-drafting',
  role: 'Generate the final title and abstract, then emit the complete paper.',
  effort: 'high',
  async run({ ctx, llm, emit }) {
    if (!ctx.draft) {
      emit({
        type: 'agent.result',
        agent: 'abstract-title',
        summary: 'No draft to finalize.',
        data: null,
      });
      return;
    }

    const body = ctx.draft.sections
      .map((s) => `## ${s.title}\n\n${s.content}`)
      .join('\n\n');

    const system =
      'You are finalizing an academic paper. Read the (revised) body and produce a precise, ' +
      'informative title and a self-contained abstract (roughly 150-250 words) that states the ' +
      'problem, approach, and contribution. Do not introduce claims not supported by the body.';

    const result = await llm.parse({
      system,
      messages: [{ role: 'user', content: `Topic: ${ctx.topic}\n\nPaper body:\n\n${body}` }],
      schema: AbstractTitleSchema,
      effort: 'high',
    });

    ctx.draft = { ...ctx.draft, title: result.title, abstract: result.abstract };
    const markdown = assembleMarkdown(ctx.draft);
    ctx.log.push(`abstract-title: finalized "${result.title}"`);
    emit({
      type: 'agent.result',
      agent: 'abstract-title',
      summary: `Finalized paper: ${result.title}`,
      // The full paper artifact + assembled Markdown, for the UI export panel.
      data: { ...ctx.draft, markdown },
    });
  },
});
