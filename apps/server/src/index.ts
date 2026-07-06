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
  runDeepResearch,
  PROVIDER_PRESETS,
  isOutputLanguage,
} from '@ars/core';
import type { TimestampedEvent, ProviderConfig } from '@ars/core';
import { RunStore } from './runStore.js';

const cfg = loadConfig();
const baseProvider = defaultProviderConfig(cfg);
const serverHasCreds = hasServerCredentials(cfg);
const store = new RunStore();

const app = new Hono();
app.use('/api/*', cors());

app.get('/api/health', (c) => c.json({ ok: true, service: 'ars-server', model: cfg.model }));

// Provider presets for the settings panel (no secrets).
app.get('/api/providers', (c) =>
  c.json({
    presets: PROVIDER_PRESETS,
    default: { provider: baseProvider.provider, model: baseProvider.model },
    defaultAvailable: serverHasCreds,
  }),
);

// Start a research run. Optional `provider` override supplies the user's own
// endpoint + key (used only for this run; never persisted or logged).
app.post('/api/runs', async (c) => {
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

  const run = store.create(topic);
  const ctx = createContext(run.id, topic, language);

  // Fire-and-forget; events flow to SSE subscribers.
  runDeepResearch({ ctx, llm, emit: (e) => store.emit(run, e) }).catch((err) => {
    store.emit(run, { type: 'run.error', message: (err as Error).message });
  });

  return c.json({ runId: run.id, provider: providerCfg.provider, model: providerCfg.model });
});

// Snapshot of a run (status + all events so far).
app.get('/api/runs/:id', (c) => {
  const run = store.get(c.req.param('id'));
  if (!run) return c.json({ error: 'not found' }, 404);
  return c.json({ id: run.id, topic: run.topic, status: run.status, events: run.events });
});

// Live event stream (replays history, then tails). Reconnect-safe.
app.get('/api/runs/:id/stream', (c) => {
  const run = store.get(c.req.param('id'));
  if (!run) return c.json({ error: 'not found' }, 404);

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
