import type {
  Paper,
  ResearchQuestion,
  Critique,
  CitationCheck,
  OutlineSection,
  PaperDraft,
} from './schemas.js';
import type { OutputLanguage } from './language.js';

export interface ResearchContext {
  runId: string;
  topic: string;
  language: OutputLanguage;
  papers: Paper[];
  researchQuestions: ResearchQuestion[];
  critiques: Critique[];
  citationChecks: CitationCheck[];
  // Paper-drafting stage
  outline: OutlineSection[];
  draft: PaperDraft | null;
  draftReview: Critique[];
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
    outline: [],
    draft: null,
    draftReview: [],
    log: [],
  };
}
