import { defineAgent } from '../../agent.js';
import { OutlineSchema } from '../../schemas.js';

export const outlineArchitect = defineAgent({
  name: 'outline-architect',
  title: '大纲架构',
  stage: 'paper-drafting',
  role: 'Design a structured paper outline grounded in the research questions and literature.',
  effort: 'high',
  async run({ ctx, llm, emit }) {
    const questions =
      ctx.researchQuestions.length > 0
        ? ctx.researchQuestions
            .map((q, i) => `${i + 1}. ${q.question}\n   Rationale: ${q.rationale}`)
            .join('\n')
        : '(none)';

    const literature =
      ctx.papers.length > 0
        ? ctx.papers.map((p, i) => `${i + 1}. ${p.title} (${p.year ?? 'n.d.'})`).join('\n')
        : '(none)';

    const critiques =
      ctx.critiques.length > 0
        ? ctx.critiques.map((c, i) => `${i + 1}. [${c.severity}] ${c.issue}`).join('\n')
        : '(none)';

    const system =
      'You are an academic writing architect. Design a clear, logically ordered outline ' +
      'for a research paper. Produce standard sections (e.g. Introduction, Related Work, ' +
      'Method/Approach, Discussion, Conclusion) tailored to the topic. For each section give ' +
      'a stable lowercase-slug id, a title, and 2-5 concrete bullet points describing what ' +
      'that section must cover. Ground the bullets in the research questions, the surveyed ' +
      'literature, and the raised critiques. Do NOT write prose yet — only the plan.';

    const user =
      `Topic: ${ctx.topic}\n\n` +
      `Research questions:\n${questions}\n\n` +
      `Surveyed literature:\n${literature}\n\n` +
      `Critiques to address:\n${critiques}`;

    const result = await llm.parse({
      system,
      messages: [{ role: 'user', content: user }],
      schema: OutlineSchema,
      effort: 'high',
    });

    ctx.outline = result.sections;
    ctx.log.push(`outline-architect: planned ${result.sections.length} sections`);
    emit({
      type: 'agent.result',
      agent: 'outline-architect',
      summary: `Planned ${result.sections.length} sections.`,
      data: result.sections,
    });
  },
});
