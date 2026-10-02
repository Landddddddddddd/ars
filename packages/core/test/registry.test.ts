import { describe, it, expect } from 'vitest';
import { AgentRegistry } from '../src/registry';
import { STAGES, deepResearchAgents, paperDraftingAgents } from '../src/pipeline';

describe('AgentRegistry', () => {
  it('registers and retrieves an agent by name', () => {
    const reg = new AgentRegistry();
    const agent = { name: 'a', title: 'A', stage: 'deep-research' as const, role: 'r', run: async () => {} };
    reg.register(agent);
    expect(reg.get('a')).toBe(agent);
    expect(reg.get('missing')).toBeUndefined();
  });

  it('register() is chainable and overwrites by name', () => {
    const reg = new AgentRegistry();
    const first = { name: 'a', title: 'A1', stage: 'deep-research' as const, role: 'r', run: async () => {} };
    const second = { name: 'a', title: 'A2', stage: 'deep-research' as const, role: 'r', run: async () => {} };
    reg.register(first).register(second);
    expect(reg.all()).toHaveLength(1);
    expect(reg.get('a')?.title).toBe('A2');
  });
});

describe('pipeline shape', () => {
  it('exposes both stages with titles', () => {
    expect(STAGES.map((s) => s.id)).toEqual(['deep-research', 'paper-drafting']);
    for (const s of STAGES) expect(s.title.length).toBeGreaterThan(0);
  });

  it('every agent carries name, title, stage and a run implementation', () => {
    const all = [...deepResearchAgents, ...paperDraftingAgents];
    expect(all.length).toBeGreaterThan(0);
    for (const a of all) {
      expect(typeof a.name).toBe('string');
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.role.length).toBeGreaterThan(0);
      expect(typeof a.run).toBe('function');
    }
  });

  it('agent names are unique (the UI keys timeline cards by name)', () => {
    const all = [...deepResearchAgents, ...paperDraftingAgents];
    expect(new Set(all.map((a) => a.name)).size).toBe(all.length);
  });

  it('every agent in a stage reports that stage as its own', () => {
    for (const s of STAGES) {
      for (const a of s.agents) expect(a.stage).toBe(s.id);
    }
  });
});
