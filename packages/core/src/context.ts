import type { Paper, ResearchQuestion, Critique, CitationCheck } from './schemas.js';
import type { OutputLanguage } from './language.js';

export interface ResearchContext {
  runId: string;
  topic: string;
  language: OutputLanguage;
  papers: Paper[];
  researchQuestions: ResearchQuestion[];
  critiques: Critique[];
  citationChecks: CitationCheck[];
  log: string[];
}

export function createContext(
  runId: string,
  topic: string,
  language: OutputLanguage = 'auto',
): ResearchContext {
  return {
    runId,
    topic,
    language,
    papers: [],
    researchQuestions: [],
    critiques: [],
    citationChecks: [],
    log: [],
  };
}
