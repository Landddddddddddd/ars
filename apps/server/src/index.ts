import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import {
  loadConfig,
  hasServerCredentials,
  createLLM,
  defaultProviderConfig,
  resolveProviderConfig,
  createContext,
  runPipeline,
  STAGES,
  PROVIDER_PRESETS,
  isOutputLanguage,
} from '@ars/core';
import type { TimestampedEvent, ProviderConfig } from '@ars/core';
import { RunStore } from './runStore.js';
import { authRoutes } from './routes/auth.js';
import { billingRoutes } from './routes/billing.js';
import { requireAuth, type AuthVars } from './auth.js';
import { charge, refund, isInsufficient } from './credits.js';
import { RUN_COST_CREDITS } from './env.js';

const cfg = loadConfig();
const baseProvider = defaultProviderConfig(cfg);
const serverHasCreds = hasServerCredentials(cfg);
// Refund the run's charge if it fails before producing anything useful.
const store = new RunStore((run) => refund(run.userId, RUN_COST_CREDITS, run.id));

const app = new Hono<{ Variables: AuthVars }>();
// CORS must allow credentials so the session cookie flows on same-origin/proxied
// requests. In dev, Vite proxies /api to this server so it stays same-origin.
app.use('/api/*', cors({ origin: (o) => o, credentials: true }));

app.route('/api/auth', authRoutes);
app.route('/api/billing', billingRoutes);

app.get('/api/health', (c) => c.json({ ok: true, service: 'ars-server', model: cfg.model }));

// Provider presets for the settings panel (no secrets).
app.get('/api/providers', (c) =>
  c.json({
    presets: PROVIDER_PRESETS,
    default: { provider: baseProvider.provider, model: baseProvider.model },
    defaultAvailable: serverHasCreds,
  }),
);

// Pipeline shape (stages + their agents) so the UI can render itself dynamically.
app.get('/api/stages', (c) =>
  c.json({
    stages: STAGES.map((s) => ({
      id: s.id,
      title: s.title,
      agents: s.agents.map((a) => ({ name: a.name, title: a.title, role: a.role })),
    })),
  }),
);

// Start a research run. Requires auth; charges RUN_COST_CREDITS up front and
// refunds on failure (via the RunStore onRunFailed hook). Optional `provider`
// override supplies the user's own endpoint + key (used only for this run).
app.post('/api/runs', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req
    .json<{ topic?: string; provider?: Partial<ProviderConfig> | null; language?: string }>()
    .catch(() => ({}) as { topic?: string; provider?: Partial<ProviderConfig> | null; language?: string });

  const topic = (body.topic ?? '').trim();
  if (!topic) return c.json({ error: 'topic is required' }, 400);

  const language = isOutputLanguage(body.language) ? body.language : 'auto';

  if (body.provider && !body.provider.apiKey && !body.provider.authToken) {
    return c.json({ error: '选择自定义模型时需要提供 API Key' }, 400);
  }

  const providerCfg = resolveProviderConfig(baseProvider, body.provider ?? null);
  let llm;
  try {
    llm = createLLM(providerCfg);
  } catch (err) {
    return c.json({ error: 'Failed to init model: ' + (err as Error).message }, 400);
  }

  const run = store.create(topic, user.id);

  // Charge before starting. Insufficient balance → 402 so the UI can prompt top-up.
  let balance: number;
  try {
    balance = charge(user.id, RUN_COST_CREDITS, 'run.charge', run.id);
  } catch (err) {
    if (isInsufficient(err)) {
      return c.json({ error: '积分不足，请先充值', needCredits: true, cost: RUN_COST_CREDITS }, 402);
    }
    throw err;
  }

  const ctx = createContext(run.id, topic, language);

  // Fire-and-forget; events flow to SSE subscribers. A thrown error emits
  // run.error, which triggers the store's refund hook.
  runPipeline({ ctx, llm, emit: (e) => store.emit(run, e) }).catch((err) => {
    store.emit(run, { type: 'run.error', message: (err as Error).message });
  });

  return c.json({
    runId: run.id,
    provider: providerCfg.provider,
    model: providerCfg.model,
    credits: balance,
  });
});

// Snapshot of a run (status + all events so far). Owner-only.
app.get('/api/runs/:id', requireAuth, (c) => {
  const run = store.get(c.req.param('id') ?? '');
  if (!run || run.userId !== c.get('user').id) return c.json({ error: 'not found' }, 404);
  return c.json({ id: run.id, topic: run.topic, status: run.status, events: run.events });
});

// Live event stream (replays history, then tails). Reconnect-safe. Owner-only.
app.get('/api/runs/:id/stream', requireAuth, (c) => {
  const run = store.get(c.req.param('id') ?? '');
  if (!run || run.userId !== c.get('user').id) return c.json({ error: 'not found' }, 404);

  return streamSSE(c, async (stream) => {
    const queue: TimestampedEvent[] = [];
    const seen = new Set<number>();
    let notify: (() => void) | null = null;
    const listener = (e: TimestampedEvent) => {
      queue.push(e);
      notify?.();
    };
    run.listeners.add(listener);

    const write = async (e: TimestampedEvent) => {
      if (seen.has(e.seq)) return false;
      seen.add(e.seq);
      await stream.writeSSE({ data: JSON.stringify(e) });
      return e.type === 'run.done' || e.type === 'run.error';
    };

    try {
      // Replay everything already recorded.
      for (const e of [...run.events]) {
        if (await write(e)) return;
      }
      // If the run already finished during replay, we're done.
      if (run.status !== 'running' && queue.length === 0) return;

      // Tail new events.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        while (queue.length) {
          const e = queue.shift()!;
          if (await write(e)) return;
        }
        if (run.status !== 'running' && queue.length === 0) return;
        await new Promise<void>((resolve) => {
          notify = resolve;
        });
        notify = null;
      }
    } finally {
      run.listeners.delete(listener);
    }
  });
});

// Serve the built frontend in production (apps/web/dist). In dev, Vite serves it
// on :5173 and proxies /api here, so these handlers simply 404 (dist not built).
const WEB_DIR = process.env.ARS_WEB_DIR ?? './apps/web/dist';
app.use('/*', serveStatic({ root: WEB_DIR }));
app.get('*', serveStatic({ path: `${WEB_DIR}/index.html` })); // SPA fallback

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`ARS server on http://localhost:${port}  (model: ${cfg.model})`);
if (!serverHasCreds) {
  console.log('ℹ 未配置服务器凭据（ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY）——用户需在界面自带 key。');
}
