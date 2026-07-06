import type { LLMClient } from './providers/types.js';
import type { ResearchContext } from './context.js';
import { withLanguage } from './language.js';
import type { Agent } from './agent.js';
import type { AgentEvent, StageId } from './events.js';
import {
  literatureSearch,
  citationVerifier,
  researchQuestion,
  devilsAdvocate,
} from './agents/index.js';

export const STAGE_TITLES: Record<StageId, string> = {
  'deep-research': 'Deep Research（深度研究）',
};

/**
 * Milestone-1 pipeline: a single Deep Research stage.
 * literature → verify citations → research questions → devil's advocate.
 * Adding stages/agents later is additive — extend these arrays.
 */
export const deepResearchAgents: Agent[] = [
  literatureSearch,
  citationVerifier,
  researchQuestion,
  devilsAdvocate,
];

export interface PipelineArgs {
  ctx: ResearchContext;
  llm: LLMClient;
  emit: (e: AgentEvent) => void;
}

export async function runDeepResearch({ ctx, llm, emit }: PipelineArgs): Promise<void> {
  // Every agent's output follows the run's chosen language.
  const langLlm = withLanguage(llm, ctx.language);

  emit({ type: 'run.start', runId: ctx.runId, topic: ctx.topic });
  emit({ type: 'stage.start', stage: 'deep-research', title: STAGE_TITLES['deep-research'] });

  for (const agent of deepResearchAgents) {
    emit({ type: 'agent.start', agent: agent.name, title: agent.title, stage: agent.stage });
    try {
      await agent.run({ ctx, llm: langLlm, emit });
    } catch (err) {
      emit({
        type: 'agent.error',
        agent: agent.name,
        message: (err as Error).message ?? String(err),
      });
    }
    emit({ type: 'agent.done', agent: agent.name });
  }

  emit({ type: 'stage.done', stage: 'deep-research' });
  emit({ type: 'run.done', runId: ctx.runId });
}
