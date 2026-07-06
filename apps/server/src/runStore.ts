import { randomUUID } from 'node:crypto';
import type { AgentEvent, TimestampedEvent } from '@ars/core';

export interface Run {
  id: string;
  topic: string;
  status: 'running' | 'done' | 'error';
  events: TimestampedEvent[];
  listeners: Set<(e: TimestampedEvent) => void>;
  seq: number;
}

export class RunStore {
  private runs = new Map<string, Run>();

  create(topic: string): Run {
    const run: Run = {
      id: randomUUID(),
      topic,
      status: 'running',
      events: [],
      listeners: new Set(),
      seq: 0,
    };
    this.runs.set(run.id, run);
    return run;
  }

  get(id: string): Run | undefined {
    return this.runs.get(id);
  }

  emit(run: Run, event: AgentEvent): void {
    const te: TimestampedEvent = { ...event, ts: Date.now(), seq: run.seq++ };
    run.events.push(te);
    if (event.type === 'run.done') run.status = 'done';
    if (event.type === 'run.error') run.status = 'error';
    for (const l of run.listeners) {
      try {
        l(te);
      } catch {
        /* listener errors must not break the run */
      }
    }
  }
}
