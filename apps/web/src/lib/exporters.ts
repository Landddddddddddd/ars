/**
 * Client-side paper exporters.
 *
 * Each exporter turns a finished `PaperData` into a downloadable file entirely
 * in the browser — no server round-trip, no model credentials involved.
 *
 * Formats:
 *  - Markdown  : the pre-assembled `paper.markdown` blob (mirrors the .md button)
 *  - LaTeX     : a self-contained `.tex` (ctex for CJK, hyperref, thebibliography)
 *  - DOCX      : a real Office `.docx` via the `docx` library (Packer.toBlob)
 *  - PDF       : a print-optimized window; the browser's print dialog lets the
 *                user "Save as PDF". Zero native dependency, works everywhere.
 *
 * The structured `PaperData` fields (title / abstract / sections / references)
 * are the source of truth so exports stay consistent with the on-screen render.
 */
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import type { PaperData } from '../components/PaperExport.js';

/** Filesystem-safe slug for download filenames (keeps CJK chars). */
function slug(title: string): string {
  const s = (title || 'paper')
    .replace(/[^\w一-龥]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || 'paper';
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Split body text into paragraphs on blank lines; trim + drop empties. */
function splitParas(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[ \t]+\n/g, '\n').trim())
    .filter((p) => p.length > 0);
}

// ── Markdown ────────────────────────────────────────────────────────────
export function exportMarkdown(paper: PaperData): void {
  triggerDownload(
    new Blob([paper.markdown], { type: 'text/markdown;charset=utf-8' }),
    `${slug(paper.title)}.md`,
  );
}

