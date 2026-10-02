import { describe, it, expect } from 'vitest';
import { resolveStages, STAGES, deepResearchAgents } from '../src/pipeline';
import type { StageId } from '../src/events';

describe('resolveStages', () => {
  it('returns the full pipeline when nothing is requested', () => {
    expect(resolveStages()).toEqual(STAGES);
    expect(resolveStages(null)).toEqual(STAGES);
    expect(resolveStages([])).toEqual(STAGES);
  });

  it('returns only the requested stages, in pipeline order', () => {
    const picked = resolveStages(['paper-drafting', 'deep-research']);
    expect(picked.map((s) => s.id)).toEqual(['deep-research', 'paper-drafting']);
  });

  it('ignores unknown ids', () => {
    const picked = resolveStages(['deep-research', 'not-a-stage'] as string[]);
    expect(picked.map((s) => s.id)).toEqual(['deep-research']);
  });

  it('falls back to the full pipeline when no id is valid — never runs nothing', () => {
    expect(resolveStages(['bogus', 'also-bogus'])).toEqual(STAGES);
  });

  it('a single-stage run still contains that stage\'s agents', () => {
    const picked = resolveStages(['deep-research']);
    expect(picked).toHaveLength(1);
    expect(picked[0].agents).toEqual(deepResearchAgents);
  });

  it('every resolvable stage id is one of the declared StageIds', () => {
    const ids: StageId[] = ['deep-research', 'paper-drafting'];
    for (const id of ids) {
      expect(resolveStages([id]).map((s) => s.id)).toEqual([id]);
    }
  });
});
