import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { Effort } from '../config.js';
import type { GenArgs, LLMClient, Message, ParseArgs, ProviderConfig, ProviderKind } from './types.js';
import { extractJson, isBadRequest } from './util.js';

function messageText(msg: any): string {
  return (msg?.content ?? [])
    .filter((b: any) => b?.type === 'text')
    .map((b: any) => b.text)
    .join('');
}

const ALL_ON = { thinking: true, effortParam: true, structured: true, stream: true };

/** Anthropic Messages API — official or any Anthropic-compatible relay. */
export class AnthropicLLM implements LLMClient {
  readonly provider: ProviderKind = 'anthropic';
  readonly model: string;
  private client: Anthropic;
  private effort: Effort;
  private features: NonNullable<ProviderConfig['features']>;

  constructor(cfg: ProviderConfig) {
    this.model = cfg.model;
    this.effort = cfg.effort ?? 'medium';
    this.features = cfg.features ?? ALL_ON;
    const opts: Record<string, unknown> = {};
    if (cfg.authToken) opts.authToken = cfg.authToken;
    else if (cfg.apiKey) opts.apiKey = cfg.apiKey;
    if (cfg.baseURL) opts.baseURL = cfg.baseURL;
    this.client = new Anthropic(opts as any);
  }

  private baseParams(args: {
    system: string;
    messages: Message[];
    effort?: Effort;
    maxTokens: number;
    includeThinking: boolean;
    includeEffort: boolean;
  }): any {
    const params: any = {
      model: this.model,
      max_tokens: args.maxTokens,
      system: args.system,
      messages: args.messages.map((m) => ({ role: m.role, content: m.content })),
    };
    if (args.includeThinking && this.features.thinking) {
      params.thinking = { type: 'adaptive', display: 'summarized' };
    }
    if (args.includeEffort && this.features.effortParam) {
      params.output_config = { effort: args.effort ?? this.effort };
    }
    return params;
  }

  async generate(args: GenArgs): Promise<string> {
    const maxTokens = args.maxTokens ?? 16000;
    const canStream = this.features.stream && (args.onText || args.onThinking);

    const attempt = async (includeThinking: boolean, includeEffort: boolean) => {
      const params = this.baseParams({
        system: args.system,
        messages: args.messages,
        effort: args.effort,
        maxTokens,
        includeThinking,
        includeEffort,
      });
      if (canStream) {
        const stream = this.client.messages.stream(params);
        for await (const event of stream as any) {
          if (event.type === 'content_block_delta') {
            if (event.delta?.type === 'text_delta') args.onText?.(event.delta.text);
            else if (event.delta?.type === 'thinking_delta')
              args.onThinking?.(event.delta.thinking);
          }
        }
        return messageText(await stream.finalMessage());
      }
      const msg = await this.client.messages.create({ ...params, stream: false });
      return messageText(msg);
    };

    try {
      return await attempt(true, true);
    } catch (err) {
      if (isBadRequest(err)) return await attempt(false, false);
      throw err;
    }
  }

  async parse<T>(args: ParseArgs<T>): Promise<T> {
    const maxTokens = args.maxTokens ?? 16000;
    if (this.features.structured) {
      try {
        const params = this.baseParams({
          system: args.system,
          messages: args.messages,
          effort: args.effort,
          maxTokens,
          includeThinking: false,
          includeEffort: true,
        });
        params.output_config = {
          ...(params.output_config ?? {}),
          format: zodOutputFormat(args.schema as any),
        };
        const res: any = await (this.client.messages as any).parse(params);
        if (res?.parsed_output != null) return res.parsed_output as T;
        const parsed = args.schema.safeParse(JSON.parse(extractJson(messageText(res))));
        if (parsed.success) return parsed.data;
      } catch {
        /* fall through */
      }
    }
    return this.manualJson(args, maxTokens);
  }

  private async manualJson<T>(args: ParseArgs<T>, maxTokens: number): Promise<T> {
    const system =
      args.system +
      '\n\nRespond with ONLY a single valid JSON object matching the requested ' +
      'structure. No markdown fences, no commentary, no prose before or after.';
    const params = this.baseParams({
      system,
      messages: args.messages,
      effort: args.effort,
      maxTokens,
      includeThinking: false,
      includeEffort: true,
    });
    const run = async (p: any) => messageText(await this.client.messages.create({ ...p, stream: false }));
    let text: string;
    try {
      text = await run(params);
    } catch (err) {
      if (!isBadRequest(err)) throw err;
      delete params.thinking;
      delete params.output_config;
      text = await run(params);
    }
    const raw = extractJson(text);
    const parsed = args.schema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new Error('Structured parse failed: ' + parsed.error.message + '\nRaw: ' + raw.slice(0, 500));
    }
    return parsed.data;
  }
}
