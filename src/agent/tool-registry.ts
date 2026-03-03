import type { VaultTool, ToolDefinition } from '../types';

interface RegisteredTool {
  tool: VaultTool;
  level: 1 | 2 | 3 | 4;
}

export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  registerTool(tool: VaultTool, level: 1 | 2 | 3 | 4): void {
    this.tools.set(tool.definition.name, { tool, level });
  }

  getToolDefinitions(mode: 'readonly' | 'full'): ToolDefinition[] {
    const maxLevel = mode === 'full' ? 4 : 3;
    const definitions: ToolDefinition[] = [];

    for (const { tool, level } of this.tools.values()) {
      if (level <= maxLevel) {
        definitions.push(tool.definition);
      }
    }

    return definitions;
  }

  getOpenAIToolDefinitions(mode: 'readonly' | 'full'): OpenAIToolDef[] {
    return this.getToolDefinitions(mode).map((def) => ({
      type: 'function' as const,
      function: {
        name: def.name,
        description: def.description,
        parameters: def.parameters,
      },
    }));
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<string> {
    const registered = this.tools.get(name);
    if (!registered) {
      return JSON.stringify({ error: `Unknown tool: ${name}` });
    }

    try {
      return await registered.tool.execute(args);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Tool execution failed';
      return JSON.stringify({ error: message });
    }
  }

  hasToolForMode(name: string, mode: 'readonly' | 'full'): boolean {
    const registered = this.tools.get(name);
    if (!registered) return false;
    const maxLevel = mode === 'full' ? 4 : 3;
    return registered.level <= maxLevel;
  }
}

export interface OpenAIToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}
