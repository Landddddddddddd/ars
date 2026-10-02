import { describe, it, expect } from 'vitest';
import {
  PaperSchema,
  LiteratureResultSchema,
  CritiqueSchema,
  CitationCheckSchema,
  PaperDraftSchema,
  ReferenceSchema,
  OutlineSchema,
} from '../src/schemas';

describe('PaperSchema', () => {
  it('accepts a fully-populated paper', () => {
    const ok = PaperSchema.safeParse({
      title: 'Sparse Mixtures for Efficient Inference',
      authors: ['X. Puigcerver'],
      year: 2023,
      venue: 'ICML',
      summary: 'Soft routing over experts.',
      keyFindings: ['Fewer activated parameters', 'Stable training'],
    });
    expect(ok.success).toBe(true);
  });

  it('accepts nullable venue/year (metadata not always resolvable)', () => {
    const ok = PaperSchema.safeParse({
      title: 'Preprint without venue',
      authors: [],
      year: null,
      venue: null,
      summary: 's',
      keyFindings: [],
    });
    expect(ok.success).toBe(true);
  });

  it('rejects a non-integer year', () => {
    const bad = PaperSchema.safeParse({
      title: 't',
      authors: [],
      year: 2023.5,
      venue: null,
      summary: 's',
      keyFindings: [],
    });
    expect(bad.success).toBe(false);
  });

  it('rejects a missing summary', () => {
    const bad = PaperSchema.safeParse({
      title: 't',
      authors: [],
      year: 2023,
      venue: null,
      keyFindings: [],
    });
    expect(bad.success).toBe(false);
  });
});

describe('LiteratureResultSchema', () => {
  it('wraps a list of papers', () => {
    const ok = LiteratureResultSchema.safeParse({ papers: [] });
    expect(ok.success).toBe(true);
  });

  it('rejects a bare array (papers must be wrapped)', () => {
    const bad = LiteratureResultSchema.safeParse([]);
    expect(bad.success).toBe(false);
  });
});

describe('CritiqueSchema', () => {
  it('constrains severity to low/medium/high', () => {
    expect(
      CritiqueSchema.safeParse({
        target: 'method',
        issue: 'no baseline',
        severity: 'high',
        suggestion: 'add one',
      }).success,
    ).toBe(true);
    expect(
      CritiqueSchema.safeParse({
        target: 'method',
        issue: 'no baseline',
        severity: 'critical',
        suggestion: 'add one',
      }).success,
    ).toBe(false);
  });
});

describe('CitationCheckSchema', () => {
  it('treats optional status as optional', () => {
    const ok = CitationCheckSchema.safeParse({
      title: 'A',
      verified: true,
      matchedTitle: 'A',
      paperId: 'id',
      url: null,
      note: '',
    });
    expect(ok.success).toBe(true);
  });

  it('distinguishes not_found from lookup_failed', () => {
    const base = {
      title: 'A',
      verified: false,
      matchedTitle: null,
      paperId: null,
      url: null,
      note: 'n',
    };
    expect(CitationCheckSchema.safeParse({ ...base, status: 'not_found' }).success).toBe(true);
    expect(CitationCheckSchema.safeParse({ ...base, status: 'lookup_failed' }).success).toBe(true);
    // An unknown status must not slip through — it would be silently misread.
    expect(CitationCheckSchema.safeParse({ ...base, status: 'maybe' }).success).toBe(false);
  });
});

describe('PaperDraftSchema', () => {
  it('accepts a complete draft', () => {
    const ok = PaperDraftSchema.safeParse({
      title: 'T',
      abstract: 'A',
      sections: [{ id: 'intro', title: 'Introduction', content: 'c' }],
      references: [
        {
          citationKey: 'K',
          title: 'T',
          authors: ['A'],
          year: 2024,
          venue: null,
          url: null,
        },
      ],
    });
    expect(ok.success).toBe(true);
  });

  it('rejects a section missing its stable id', () => {
    const bad = PaperDraftSchema.safeParse({
      title: 'T',
      abstract: 'A',
      sections: [{ title: 'Introduction', content: 'c' }],
      references: [],
    });
    expect(bad.success).toBe(false);
  });
});

describe('OutlineSchema / ReferenceSchema', () => {
  it('accepts an outline with bullet points', () => {
    expect(
      OutlineSchema.safeParse({
        sections: [{ id: 'intro', title: 'Introduction', bullets: ['hook', 'gap'] }],
      }).success,
    ).toBe(true);
  });

  it('keeps venue and url nullable on references', () => {
    const ok = ReferenceSchema.safeParse({
      citationKey: 'K',
      title: 'T',
      authors: [],
      year: null,
      venue: null,
      url: null,
    });
    expect(ok.success).toBe(true);
  });
});
