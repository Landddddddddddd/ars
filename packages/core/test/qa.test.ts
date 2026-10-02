import { describe, it, expect } from 'vitest';
import { checkDraft, draftStats, summarizeIssues, countWords, citationKeysUsed } from '../src/qa';
import type { PaperDraft } from '../src/schemas';

const ref = (key: string, title: string, year: number | null = 2021) => ({
  citationKey: key,
  title,
  authors: ['A. Smith'],
  year,
  venue: 'NeurIPS',
  url: null,
});

/** A draft that should pass every structural check cleanly. */
function goodDraft(overrides: Partial<PaperDraft> = {}): PaperDraft {
  const long = (seed: string) =>
    `${seed}：`.padEnd(60, '本段用于测试篇幅是否达标，内容为占位性学术叙述。') +
    '参见 [Smith2021] 的方法与本工作的对比分析，结论在后续章节展开。';
  return {
    title: '稀疏路由的稳定性分析',
    abstract: 'A'.repeat(40) + '本文研究稀疏路由在长尾分布下的稳定性，提出一种轻量正则并给出上下界分析，实验覆盖三个公开基准。',
    sections: [
      { id: 'introduction', title: '引言', content: long('引言') },
      { id: 'method', title: '方法', content: long('方法') + ' 与 [Lee2022] 不同，本文不依赖额外标注。' },
    ],
    references: [ref('Smith2021', 'Routing Stability'), ref('Lee2022', 'Efficient Routing', 2022)],
    ...overrides,
  };
}

describe('countWords / citationKeysUsed', () => {
  it('counts CJK characters and latin words together', () => {
    expect(countWords('混合专家模型 routing')).toBe(6 + 1);
  });

  it('collects [Key] markers from the body only', () => {
    const keys = citationKeysUsed(
      goodDraft({
        sections: [{ id: 's', title: 'S', content: '见 [Smith2021] 与 [Lee2022] 以及 [Smith2021]。' }],
      }),
    );
    expect([...keys].sort()).toEqual(['Lee2022', 'Smith2021']);
  });
});

describe('checkDraft — clean draft', () => {
  it('reports no errors for a well-formed draft', () => {
    const issues = checkDraft(goodDraft());
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('computes stats including the cited ratio', () => {
    const s = draftStats(goodDraft());
    expect(s.sections).toBe(2);
    expect(s.references).toBe(2);
    expect(s.citedRatio).toBe(1);
    expect(s.words).toBeGreaterThan(0);
  });
});

describe('checkDraft — structural problems', () => {
  it('flags a missing/placeholder title', () => {
    expect(checkDraft(goodDraft({ title: '' })).some((i) => i.code === 'missing-title')).toBe(true);
    expect(checkDraft(goodDraft({ title: 'Untitled' })).some((i) => i.code === 'missing-title')).toBe(
      true,
    );
  });

  it('flags a missing or too-short abstract', () => {
    expect(checkDraft(goodDraft({ abstract: '' })).some((i) => i.code === 'missing-abstract')).toBe(
      true,
    );
    expect(checkDraft(goodDraft({ abstract: '太短' })).some((i) => i.code === 'short-abstract')).toBe(
      true,
    );
  });

  it('flags empty and thin sections', () => {
    const d = goodDraft({
      sections: [
        { id: 'a', title: 'A', content: '   ' },
        { id: 'b', title: 'B', content: '本段过短。' },
      ],
    });
    const codes = checkDraft(d).map((i) => i.code);
    expect(codes).toContain('empty-section');
    expect(codes).toContain('thin-section');
  });

  it('flags a draft with no sections at all', () => {
    expect(checkDraft(goodDraft({ sections: [] })).some((i) => i.code === 'no-sections')).toBe(true);
  });

  it('flags duplicated paragraphs across sections', () => {
    const para = 'X'.repeat(120);
    const d = goodDraft({
      sections: [
        { id: 'a', title: 'A', content: para },
        { id: 'b', title: 'B', content: para },
      ],
    });
    expect(checkDraft(d).some((i) => i.code === 'duplicate-paragraph')).toBe(true);
  });

  it('flags nested markdown headings inside a section', () => {
    const d = goodDraft({
      sections: [{ id: 'a', title: 'A', content: '### 子标题\n\n' + 'Y'.repeat(300) }],
    });
    expect(checkDraft(d).some((i) => i.code === 'nested-heading')).toBe(true);
  });
});

describe('checkDraft — citation integrity', () => {
  it('flags a reference that is never cited (死条目)', () => {
    const d = goodDraft({ references: [ref('Ghost2020', 'Never Cited')] });
    expect(checkDraft(d).some((i) => i.code === 'uncited-reference')).toBe(true);
  });

  it('flags a citation key with no reference entry (断链)', () => {
    const d = goodDraft({
      sections: [{ id: 'a', title: 'A', content: '见 [Missing2024] 的结论。' + 'Z'.repeat(300) }],
    });
    const err = checkDraft(d).find((i) => i.code === 'missing-reference');
    expect(err?.severity).toBe('error');
  });

  it('flags references with no references list at all', () => {
    expect(checkDraft(goodDraft({ references: [] })).some((i) => i.code === 'no-references')).toBe(
      true,
    );
  });

  it('flags duplicate references (same title twice)', () => {
    const d = goodDraft({
      sections: [{ id: 'a', title: 'A', content: '见 [Smith2021]。' + 'W'.repeat(300) }],
      references: [ref('Smith2021', 'Same Paper'), ref('Smith2021b', 'Same Paper')],
    });
    expect(checkDraft(d).some((i) => i.code === 'duplicate-reference')).toBe(true);
  });

  it('notes references without a year as lower-verifiability', () => {
    const d = goodDraft({
      sections: [{ id: 'a', title: 'A', content: '见 [Smith2021]。' + 'V'.repeat(300) }],
      references: [ref('Smith2021', 'No Year Paper', null)],
    });
    expect(checkDraft(d).some((i) => i.code === 'missing-year')).toBe(true);
  });
});

describe('checkDraft — anti-fabrication guard', () => {
  it('flags any reference whose title was not verified', () => {
    const issues = checkDraft(goodDraft(), { verifiedTitles: ['Routing Stability'] });
    const bad = issues.filter((i) => i.code === 'unverified-reference');
    expect(bad).toHaveLength(1);
    expect(bad[0].severity).toBe('error');
  });

  it('passes when every reference was verified (case/space-insensitive)', () => {
    const issues = checkDraft(goodDraft(), {
      verifiedTitles: ['routing   stability', 'Efficient Routing'],
    });
    expect(issues.some((i) => i.code === 'unverified-reference')).toBe(false);
  });

  it('skips the guard entirely when no verified list is supplied', () => {
    expect(checkDraft(goodDraft()).some((i) => i.code === 'unverified-reference')).toBe(false);
  });
});

describe('summarizeIssues', () => {
  it('counts by severity', () => {
    const issues = checkDraft(goodDraft({ title: '', abstract: '', references: [] }));
    const s = summarizeIssues(issues);
    expect(s.error).toBeGreaterThan(0);
    expect(s.error + s.warn + s.info).toBe(issues.length);
  });
});
