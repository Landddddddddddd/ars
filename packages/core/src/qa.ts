import type { PaperDraft } from './schemas.js';

/**
 * Post-draft quality assurance. The pipeline can produce structurally valid but
 * low-quality artifacts (a section that never got written, a citation key that
 * never made it into the reference list, a reference that no citation-verifier
 * ever confirmed). These checks catch that at the output boundary, where it can
 * still be reported instead of silently shipped.
 *
 * Pure and dependency-free by design: no LLM, no network, fully unit-testable.
 */

export type QASeverity = 'error' | 'warn' | 'info';

export interface QAIssue {
  code: string;
  severity: QASeverity;
  message: string;
  sectionId?: string;
}

export interface QAOptions {
  /** Titles confirmed by the citation verifier. When provided, any reference
   *  outside this set is flagged — the anti-fabrication guard. */
  verifiedTitles?: string[];
  /** Minimum characters for a section body before it's called thin. */
  minSectionChars?: number;
}

export interface DraftStats {
  sections: number;
  words: number;
  references: number;
  /** Share of references actually cited somewhere in the body (0–1). */
  citedRatio: number;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Count CJK characters + latin words — a rough but stable length proxy. */
export function countWords(text: string): number {
  const cjk = (text.match(/[一-龥]/g) ?? []).length;
  const latin = (text.replace(/[一-龥]/g, ' ').match(/[A-Za-z0-9][A-Za-z0-9'-]*/g) ?? []).length;
  return cjk + latin;
}

/** Every [Key] marker appearing in the body text. */
export function citationKeysUsed(draft: PaperDraft): Set<string> {
  const used = new Set<string>();
  const re = /\[([A-Za-z][A-Za-z0-9_-]{1,40})\]/g;
  for (const s of draft.sections) {
    for (const m of s.content.matchAll(re)) used.add(m[1]);
  }
  return used;
}

export function draftStats(draft: PaperDraft): DraftStats {
  const words = draft.sections.reduce((n, s) => n + countWords(s.content), 0) + countWords(draft.abstract);
  const used = citationKeysUsed(draft);
  const cited = draft.references.filter((r) => used.has(r.citationKey)).length;
  return {
    sections: draft.sections.length,
    words,
    references: draft.references.length,
    citedRatio: draft.references.length === 0 ? 0 : cited / draft.references.length,
  };
}

/** Run every structural / citation-integrity check on a finished draft. */
export function checkDraft(draft: PaperDraft, opts: QAOptions = {}): QAIssue[] {
  const issues: QAIssue[] = [];
  const minChars = opts.minSectionChars ?? 220;

  // ── Title ────────────────────────────────────────────────────────────────
  if (!draft.title || !draft.title.trim() || /^untitled$/i.test(draft.title.trim())) {
    issues.push({ code: 'missing-title', severity: 'error', message: '标题缺失或仍为占位符。' });
  } else if (draft.title.trim().length > 160) {
    issues.push({
      code: 'long-title',
      severity: 'info',
      message: `标题偏长（${draft.title.trim().length} 字符），建议精简到 120 字符以内。`,
    });
  }

  // ── Abstract ─────────────────────────────────────────────────────────────
  const abs = (draft.abstract ?? '').trim();
  if (abs.length === 0) {
    issues.push({ code: 'missing-abstract', severity: 'error', message: '摘要缺失。' });
  } else if (countWords(abs) < 80) {
    issues.push({
      code: 'short-abstract',
      severity: 'warn',
      message: `摘要过短（约 ${countWords(abs)} 词），应交代问题、方法与贡献。`,
    });
  } else if (countWords(abs) > 700) {
    issues.push({ code: 'long-abstract', severity: 'info', message: '摘要偏长，建议压缩。' });
  }

  // ── Sections ─────────────────────────────────────────────────────────────
  if (draft.sections.length === 0) {
    issues.push({ code: 'no-sections', severity: 'error', message: '正文没有任何章节。' });
  }
  for (const s of draft.sections) {
    const body = (s.content ?? '').trim();
    if (body.length === 0) {
      issues.push({
        code: 'empty-section',
        severity: 'error',
        sectionId: s.id,
        message: `章节「${s.title}」内容为空。`,
      });
    } else if (body.length < minChars) {
      issues.push({
        code: 'thin-section',
        severity: 'warn',
        sectionId: s.id,
        message: `章节「${s.title}」偏短（${body.length} 字符），论证可能不充分。`,
      });
    }
    // Nested markdown headings break the flat H2 structure used by the exporters.
    if (/^#{2,4}\s/m.test(s.content)) {
      issues.push({
        code: 'nested-heading',
        severity: 'info',
        sectionId: s.id,
        message: `章节「${s.title}」内嵌了 Markdown 标题，导出时层级可能错乱。`,
      });
    }
  }

  // Duplicate paragraphs across sections (a classic copy-paste artifact).
  const seen = new Map<string, string>();
  for (const s of draft.sections) {
    for (const para of s.content.split(/\n\s*\n/)) {
      const key = norm(para);
      if (key.length < 60) continue;
      if (seen.has(key)) {
        issues.push({
          code: 'duplicate-paragraph',
          severity: 'warn',
          sectionId: s.id,
          message: `段落与章节「${seen.get(key)}」重复。`,
        });
      } else {
        seen.set(key, s.title);
      }
    }
  }

  // ── References ───────────────────────────────────────────────────────────
  if (draft.references.length === 0) {
    issues.push({ code: 'no-references', severity: 'error', message: '参考文献列表为空。' });
  }

  const used = citationKeysUsed(draft);
  const keys = new Set(draft.references.map((r) => r.citationKey));

  for (const r of draft.references) {
    if (!used.has(r.citationKey)) {
      issues.push({
        code: 'uncited-reference',
        severity: 'warn',
        message: `参考文献 [${r.citationKey}] 未在正文中被引用。`,
      });
    }
    if (r.year == null) {
      issues.push({
        code: 'missing-year',
        severity: 'info',
        message: `参考文献 [${r.citationKey}] 缺少年份，可核验性下降。`,
      });
    }
  }

  for (const k of used) {
    if (!keys.has(k)) {
      issues.push({
        code: 'missing-reference',
        severity: 'error',
        message: `正文引用了 [${k}]，但参考文献列表中没有该条目（导出后将是断链）。`,
      });
    }
  }

  const byTitle = new Map<string, number>();
  for (const r of draft.references) {
    const k = norm(r.title);
    byTitle.set(k, (byTitle.get(k) ?? 0) + 1);
  }
  for (const [title, n] of byTitle) {
    if (n > 1) {
      issues.push({
        code: 'duplicate-reference',
        severity: 'warn',
        message: `参考文献「${title.slice(0, 40)}…」重复出现 ${n} 次。`,
      });
    }
  }

  // ── Anti-fabrication: only verified titles may be cited ───────────────────
  if (opts.verifiedTitles && opts.verifiedTitles.length > 0) {
    const ok = new Set(opts.verifiedTitles.map(norm));
    for (const r of draft.references) {
      if (!ok.has(norm(r.title))) {
        issues.push({
          code: 'unverified-reference',
          severity: 'error',
          message: `参考文献「${r.title.slice(0, 40)}…」未通过文献核验，可能是编造条目。`,
        });
      }
    }
  }

  return issues;
}

/** Count issues per severity — handy for a one-line UI badge. */
export function summarizeIssues(issues: QAIssue[]): Record<QASeverity, number> {
  const out: Record<QASeverity, number> = { error: 0, warn: 0, info: 0 };
  for (const i of issues) out[i.severity] = (out[i.severity] ?? 0) + 1;
  return out;
}
