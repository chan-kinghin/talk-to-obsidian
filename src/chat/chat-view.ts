import { ItemView, TFile, WorkspaceLeaf } from 'obsidian';
import type VaultChatPlugin from '../main';
import type { AgentEvent, ChatMessage } from '../types';
import { MessageList } from './components/message-list';
import { InputBar } from './components/input-bar';
import { SourcePanel } from './components/source-panel';
import { ChatStore } from './chat-store';
import { resolveWikiLink } from '../utils/links';
import type { ConnectionState } from '../utils/status';

export const VIEW_TYPE_VAULT_CHAT = 'vault-chat-view';

export class ChatView extends ItemView {
  private plugin: VaultChatPlugin;
  private messageList!: MessageList;
  private inputBar!: InputBar;
  private sourcePanel!: SourcePanel;
  private chatStore!: ChatStore;
  private indexStatusEl!: HTMLElement;
  private modeToggleEl!: HTMLElement;
  private statusDotEl!: HTMLElement;
  private currentMode: 'readonly' | 'full' = 'readonly';
  private unsubscribeStatus?: () => void;

  constructor(leaf: WorkspaceLeaf, plugin: VaultChatPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.currentMode = plugin.settings.agent.mode;
  }

  getViewType(): string {
    return VIEW_TYPE_VAULT_CHAT;
  }

  getDisplayText(): string {
    return 'Vault Chat';
  }

  getIcon(): string {
    return 'message-circle';
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();

    // Initialize chat store
    this.chatStore = new ChatStore(this.plugin.settings.agent.maxTurns);

    const container = contentEl.createDiv({ cls: 'vault-chat-container' });

    // Header
    const header = container.createDiv({ cls: 'vault-chat-header' });
    const titleArea = header.createDiv({ cls: 'vault-chat-header-title-area' });
    this.statusDotEl = titleArea.createEl('span', { cls: 'vault-chat-status-dot' });
    titleArea.createEl('span', { text: 'Vault Chat', cls: 'vault-chat-header-title' });
    this.updateStatusDot(this.plugin.getLLMStatus().getState());

    // Listen for status changes
    this.unsubscribeStatus = this.plugin.getLLMStatus().onChange((event) => {
      this.updateStatusDot(event.current);
    });

    const actions = header.createDiv({ cls: 'vault-chat-header-actions' });

    // Mode toggle
    this.modeToggleEl = actions.createEl('button', {
      attr: { 'aria-label': 'Toggle mode' },
    });
    this.modeToggleEl.classList.add('vault-chat-mode-toggle');
    this.updateModeDisplay();
    this.modeToggleEl.addEventListener('click', () => {
      this.toggleMode();
    });

    // New chat button
    const newChatBtn = actions.createEl('button', {
      attr: { 'aria-label': 'New Chat' },
      text: 'New Chat',
    });
    newChatBtn.classList.add('vault-chat-new-chat-btn');
    newChatBtn.addEventListener('click', () => {
      this.chatStore.clear();
      this.messageList.clear();
      this.sourcePanel.clear();
    });

    // Message list
    this.messageList = new MessageList(container, (filePath) => {
      this.openFile(filePath);
    });

    // Source panel
    this.sourcePanel = new SourcePanel(
      container,
      (filePath) => this.openFile(filePath),
      (linkText) => resolveWikiLink(this.app, linkText)
    );

    // Index status
    this.indexStatusEl = container.createDiv({ cls: 'vault-chat-index-status' });
    this.updateIndexStatus();

    // Input bar
    this.inputBar = new InputBar(container, (text) => {
      this.handleQuery(text);
    });

    this.inputBar.focus();
  }

  async onClose(): Promise<void> {
    this.unsubscribeStatus?.();
    this.contentEl.empty();
  }

  private updateStatusDot(state: ConnectionState): void {
    const titles: Record<ConnectionState, string> = {
      connected: 'LLM connected',
      connecting: 'Connecting to LLM...',
      disconnected: 'LLM not configured',
      error: 'LLM connection error',
    };
    this.statusDotEl.className = `vault-chat-status-dot vault-chat-status-${state}`;
    this.statusDotEl.textContent = '\u25CF ';
    this.statusDotEl.title = titles[state];
  }

  async updateIndexStatus(): Promise<void> {
    const count = await this.plugin.getIndexedDocumentCount();
    this.indexStatusEl.textContent = `${count} notes indexed`;
  }

