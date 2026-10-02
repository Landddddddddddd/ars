import type { Paper, ResearchQuestion, Critique, CitationCheck } from './schemas.js';
import type { QAIssue, DraftStats } from './qa.js';

export type StageId = 'deep-research' | 'paper-drafting';

export type AgentEvent =
  | { type: 'run.start'; runId: string; topic: string }
  // Which stages this run will execute — lets the UI render only the selected
  // stages when a subset was requested instead of the full pipeline.
  | { type: 'run.stages'; stages: string[] }
  | { type: 'stage.start'; stage: StageId; title: string }
  | { type: 'agent.start'; agent: string; title: string; stage: StageId }
  | { type: 'agent.thinking'; agent: string; delta: string }
  | { type: 'agent.output'; agent: string; delta: string }
  | { type: 'agent.result'; agent: string; summary: string; data?: unknown }
  | { type: 'agent.error'; agent: string; message: string }
  | { type: 'agent.done'; agent: string }
  | { type: 'stage.done'; stage: StageId }
  // Post-draft quality report (structural + citation-integrity checks).
  | { type: 'run.qa'; issues: QAIssue[]; stats: DraftStats }
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
