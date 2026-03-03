/**
 * FeishuHandler — routes incoming Feishu DM messages to agent-core,
 * collects the full response (complete-then-send), and sends a
 * formatted card reply back via the Feishu bot.
 *
 * Uses read-only mode only (Level 1-3 tools) for Feishu.
 */

import type { AgentCore } from '../agent/agent-core';
import type { FeishuBot, FeishuMessageEvent } from './feishu-bot';
import { formatFeishuCard, formatFeishuErrorCard } from './feishu-formatter';
import { BaseHandler } from '../channels/base-handler';

export class FeishuHandler extends BaseHandler<FeishuMessageEvent> {
  private bot: FeishuBot;

  constructor(agentCore: AgentCore, vaultName: string, bot: FeishuBot) {
    super(agentCore, vaultName);
    this.bot = bot;
  }

  /** Start listening for incoming messages from the Feishu bot. */
  start(): void {
    this.bot.onMessage((event) => {
      this.handleEvent(event).catch((e) => {
        console.error('Vault Chat: Feishu handler error:', e);
      });
    });
  }

  protected get channelName(): string {
    return 'Feishu';
  }

  protected getDeduplicationKey(event: FeishuMessageEvent): string {
    return event.messageId;
  }

  protected shouldProcess(): boolean {
    return true; // Feishu has no allowlist filtering
  }

  protected getChatTarget(event: FeishuMessageEvent): string {
    return event.chatId;
  }

  protected getMessageText(event: FeishuMessageEvent): string {
    return event.text;
  }

  protected formatResponse(answer: string): string {
    const card = formatFeishuCard(answer, this.vaultName);
    return JSON.stringify(card.card);
  }

  protected formatError(error: string): string {
    const card = formatFeishuErrorCard(error);
    return JSON.stringify(card.card);
  }

  protected async sendReply(chatTarget: string, message: string): Promise<void> {
    await this.bot.sendMessage(chatTarget, message);
  }
}
