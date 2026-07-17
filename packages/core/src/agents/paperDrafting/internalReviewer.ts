import { defineAgent } from '../../agent.js';
import { CritiqueSetSchema } from '../../schemas.js';
import { assembleMarkdown } from '../../draft.js';

export const internalReviewer = defineAgent({
  name: 'internal-reviewer',
  title: '内部审稿',
  stage: 'paper-drafting',
  role: 'Review the full draft as a demanding peer reviewer and list actionable issues.',
  effort: 'high',
  async run({ ctx, llm, emit }) {
    if (!ctx.draft) {
      emit({
        type: 'agent.result',
        agent: 'internal-reviewer',
        summary: 'No draft to review.',
        data: [],
      });
      return;
    }

    const paper = assembleMarkdown(ctx.draft);

    const system =
      'You are Reviewer 2 for a top-tier venue: rigorous, fair, and specific. Review the ' +
      'submitted draft. Identify weaknesses in argumentation, unsupported claims, gaps in ' +
      'method, clarity problems, structural issues, and missing context. Think out loud, then ' +
      'deliver a concise reviewer report. Be constructive but do not soften real problems.';

    const prose = await llm.generate({
      system,
      messages: [{ role: 'user', content: `Draft under review:\n\n${paper}` }],
      effort: 'high',
      onThinking: (delta) =>
        emit({ type: 'agent.thinking', agent: 'internal-reviewer', delta }),
      onText: (delta) => emit({ type: 'agent.output', agent: 'internal-reviewer', delta }),
    });

    const result = await llm.parse({
      system:
        'Convert the following peer review into discrete, actionable items. For each: the ' +
        'target (section or claim being challenged), the specific issue, a severity ' +
        '(low|medium|high), and a concrete suggestion to fix it.',
      messages: [{ role: 'user', content: prose }],
      schema: CritiqueSetSchema,
      effort: 'medium',
    });

    ctx.draftReview = result.critiques;
    ctx.log.push(`internal-reviewer: raised ${result.critiques.length} review items`);
    emit({
      type: 'agent.result',
      agent: 'internal-reviewer',
      summary: `Raised ${result.critiques.length} review items.`,
      data: result.critiques,
    });
  },
});
