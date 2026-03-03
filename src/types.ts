export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AgentEvent {
  type: 'answer' | 'tool_use' | 'error' | 'thinking';
  content: string;
  tool?: string;
  input?: Record<string, unknown>;
  output?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface VaultTool {
  definition: ToolDefinition;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

export interface PluginSettings {
  llm: {
    provider: string;
    apiKey: string;
    model: string;
    customEndpoint: string;
    customModel: string;
  };
  feishu: {
    enabled: boolean;
    appId: string;
    appSecret: string;
  };
  telegram: {
    enabled: boolean;
    botToken: string;
    allowedUserIds: string;
  };
  imessage: {
    enabled: boolean;
    serverUrl: string;
    password: string;
    allowedAddresses: string;
  };
  agent: {
    mode: 'readonly' | 'full';
    maxTurns: number;
    maxToolRounds: number;
  };
}

export interface IndexedDocument {
  content: string;
  fileName: string;
  filePath: string;
  tags: string[];
}

export interface SearchResult {
  fileName: string;
  filePath: string;
  snippet: string;
  score: number;
  tags: string[];
}
