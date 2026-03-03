/**
 * TelegramHandler -- routes incoming Telegram messages to agent-core,
 * collects the full response (complete-then-send), and sends a
 * plain-text reply back via the Telegram bot.
 *
 * Uses read-only mode only (Level 1-3 tools) for Telegram.
 */

import type { AgentCore } from '../agent/agent-core';
import type { TelegramBot, TelegramMessageEvent } from './telegram-bot';
import type { AllowlistFilter } from '../utils/allowlist';
import { formatTelegramResponse, formatTelegramError } from './telegram-formatter';
import { BaseHandler } from '../channels/base-handler';

export class TelegramHandler extends BaseHandler<TelegramMessageEvent> {
  private bot: TelegramBot;
  private allowlist: AllowlistFilter;

  constructor(
    agentCore: AgentCore,
    vaultName: string,
    bot: TelegramBot,
    allowlist: AllowlistFilter
  ) {
    super(agentCore, vaultName);
    this.bot = bot;
    this.allowlist = allowlist;
  }

  /** Start listening for incoming messages from the Telegram bot. */
  start(): void {
    this.bot.onMessage((event) => {
      this.handleEvent(event).catch((e) => {
        console.error('Vault Chat: Telegram handler error:', e);
      });
    });
  }

  protected get channelName(): string {
    return 'Telegram';
  }

  protected getDeduplicationKey(event: TelegramMessageEvent): string {
    return String(event.messageId);
  }

  protected shouldProcess(event: TelegramMessageEvent): boolean {
    return this.allowlist.isAllowed(String(event.userId));
  }

  protected getChatTarget(event: TelegramMessageEvent): string {
    return String(event.chatId);
  }

  protected getMessageText(event: TelegramMessageEvent): string {
    return event.text;
  }

  protected formatResponse(answer: string): string {
    return formatTelegramResponse(answer, this.vaultName);
  }

  protected formatError(error: string): string {
    return formatTelegramError(error);
  }

  protected async sendReply(chatTarget: string, message: string): Promise<void> {
    await this.bot.sendMessage(Number(chatTarget), message);
  }
}
