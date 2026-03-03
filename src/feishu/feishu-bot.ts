/**
 * FeishuBot — WebSocket-based Feishu bot using @larksuiteoapi/node-sdk.
 *
 * Conditionally loaded only on desktop (Platform.isDesktop).
 * Uses dynamic import of the SDK to avoid bundling Node.js deps on mobile.
 *
 * Connection lifecycle:
 *   connect() -> WebSocket established -> events dispatched
 *   disconnect() -> clean shutdown
 */

export type FeishuConnectionStatus = 'disconnected' | 'connected' | 'error';

export type FeishuEventListener = (event: FeishuMessageEvent) => void;
type StatusListener = (status: FeishuConnectionStatus) => void;

export interface FeishuMessageEvent {
  messageId: string;
  chatId: string;
  senderId: string;
  text: string;
  messageType: string;
}

interface FeishuBotOptions {
  appId: string;
  appSecret: string;
}

export class FeishuBot {
  private appId: string;
  private appSecret: string;
  private wsClient: unknown = null;
  private larkClient: unknown = null;
  private status: FeishuConnectionStatus = 'disconnected';
  private messageListeners: FeishuEventListener[] = [];
  private statusListeners: StatusListener[] = [];

  constructor(options: FeishuBotOptions) {
    this.appId = options.appId;
    this.appSecret = options.appSecret;
  }

  getStatus(): FeishuConnectionStatus {
    return this.status;
  }

  onMessage(listener: FeishuEventListener): void {
    this.messageListeners.push(listener);
  }

  offMessage(listener: FeishuEventListener): void {
    this.messageListeners = this.messageListeners.filter((l) => l !== listener);
  }

  onStatusChange(listener: StatusListener): void {
    this.statusListeners.push(listener);
  }

  offStatusChange(listener: StatusListener): void {
    this.statusListeners = this.statusListeners.filter((l) => l !== listener);
  }

  /**
   * Establish WebSocket connection to Feishu.
   * Dynamically imports @larksuiteoapi/node-sdk to keep it out of the
   * mobile bundle.
   */
  async connect(): Promise<void> {
    if (this.status === 'connected') {
      return;
    }

    if (!this.appId || !this.appSecret) {
      this.setStatus('error');
      throw new Error('Feishu App ID and App Secret are required');
    }

    try {
      // Dynamic import — keeps Node.js deps out of mobile bundle
      const lark = await import('@larksuiteoapi/node-sdk');

      // Create Lark client for sending replies
      this.larkClient = new lark.Client({
        appId: this.appId,
        appSecret: this.appSecret,
        appType: lark.AppType.SelfBuild,
      });

      // Create event dispatcher for handling incoming messages
      const dispatcher = new lark.EventDispatcher({}).register({
        'im.message.receive_v1': (data: unknown) => {
          this.handleIncomingMessage(data);
          return {};
        },
      });

      // Create WebSocket client — long-polling, no public URL needed
      this.wsClient = new (lark.WSClient as any)({
        appId: this.appId,
        appSecret: this.appSecret,
        eventDispatcher: dispatcher,
        loggerLevel: lark.LoggerLevel.warn,
      });

      await (this.wsClient as { start: () => Promise<void> }).start();

      this.setStatus('connected');
      console.debug('Vault Chat: Feishu bot connected');
    } catch (e) {
      this.setStatus('error');
      const msg = e instanceof Error ? e.message : 'Unknown error';
      console.error('Vault Chat: Feishu connection failed:', msg);
      throw e;
    }
  }

  /**
   * Disconnect and clean up.
   */
  async disconnect(): Promise<void> {
    if (this.wsClient) {
      try {
        // WSClient does not have an explicit stop method in the SDK.
        // Setting to null will let GC clean up the WebSocket.
        this.wsClient = null;
      } catch {
        // Ignore disconnect errors
      }
    }
    this.larkClient = null;
    this.setStatus('disconnected');
    console.debug('Vault Chat: Feishu bot disconnected');
  }

  /**
   * Send a reply message to a Feishu chat.
   */
  async sendMessage(chatId: string, content: string): Promise<void> {
    if (!this.larkClient) {
      throw new Error('Feishu client not initialized');
    }

    const client = this.larkClient as {
      im: {
        message: {
          create: (params: unknown) => Promise<unknown>;
        };
      };
    };

    await client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'interactive',
        content,
      },
    });
  }

  /**
   * Send a text-only reply to a Feishu chat.
   */
  async sendTextMessage(chatId: string, text: string): Promise<void> {
    if (!this.larkClient) {
      throw new Error('Feishu client not initialized');
    }

    const client = this.larkClient as {
      im: {
        message: {
          create: (params: unknown) => Promise<unknown>;
        };
      };
    };

    await client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text }),
      },
    });
  }

  private handleIncomingMessage(data: unknown): void {
    try {
      const msg = data as {
        message?: {
          message_id?: string;
          chat_id?: string;
          message_type?: string;
          content?: string;
        };
        sender?: {
          sender_id?: {
            open_id?: string;
          };
        };
      };

      const messageId = msg.message?.message_id ?? '';
      const chatId = msg.message?.chat_id ?? '';
      const messageType = msg.message?.message_type ?? '';
      const senderId = msg.sender?.sender_id?.open_id ?? '';

      // Only handle text messages
      if (messageType !== 'text') {
        return;
      }

      // Parse text content
      let text = '';
      try {
        const parsed = JSON.parse(msg.message?.content ?? '{}');
        text = (parsed.text as string) ?? '';
      } catch {
        return;
      }

      if (!text.trim()) {
        return;
      }

      const event: FeishuMessageEvent = {
        messageId,
        chatId,
        senderId,
        text: text.trim(),
        messageType,
      };

      for (const listener of this.messageListeners) {
        try {
          listener(event);
        } catch (e) {
          console.error('Vault Chat: Feishu message listener error:', e);
        }
      }
    } catch (e) {
      console.error('Vault Chat: Failed to parse Feishu message:', e);
    }
  }

  private setStatus(status: FeishuConnectionStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch {
        // Ignore listener errors
      }
    }
  }
}
