import type { ChatMessage, AgentEvent } from '../types';
import type { PluginSettings } from '../types';
import { ToolRegistry, OpenAIToolDef } from './tool-registry';
import { buildSystemPrompt } from './prompt';

interface LLMResponseMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: LLMToolCall[];
}

interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export class AgentCore {
  private toolRegistry: ToolRegistry;
  private settings: PluginSettings;

  constructor(toolRegistry: ToolRegistry, settings: PluginSettings) {
    this.toolRegistry = toolRegistry;
    this.settings = settings;
  }

  async *run(
    userMessage: string,
    history: ChatMessage[],
    mode: 'readonly' | 'full'
  ): AsyncGenerator<AgentEvent> {
    const tools = this.toolRegistry.getOpenAIToolDefinitions(mode);
    const systemPrompt = buildSystemPrompt(mode);

    const messages: Array<Record<string, unknown>> = [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => this.toChatCompletionMessage(m)),
      { role: 'user', content: userMessage },
    ];

    let rounds = 0;
    const maxRounds = this.settings.agent.maxToolRounds;

    while (rounds < maxRounds) {
      rounds++;

      let response: LLMResponseMessage;
      let streamedContent = '';

      try {
        const result = await this.callLLM(messages, tools);
        response = result.message;
        streamedContent = result.streamedContent;
      } catch (e) {
        const message = e instanceof Error ? e.message : 'LLM call failed';
        yield { type: 'error', content: message };
        return;
      }

      // If there are no tool calls, this is the final answer
      if (!response.tool_calls || response.tool_calls.length === 0) {
        const content = streamedContent || response.content || '';
        yield { type: 'answer', content };
        return;
      }

      // Add assistant message with tool calls to messages
      messages.push({
        role: 'assistant',
        content: response.content ?? null,
        tool_calls: response.tool_calls,
      });

      // Execute each tool call
      for (const toolCall of response.tool_calls) {
        const name = toolCall.function.name;
        let args: Record<string, unknown>;

        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          args = {};
        }

        // Check if tool is available in current mode
        if (!this.toolRegistry.hasToolForMode(name, mode)) {
          const result = JSON.stringify({ error: `Tool ${name} is not available in ${mode} mode` });
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          });
          yield {
            type: 'tool_use',
            content: `Tool ${name} not available`,
            tool: name,
            input: args,
            output: result,
          };
          continue;
        }

        const result = await this.toolRegistry.executeTool(name, args);

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        });

        yield {
          type: 'tool_use',
          content: `Used ${name}`,
          tool: name,
          input: args,
          output: result,
        };
      }
    }

    yield { type: 'error', content: 'Maximum tool rounds reached. Please try a simpler query.' };
  }

  private async callLLM(
    messages: Array<Record<string, unknown>>,
    tools: OpenAIToolDef[]
  ): Promise<{ message: LLMResponseMessage; streamedContent: string }> {
    const { apiKey, endpoint, model } = this.settings.llm;

    if (!apiKey) {
      throw new Error('API key is not configured. Please set it in settings.');
    }

    const url = `${endpoint.replace(/\/+$/, '')}/chat/completions`;

    const body: Record<string, unknown> = {
      model,
      messages,
      stream: true,
    };

    if (tools.length > 0) {
      body.tools = tools;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`LLM API error (${response.status}): ${errorText}`);
    }

    return this.parseSSEResponse(response);
  }

  private async parseSSEResponse(
    response: Response
  ): Promise<{ message: LLMResponseMessage; streamedContent: string }> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(data);
          } catch {
            continue;
          }

          const choices = parsed.choices as Array<Record<string, unknown>> | undefined;
          if (!choices || choices.length === 0) continue;

          const delta = choices[0].delta as Record<string, unknown> | undefined;
          if (!delta) continue;

          // Accumulate content
          if (typeof delta.content === 'string') {
            content += delta.content;
          }

          // Accumulate tool calls
          const deltaToolCalls = delta.tool_calls as Array<Record<string, unknown>> | undefined;
          if (deltaToolCalls) {
            for (const tc of deltaToolCalls) {
              const index = tc.index as number;
              const existing = toolCalls.get(index);

              if (!existing) {
                toolCalls.set(index, {
                  id: (tc.id as string) ?? '',
                  name: ((tc.function as Record<string, unknown>)?.name as string) ?? '',
                  arguments: ((tc.function as Record<string, unknown>)?.arguments as string) ?? '',
                });
              } else {
                if (tc.id) existing.id = tc.id as string;
                const fn = tc.function as Record<string, unknown> | undefined;
                if (fn?.name) existing.name = fn.name as string;
                if (fn?.arguments) existing.arguments += fn.arguments as string;
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const toolCallsArray: LLMToolCall[] = [];
    for (const [, tc] of [...toolCalls.entries()].sort((a, b) => a[0] - b[0])) {
      toolCallsArray.push({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name,
          arguments: tc.arguments,
        },
      });
    }

    return {
      message: {
        role: 'assistant',
        content: content || null,
        tool_calls: toolCallsArray.length > 0 ? toolCallsArray : undefined,
      },
      streamedContent: content,
    };
  }

  private toChatCompletionMessage(msg: ChatMessage): Record<string, unknown> {
    const result: Record<string, unknown> = {
      role: msg.role,
      content: msg.content,
    };

    if (msg.toolCallId) {
      result.tool_call_id = msg.toolCallId;
    }

    if (msg.toolCalls && msg.toolCalls.length > 0) {
      result.tool_calls = msg.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        },
      }));
    }

    return result;
  }
}
