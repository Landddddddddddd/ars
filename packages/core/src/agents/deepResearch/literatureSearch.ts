import { defineAgent } from '../../agent.js';
import { LiteratureResultSchema } from '../../schemas.js';

export const literatureSearch = defineAgent({
  name: 'literature-search',
  title: '文献调研',
  stage: 'deep-research',
  role: 'Find high-quality, real literature relevant to the research topic.',
  effort: 'medium',
  async run({ ctx, llm, emit }) {
    const system =
      'You are an expert research librarian. Given a research topic, identify the ' +
      'most relevant, high-quality, REAL academic papers a researcher should read. ' +
      'Only include papers you are confident actually exist (they will be verified ' +
      'against Semantic Scholar). Prefer well-known, frequently-cited work. ' +
      'For each paper provide: title, authors (list), year (or null), venue (or null), ' +
      'a one-sentence summary of why it is relevant, and 1-3 key findings. ' +
      'Return 5-8 papers.';

    const result = await llm.parse({
      system,
      messages: [{ role: 'user', content: `Research topic: ${ctx.topic}` }],
      schema: LiteratureResultSchema,
      effort: 'medium',
    });

    ctx.papers = result.papers;
    ctx.log.push(`literature-search: found ${result.papers.length} papers`);
    emit({
      type: 'agent.result',
      agent: 'literature-search',
      summary: `Found ${result.papers.length} candidate papers.`,
      data: result.papers,
    });
  },
});
