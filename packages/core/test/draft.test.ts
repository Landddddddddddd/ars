import { describe, it, expect } from 'vitest';
import { assembleMarkdown } from '../src/draft';
import type { PaperDraft } from '../src/schemas';

const base: PaperDraft = {
  title: 'A Controlled Study of Adaptive Routing',
  abstract: 'We measure length–accuracy trade-offs.',
  sections: [
    { id: 'introduction', title: 'Introduction', content: 'Body of the introduction.' },
    { id: 'method', title: 'Method', content: 'Body of the method.' },
  ],
  references: [
    {
      citationKey: 'Smith2021',
      title: 'Adaptive Routing for Reasoning',
      authors: ['A. Smith', 'B. Lee'],
      year: 2021,
      venue: 'NeurIPS',
      url: 'https://example.org/paper',
    },
  ],
};

describe('assembleMarkdown', () => {
  it('renders the title as an H1', () => {
    expect(assembleMarkdown(base).startsWith('# A Controlled Study of Adaptive Routing')).toBe(
      true,
    );
  });

  it('falls back to "Untitled" when the title is empty', () => {
    expect(assembleMarkdown({ ...base, title: '' })).toContain('# Untitled');
  });

  it('emits an Abstract section only when an abstract exists', () => {
    expect(assembleMarkdown(base)).toContain('## Abstract');
    expect(assembleMarkdown({ ...base, abstract: '' })).not.toContain('## Abstract');
  });

  it('renders every section as an H2 followed by its prose', () => {
    const md = assembleMarkdown(base);
    expect(md).toContain('## Introduction');
    expect(md).toContain('Body of the introduction.');
    expect(md).toContain('## Method');
  });

  it('formats references as a bulleted citation list', () => {
    const md = assembleMarkdown(base);
    expect(md).toContain('## References');
    expect(md).toContain(
      '- [Smith2021] A. Smith, B. Lee (2021). Adaptive Routing for Reasoning. *NeurIPS*. https://example.org/paper',
    );
  });

  it('omits the References heading when there are no references', () => {
    const md = assembleMarkdown({ ...base, references: [] });
    expect(md).not.toContain('## References');
  });

  it('handles a reference with no authors and no year', () => {
    const md = assembleMarkdown({
      ...base,
      references: [
        {
          citationKey: 'Anon',
          title: 'Unknown Provenance',
          authors: [],
          year: null,
          venue: null,
          url: null,
        },
      ],
    });
    expect(md).toContain('- [Anon] Unknown (n.d.). Unknown Provenance.');
  });

  it('joins blocks with a blank line so Markdown parsers see separate blocks', () => {
    const md = assembleMarkdown(base);
    expect(md).toContain('# A Controlled Study of Adaptive Routing\n\n## Abstract');
  });
});
