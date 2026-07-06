import { defineAgent } from '../../agent.js';
import { ResearchQuestionSetSchema } from '../../schemas.js';

export const researchQuestion = defineAgent({
  name: 'research-question',
  title: '研究问题构建',
  stage: 'deep-research',
  role: 'Define sharp research questions grounded in the surveyed literature.',
  effort: 'high',
  async run({ ctx, llm, emit }) {
    const litContext =
      ctx.papers.length > 0
        ? ctx.papers
            .map((p, i) => `${i + 1}. ${p.title} (${p.year ?? 'n.d.'}) — ${p.summary}`)
            .join('\n')
        : '(no literature available yet)';

    const system =
      'You are a research advisor. Given a topic and the surveyed literature, ' +
      'formulate 2-4 precise, novel, and feasible research questions. For each: a ' +
      'clear question, a rationale (grounded in gaps in the literature), 2-3 concrete ' +
      'objectives, and an optional hypothesis (or null). Avoid vague or overly broad ' +
      'questions.';

    const result = await llm.parse({
      system,
      messages: [
        {
          role: 'user',
          content: `Topic: ${ctx.topic}\n\nSurveyed literature:\n${litContext}`,
        },
      ],
      schema: ResearchQuestionSetSchema,
      effort: 'high',
    });

    ctx.researchQuestions = result.questions;
    ctx.log.push(`research-question: proposed ${result.questions.length} questions`);
    emit({
      type: 'agent.result',
      agent: 'research-question',
      summary: `Proposed ${result.questions.length} research questions.`,
      data: result.questions,
    });
  },
});
