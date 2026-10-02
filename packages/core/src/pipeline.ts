import type { LLMClient } from './providers/types.js';
import type { ResearchContext } from './context.js';
import { withLanguage } from './language.js';
import { checkDraft, draftStats } from './qa.js';
import { withRetry } from './retry.js';
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
  /**
   * Optional stage subset to run (e.g. only 'deep-research'). When omitted or
   * empty, the full pipeline runs. Unknown ids are ignored; if no valid id
   * remains, this falls back to the full pipeline rather than running nothing.
   */
  stages?: string[];
}

/** Resolve a requested stage-id subset into ordered stage definitions. */
export function resolveStages(ids?: string[] | null): StageDef[] {
  if (!ids || ids.length === 0) return STAGES;
  const wanted = new Set(ids);
  const picked = STAGES.filter((s) => wanted.has(s.id));
  return picked.length > 0 ? picked : STAGES;
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
    // Resilience: a single transient failure (network / 429 / 5xx / timeout)
    // should not blank out a whole section. Retry those with backoff; if every
    // retry fails, fall back to the agent's degraded writer when provided.
    const maxAttempts = Math.max(1, agent.retry ?? 3);
    try {
      await withRetry(() => agent.run({ ctx, llm, emit }), {
        retries: maxAttempts - 1,
        baseDelayMs: 600,
        maxDelayMs: 8000,
        onRetry: ({ attempt, error, delayMs }) =>
          emit({ type: 'agent.retry', agent: agent.name, attempt, delayMs, message: error.message }),
      });
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      if (agent.fallback) {
        try {
          await agent.fallback({ ctx, llm, emit });
          emit({ type: 'agent.fallback', agent: agent.name, reason: message });
        } catch {
          emit({ type: 'agent.error', agent: agent.name, message });
        }
      } else {
        emit({ type: 'agent.error', agent: agent.name, message });
      }
    }
    emit({ type: 'agent.done', agent: agent.name });
  }
  emit({ type: 'stage.done', stage: stage.id });
}

/**
 * Run the full multi-stage pipeline (deep research → paper drafting).
 * Every agent's output follows the run's chosen language (injected once here).
 */
export async function runPipeline({ ctx, llm, emit, stages }: PipelineArgs): Promise<void> {
  const langLlm = withLanguage(llm, ctx.language);
  const selected = resolveStages(stages);
  emit({ type: 'run.start', runId: ctx.runId, topic: ctx.topic });
  emit({ type: 'run.stages', stages: selected.map((s) => s.id) });
  for (const stage of selected) {
    await runStage(stage, ctx, langLlm, emit);
  }
  // Quality gate: report structural / citation problems instead of shipping
  // them silently. Only meaningful when a draft was actually produced.
  if (ctx.draft) {
    const verifiedTitles = ctx.citationChecks.filter((c) => c.verified).map((c) => c.title);
    const issues = checkDraft(ctx.draft, { verifiedTitles });
    emit({ type: 'run.qa', issues, stats: draftStats(ctx.draft) });
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
