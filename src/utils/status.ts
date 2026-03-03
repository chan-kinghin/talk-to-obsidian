export type ConnectionState = 'connected' | 'connecting' | 'disconnected' | 'error';

export interface StatusChangeEvent {
  previous: ConnectionState;
  current: ConnectionState;
  message?: string;
}

type StatusListener = (event: StatusChangeEvent) => void;

export class StatusIndicator {
  private state: ConnectionState = 'disconnected';
  private message = '';
  private listeners: StatusListener[] = [];

  getState(): ConnectionState {
    return this.state;
  }

  getMessage(): string {
    return this.message;
  }

  setState(newState: ConnectionState, message = ''): void {
    if (this.state === newState && this.message === message) {
      return;
    }
    const previous = this.state;
    this.state = newState;
    this.message = message;
    this.emit({ previous, current: newState, message });
  }

  onChange(listener: StatusListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  destroy(): void {
    this.listeners = [];
  }

  private emit(event: StatusChangeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error('Vault Chat: Status listener error:', e);
      }
    }
  }
}
