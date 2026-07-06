import type { ArsConfig } from '../config.js';
import type { LLMClient, ProviderConfig } from './types.js';
import { AnthropicLLM } from './anthropic.js';
import { OpenAICompatibleLLM } from './openai.js';

export function createLLM(cfg: ProviderConfig): LLMClient {
  return cfg.provider === 'openai' ? new OpenAICompatibleLLM(cfg) : new AnthropicLLM(cfg);
}

/** The server's default provider, built from .env (the Anthropic relay). */
export function defaultProviderConfig(cfg: ArsConfig): ProviderConfig {
  return {
    provider: 'anthropic',
    model: cfg.model,
    apiKey: cfg.apiKey,
    authToken: cfg.authToken,
    baseURL: cfg.baseURL,
    effort: cfg.effort,
    features: cfg.features,
  };
}

/** Merge a partial user override (from the browser) onto the server default. */
export function resolveProviderConfig(
  base: ProviderConfig,
  override?: Partial<ProviderConfig> | null,
): ProviderConfig {
  if (!override) return base;
  const merged: ProviderConfig = { ...base, ...override };
  // A user override supplies its own creds — don't leak the server's relay token
  // into a different endpoint.
  if (override.provider === 'openai' || override.baseURL || override.apiKey || override.authToken) {
    merged.authToken = override.authToken;
    merged.apiKey = override.apiKey;
    merged.baseURL = override.baseURL ?? merged.baseURL;
    if (override.provider === 'openai') merged.features = undefined;
  }
  return merged;
}
