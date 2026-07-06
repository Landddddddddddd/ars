export interface TEvent {
  type: string;
  ts: number;
  seq: number;
  [k: string]: any;
}

export type ProviderKind = 'anthropic' | 'openai';
export type OutputLanguage = 'auto' | 'zh' | 'en';

export interface ProviderPreset {
  id: string;
  label: string;
  provider: ProviderKind;
  baseURL?: string;
  models: string[];
  needsKey: boolean;
  note?: string;
}

export interface ProviderOverride {
  provider: ProviderKind;
  model: string;
  apiKey?: string;
  authToken?: string;
  baseURL?: string;
}

export async function fetchProviders(): Promise<{
  presets: ProviderPreset[];
  default: { provider: string; model: string };
}> {
  const r = await fetch('/api/providers');
  return r.json();
}

export async function startRun(
  topic: string,
  provider?: ProviderOverride | null,
  language: OutputLanguage = 'auto',
): Promise<string> {
  const r = await fetch('/api/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topic, provider: provider ?? null, language }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? 'failed to start run');
  return j.runId as string;
}

export function streamRun(runId: string, onEvent: (e: TEvent) => void): () => void {
  const es = new EventSource(`/api/runs/${runId}/stream`);
  es.onmessage = (m) => {
    const e = JSON.parse(m.data) as TEvent;
    onEvent(e);
    if (e.type === 'run.done' || e.type === 'run.error') es.close();
  };
  return () => es.close();
}
