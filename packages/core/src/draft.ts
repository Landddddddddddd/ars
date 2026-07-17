import type { PaperDraft, Reference } from './schemas.js';

function formatReference(r: Reference): string {
  const authors = r.authors.length > 0 ? r.authors.join(', ') : 'Unknown';
  const year = r.year ?? 'n.d.';
  const venue = r.venue ? ` *${r.venue}*.` : '';
  const link = r.url ? ` ${r.url}` : '';
  return `- [${r.citationKey}] ${authors} (${year}). ${r.title}.${venue}${link}`;
}

/**
 * Assemble a PaperDraft into a single standard-format Markdown document.
 * Single source of truth for both the CLI printout and the web download.
 */
export function assembleMarkdown(draft: PaperDraft): string {
  const parts: string[] = [];

  parts.push(`# ${draft.title || 'Untitled'}`);

  if (draft.abstract) {
    parts.push(`## Abstract\n\n${draft.abstract}`);
  }

  for (const s of draft.sections) {
    parts.push(`## ${s.title}\n\n${s.content}`);
  }

  if (draft.references.length > 0) {
    const refs = draft.references.map(formatReference).join('\n');
    parts.push(`## References\n\n${refs}`);
  }

  return parts.join('\n\n');
}
