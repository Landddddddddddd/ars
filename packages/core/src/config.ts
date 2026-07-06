import { config as loadDotenv } from 'dotenv';

// Load .env from the repo root (npm scripts run with cwd = repo root).
loadDotenv();

function flag(name: string, def: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  return v === '1' || v.toLowerCase() === 'true';
}

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ArsConfig {
  authToken?: string;
  apiKey?: string;
  baseURL?: string;
  model: string;
  effort: Effort;
  features: {
    thinking: boolean;
    effortParam: boolean;
    structured: boolean;
    stream: boolean;
  };
  semanticScholarApiKey?: string;
}

export function hasServerCredentials(cfg: ArsConfig): boolean {
  return !!(cfg.authToken || cfg.apiKey);
}

export function loadConfig(): ArsConfig {
  // Server credentials are optional: on a public deployment users bring their own
  // key via the UI, so a missing server key must NOT crash the server — the
  // "default" provider simply won't work until creds are set.
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN || undefined;
  const apiKey = process.env.ANTHROPIC_API_KEY || undefined;
  return {
    authToken,
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
    model: process.env.ARS_MODEL || 'claude-opus-4-8',
    effort: (process.env.ARS_EFFORT as Effort) || 'medium',
    features: {
      thinking: flag('ARS_THINKING', true),
      effortParam: flag('ARS_EFFORT_PARAM', true),
      structured: flag('ARS_STRUCTURED', true),
      stream: flag('ARS_STREAM', true),
    },
    semanticScholarApiKey: process.env.SEMANTIC_SCHOLAR_API_KEY || undefined,
  };
}
