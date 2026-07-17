import { STAGES } from '@ars/core';

// Step-by-step credit pricing with per-stage weighting. A "step" is one agent
// invocation. Research steps are cheap; paper-drafting steps cost more (that's
// where the real value — a finished paper — is produced). Cost is charged per
// step as the run progresses; the signup bonus defaults to exactly one full run.

function int(name: string, def: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : def;
}

/** Base credits for one research step. */
export const CREDITS_PER_STEP = int('CREDITS_PER_STEP', 1);

/** Per-stage weight multipliers (× CREDITS_PER_STEP). Drafting weighs more. */
const STAGE_WEIGHT: Record<string, number> = {
  'deep-research': int('RESEARCH_STEP_WEIGHT', 1),
  'paper-drafting': int('DRAFTING_STEP_WEIGHT', 3),
};

function weightForStage(stageId: string): number {
  return STAGE_WEIGHT[stageId] ?? 1;
}

/** Credit cost of a single step in a given stage. */
export function stageStepCost(stageId: string): number {
  return CREDITS_PER_STEP * weightForStage(stageId);
}

// Per-agent cost lookup, derived from the pipeline so it stays correct as agents
// are added/moved between stages.
const STEP_COST_BY_AGENT = new Map<string, number>();
for (const stage of STAGES) {
  for (const agent of stage.agents) {
    STEP_COST_BY_AGENT.set(agent.name, stageStepCost(stage.id));
  }
}

/** Credits charged when a specific agent step starts. */
export function stepCost(agentName: string): number {
  return STEP_COST_BY_AGENT.get(agentName) ?? CREDITS_PER_STEP;
}

/** Total credits for one full run (sum of every step's weighted cost). */
export const FULL_RUN_COST = [...STEP_COST_BY_AGENT.values()].reduce((a, b) => a + b, 0);

/** Free credits on signup — defaults to exactly one full run. */
export const SIGNUP_BONUS_CREDITS = int('SIGNUP_BONUS_CREDITS', FULL_RUN_COST);

export interface StageCost {
  id: string;
  title: string;
  steps: number;
  perStep: number;
  subtotal: number;
}

/** Per-stage cost breakdown for the UI. */
export function costBreakdown(): StageCost[] {
  return STAGES.map((s) => ({
    id: s.id,
    title: s.title,
    steps: s.agents.length,
    perStep: stageStepCost(s.id),
    subtotal: s.agents.length * stageStepCost(s.id),
  }));
}
