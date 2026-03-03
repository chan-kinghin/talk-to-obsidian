/**
 * IMessageHandler -- routes incoming iMessage messages to agent-core,
 * collects the full response (complete-then-send), and sends a
 * formatted plain-text reply back via the BlueBubbles bot.
 *
 * Uses read-only mode only (Level 1-3 tools) for iMessage.
 */

import type { AgentCore } from '../agent/agent-core';
import type { IMessageBot, IMessageEvent } from './imessage-bot';
import type { AllowlistFilter } from '../utils/allowlist';
import { formatIMessageResponse, formatIMessageError } from './imessage-formatter';
import { BaseHandler } from '../channels/base-handler';

export class IMessageHandler extends BaseHandler<IMessageEvent> {
  private bot: IMessageBot;
  private allowlist: AllowlistFilter;

  constructor(
    agentCore: AgentCore,
    vaultName: string,
    bot: IMessageBot,
    allowlist: AllowlistFilter
  ) {
    super(agentCore, vaultName);
    this.bot = bot;
    this.allowlist = allowlist;
  }

  /** Start listening for incoming messages from the iMessage bot. */
  start(): void {
    this.bot.onMessage((event) => {
      // Skip messages from self (double-check; bot already filters these)
      if (event.isFromMe) {
        return;
      }
      this.handleEvent(event).catch((e) => {
        console.error('Vault Chat: iMessage handler error:', e);
      });
    });
  }

  protected get channelName(): string {
    return 'iMessage';
  }

  protected getDeduplicationKey(event: IMessageEvent): string {
    return event.messageGuid;
  }

  protected shouldProcess(event: IMessageEvent): boolean {
    return this.allowlist.isAllowed(event.senderAddress);
  }

  protected getChatTarget(event: IMessageEvent): string {
    return event.chatGuid;
  }

  protected getMessageText(event: IMessageEvent): string {
    return event.text;
  }

  protected formatResponse(answer: string): string {
    return formatIMessageResponse(answer, this.vaultName);
  }

  protected formatError(error: string): string {
    return formatIMessageError(error);
  }

  protected async sendReply(chatTarget: string, message: string): Promise<void> {
    await this.bot.sendMessage(chatTarget, message);
  }
}
