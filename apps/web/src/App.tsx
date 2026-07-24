import { useCallback, useEffect, useRef, useState } from 'react';
import {
  startRun,
  streamRun,
  fetchProviders,
  fetchStages,
  fetchPricing,
  suggestTopics,
  type TEvent,
  type ProviderPreset,
  type OutputLanguage,
  type StageInfo,
  type Pricing,
  type SuggestedTopic,
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
        case 'run.done':
          setStatus('done');
          break;
        case 'run.error':
          setStatus('error');
          refreshMe(); // a failed run refunds credits — reflect the new balance
          break;
      }
    },
    [patch, refreshMe],
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
      setStatus('running');
      try {
        const override = buildOverride(settings, presets);
        const runId = await startRun(t, override, language);
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
    [status, handleEvent, settings, presets, language, stages, runCost, user],
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
        stages.map((stage) => {
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
