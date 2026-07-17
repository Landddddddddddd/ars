import * as z from 'zod/v4';
import type { LLMClient } from './providers/types.js';
import { withLanguage, type OutputLanguage } from './language.js';

// Turn a broad direction ("大模型在教育中的应用") into several focused, researchable
// topics the user can pick from before committing to a full pipeline run.

const TopicsSchema = z.object({
  topics: z
    .array(
      z.object({
        title: z.string(),
        rationale: z.string(),
      }),
    )
    .min(3)
    .max(6),
});

export interface SuggestedTopic {
  title: string;
  rationale: string;
}

export async function suggestResearchTopics(
  llm: LLMClient,
  direction: string,
  language: OutputLanguage = 'auto',
): Promise<SuggestedTopic[]> {
  const langLlm = withLanguage(llm, language);
  const { topics } = await langLlm.parse({
    system:
      'You are a research advisor. Given a broad research direction, propose 4–6 ' +
      'focused, specific, and researchable paper topics. Each should be narrow enough ' +
      'to support a single coherent study (name a concrete angle, population, method, ' +
      'or comparison — not a whole field). For each, give a concise `title` (a paper-' +
      'worthy research topic, not a question) and a one-sentence `rationale` explaining ' +
      'why it is promising and tractable. Cover meaningfully different angles.',
    messages: [{ role: 'user', content: `Broad research direction: ${direction}` }],
    schema: TopicsSchema,
    effort: 'low',
  });
  return topics;
}
