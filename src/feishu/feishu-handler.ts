/**
 * FeishuHandler — routes incoming Feishu DM messages to agent-core,
 * collects the full response (complete-then-send), and sends a
 * formatted card reply back via the Feishu bot.
 *
 * Uses read-only mode only (Level 1-3 tools) for Feishu.
 * Implements simple rate limiting to respect Feishu API limits.
 */

import type { AgentCore } from '../agent/agent-core';
import type { FeishuBot, FeishuMessageEvent } from './feishu-bot';
import { formatFeishuCard, formatFeishuErrorCard } from './feishu-formatter';

interface RateLimitState {
  /** Timestamps of messages in the current minute window */
  minuteWindow: number[];
  /** Timestamps of messages in the current second window */
  secondWindow: number[];
}

export class FeishuHandler {
  private agentCore: AgentCore;
  private bot: FeishuBot;
  private vaultName: string;
  private rateLimit: RateLimitState = {
    minuteWindow: [],
    secondWindow: [],
  };
  private processing: Set<string> = new Set();

  /** Max messages per minute (Feishu API limit) */
  private static readonly MAX_PER_MINUTE = 100;
  /** Max messages per second (Feishu API limit) */
  private static readonly MAX_PER_SECOND = 5;

  constructor(agentCore: AgentCore, bot: FeishuBot, vaultName: string) {
    this.agentCore = agentCore;
    this.bot = bot;
    this.vaultName = vaultName;
  }

  /**
   * Start listening for incoming messages from the Feishu bot.
   */
  start(): void {
    this.bot.onMessage((event) => {
      this.handleMessage(event).catch((e) => {
        console.error('Vault Chat: Feishu handler error:', e);
      });
    });
  }

  /**
   * Handle a single incoming Feishu DM message.
   * Routes to agent-core in read-only mode, collects full response,
   * then sends formatted card reply.
   */
  private async handleMessage(event: FeishuMessageEvent): Promise<void> {
    const { chatId, messageId, text } = event;

    // Deduplicate — Feishu may retry delivery
    if (this.processing.has(messageId)) {
      return;
    }
    this.processing.add(messageId);

    try {
      // Check rate limits before processing
      if (!this.checkRateLimit()) {
        const errorCard = formatFeishuErrorCard(
          'Rate limit reached. Please try again in a moment.'
        );
        await this.bot.sendMessage(chatId, JSON.stringify(errorCard.card));
        return;
      }

      // Run agent in read-only mode (no history for Feishu — stateless)
      const events = this.agentCore.run(text, [], 'readonly');

      let answer = '';
      let hasError = false;

      // Collect all events — complete-then-send pattern
      for await (const agentEvent of events) {
        switch (agentEvent.type) {
          case 'answer':
            answer += agentEvent.content;
            break;
          case 'error':
            answer = agentEvent.content;
            hasError = true;
            break;
          case 'tool_use':
            // Tool use events are not shown in Feishu replies
            break;
        }
      }

      if (!answer) {
        answer = 'No response generated. Please try rephrasing your question.';
        hasError = true;
      }

      // Format and send reply
      if (hasError) {
        const card = formatFeishuErrorCard(answer);
        await this.bot.sendMessage(chatId, JSON.stringify(card.card));
      } else {
        const card = formatFeishuCard(answer, this.vaultName);
        await this.bot.sendMessage(chatId, JSON.stringify(card.card));
      }

      this.recordMessage();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Internal error';
      console.error('Vault Chat: Feishu message handling failed:', msg);

      try {
        const card = formatFeishuErrorCard(`Error: ${msg}`);
        await this.bot.sendMessage(chatId, JSON.stringify(card.card));
      } catch {
        // If we can't even send the error, just log it
        console.error('Vault Chat: Failed to send Feishu error reply');
      }
    } finally {
      // Clean up after a delay (Feishu may retry within ~60s)
      setTimeout(() => {
        this.processing.delete(messageId);
      }, 60000);
    }
  }

  /**
   * Check if we're within Feishu API rate limits.
   * Returns true if the message can be processed.
   */
  private checkRateLimit(): boolean {
    const now = Date.now();

    // Clean expired entries
    this.rateLimit.minuteWindow = this.rateLimit.minuteWindow.filter(
      (t) => now - t < 60000
    );
    this.rateLimit.secondWindow = this.rateLimit.secondWindow.filter(
      (t) => now - t < 1000
    );

    if (this.rateLimit.minuteWindow.length >= FeishuHandler.MAX_PER_MINUTE) {
      return false;
    }
    if (this.rateLimit.secondWindow.length >= FeishuHandler.MAX_PER_SECOND) {
      return false;
    }

    return true;
  }

  /**
   * Record that a message was sent (for rate limiting).
   */
  private recordMessage(): void {
    const now = Date.now();
    this.rateLimit.minuteWindow.push(now);
    this.rateLimit.secondWindow.push(now);
  }
}
