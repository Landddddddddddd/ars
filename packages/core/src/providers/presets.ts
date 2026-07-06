import type { ProviderKind } from './types.js';

export interface ProviderPreset {
  id: string;
  label: string;
  provider: ProviderKind;
  baseURL?: string;
  models: string[];
  needsKey: boolean;
  note?: string;
}

/**
 * Shown in the web settings panel. Models are suggestions — any string is allowed.
 * Providers with separate China / international sites are split into two entries so
 * the endpoint always matches where the key was issued (mismatched region → auth error,
 * e.g. MiniMax 2049).
 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'default',
    label: '默认（服务器 .env）',
    provider: 'anthropic',
    models: [],
    needsKey: false,
    note: '使用服务器 .env 中的凭据，无需填写。',
  },

  // ── Anthropic ──────────────────────────────────────────────
  {
    id: 'anthropic',
    label: 'Anthropic 官方',
    provider: 'anthropic',
    baseURL: 'https://api.anthropic.com',
    models: ['claude-opus-4-8', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
    needsKey: true,
  },
  {
    id: 'anthropic-relay',
    label: 'Anthropic 兼容中转（自定义）',
    provider: 'anthropic',
    baseURL: '',
    models: ['claude-opus-4-8'],
    needsKey: true,
    note: '填中转的 Base URL + token（Bearer 鉴权）。',
  },

  // ── OpenAI ─────────────────────────────────────────────────
  {
    id: 'openai',
    label: 'OpenAI',
    provider: 'openai',
    baseURL: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'o4-mini'],
    needsKey: true,
  },

  // ── DeepSeek（全球单一端点）─────────────────────────────────
  {
    id: 'deepseek',
    label: 'DeepSeek',
    provider: 'openai',
    baseURL: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    needsKey: true,
  },

  // ── MiniMax（国内 / 国际）──────────────────────────────────
  {
    id: 'minimax-cn',
    label: 'MiniMax（国内）',
    provider: 'openai',
    baseURL: 'https://api.minimaxi.com/v1',
    models: ['MiniMax-M3', 'MiniMax-M2.5', 'MiniMax-M2'],
    needsKey: true,
    note: '国内平台 platform.minimaxi.com 的 key。M3 思考过程实时显示。',
  },
  {
    id: 'minimax-global',
    label: 'MiniMax（国际）',
    provider: 'openai',
    baseURL: 'https://api.minimax.io/v1',
    models: ['MiniMax-M3', 'MiniMax-M2.5', 'MiniMax-M2'],
    needsKey: true,
    note: '国际平台 platform.minimax.io 的 key。',
  },

  // ── Moonshot / Kimi（国内 / 国际）──────────────────────────
  {
    id: 'moonshot-cn',
    label: 'Moonshot / Kimi（国内）',
    provider: 'openai',
    baseURL: 'https://api.moonshot.cn/v1',
    models: ['kimi-k2-0711-preview', 'moonshot-v1-32k', 'moonshot-v1-8k'],
    needsKey: true,
    note: '国内平台 platform.moonshot.cn 的 key。',
  },
  {
    id: 'moonshot-global',
    label: 'Moonshot / Kimi（国际）',
    provider: 'openai',
    baseURL: 'https://api.moonshot.ai/v1',
    models: ['kimi-k2-0711-preview', 'kimi-latest', 'moonshot-v1-8k'],
    needsKey: true,
    note: '国际平台 platform.moonshot.ai 的 key。',
  },

  // ── 智谱 GLM（国内 / 国际 Z.ai）────────────────────────────
  {
    id: 'zhipu-cn',
    label: '智谱 GLM（国内）',
    provider: 'openai',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4.6', 'glm-4-plus', 'glm-4'],
    needsKey: true,
    note: '国内平台 open.bigmodel.cn 的 key。',
  },
  {
    id: 'zhipu-global',
    label: '智谱 GLM / Z.ai（国际）',
    provider: 'openai',
    baseURL: 'https://api.z.ai/api/paas/v4',
    models: ['glm-4.6', 'glm-4.5', 'glm-4.5-air'],
    needsKey: true,
    note: '国际平台 z.ai 的 key。',
  },

  // ── 聚合 / 自定义 ──────────────────────────────────────────
  {
    id: 'openrouter',
    label: 'OpenRouter',
    provider: 'openai',
    baseURL: 'https://openrouter.ai/api/v1',
    models: ['anthropic/claude-opus-4', 'openai/gpt-4o', 'deepseek/deepseek-chat'],
    needsKey: true,
  },
  {
    id: 'custom',
    label: '自定义（OpenAI 兼容）',
    provider: 'openai',
    baseURL: '',
    models: [],
    needsKey: true,
    note: '手动填 Base URL / 模型 / API Key。',
  },
];