// ── LaTeX ───────────────────────────────────────────────────────────────
function escapeLatex(s: string): string {
  return s
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[&%$#_{}]/g, (m) => '\\' + m)
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

/** Light inline markdown → LaTeX: **bold**, *italic*, `code`. Best-effort. */
function inlineLatex(text: string): string {
  let out = escapeLatex(text);
  out = out.replace(/\*\*([^*]+)\*\*/g, '\\textbf{$1}');
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1\\textit{$2}');
  out = out.replace(/`([^`]+)`/g, '\\texttt{$1}');
  return out;
}

function latexBody(content: string): string {
  return splitParas(content)
    .map((p) => inlineLatex(p))
    .join('\n\n');
}

export function exportLatex(paper: PaperData): void {
  const L: string[] = [];
  L.push('\\documentclass[11pt]{article}');
  L.push('\\usepackage[UTF8]{ctex}'); // CJK (Chinese) support
  L.push('\\usepackage{geometry}');
  L.push('\\geometry{a4paper,margin=1in}');
  L.push('\\usepackage{hyperref}');
  L.push('\\hypersetup{colorlinks=true,linkcolor=blue,citecolor=blue,urlcolor=blue}');
  L.push('\\title{' + escapeLatex(paper.title || 'Untitled') + '}');
  L.push('\\author{}');
  L.push('\\date{}');
  L.push('\\begin{document}');
  L.push('\\maketitle');
  if (paper.abstract) {
    L.push('\\begin{abstract}');
    L.push(inlineLatex(paper.abstract));
    L.push('\\end{abstract}');
  }
  for (const s of paper.sections) {
    L.push('\\section{' + escapeLatex(s.title) + '}');
    L.push(latexBody(s.content));
  }
  if (paper.references.length > 0) {
    L.push('\\begin{thebibliography}{' + paper.references.length + '}');
    for (const r of paper.references) {
      const authors = escapeLatex(r.authors.join(', ') || 'Unknown');
      const year = r.year ?? 'n.d.';
      const venue = r.venue ? ' \\emph{' + escapeLatex(r.venue) + '}.' : '';
      const url = r.url ? ' \\url{' + r.url + '}' : '';
      L.push(
        '\\bibitem{' + r.citationKey + '} ' +
          authors + ' (' + year + '). ' +
          escapeLatex(r.title) + '.' + venue + url,
      );
    }
    L.push('\\end{thebibliography}');
  }
  L.push('\\end{document}');
  const tex = L.join('\n');
  triggerDownload(
    new Blob([tex], { type: 'application/x-tex;charset=utf-8' }),
    `${slug(paper.title)}.tex`,
  );
}

// ── DOCX ────────────────────────────────────────────────────────────────
export async function exportDocx(paper: PaperData): Promise<void> {
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      text: paper.title || 'Untitled',
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
  );

  if (paper.abstract) {
    children.push(new Paragraph({ text: '摘要', heading: HeadingLevel.HEADING_2 }));
    children.push(new Paragraph({ children: [new TextRun(paper.abstract)] }));
  }

  for (const s of paper.sections) {
    children.push(new Paragraph({ text: s.title, heading: HeadingLevel.HEADING_2 }));
    for (const para of splitParas(s.content)) {
      children.push(new Paragraph({ children: [new TextRun(para)] }));
    }
  }

  if (paper.references.length > 0) {
    children.push(new Paragraph({ text: '参考文献', heading: HeadingLevel.HEADING_2 }));
    for (const r of paper.references) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `[${r.citationKey}] `, bold: true }),
            new TextRun(`${r.authors.join(', ') || 'Unknown'} (${r.year ?? 'n.d.'}). `),
            new TextRun({ text: r.title, italics: true }),
            new TextRun(r.venue ? `. ${r.venue}` : ''),
            ...(r.url ? [new TextRun(`. ${r.url}`)] : []),
          ],
        }),
      );
    }
  }

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `${slug(paper.title)}.docx`);
}

// ── PDF (browser print → Save as PDF) ───────────────────────────────────
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPrintHtml(paper: PaperData): string {
  const sections = paper.sections
    .map(
      (s) =>
        `<section><h2>${escapeHtml(s.title)}</h2><div class="body">${escapeHtml(
          s.content,
        )}</div></section>`,
    )
    .join('');

  const refs = paper.references.length
    ? `<section><h2>参考文献</h2><ol>${paper.references
        .map(
          (r) =>
            `<li><span class="key">[${escapeHtml(r.citationKey)}]</span> ${escapeHtml(
              r.authors.join(', ') || 'Unknown',
            )} (${r.year ?? 'n.d.'}). <i>${escapeHtml(r.title)}</i>${
              r.venue ? `. ${escapeHtml(r.venue)}` : ''
            }${r.url ? `. <a href="${escapeHtml(r.url)}">${escapeHtml(r.url)}</a>` : ''}</li>`,
        )
        .join('')}</ol></section>`
    : '';

  return `<!doctype html><html><head><meta charset="utf-8">
<title>${escapeHtml(paper.title || 'paper')}</title>
<style>
  @page { margin: 22mm 20mm; }
  body { font: 12pt/1.7 'Times New Roman', Georgia, 'PingFang SC', 'Microsoft YaHei', serif; color:#111; }
  h1 { font-size: 20pt; text-align:center; margin: 0 0 6pt; }
  h2 { font-size: 14pt; margin: 18pt 0 6pt; border-bottom: 1px solid #ccc; padding-bottom:2pt; }
  .abstract { background:#f6f6f6; padding:10pt 14pt; border-radius:6px; margin:10pt 0; }
  .body { white-space: pre-wrap; }
  ol { padding-left: 20pt; }
  .key { color:#555; }
  a { color:#1a56db; }
  section { page-break-inside: avoid; }
</style></head><body>
<h1>${escapeHtml(paper.title || 'Untitled')}</h1>
${
  paper.abstract
    ? `<div class="abstract"><b>摘要　</b>${escapeHtml(paper.abstract)}</div>`
    : ''
}
${sections}${refs}
</body></html>`;
}

export function exportPdf(paper: PaperData): void {
  const html = buildPrintHtml(paper);
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');

  const cleanup = () => setTimeout(() => iframe.remove(), 1000);

  iframe.onload = () => {
    const w = iframe.contentWindow;
    if (!w) {
      cleanup();
      return;
    }
    w.addEventListener('afterprint', cleanup, { once: true });
    w.focus();
    // Allow layout/paint before invoking the print dialog.
    setTimeout(() => {
      try {
        w.print();
      } catch {
        cleanup();
      }
    }, 400);
  };

  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}
