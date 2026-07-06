/** Remove inline chain-of-thought some models emit in the content field. */
export function stripThink(text: string): string {
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // Unclosed <think> (truncated output): drop from the opening tag onward.
  const open = t.lastIndexOf('<think>');
  if (open !== -1 && t.indexOf('</think>', open) === -1) t = t.slice(0, open);
  return t;
}

export function extractJson(text: string): string {
  const cleaned = stripThink(text);
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : cleaned;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) return body.slice(start, end + 1);
  return body.trim();
}

export function isBadRequest(err: any): boolean {
  return err?.status === 400 || err?.name === 'BadRequestError';
}

/**
 * Splits a streamed content flow into "answer" vs "thinking", routing text inside
 * <think>...</think> to the thinking sink. Handles tags spanning chunk boundaries.
 */
export class ThinkSplitter {
  private buf = '';
  private inThink = false;

  push(delta: string, onText: (s: string) => void, onThink: (s: string) => void): void {
    this.buf += delta;
    for (;;) {
      if (!this.inThink) {
        const open = this.buf.indexOf('<think>');
        if (open === -1) {
          // Emit everything except a short tail that might be a partial '<think>'.
          const keep = 6;
          if (this.buf.length > keep) {
            onText(this.buf.slice(0, this.buf.length - keep));
            this.buf = this.buf.slice(this.buf.length - keep);
          }
          return;
        }
        if (open > 0) onText(this.buf.slice(0, open));
        this.buf = this.buf.slice(open + 7);
        this.inThink = true;
      } else {
        const close = this.buf.indexOf('</think>');
        if (close === -1) {
          const keep = 7; // partial '</think>'
          if (this.buf.length > keep) {
            onThink(this.buf.slice(0, this.buf.length - keep));
            this.buf = this.buf.slice(this.buf.length - keep);
          }
          return;
        }
        if (close > 0) onThink(this.buf.slice(0, close));
        this.buf = this.buf.slice(close + 8);
        this.inThink = false;
      }
    }
  }

  flush(onText: (s: string) => void, onThink: (s: string) => void): void {
    if (this.buf) (this.inThink ? onThink : onText)(this.buf);
    this.buf = '';
  }
}
