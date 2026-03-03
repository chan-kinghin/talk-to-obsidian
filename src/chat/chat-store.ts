import type { ChatMessage } from '../types';

export class ChatStore {
  private messages: ChatMessage[] = [];
  private maxTurns: number;

  constructor(maxTurns: number) {
    this.maxTurns = maxTurns;
  }

  addMessage(msg: ChatMessage): void {
    this.messages.push(msg);
  }

  /**
   * Get recent history for LLM context.
   * Returns the last N messages, where N = maxTurns * 2 (user + assistant pairs)
   * plus any trailing tool messages.
   */
  getHistory(): ChatMessage[] {
    if (this.messages.length === 0) return [];

    // Calculate how many messages to include
    const maxMessages = this.maxTurns * 2;
    if (this.messages.length <= maxMessages) {
      return [...this.messages];
    }

    return this.messages.slice(-maxMessages);
  }

  getAllMessages(): ChatMessage[] {
    return [...this.messages];
  }

  clear(): void {
    this.messages = [];
  }

  get length(): number {
    return this.messages.length;
  }
}
