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
      '\n\nReturn ONLY a single JSON object that is an INSTANCE of the schema below, ' +
      'with real values filled in. Do NOT return the schema itself; never output keys ' +
      'named "$schema", "properties", or "type". No markdown, no prose.\n\nSchema:\n' +
      JSON.stringify(jsonSchema);
    const messages = toChat(system, args.messages);
    const maxTokens = args.maxTokens ?? 8192;

    // Weak relay models sometimes echo the JSON Schema back instead of an instance.
    // It's valid JSON, so JSON.parse succeeds — detect it and treat as a miss.
    const looksLikeSchema = (o: any): boolean =>
      !!o &&
      typeof o === 'object' &&
      !Array.isArray(o) &&
      ('$schema' in o || (o.type === 'object' && 'properties' in o));

    let sawSchemaEcho = false;
    const tryParse = (text: string): T | null => {
      try {
        const obj = JSON.parse(extractJson(text));
        if (looksLikeSchema(obj)) {
          sawSchemaEcho = true;
          return null;
        }
        const p = args.schema.safeParse(obj);
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

    // Corrective pass: if the model echoed the schema, show it the mistake and demand
    // an instance. Often recovers models that ignored the "instance not schema" hint.
    if (sawSchemaEcho) {
      try {
        const fixMessages: ChatMsg[] = [
          ...messages,
          { role: 'assistant', content: stripThink(lastText).slice(0, 1500) },
          {
            role: 'user',
            content:
              'That was the JSON SCHEMA definition, not data. Reply again with ONLY a JSON ' +
              'object that is an INSTANCE of the schema — put real values in every field. ' +
              'Do not include "$schema", "properties", or "type".',
          },
        ];
        const res = await this.create({
          model: this.model,
          messages: fixMessages,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
        });
        const ok = tryParse(res.choices?.[0]?.message?.content ?? '');
        if (ok) return ok;
      } catch (err) {
        lastErr = err;
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
