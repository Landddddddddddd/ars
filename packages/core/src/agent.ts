import type { LLMClient } from './providers/types.js';
import type { ResearchContext } from './context.js';
import type { AgentEvent, StageId } from './events.js';
import type { Effort } from './config.js';

export interface AgentRunArgs {
  ctx: ResearchContext;
  llm: LLMClient;
  emit: (e: AgentEvent) => void;
}

/**
 * Every ARS agent — from the 4 in Milestone 1 to all 32 later — follows this shape.
 * `run` reads/writes the shared ResearchContext and emits events for the UI.
 */
export interface Agent {
  /** Stable id, kebab-case, e.g. 'literature-search'. */
  name: string;
  /** Human title, e.g. '文献调研'. */
  title: string;
  stage: StageId;
  /** One-line description of what this agent does. */
  role: string;
  /** Preferred reasoning effort for this agent's calls. */
  effort?: Effort;
  run(args: AgentRunArgs): Promise<void>;
}

export function defineAgent(agent: Agent): Agent {
  return agent;
}
