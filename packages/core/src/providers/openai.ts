import OpenAI from 'openai';
import * as z from 'zod/v4';
import type { GenArgs, LLMClient, Message, ParseArgs, ProviderConfig, ProviderKind } from './types.js';
import { extractJson, isBadRequest, stripThink, ThinkSplitter } from './util.js';

type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };

function toChat(system: string, messages: Message[]): ChatMsg[] {
  return [{ role: 'system', content: system }, ...messages.map((m) => ({ role: m.role, content: m.content }))];
}

/** OpenAI-compatible chat/completions — OpenAI, DeepSeek, Moonshot/Kimi, GLM, OpenRouter, … */
export class OpenAICompatibleLLM implements LLMClient {
  readonly provider: ProviderKind = 'openai';
  readonly model: string;
  private client: OpenAI;

  constructor(cfg: ProviderConfig) {
    this.model = cfg.model;
    this.client = new OpenAI({
      apiKey: cfg.apiKey ?? 'missing',
      baseURL: cfg.baseURL,
    });
  }

  /** create with a defensive retry that drops params some (reasoning) models reject. */
  private async create(params: any): Promise<any> {
    try {
      return await this.client.chat.completions.create(params);
    } catch (err) {
      if (isBadRequest(err) && (params.max_tokens || params.temperature !== undefined)) {
        const p = { ...params };
        delete p.max_tokens;
        delete p.temperature;
        return await this.client.chat.completions.create(p);
      }
      throw err;
    }
  }

  async generate(args: GenArgs): Promise<string> {
    const messages = toChat(args.system, args.messages);
    const maxTokens = args.maxTokens ?? 8192; // reasoning models need headroom
    const canStream = !!(args.onText || args.onThinking);

    if (canStream) {
      const stream: any = await this.create({ model: this.model, messages, stream: true, max_tokens: maxTokens });
      const splitter = new ThinkSplitter();
      let out = '';
      const emitText = (t: string) => {
        out += t;
        args.onText?.(t);
      };
      const emitThink = (t: string) => args.onThinking?.(t);
      for await (const chunk of stream) {
        const d: any = chunk.choices?.[0]?.delta;
        if (d?.reasoning_content) emitThink(d.reasoning_content); // deepseek-reasoner etc.
        if (d?.content) splitter.push(d.content, emitText, emitThink); // MiniMax inline <think>
      }
      splitter.flush(emitText, emitThink);
      return out;
    }
    const res = await this.create({ model: this.model, messages, max_tokens: maxTokens });
    return stripThink(res.choices?.[0]?.message?.content ?? '');
  }

  async parse<T>(args: ParseArgs<T>): Promise<T> {
    const jsonSchema = z.toJSONSchema(args.schema as any);
    const system =
      args.system +
      '\n\nReturn ONLY a single JSON object that conforms to this JSON schema ' +
      '(no markdown, no prose):\n' +
      JSON.stringify(jsonSchema);
    const messages = toChat(system, args.messages);
    const maxTokens = args.maxTokens ?? 8192;

    const tryParse = (text: string): T | null => {
      try {
        const p = args.schema.safeParse(JSON.parse(extractJson(text)));
        return p.success ? p.data : null;
      } catch {
        return null;
      }
    };

    // 1) strict json_schema (OpenAI); 2) json_object; 3) plain.
    const attempts = [
      {
        model: this.model,
        messages,
        max_tokens: maxTokens,
        response_format: { type: 'json_schema', json_schema: { name: 'result', schema: jsonSchema, strict: true } },
      },
      { model: this.model, messages, max_tokens: maxTokens, response_format: { type: 'json_object' } },
      { model: this.model, messages, max_tokens: maxTokens },
    ];

    let lastText = '';
    let lastErr: unknown = null;
    for (const params of attempts) {
      try {
        const res = await this.create(params);
        lastText = res.choices?.[0]?.message?.content ?? '';
        const ok = tryParse(lastText);
        if (ok) return ok;
      } catch (err) {
        lastErr = err; // e.g. 401 auth / network — surface it if nothing else worked
      }
    }
    // If the API calls themselves failed (auth, network), surface that real error.
    if (lastErr && !lastText) throw lastErr;
    throw new Error(
      '结构化解析失败：模型未返回可用 JSON（可能在思考中被 max_tokens 截断，或输出了非 JSON 文本）。' +
        'Raw: ' +
        stripThink(lastText).slice(0, 300),
    );
  }
}
