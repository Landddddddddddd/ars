import * as z from 'zod/v4';

export const PaperSchema = z.object({
  title: z.string(),
  authors: z.array(z.string()),
  year: z.number().int().nullable(),
  venue: z.string().nullable(),
  summary: z.string(),
  keyFindings: z.array(z.string()),
});
export type Paper = z.infer<typeof PaperSchema>;

export const LiteratureResultSchema = z.object({
  papers: z.array(PaperSchema),
});
export type LiteratureResult = z.infer<typeof LiteratureResultSchema>;

export const ResearchQuestionSchema = z.object({
  question: z.string(),
  rationale: z.string(),
  objectives: z.array(z.string()),
  hypothesis: z.string().nullable(),
});
export type ResearchQuestion = z.infer<typeof ResearchQuestionSchema>;

export const ResearchQuestionSetSchema = z.object({
  questions: z.array(ResearchQuestionSchema),
});
export type ResearchQuestionSet = z.infer<typeof ResearchQuestionSetSchema>;

export const CritiqueSchema = z.object({
  target: z.string(),
  issue: z.string(),
  severity: z.enum(['low', 'medium', 'high']),
  suggestion: z.string(),
});
export type Critique = z.infer<typeof CritiqueSchema>;

export const CritiqueSetSchema = z.object({
  critiques: z.array(CritiqueSchema),
});
export type CritiqueSet = z.infer<typeof CritiqueSetSchema>;

export const CitationCheckSchema = z.object({
  title: z.string(),
  verified: z.boolean(),
  matchedTitle: z.string().nullable(),
  paperId: z.string().nullable(),
  url: z.string().nullable(),
  note: z.string(),
});
export type CitationCheck = z.infer<typeof CitationCheckSchema>;
