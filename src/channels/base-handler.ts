/**
 * BaseHandler — shared handler pipeline for all messaging channels.
 *
 * Extracts the common rate-limiting, deduplication, agent event collection,
 * and error handling logic. Channel-specific handlers extend this class
 * and implement the abstract methods for their data shapes and formatting.
 */

import type { AgentCore } from '../agent/agent-core';

interface RateLimitState {
  minuteWindow: number[];
  secondWindow: number[];
}

/**
 * Abstract base for all channel message handlers.
 *
 * @template TEvent - The channel-specific incoming event type.
 */
export abstract class BaseHandler<TEvent> {
  protected agentCore: AgentCore;
  protected vaultName: string;
  private rateLimit: RateLimitState = { minuteWindow: [], secondWindow: [] };
  private processing: Set<string> = new Set();

  /** Max outbound messages per minute. */
  protected maxPerMinute = 100;
  /** Max outbound messages per second. */
  protected maxPerSecond = 5;

  constructor(agentCore: AgentCore, vaultName: string) {
    this.agentCore = agentCore;
    this.vaultName = vaultName;
  }

  // ── Abstract methods (channel-specific) ──────────────────────

  /** Human-readable channel name for log messages. */
  protected abstract get channelName(): string;

  /** Extract a unique key to deduplicate retried deliveries. */
  protected abstract getDeduplicationKey(event: TEvent): string;

  /**
   * Check whether this event should be processed (e.g. allowlist check).
   * Return true to proceed, false to silently drop.
   */
  protected abstract shouldProcess(event: TEvent): boolean;

  /** Extract the chat/thread target for sending replies. */
  protected abstract getChatTarget(event: TEvent): string;

  /** Extract the user's message text. */
  protected abstract getMessageText(event: TEvent): string;

  /** Format a successful response for this channel. */
  protected abstract formatResponse(answer: string): string;

  /** Format an error message for this channel. */
  protected abstract formatError(error: string): string;

  /** Send a reply to the given chat target. */
  protected abstract sendReply(chatTarget: string, message: string): Promise<void>;

  // ── Shared pipeline ──────────────────────────────────────────

  /**
   * Process an incoming event through the shared pipeline:
   * filter → dedup → rate-limit → agent run → format → reply.
   */
  async handleEvent(event: TEvent): Promise<void> {
    // Channel-specific filtering (allowlist, isFromMe, etc.)
    if (!this.shouldProcess(event)) {
      return;
    }

    const dedupKey = this.getDeduplicationKey(event);

    // Deduplicate — channels may retry delivery
    if (this.processing.has(dedupKey)) {
      return;
    }
    this.processing.add(dedupKey);

    try {

      const chatTarget = this.getChatTarget(event);
      const text = this.getMessageText(event);

      // Check rate limits before processing
      if (!this.checkRateLimit()) {
        const errorMsg = this.formatError(
          'Rate limit reached. Please try again in a moment.'
        );
        await this.sendReply(chatTarget, errorMsg);
        return;
      }

      // Run agent in read-only mode (stateless for external channels)
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
            break;
        }
      }

      if (!answer) {
        answer = 'No response generated. Please try rephrasing your question.';
        hasError = true;
      }

      // Format and send reply
      const formatted = hasError
        ? this.formatError(answer)
        : this.formatResponse(answer);
      await this.sendReply(chatTarget, formatted);

      this.recordMessage();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Internal error';
      console.error(`Vault Chat: ${this.channelName} message handling failed:`, msg);

      try {
        const chatTarget = this.getChatTarget(event);
        await this.sendReply(chatTarget, this.formatError(`Error: ${msg}`));
      } catch {
        console.error(`Vault Chat: Failed to send ${this.channelName} error reply`);
      }
    } finally {
      // Clean up after a delay (channels may retry within ~60s)
      setTimeout(() => {
        this.processing.delete(dedupKey);
      }, 60000);
    }
  }

  private checkRateLimit(): boolean {
    const now = Date.now();

    this.rateLimit.minuteWindow = this.rateLimit.minuteWindow.filter(
      (t) => now - t < 60000
    );
    this.rateLimit.secondWindow = this.rateLimit.secondWindow.filter(
      (t) => now - t < 1000
    );

    if (this.rateLimit.minuteWindow.length >= this.maxPerMinute) {
      return false;
    }
    if (this.rateLimit.secondWindow.length >= this.maxPerSecond) {
      return false;
    }

    return true;
  }

  private recordMessage(): void {
    const now = Date.now();
    this.rateLimit.minuteWindow.push(now);
    this.rateLimit.secondWindow.push(now);
  }
}
