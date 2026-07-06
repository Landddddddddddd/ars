import { defineAgent } from '../../agent.js';
import { CritiqueSetSchema } from '../../schemas.js';

export const devilsAdvocate = defineAgent({
  name: 'devils-advocate',
  title: '魔鬼代言人',
  stage: 'deep-research',
  role: 'Aggressively challenge assumptions and conclusions to prevent tunnel vision.',
  effort: 'high',
  async run({ ctx, llm, emit }) {
    const questions =
      ctx.researchQuestions.length > 0
        ? ctx.researchQuestions.map((q, i) => `${i + 1}. ${q.question}`).join('\n')
        : '(none yet)';

    const system =
      "You are the Devil's Advocate on a research team. Your job is to poke holes: " +
      'challenge hidden assumptions, question the framing, surface confounds, ' +
      'threats to validity, and alternative explanations. Be rigorous and specific, ' +
      'not contrarian for its own sake. Think out loud, then deliver your critique.';

    const user =
      `Research topic: ${ctx.topic}\n\nProposed research questions:\n${questions}\n\n` +
      'Deliver a sharp critique in prose.';

    // Stream the critique so the UI can show live reasoning + output.
    const prose = await llm.generate({
      system,
      messages: [{ role: 'user', content: user }],
      effort: 'high',
      onThinking: (delta) =>
        emit({ type: 'agent.thinking', agent: 'devils-advocate', delta }),
      onText: (delta) => emit({ type: 'agent.output', agent: 'devils-advocate', delta }),
    });

    // Structure the critique into discrete, actionable items.
    const result = await llm.parse({
      system:
        'Convert the following research critique into discrete items. For each: the ' +
        'target being challenged, the specific issue, a severity (low|medium|high), ' +
        'and a concrete suggestion to address it.',
      messages: [{ role: 'user', content: prose }],
      schema: CritiqueSetSchema,
      effort: 'medium',
    });

    ctx.critiques = result.critiques;
    ctx.log.push(`devils-advocate: raised ${result.critiques.length} critiques`);
    emit({
      type: 'agent.result',
      agent: 'devils-advocate',
      summary: `Raised ${result.critiques.length} critiques.`,
      data: result.critiques,
    });
  },
});
