import { useState } from 'react';

export interface AgentState {
  name: string;
  title: string;
  status: 'pending' | 'running' | 'done' | 'error';
  thinking: string;
  output: string;
  summary?: string;
  data?: unknown;
  error?: string;
}

const STATUS_LABEL: Record<AgentState['status'], string> = {
  pending: '待运行',
  running: '运行中',
  done: '完成',
  error: '错误',
};

export function AgentCard({ agent }: { agent: AgentState }) {
  const [showThinking, setShowThinking] = useState(false);
  if (!agent) return null;

  return (
    <div className={`card ${agent.status}`}>
      <div className="card-head">
        <span className={`dot ${agent.status}`} />
        <span className="card-title">{agent.title}</span>
        <span className="card-name">{agent.name}</span>
        <span className={`badge ${agent.status}`}>{STATUS_LABEL[agent.status]}</span>
      </div>

      {agent.error && <div className="err">✗ {agent.error}</div>}

      {agent.thinking && (
        <div className="thinking">
          <button className="link" onClick={() => setShowThinking((s) => !s)}>
            {showThinking ? '▾ 隐藏思考' : '▸ 显示思考过程'}
          </button>
          {showThinking && <pre className="thinking-body">{agent.thinking}</pre>}
        </div>
      )}

      {agent.output && <pre className="output">{agent.output}</pre>}

      {agent.summary && <div className="summary">✔ {agent.summary}</div>}
      {agent.data != null && <Result name={agent.name} data={agent.data} />}
    </div>
  );
}

function Result({ name, data }: { name: string; data: unknown }) {
  if (!Array.isArray(data)) return null;

  if (name === 'literature-search') {
    return (
      <ul className="result">
        {data.map((p: any, i) => (
          <li key={i}>
            <b>{p.title}</b> <span className="muted">({p.year ?? 'n.d.'})</span>
            <div className="muted">{(p.authors ?? []).join(', ')}</div>
            <div>{p.summary}</div>
          </li>
        ))}
      </ul>
    );
  }

  if (name === 'citation-verifier') {
    return (
      <ul className="result">
        {data.map((c: any, i) => (
          <li key={i}>
            <span className={c.verified ? 'ok' : 'bad'}>{c.verified ? '✓' : '✗'}</span>{' '}
            <b>{c.title}</b>
            <div className="muted">{c.note}</div>
            {c.url && (
              <a href={c.url} target="_blank" rel="noreferrer">
                Semantic Scholar
              </a>
            )}
          </li>
        ))}
      </ul>
    );
  }

  if (name === 'research-question') {
    return (
      <ol className="result">
        {data.map((q: any, i) => (
          <li key={i}>
            <b>{q.question}</b>
            <div className="muted">{q.rationale}</div>
            {q.hypothesis && <div>假设：{q.hypothesis}</div>}
          </li>
        ))}
      </ol>
    );
  }

  if (name === 'devils-advocate') {
    return (
      <ul className="result">
        {data.map((c: any, i) => (
          <li key={i}>
            <span className={`sev ${c.severity}`}>{c.severity}</span> <b>{c.issue}</b>
            <div className="muted">针对：{c.target}</div>
            <div>建议：{c.suggestion}</div>
          </li>
        ))}
      </ul>
    );
  }

  return null;
}
