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
  outlineArchitect,
  sectionWriter,
  citationWeaver,
  internalReviewer,
  reviser,
  abstractTitle,
} from './agents/index.js';

export const STAGE_TITLES: Record<StageId, string> = {
  'deep-research': 'Deep Research（深度研究）',
  'paper-drafting': '论文起草（Paper Drafting）',
};

/**
 * Stage 1 — Deep Research: literature → verify citations → research questions → devil's advocate.
 */
export const deepResearchAgents: Agent[] = [
  literatureSearch,
  citationVerifier,
  researchQuestion,
  devilsAdvocate,
];

/**
 * Stage 2 — Paper Drafting: outline → write sections → weave citations →
 * internal review → revise → title & abstract.
 */
export const paperDraftingAgents: Agent[] = [
  outlineArchitect,
  sectionWriter,
  citationWeaver,
  internalReviewer,
  reviser,
  abstractTitle,
];

/** A pipeline stage: an ordered group of agents. */
export interface StageDef {
  id: StageId;
  title: string;
  agents: Agent[];
}

/** The full ordered pipeline. Adding a stage is additive — append here. */
export const STAGES: StageDef[] = [
  { id: 'deep-research', title: STAGE_TITLES['deep-research'], agents: deepResearchAgents },
  { id: 'paper-drafting', title: STAGE_TITLES['paper-drafting'], agents: paperDraftingAgents },
];

export interface PipelineArgs {
  ctx: ResearchContext;
  llm: LLMClient;
  emit: (e: AgentEvent) => void;
}

/** Run one stage's agents in order, isolating per-agent failures. */
async function runStage(
  stage: StageDef,
  ctx: ResearchContext,
  llm: LLMClient,
  emit: PipelineArgs['emit'],
): Promise<void> {
  emit({ type: 'stage.start', stage: stage.id, title: stage.title });
  for (const agent of stage.agents) {
    emit({ type: 'agent.start', agent: agent.name, title: agent.title, stage: agent.stage });
    try {
      await agent.run({ ctx, llm, emit });
    } catch (err) {
      emit({
        type: 'agent.error',
        agent: agent.name,
        message: (err as Error).message ?? String(err),
      });
    }
    emit({ type: 'agent.done', agent: agent.name });
  }
  emit({ type: 'stage.done', stage: stage.id });
}

/**
 * Run the full multi-stage pipeline (deep research → paper drafting).
 * Every agent's output follows the run's chosen language (injected once here).
 */
export async function runPipeline({ ctx, llm, emit }: PipelineArgs): Promise<void> {
  const langLlm = withLanguage(llm, ctx.language);
  emit({ type: 'run.start', runId: ctx.runId, topic: ctx.topic });
  for (const stage of STAGES) {
    await runStage(stage, ctx, langLlm, emit);
  }
  emit({ type: 'run.done', runId: ctx.runId });
}

/**
 * Milestone-1 pipeline: just the Deep Research stage. Kept for callers that
 * only want the research phase without drafting.
 */
export async function runDeepResearch({ ctx, llm, emit }: PipelineArgs): Promise<void> {
  const langLlm = withLanguage(llm, ctx.language);
  emit({ type: 'run.start', runId: ctx.runId, topic: ctx.topic });
  await runStage(STAGES[0], ctx, langLlm, emit);
  emit({ type: 'run.done', runId: ctx.runId });
}
