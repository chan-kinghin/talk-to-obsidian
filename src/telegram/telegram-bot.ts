/**
 * TelegramBot -- HTTP long-polling Telegram bot using native fetch.
 *
 * No npm dependencies -- communicates with the Telegram Bot API via
 * `https://api.telegram.org/bot{token}/` using only the global `fetch`.
 *
 * Connection lifecycle:
 *   connect() -> long-polling loop started -> events dispatched
 *   disconnect() -> polling stopped, clean shutdown
 */

export type TelegramConnectionStatus = 'disconnected' | 'connected' | 'error';

export type TelegramEventListener = (event: TelegramMessageEvent) => void;
type StatusListener = (status: TelegramConnectionStatus) => void;

export interface TelegramMessageEvent {
  messageId: number;
  chatId: number;
  userId: number;
  username: string;
  text: string;
}

interface TelegramBotOptions {
  botToken: string;
}

export class TelegramBot {
  private botToken: string;
  private baseUrl: string;
  private status: TelegramConnectionStatus = 'disconnected';
  private messageListeners: TelegramEventListener[] = [];
  private statusListeners: StatusListener[] = [];
  private polling = false;
  private offset = 0;

  constructor(options: TelegramBotOptions) {
    this.botToken = options.botToken;
    this.baseUrl = `https://api.telegram.org/bot${options.botToken}/`;
  }

  getStatus(): TelegramConnectionStatus {
    return this.status;
  }

  onMessage(listener: TelegramEventListener): void {
    this.messageListeners.push(listener);
  }

  offMessage(listener: TelegramEventListener): void {
    this.messageListeners = this.messageListeners.filter((l) => l !== listener);
  }

  onStatusChange(listener: StatusListener): void {
    this.statusListeners.push(listener);
  }

  offStatusChange(listener: StatusListener): void {
    this.statusListeners = this.statusListeners.filter((l) => l !== listener);
  }

  /**
   * Start the long-polling connection to the Telegram Bot API.
   * Validates the bot token first via getMe, then starts the poll loop.
   */
  async connect(): Promise<void> {
    if (this.status === 'connected') {
      return;
    }

    if (!this.botToken) {
      this.setStatus('error');
      throw new Error('Telegram bot token is required');
    }

    try {
      // Validate the token by calling getMe
      const meResp = await fetch(`${this.baseUrl}getMe`);
      if (!meResp.ok) {
        throw new Error(`Telegram getMe failed: HTTP ${meResp.status}`);
      }
      const meData = (await meResp.json()) as { ok: boolean; description?: string };
      if (!meData.ok) {
        throw new Error(`Telegram getMe failed: ${meData.description ?? 'unknown error'}`);
      }

      this.polling = true;
      this.setStatus('connected');
      console.debug('Vault Chat: Telegram bot connected');

      // Start poll loop -- fire and forget, errors handled internally
      this.pollLoop().catch((e) => {
        console.error('Vault Chat: Telegram poll loop exited with error:', e);
        this.setStatus('error');
      });
    } catch (e) {
      this.setStatus('error');
      const msg = e instanceof Error ? e.message : 'Unknown error';
      console.error('Vault Chat: Telegram connection failed:', msg);
      throw e;
    }
  }

  /**
   * Stop polling and disconnect.
   */
  async disconnect(): Promise<void> {
    this.polling = false;
    this.setStatus('disconnected');
    console.debug('Vault Chat: Telegram bot disconnected');
  }

  /**
   * Send a text message to a Telegram chat.
   */
  async sendMessage(chatId: number, text: string, parseMode?: string): Promise<void> {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
    };
    if (parseMode) {
      body.parse_mode = parseMode;
    }

    try {
      const resp = await fetch(`${this.baseUrl}sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const errData = (await resp.json().catch(() => ({}))) as { description?: string };
        console.error(
          'Vault Chat: Telegram sendMessage failed:',
          errData.description ?? `HTTP ${resp.status}`
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      console.error('Vault Chat: Telegram sendMessage error:', msg);
    }
  }

  /**
   * Long-polling loop that fetches updates from the Telegram Bot API.
   * Runs until `this.polling` is set to false.
   */
  private async pollLoop(): Promise<void> {
    while (this.polling) {
      try {
        const url = `${this.baseUrl}getUpdates?offset=${this.offset}&timeout=30`;
        const resp = await fetch(url);

        if (!resp.ok) {
          console.error(`Vault Chat: Telegram getUpdates HTTP ${resp.status}`);
          await this.sleep(5000);
          continue;
        }

        const data = (await resp.json()) as {
          ok: boolean;
          result?: TelegramUpdate[];
        };

        if (!data.ok || !data.result) {
          await this.sleep(5000);
          continue;
        }

        for (const update of data.result) {
          // Advance offset past this update
          this.offset = update.update_id + 1;

          // Only handle text messages
          const message = update.message;
          if (!message?.text) {
            continue;
          }

          const event: TelegramMessageEvent = {
            messageId: message.message_id,
            chatId: message.chat.id,
            userId: message.from?.id ?? 0,
            username: message.from?.username ?? '',
            text: message.text.trim(),
          };

          for (const listener of this.messageListeners) {
            try {
              listener(event);
            } catch (e) {
              console.error('Vault Chat: Telegram message listener error:', e);
            }
          }
        }

        // Small delay between successful polls to avoid tight looping
        await this.sleep(100);
      } catch (e) {
        if (!this.polling) {
          break;
        }
        const msg = e instanceof Error ? e.message : 'Unknown error';
        console.error('Vault Chat: Telegram poll error:', msg);
        await this.sleep(5000);
      }
    }
  }

  private setStatus(status: TelegramConnectionStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch {
        // Ignore listener errors
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/* ------------------------------------------------------------------ */
/* Telegram API response types (subset needed for getUpdates)         */
/* ------------------------------------------------------------------ */

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface TelegramMessage {
  message_id: number;
  from?: { id: number; username?: string };
  chat: { id: number };
  text?: string;
}
