/**
 * IMessageBot -- WebSocket-based BlueBubbles iMessage bot.
 *
 * Connects to a local BlueBubbles server via Socket.IO WebSocket
 * to receive incoming iMessage events and send replies.
 *
 * Connection lifecycle:
 *   connect() -> WebSocket established -> events dispatched
 *   disconnect() -> clean shutdown, no reconnect
 */

export type IMessageConnectionStatus = 'disconnected' | 'connected' | 'error';

export type IMessageEventListener = (event: IMessageEvent) => void;
type StatusListener = (status: IMessageConnectionStatus) => void;

export interface IMessageEvent {
  messageGuid: string;
  chatGuid: string;
  senderAddress: string;
  text: string;
  isFromMe: boolean;
}

interface IMessageBotOptions {
  serverUrl: string;
  password: string;
}

export class IMessageBot {
  private serverUrl: string;
  private password: string;
  private ws: WebSocket | null = null;
  private status: IMessageConnectionStatus = 'disconnected';
  private messageListeners: IMessageEventListener[] = [];
  private statusListeners: StatusListener[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private deliberateDisconnect = false;

  constructor(options: IMessageBotOptions) {
    this.serverUrl = options.serverUrl;
    this.password = options.password;
  }

  getStatus(): IMessageConnectionStatus {
    return this.status;
  }

  onMessage(listener: IMessageEventListener): void {
    this.messageListeners.push(listener);
  }

  offMessage(listener: IMessageEventListener): void {
    this.messageListeners = this.messageListeners.filter((l) => l !== listener);
  }

  onStatusChange(listener: StatusListener): void {
    this.statusListeners.push(listener);
  }

  offStatusChange(listener: StatusListener): void {
    this.statusListeners = this.statusListeners.filter((l) => l !== listener);
  }

  /**
   * Connect to BlueBubbles server via Socket.IO WebSocket transport.
   *
   * BlueBubbles uses the Socket.IO protocol over WebSocket:
   *   - Send "40" after connection open to subscribe to events
   *   - Incoming "42" frames contain JSON event arrays
   *   - Respond to "2" (ping) with "3" (pong) for keep-alive
   */
  async connect(): Promise<void> {
    if (this.status === 'connected') {
      return;
    }

    if (!this.serverUrl || !this.password) {
      this.setStatus('error');
      throw new Error('BlueBubbles server URL and password are required');
    }

    this.deliberateDisconnect = false;

    try {
      const cleanUrl = this.serverUrl.replace(/\/+$/, '');
      const wsProtocol = cleanUrl.startsWith('https') ? 'wss' : 'ws';
      const httpBase = cleanUrl.replace(/^https?/, wsProtocol);
      const wsUrl =
        `${httpBase}/socket.io/?EIO=4&transport=websocket` +
        `&password=${encodeURIComponent(this.password)}`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = (): void => {
        // Socket.IO handshake: send "40" to subscribe to the default namespace
        this.ws?.send('40');
        this.setStatus('connected');
        console.debug('Vault Chat: iMessage bot connected');
      };

      this.ws.onmessage = (ev: MessageEvent): void => {
        const data = typeof ev.data === 'string' ? ev.data : '';
        this.handleSocketMessage(data);
      };

      this.ws.onerror = (ev: Event): void => {
        console.error('Vault Chat: iMessage WebSocket error:', ev);
      };

      this.ws.onclose = (): void => {
        this.setStatus('disconnected');
        console.debug('Vault Chat: iMessage WebSocket closed');
        this.scheduleReconnect();
      };
    } catch (e) {
      this.setStatus('error');
      const msg = e instanceof Error ? e.message : 'Unknown error';
      console.error('Vault Chat: iMessage connection failed:', msg);
      throw e;
    }
  }

  /**
   * Disconnect and clean up. Prevents automatic reconnection.
   */
  async disconnect(): Promise<void> {
    this.deliberateDisconnect = true;

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore close errors
      }
      this.ws = null;
    }

    this.setStatus('disconnected');
    console.debug('Vault Chat: iMessage bot disconnected');
  }

  /**
   * Send a text message to an iMessage chat via BlueBubbles REST API.
   */
  async sendMessage(chatGuid: string, text: string): Promise<void> {
    const cleanUrl = this.serverUrl.replace(/\/+$/, '');
    const url =
      `${cleanUrl}/api/v1/message/text` +
      `?password=${encodeURIComponent(this.password)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatGuid,
        message: text,
        method: 'private-api',
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `BlueBubbles send failed (${response.status}): ${body}`
      );
    }
  }

  /**
   * Parse Socket.IO framed messages from the WebSocket.
   *
   * Frame types:
   *   "0"  - open (server handshake, contains JSON config)
   *   "2"  - ping -> respond with "3" (pong)
   *   "40" - namespace connect ack
   *   "42" - event: JSON array [eventName, ...args]
   */
  private handleSocketMessage(data: string): void {
    // Ping/pong keep-alive
    if (data === '2') {
      this.ws?.send('3');
      return;
    }

    // Event frame: starts with "42"
    if (!data.startsWith('42')) {
      return;
    }

    const jsonStr = data.slice(2);
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return;
    }

    if (!Array.isArray(parsed) || parsed.length < 2) {
      return;
    }

    const eventName = parsed[0];
    const payload = parsed[1];

    if (eventName !== 'new-message') {
      return;
    }

    this.processNewMessage(payload);
  }

  /**
   * Extract a message event from a BlueBubbles "new-message" payload.
   */
  private processNewMessage(payload: unknown): void {
    try {
      const msg = payload as {
        guid?: string;
        chats?: Array<{ chatIdentifier?: string }>;
        handle?: { address?: string };
        text?: string;
        isFromMe?: boolean;
      };

      const messageGuid = msg.guid ?? '';
      const chatGuid = msg.chats?.[0]?.chatIdentifier ?? '';
      const senderAddress = msg.handle?.address ?? '';
      const text = msg.text ?? '';
      const isFromMe = msg.isFromMe ?? false;

      // Skip messages from self
      if (isFromMe) {
        return;
      }

      if (!text.trim()) {
        return;
      }

      const event: IMessageEvent = {
        messageGuid,
        chatGuid,
        senderAddress,
        text: text.trim(),
        isFromMe,
      };

      for (const listener of this.messageListeners) {
        try {
          listener(event);
        } catch (e) {
          console.error('Vault Chat: iMessage message listener error:', e);
        }
      }
    } catch (e) {
      console.error('Vault Chat: Failed to parse iMessage event:', e);
    }
  }

  /**
   * Schedule a reconnection attempt after an unexpected disconnect.
   */
  private scheduleReconnect(): void {
    if (this.deliberateDisconnect) {
      return;
    }

    if (this.reconnectTimer !== null) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.debug('Vault Chat: iMessage attempting reconnect...');
      this.connect().catch((e) => {
        console.error('Vault Chat: iMessage reconnect failed:', e);
      });
    }, 5000);
  }

  private setStatus(status: IMessageConnectionStatus): void {
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