  private toggleMode(): void {
    this.currentMode = this.currentMode === 'readonly' ? 'full' : 'readonly';
    this.updateModeDisplay();
  }

  private updateModeDisplay(): void {
    if (this.currentMode === 'full') {
      this.modeToggleEl.textContent = 'Full';
      this.modeToggleEl.classList.add('vault-chat-mode-full');
      this.modeToggleEl.classList.remove('vault-chat-mode-readonly');
    } else {
      this.modeToggleEl.textContent = 'Read-only';
      this.modeToggleEl.classList.add('vault-chat-mode-readonly');
      this.modeToggleEl.classList.remove('vault-chat-mode-full');
    }
  }

  private async handleQuery(query: string): Promise<void> {
    // Show user message
    this.messageList.addMessage({ type: 'user', content: query });

    // Store user message in history
    this.chatStore.addMessage({ role: 'user', content: query });

    const agentCore = this.plugin.getAgentCore();
    if (!agentCore) {
      this.messageList.addMessage({
        type: 'assistant',
        content: 'Agent not initialized. Please configure your LLM API key in Settings → Vault Chat.',
      });
      return;
    }

    if (!this.plugin.settings.llm.apiKey) {
      this.messageList.addMessage({
        type: 'assistant',
        content: 'No API key configured. Go to Settings → Vault Chat → LLM Configuration to add your API key.',
      });
      return;
    }

    // Show loading
    this.messageList.addMessage({ type: 'loading' });
    this.inputBar.setEnabled(false);

    const history = this.chatStore.getHistory();
    // Remove the last user message since agent-core adds it
    const historyForAgent = history.slice(0, -1);
    let lastAnswerContent = '';

    try {
      const events = agentCore.run(query, historyForAgent, this.currentMode);

      for await (const event of events) {
        this.handleAgentEvent(event);
        if (event.type === 'answer') {
          lastAnswerContent = event.content;
        }
      }

      // Store assistant answer in history
      if (lastAnswerContent) {
        this.chatStore.addMessage({ role: 'assistant', content: lastAnswerContent });
        this.sourcePanel.update(lastAnswerContent);
      }
    } catch (e) {
      this.messageList.removeLoading();
      const errorMsg = e instanceof Error ? e.message : 'Unknown error';
      let userMessage = `Error: ${errorMsg}`;

      // Provide more helpful messages for common errors
      if (errorMsg.includes('401') || errorMsg.toLowerCase().includes('invalid api key')) {
        userMessage = 'Invalid API key. Please check your key in Settings → Vault Chat → LLM Configuration.';
        this.plugin.getLLMStatus().setState('error', 'Invalid API key');
      } else if (errorMsg.includes('fetch') || errorMsg.includes('network') || errorMsg.includes('Failed to fetch')) {
        userMessage = 'Network error. Please check your internet connection and API endpoint.';
        this.plugin.getLLMStatus().setState('error', 'Network error');
      } else if (errorMsg.includes('timeout')) {
        userMessage = 'Request timed out. The LLM took too long to respond. Please try again.';
      }

      this.messageList.addMessage({
        type: 'assistant',
        content: userMessage,
      });
    }

    this.inputBar.setEnabled(true);
    this.inputBar.focus();
  }

  private handleAgentEvent(event: AgentEvent): void {
    switch (event.type) {
      case 'tool_use':
        this.messageList.removeLoading();
        this.messageList.addMessage({
          type: 'tool-activity',
          toolName: event.tool ?? '',
          toolInput: event.input ? JSON.stringify(event.input, null, 2) : '',
          toolOutput: this.truncateOutput(event.output ?? ''),
        });
        // Re-add loading for next step
        this.messageList.addMessage({ type: 'loading' });
        break;

      case 'answer':
        this.messageList.removeLoading();
        this.messageList.addMessage({
          type: 'assistant',
          content: event.content,
        });
        break;

      case 'error':
        this.messageList.removeLoading();
        this.messageList.addMessage({
          type: 'assistant',
          content: `Error: ${event.content}`,
        });
        break;
    }
  }

  private truncateOutput(output: string): string {
    const maxLen = 500;
    if (output.length <= maxLen) return output;
    return output.slice(0, maxLen) + '... (truncated)';
  }

  private async openFile(filePath: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file) {
      await this.app.workspace.getLeaf(false).openFile(file as TFile);
    }
  }
}
