import type { SearchResult } from '../../types';

export interface DisplayMessage {
  type: 'user' | 'assistant' | 'search-results' | 'tool-activity' | 'loading';
  content?: string;
  results?: SearchResult[];
  toolName?: string;
  toolInput?: string;
  toolOutput?: string;
}

export class MessageList {
  private containerEl: HTMLElement;
  private onResultClick: (filePath: string) => void;

  constructor(parentEl: HTMLElement, onResultClick: (filePath: string) => void) {
    this.containerEl = parentEl.createDiv({ cls: 'vault-chat-messages' });
    this.onResultClick = onResultClick;
    this.showEmpty();
  }

  showEmpty(): void {
    this.containerEl.empty();
    const emptyEl = this.containerEl.createDiv({ cls: 'vault-chat-empty' });
    emptyEl.createDiv({ cls: 'vault-chat-empty-icon', text: '\u{1F50D}' });
    emptyEl.createDiv({
      cls: 'vault-chat-empty-text',
      text: 'Search your vault\nType a query to find relevant notes',
    });
  }

  addMessage(message: DisplayMessage): HTMLElement {
    // Remove empty state if present
    const emptyEl = this.containerEl.querySelector('.vault-chat-empty');
    if (emptyEl) {
      emptyEl.remove();
    }

    let el: HTMLElement;

    switch (message.type) {
      case 'user':
        el = this.renderUserMessage(message.content ?? '');
        break;
      case 'assistant':
        el = this.renderAssistantMessage(message.content ?? '');
        break;
      case 'search-results':
        el = this.renderSearchResults(message.results ?? []);
        break;
      case 'tool-activity':
        el = this.renderToolActivity(
          message.toolName ?? '',
          message.toolInput ?? '',
          message.toolOutput ?? ''
        );
        break;
      case 'loading':
        el = this.renderLoading();
        break;
      default:
        el = this.containerEl.createDiv();
    }

    this.scrollToBottom();
    return el;
  }

  removeLoading(): void {
    const loading = this.containerEl.querySelector('.vault-chat-loading');
    if (loading) {
      loading.remove();
    }
  }

  clear(): void {
    this.showEmpty();
  }

  private renderUserMessage(content: string): HTMLElement {
    const msgEl = this.containerEl.createDiv({
      cls: 'vault-chat-message vault-chat-message-user',
    });
    msgEl.createDiv({ cls: 'vault-chat-message-content', text: content });
    return msgEl;
  }

  private renderAssistantMessage(content: string): HTMLElement {
    const msgEl = this.containerEl.createDiv({
      cls: 'vault-chat-message vault-chat-message-assistant',
    });
    msgEl.createDiv({ cls: 'vault-chat-message-content', text: content });
    return msgEl;
  }

  private renderSearchResults(results: SearchResult[]): HTMLElement {
    const wrapperEl = this.containerEl.createDiv({
      cls: 'vault-chat-message vault-chat-message-assistant',
    });

    if (results.length === 0) {
      wrapperEl.createDiv({
        cls: 'vault-chat-message-content',
        text: 'No results found.',
      });
      return wrapperEl;
    }

    wrapperEl.createDiv({
      cls: 'vault-chat-message-role',
      text: `${results.length} result${results.length === 1 ? '' : 's'}`,
    });

    for (const result of results) {
      const resultEl = wrapperEl.createDiv({ cls: 'vault-chat-search-result' });

      const titleEl = resultEl.createDiv({
        cls: 'vault-chat-search-result-title',
        text: result.fileName,
      });
      titleEl.addEventListener('click', () => {
        this.onResultClick(result.filePath);
      });

      resultEl.createDiv({
        cls: 'vault-chat-search-result-path',
        text: result.filePath,
      });

      if (result.snippet) {
        resultEl.createDiv({
          cls: 'vault-chat-search-result-snippet',
          text: result.snippet,
        });
      }

      if (result.tags.length > 0) {
        resultEl.createDiv({
          cls: 'vault-chat-search-result-path',
          text: `Tags: ${result.tags.join(', ')}`,
        });
      }
    }

    return wrapperEl;
  }

  private renderToolActivity(
    toolName: string,
    toolInput: string,
    toolOutput: string
  ): HTMLElement {
    const activityEl = this.containerEl.createDiv({
      cls: 'vault-chat-tool-activity',
    });

    const headerEl = activityEl.createDiv({ cls: 'vault-chat-tool-header' });
    const iconEl = headerEl.createSpan({ cls: 'vault-chat-tool-icon', text: '\u25B6' });
    headerEl.createSpan({ cls: 'vault-chat-tool-name', text: toolName });

    const detailEl = activityEl.createDiv({ cls: 'vault-chat-tool-detail' });
    if (toolInput) {
      detailEl.createEl('strong', { text: 'Input: ' });
      detailEl.appendText(toolInput + '\n');
    }
    if (toolOutput) {
      detailEl.createEl('strong', { text: 'Output: ' });
      detailEl.appendText(toolOutput);
    }

    headerEl.addEventListener('click', () => {
      iconEl.classList.toggle('expanded');
      detailEl.classList.toggle('expanded');
    });

    return activityEl;
  }

  private renderLoading(): HTMLElement {
    const loadingEl = this.containerEl.createDiv({ cls: 'vault-chat-loading' });
    loadingEl.createSpan({ text: 'Searching' });
    loadingEl.createSpan({ cls: 'vault-chat-loading-dots' });
    return loadingEl;
  }

  private scrollToBottom(): void {
    requestAnimationFrame(() => {
      this.containerEl.scrollTop = this.containerEl.scrollHeight;
    });
  }
}
