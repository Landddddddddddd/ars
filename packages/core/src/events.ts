import type { Paper, ResearchQuestion, Critique, CitationCheck } from './schemas.js';

export type StageId = 'deep-research' | 'paper-drafting';

export type AgentEvent =
  | { type: 'run.start'; runId: string; topic: string }
  | { type: 'stage.start'; stage: StageId; title: string }
  | { type: 'agent.start'; agent: string; title: string; stage: StageId }
  | { type: 'agent.thinking'; agent: string; delta: string }
  | { type: 'agent.output'; agent: string; delta: string }
  | { type: 'agent.result'; agent: string; summary: string; data?: unknown }
  | { type: 'agent.error'; agent: string; message: string }
  | { type: 'agent.done'; agent: string }
  | { type: 'stage.done'; stage: StageId }
  | { type: 'run.done'; runId: string }
  | { type: 'run.error'; message: string };

export type TimestampedEvent = AgentEvent & { ts: number; seq: number };

export type Emit = (e: AgentEvent) => void;

/** Convenience payload passed to agents alongside the shared context. */
export interface ResultPayloads {
  papers: Paper[];
  researchQuestions: ResearchQuestion[];
  critiques: Critique[];
  citationChecks: CitationCheck[];
}
