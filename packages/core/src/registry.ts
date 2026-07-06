import type { Agent } from './agent.js';

export class AgentRegistry {
  private map = new Map<string, Agent>();

  register(agent: Agent): this {
    this.map.set(agent.name, agent);
    return this;
  }

  get(name: string): Agent | undefined {
    return this.map.get(name);
  }

  all(): Agent[] {
    return [...this.map.values()];
  }
}
