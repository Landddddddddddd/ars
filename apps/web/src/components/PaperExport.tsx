import { useState } from 'react';

export interface PaperData {
  title: string;
  abstract: string;
  sections: { id: string; title: string; content: string }[];
  references: {
    citationKey: string;
    title: string;
    authors: string[];
    year: number | null;
    venue: string | null;
    url: string | null;
  }[];
  markdown: string;
}

/** Best-effort test that an agent.result payload is the final paper artifact. */
export function isPaperData(data: unknown): data is PaperData {
  return (
    !!data &&
    typeof data === 'object' &&
    typeof (data as any).markdown === 'string' &&
    Array.isArray((data as any).sections)
  );
}

export function PaperExport({ paper }: { paper: PaperData }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(paper.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  const download = () => {
    const blob = new Blob([paper.markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const slug = (paper.title || 'paper').replace(/[^\w一-龥]+/g, '-').slice(0, 60);
    a.href = url;
    a.download = `${slug || 'paper'}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="paper">
      <div className="paper-head">
        <span className="paper-badge">成稿</span>
        <div className="paper-actions">
          <button className="paper-btn" onClick={copy}>
            {copied ? '✓ 已复制' : '复制全文'}
          </button>
          <button className="paper-btn primary" onClick={download}>
            下载 .md
          </button>
        </div>
      </div>

      <h2 className="paper-title">{paper.title}</h2>
      {paper.abstract && (
        <p className="paper-abstract">
          <b>摘要　</b>
          {paper.abstract}
        </p>
      )}

      {paper.sections.map((s) => (
        <section key={s.id} className="paper-section">
          <h3>{s.title}</h3>
          <pre className="paper-body">{s.content}</pre>
        </section>
      ))}

      {paper.references.length > 0 && (
        <section className="paper-section">
          <h3>参考文献</h3>
          <ol className="paper-refs">
            {paper.references.map((r, i) => (
              <li key={i}>
                <span className="muted">[{r.citationKey}]</span> {r.authors.join(', ')} (
                {r.year ?? 'n.d.'}). <b>{r.title}</b>
                {r.venue ? `. ${r.venue}` : ''}
                {r.url && (
                  <>
                    {' '}
                    <a href={r.url} target="_blank" rel="noreferrer">
                      链接
                    </a>
                  </>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
