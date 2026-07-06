import { useCallback, useEffect, useRef, useState } from 'react';
import {
  startRun,
  streamRun,
  fetchProviders,
  type TEvent,
  type ProviderPreset,
  type OutputLanguage,
} from './api.js';
import { AgentCard, type AgentState } from './components/AgentCard.js';
import {
  Settings,
  buildOverride,
  DEFAULT_SETTINGS,
  type SettingsState,
} from './components/Settings.js';

const AGENT_ORDER: { name: string; title: string }[] = [
  { name: 'literature-search', title: '文献调研' },
  { name: 'citation-verifier', title: '文献溯源' },
  { name: 'research-question', title: '研究问题构建' },
  { name: 'devils-advocate', title: '魔鬼代言人' },
];

const LS_KEY = 'ars.settings';
const LS_LANG = 'ars.lang';

const LANG_OPTIONS: { value: OutputLanguage; label: string }[] = [
  { value: 'auto', label: '自动（跟随课题）' },
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
];

type Status = 'idle' | 'running' | 'done' | 'error';

function freshAgents(): Record<string, AgentState> {
  const rec: Record<string, AgentState> = {};
  for (const a of AGENT_ORDER) {
    rec[a.name] = { name: a.name, title: a.title, status: 'pending', thinking: '', output: '' };
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

export function App() {
  const [topic, setTopic] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [agents, setAgents] = useState<Record<string, AgentState>>(freshAgents);
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
  }, []);

  useEffect(() => {
    // Persist settings (including key) locally for convenience.
    localStorage.setItem(LS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(LS_LANG, language);
  }, [language]);

  const patch = useCallback((name: string, fn: (a: AgentState) => AgentState) => {
    setAgents((prev) => (prev[name] ? { ...prev, [name]: fn(prev[name]) } : prev));
  }, []);

  const handleEvent = useCallback(
    (e: TEvent) => {
      switch (e.type) {
        case 'agent.start':
          patch(e.agent, (a) => ({ ...a, status: 'running' }));
          break;
        case 'agent.thinking':
          patch(e.agent, (a) => ({ ...a, thinking: a.thinking + e.delta }));
          break;
        case 'agent.output':
          patch(e.agent, (a) => ({ ...a, output: a.output + e.delta }));
          break;
        case 'agent.result':
          patch(e.agent, (a) => ({ ...a, summary: e.summary, data: e.data }));
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
          break;
      }
    },
    [patch],
  );

  const start = useCallback(async () => {
    const t = topic.trim();
    if (!t || status === 'running') return;
    closeRef.current?.();
    setAgents(freshAgents());
    setStatus('running');
    try {
      const override = buildOverride(settings, presets);
      const runId = await startRun(t, override, language);
      closeRef.current = streamRun(runId, handleEvent);
    } catch (err) {
      setStatus('error');
      alert((err as Error).message);
    }
  }, [topic, status, handleEvent, settings, presets, language]);

  const doneCount = AGENT_ORDER.filter((a) => agents[a.name]?.status === 'done').length;

  return (
    <div className="page">
      <header>
        <h1>
          ARS <span className="sub">Academic-Research-Skills</span>
        </h1>
        <p className="tagline">多 Agent 驱动的学术研究流程 · Deep Research（M1 垂直切片）</p>
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
          placeholder="输入研究课题，例如：大语言模型在系统性文献综述中的应用"
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && start()}
          disabled={status === 'running'}
        />
        <button onClick={start} disabled={status === 'running' || !topic.trim()}>
          {status === 'running' ? '研究中…' : '开始研究'}
        </button>
      </div>

      <div className="stagebar">
        <div className="stage-label">
          Deep Research（深度研究） · {doneCount}/{AGENT_ORDER.length}
          {status === 'done' && ' ✓'}
          {status === 'error' && ' ✗'}
        </div>
        <div className="stage-track">
          {AGENT_ORDER.map((a) => (
            <div key={a.name} className={`pip ${agents[a.name]?.status}`} title={a.title} />
          ))}
        </div>
      </div>

      <div className="timeline">
        {status === 'idle' ? (
          <div className="empty">输入课题并点击「开始研究」，实时观察各 Agent 的思考与产出。</div>
        ) : (
          AGENT_ORDER.map((a) => <AgentCard key={a.name} agent={agents[a.name]} />)
        )}
      </div>
    </div>
  );
}
