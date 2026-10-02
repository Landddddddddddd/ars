import { useCallback, useEffect, useRef, useState } from 'react';
import {
  startRun,
  streamRun,
  fetchProviders,
  fetchStages,
  fetchPricing,
  suggestTopics,
  fetchRuns,
  fetchRun,
  deleteRun,
  type TEvent,
  type QAIssue,
  type ProviderPreset,
  type OutputLanguage,
  type StageInfo,
  type Pricing,
  type SuggestedTopic,
  type RunSummary,
} from './api.js';
import { AgentCard, type AgentState } from './components/AgentCard.js';
import { PaperExport, isPaperData, type PaperData } from './components/PaperExport.js';
import {
  Settings,
  buildOverride,
  DEFAULT_SETTINGS,
  type SettingsState,
} from './components/Settings.js';
import { ApiError } from './api.js';
import { useAuth } from './auth.js';
import { AuthGate } from './components/AuthGate.js';
import { BuyCredits } from './components/BuyCredits.js';

const LS_KEY = 'ars.settings';
const LS_LANG = 'ars.lang';
const LS_RUN = 'ars.lastRunId';

function fmtTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString([], {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

const LANG_OPTIONS: { value: OutputLanguage; label: string }[] = [
  { value: 'auto', label: '自动（跟随课题）' },
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
];

type Status = 'idle' | 'running' | 'done' | 'error';

function freshAgents(stages: StageInfo[]): Record<string, AgentState> {
  const rec: Record<string, AgentState> = {};
  for (const s of stages) {
    for (const a of s.agents) {
      rec[a.name] = { name: a.name, title: a.title, status: 'pending', thinking: '', output: '' };
    }
  }
  return rec;
}

function loadSettings(): SettingsState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULT_SETTINGS;
}

type StageStatus = 'pending' | 'running' | 'done';

function stageStatusOf(stage: StageInfo, agents: Record<string, AgentState>): StageStatus {
  const states = stage.agents.map((a) => agents[a.name]?.status ?? 'pending');
  if (states.every((s) => s === 'pending')) return 'pending';
  if (states.every((s) => s === 'done' || s === 'error')) return 'done';
  return 'running';
}

export function App() {
  const { user, loading, logout, refreshMe } = useAuth();
  const [topic, setTopic] = useState('');
  const [buyOpen, setBuyOpen] = useState(false);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const runCost = pricing?.runCost ?? null;
  const [suggestions, setSuggestions] = useState<SuggestedTopic[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [stages, setStages] = useState<StageInfo[]>([]);
  const [agents, setAgents] = useState<Record<string, AgentState>>({});
  const [paper, setPaper] = useState<PaperData | null>(null);
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [settings, setSettings] = useState<SettingsState>(loadSettings);
  const [language, setLanguage] = useState<OutputLanguage>(
    () => (localStorage.getItem(LS_LANG) as OutputLanguage) || 'auto',
  );
  const closeRef = useRef<null | (() => void)>(null);

  // ---- Run history (durable on the server; survives refresh & restarts) ----
  const [history, setHistory] = useState<RunSummary[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState('');

  // Empty selection = run every stage. Cost is re-fetched when this changes.
  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  // The subset the server actually announced for the current run.
  const [activeStages, setActiveStages] = useState<string[] | null>(null);
  // Post-draft quality report (emitted as a run.qa event by the pipeline).
  const [qa, setQa] = useState<QAIssue[] | null>(null);
  const [qaStats, setQaStats] = useState<{
    sections: number;
    words: number;
    references: number;
    citedRatio: number;
  } | null>(null);

  const toggleStage = useCallback((id: string) => {
    setSelectedStages((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }, []);

  const loadHistory = useCallback((query?: string) => {
    fetchRuns(query)
      .then((runs) => setHistory(runs))
      .catch(() => setHistory(null));
  }, []);

  const removeRun = useCallback(
    async (id: string) => {
      if (status === 'running') return;
      const ok = await deleteRun(id);
      if (!ok) {
        alert('删除失败：该运行可能仍在进行中，或已被删除。');
        return;
      }
      loadHistory(historyQuery || undefined);
    },
    [status, historyQuery, loadHistory],
  );

  const openRun = useCallback(
    async (id: string) => {
      if (status === 'running') return;
      const snap = await fetchRun(id);
      if (!snap) return;
      closeRef.current?.();
      closeRef.current = null;
      localStorage.setItem(LS_RUN, id);
      setTopic(snap.topic);
      setSuggestions(null);
      setAgents(freshAgents(stages));
      setPaper(null);
      setQa(null);
      setQaStats(null);
      setActiveStages(null); // re-derived from the replayed run.stages event
      setStatus(snap.status === 'running' ? 'running' : (snap.status as Status));
      for (const e of snap.events ?? []) handleEvent(e as TEvent);
      // A still-running (live) run keeps streaming; archived ones are terminal.
      if (snap.status === 'running') closeRef.current = streamRun(snap.id, handleEvent);
    },
    [status, stages, handleEvent],
  );

  useEffect(() => {
    if (user) loadHistory();
  }, [user, loadHistory]);

  useEffect(() => {
    fetchProviders()
      .then((r) => setPresets(r.presets))
      .catch(() => setPresets([]));
    fetchStages()
      .then((s) => {
        setStages(s);
        setAgents(freshAgents(s));
      })
      .catch(() => setStages([]));
    fetchPricing()
      .then(setPricing)
      .catch(() => setPricing(null));
  }, []);

  // Re-price whenever the stage selection changes, so the UI always quotes the
  // cost of what will actually run.
  useEffect(() => {
    fetchPricing(selectedStages)
      .then(setPricing)
      .catch(() => setPricing(null));
  }, [selectedStages]);

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(LS_LANG, language);
  }, [language]);

  // Returning from a hosted checkout (Stripe/Alipay ?paid=1): the webhook has
  // likely credited the account already — refresh the balance and clean the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('paid') === '1') {
      refreshMe();
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [refreshMe]);

  const patch = useCallback((name: string, fn: (a: AgentState) => AgentState) => {
    setAgents((prev) => (prev[name] ? { ...prev, [name]: fn(prev[name]) } : prev));
  }, []);

  const handleEvent = useCallback(
    (e: TEvent) => {
      switch (e.type) {
        case 'agent.start':
          // Credits are charged when a step starts — refresh so the header ticks down.
          patch(e.agent, (a) => ({ ...a, status: 'running' }));
          refreshMe();
          break;
        case 'agent.thinking':
          patch(e.agent, (a) => ({ ...a, thinking: a.thinking + e.delta }));
          break;
        case 'agent.output':
          patch(e.agent, (a) => ({ ...a, output: a.output + e.delta }));
          break;
        case 'agent.result':
          patch(e.agent, (a) => ({ ...a, summary: e.summary, data: e.data }));
          if (isPaperData(e.data)) setPaper(e.data as PaperData);
          break;
        case 'agent.error':
          patch(e.agent, (a) => ({ ...a, status: 'error', error: e.message }));
          break;
        case 'agent.done':
          patch(e.agent, (a) => (a.status === 'error' ? a : { ...a, status: 'done' }));
          break;
        case 'run.start':
          setActiveStages(null);
          break;
        // Server-resolved stage subset: render only these stages for this run.
        case 'run.stages':
          setActiveStages(Array.isArray(e.stages) ? e.stages : null);
          break;
        case 'run.qa':
          setQa(Array.isArray(e.issues) ? (e.issues as QAIssue[]) : []);
          setQaStats(e.stats ?? null);
          break;
        case 'run.done':
          setStatus('done');
          loadHistory(); // the finished run is now archived — refresh the list
          break;
        case 'run.error':
          setStatus('error');
          refreshMe(); // a failed run refunds credits — reflect the new balance
          loadHistory();
          break;
      }
    },
    [patch, refreshMe, loadHistory],
  );

  // Run the pipeline on a specific, chosen topic. Reached only after the user
  // picks from the topic options — never straight from a broad direction.
  const run = useCallback(
    async (topicText: string) => {
      const t = topicText.trim();
      if (!t || status === 'running') return;
      // Pre-check: a full run needs runCost credits (charged step by step).
      if (runCost !== null && user && user.credits < runCost) {
        setBuyOpen(true);
        return;
      }
      setTopic(t);
      setSuggestions(null);
      closeRef.current?.();
      setAgents(freshAgents(stages));
      setPaper(null);
      setQa(null);
      setQaStats(null);
      setActiveStages(null);
      setStatus('running');
      try {
        const override = buildOverride(settings, presets);
        const runId = await startRun(
          t,
          override,
          language,
          selectedStages.length > 0 ? selectedStages : null,
        );
        localStorage.setItem(LS_RUN, runId);
        closeRef.current = streamRun(runId, handleEvent);
      } catch (err) {
        setStatus('idle');
        if (err instanceof ApiError && err.needCredits) {
          setBuyOpen(true); // out of credits → prompt top-up
        } else {
          alert((err as Error).message);
        }
      }
    },
    [status, handleEvent, settings, presets, language, stages, runCost, user, selectedStages],
  );

  // Step 1: turn the broad direction into focused topic options (free). This is
  // the mandatory gate before the pipeline — the user must pick a topic first.
  const suggest = useCallback(async () => {
    const d = topic.trim();
    if (!d || suggesting || status === 'running') return;
    setSuggesting(true);
    setSuggestions(null);
    try {
      const override = buildOverride(settings, presets);
      const topics = await suggestTopics(d, override, language);
      setSuggestions(topics);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSuggesting(false);
    }
  }, [topic, suggesting, status, settings, presets, language]);

  const shownStages =
    activeStages && activeStages.length > 0
      ? stages.filter((s) => activeStages.includes(s.id))
      : stages;

  if (loading) {
    return (
      <div className="page">
        <div className="empty">加载中…</div>
      </div>
    );
  }

  if (!user) return <AuthGate />;

  return (
    <div className="page">
      <header>
        <div className="header-row">
          <div>
            <h1>
              ARS <span className="sub">Academic-Research-Skills</span>
            </h1>
            <p className="tagline">多 Agent 驱动的学术研究流程 · 从课题到成稿</p>
          </div>
          <div className="userbar">
            <span className="user-email">{user.email}</span>
            <span className="credits-badge" title="剩余积分">
              {user.credits} 积分
            </span>
            <button className="buy-btn" onClick={() => setBuyOpen(true)}>
              充值
            </button>
            <button className="link-btn" onClick={() => logout()}>
              退出
            </button>
          </div>
        </div>
      </header>

      {presets.length > 0 && (
        <Settings
          presets={presets}
          value={settings}
          onChange={setSettings}
          disabled={status === 'running'}
        />
      )}

      <div className="langbar">
        <span className="lang-label">输出语言</span>
        {LANG_OPTIONS.map((o) => (
          <button
            key={o.value}
            className={`lang-btn ${language === o.value ? 'active' : ''}`}
            onClick={() => setLanguage(o.value)}
            disabled={status === 'running'}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="composer">
        <input
          value={topic}
          placeholder="输入大体研究方向，例如：大语言模型在教育中的应用"
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && suggest()}
          disabled={status === 'running' || suggesting}
        />
        <button
          onClick={suggest}
          disabled={status === 'running' || suggesting || !topic.trim()}
          title="先把大体方向变成几个聚焦课题，选定后再进入研究"
        >
          {suggesting ? '生成课题中…' : status === 'running' ? '研究中…' : '获取课题选项'}
        </button>
      </div>

      <div className="history">
        <button
          className="history-toggle"
          onClick={() => {
            setHistoryOpen((o) => !o);
            loadHistory(historyQuery || undefined);
          }}
        >
          🕘 历史记录{history ? `（${history.length}）` : ''}
        </button>
        {historyOpen && (
          <div className="history-panel">
            <div className="history-search">
              <input
                value={historyQuery}
                placeholder="搜索课题关键词…"
                onChange={(e) => setHistoryQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadHistory(historyQuery || undefined)}
              />
              <button className="paper-btn" onClick={() => loadHistory(historyQuery || undefined)}>
                搜索
              </button>
              {historyQuery && (
                <button
                  className="link-btn"
                  onClick={() => {
                    setHistoryQuery('');
                    loadHistory();
                  }}
                >
                  清空
                </button>
              )}
            </div>
            {!history ? (
              <div className="empty">历史加载中…</div>
            ) : history.length === 0 ? (
              <div className="empty">还没有历史运行——完成一次研究后会自动存档，刷新页面也不会丢。</div>
            ) : (
              history.map((r) => (
                <div key={r.id} className="history-row">
                  <button
                    className="history-item"
                    onClick={() => openRun(r.id)}
                    title="点击恢复这次运行的完整过程与成稿"
                  >
                    <span
                      className={`stage-dot ${
                        r.status === 'done' ? 'done' : r.status === 'error' ? 'error' : 'running'
                      }`}
                    />
                    <span className="history-topic">{r.topic}</span>
                    <span className="history-meta">{fmtTime(r.updatedAt)}</span>
                    <span className="history-meta">
                      {r.source === 'archived' ? '存档' : '进行中'}
                    </span>
                  </button>
                  <button
                    className="history-del"
                    title="删除这条历史记录"
                    onClick={() => removeRun(r.id)}
                    disabled={status === 'running'}
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {suggestions && (
        <div className="suggestions">
          <div className="suggestions-head">
            <span>选择一个课题开始研究（点选即进入文献调研，消耗 {runCost ?? '—'} 积分）</span>
            <button className="link-btn" onClick={() => setSuggestions(null)}>
              返回修改方向
            </button>
          </div>

          {/* Escape hatch: proceed with the user's own wording. */}
          <button className="suggestion own" onClick={() => run(topic)}>
            <span className="suggestion-title">直接用我输入的方向</span>
            <span className="suggestion-why">{topic.trim()}</span>
          </button>

          {suggestions.length === 0 ? (
            <div className="empty">未能生成更多聚焦课题，可直接用上面的方向开始。</div>
          ) : (
            suggestions.map((s, i) => (
              <button key={i} className="suggestion" onClick={() => run(s.title)}>
                <span className="suggestion-title">{s.title}</span>
                <span className="suggestion-why">{s.rationale}</span>
              </button>
            ))
          )}
        </div>
      )}

      <div className="stage-picker">
        <span className="lang-label">执行阶段</span>
        {stages.map((s) => {
          const on = selectedStages.length === 0 || selectedStages.includes(s.id);
          return (
            <button
              key={s.id}
              className={`lang-btn ${on ? 'active' : ''}`}
              disabled={status === 'running'}
              onClick={() => {
                // First click on an implicit "all" state selects just that one.
                if (selectedStages.length === 0) setSelectedStages(stages.map((x) => x.id));
                toggleStage(s.id);
              }}
              title={`${s.title} · ${pricing?.stages.find((p) => p.id === s.id)?.subtotal ?? '—'} 积分`}
            >
              {s.title}
            </button>
          );
        })}
        {selectedStages.length > 0 && (
          <button
            className="link-btn"
            disabled={status === 'running'}
            onClick={() => setSelectedStages([])}
          >
            恢复全部阶段
          </button>
        )}
      </div>

      {pricing && (
        <div className="cost-hint">
          逐步计费：
          {pricing.stages.map((s, i) => (
            <span key={s.id}>
              {i > 0 && ' + '}
              {s.title} {s.steps} 步 × {s.perStep} 分
            </span>
          ))}
          ，合计 <b>{pricing.runCost}</b> 积分（论文写作阶段单步计费更高；失败自动全额退还）。
        </div>
      )}

      {status === 'idle' ? (
        <div className="empty">输入大体研究方向 →「获取课题选项」→ 选定一个聚焦课题,再进入文献调研与论文写作,实时观察每个 Agent 的思考与产出,最后得到可导出的论文成稿。</div>
      ) : (
        shownStages.map((stage) => {
          const st = stageStatusOf(stage, agents);
          const doneCount = stage.agents.filter(
            (a) => agents[a.name]?.status === 'done',
          ).length;
          return (
            <section key={stage.id} className="stage">
              <div className="stagebar">
                <div className="stage-label">
                  <span className={`stage-dot ${st}`} /> {stage.title} · {doneCount}/
                  {stage.agents.length}
                </div>
                <div className="stage-track">
                  {stage.agents.map((a) => (
                    <div
                      key={a.name}
                      className={`pip ${agents[a.name]?.status ?? 'pending'}`}
                      title={a.title}
                    />
                  ))}
                </div>
              </div>
              <div className="timeline">
                {stage.agents.map((a) => (
                  <AgentCard key={a.name} agent={agents[a.name]} />
                ))}
              </div>
            </section>
          );
        })
      )}

      {qa && qa.length > 0 && (
        <div className="qa-panel">
          <div className="qa-head">
            <span className="paper-badge">成稿质检</span>
            <span className="qa-counts">
              {qa.filter((i) => i.severity === 'error').length > 0 && (
                <span className="qa-chip error">
                  {qa.filter((i) => i.severity === 'error').length} 项严重
                </span>
              )}
              {qa.filter((i) => i.severity === 'warn').length > 0 && (
                <span className="qa-chip warn">
                  {qa.filter((i) => i.severity === 'warn').length} 项提醒
                </span>
              )}
              {qa.filter((i) => i.severity === 'info').length > 0 && (
                <span className="qa-chip info">
                  {qa.filter((i) => i.severity === 'info').length} 项提示
                </span>
              )}
              {qaStats && (
                <span className="qa-meta">
                  {qaStats.sections} 节 · 约 {qaStats.words} 词 · {qaStats.references} 条参考文献 ·
                  引用覆盖 {Math.round(qaStats.citedRatio * 100)}%
                </span>
              )}
            </span>
          </div>
          <ul className="qa-list">
            {qa.map((issue, i) => (
              <li key={i} className={`qa-item ${issue.severity}`}>
                <span className="qa-sev">{issue.severity}</span>
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {paper && <PaperExport paper={paper} />}

      {buyOpen && (
        <BuyCredits
          onClose={() => setBuyOpen(false)}
          onCredited={refreshMe}
        />
      )}
    </div>
  );
}
