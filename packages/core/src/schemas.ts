import * as z from 'zod/v4';

export const PaperSchema = z.object({
  title: z.string(),
  authors: z.array(z.string()),
  year: z.number().int().nullable(),
  venue: z.string().nullable(),
  summary: z.string(),
  keyFindings: z.array(z.string()),
  // Real identity carried from Semantic Scholar retrieval (absent for any
  // fallback/memory-sourced entry). When present, the paper is already known
  // to exist, so downstream verification can trust it.
  paperId: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
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
  // Distinguishes a genuinely-unfound citation from a transient lookup failure
  // (rate-limit/network) — the latter must NOT be read as "fabricated".
  status: z.enum(['verified', 'not_found', 'lookup_failed']).optional(),
  matchedTitle: z.string().nullable(),
  paperId: z.string().nullable(),
  url: z.string().nullable(),
  note: z.string(),
});
export type CitationCheck = z.infer<typeof CitationCheckSchema>;

// ── Paper-drafting stage ──────────────────────────────────────────────────

/** One planned section in the outline (before any prose is written). */
export const OutlineSectionSchema = z.object({
  id: z.string(), // stable slug, e.g. 'introduction'
  title: z.string(),
  bullets: z.array(z.string()), // planned talking points
});
export type OutlineSection = z.infer<typeof OutlineSectionSchema>;

export const OutlineSchema = z.object({
  sections: z.array(OutlineSectionSchema),
});
export type Outline = z.infer<typeof OutlineSchema>;

/** A section once its prose has been written (Markdown body). */
export const DraftSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(), // Markdown prose
});
export type DraftSection = z.infer<typeof DraftSectionSchema>;

export const DraftSectionSetSchema = z.object({
  sections: z.array(DraftSectionSchema),
});
export type DraftSectionSet = z.infer<typeof DraftSectionSetSchema>;

/** A reference entry, derived from a verified paper. */
export const ReferenceSchema = z.object({
  citationKey: z.string(), // inline key, e.g. 'Smith2021'
  title: z.string(),
  authors: z.array(z.string()),
  year: z.number().int().nullable(),
  venue: z.string().nullable(),
  url: z.string().nullable(),
});
export type Reference = z.infer<typeof ReferenceSchema>;

/** citation-weaver output: sections with inline citations + the reference list. */
export const WovenDraftSchema = z.object({
  sections: z.array(DraftSectionSchema),
  references: z.array(ReferenceSchema),
});
export type WovenDraft = z.infer<typeof WovenDraftSchema>;

/** abstract-title output. */
export const AbstractTitleSchema = z.object({
  title: z.string(),
  abstract: z.string(),
});
export type AbstractTitle = z.infer<typeof AbstractTitleSchema>;

/** The evolving paper artifact held on the context. */
export const PaperDraftSchema = z.object({
  title: z.string(),
  abstract: z.string(),
  sections: z.array(DraftSectionSchema),
  references: z.array(ReferenceSchema),
});
export type PaperDraft = z.infer<typeof PaperDraftSchema>;
