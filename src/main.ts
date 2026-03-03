import { Plugin, WorkspaceLeaf } from 'obsidian';
import { PluginSettings, SearchResult } from './types';
import { DEFAULT_SETTINGS } from './settings/settings';
import { VaultChatSettingTab } from './settings/settings-tab';
import { FTSIndex } from './search/fts-index';
import { VaultIndexer } from './search/indexer';
import { ChatView, VIEW_TYPE_VAULT_CHAT } from './chat/chat-view';
import { AgentCore } from './agent/agent-core';
import { ToolRegistry } from './agent/tool-registry';
import { createSearchVaultTool } from './agent/tools/search-vault';
import { createListFolderTool } from './agent/tools/list-folder';
import { createSearchByTagTool } from './agent/tools/search-by-tag';
import { createGetMetadataTool } from './agent/tools/get-metadata';
import { createGetBacklinksTool } from './agent/tools/get-backlinks';
import { createGetOutgoingTool } from './agent/tools/get-outgoing';
import { createReadNoteTool } from './agent/tools/read-note';
import { createCreateNoteTool } from './agent/tools/create-note';
import { createUpdateNoteTool } from './agent/tools/update-note';
import { createAppendNoteTool } from './agent/tools/append-note';
import { StatusIndicator } from './utils/status';
import { ChannelRegistry } from './channels/channel-registry';
import { ALL_CHANNELS } from './channels/all-channels';
import type { ConnectionStatus } from './channels/types';

export default class VaultChatPlugin extends Plugin {
  settings!: PluginSettings;
  channelRegistry: ChannelRegistry = new ChannelRegistry();
  private ftsIndex!: FTSIndex;
  private indexer!: VaultIndexer;
  private agentCore: AgentCore | null = null;
  private toolRegistry: ToolRegistry | null = null;
  private llmStatus: StatusIndicator = new StatusIndicator();

  async onload(): Promise<void> {
    await this.loadSettings();

    // Register all messaging channels
    for (const channel of ALL_CHANNELS) {
      this.channelRegistry.registerChannel(channel);
    }

    // Initialize FTS index
    this.ftsIndex = new FTSIndex();
    this.indexer = new VaultIndexer(this.app.vault, this.ftsIndex);

    // Initialize agent
    this.initAgent();

    // Register settings tab
    this.addSettingTab(new VaultChatSettingTab(this.app, this));

    // Register chat view
    this.registerView(VIEW_TYPE_VAULT_CHAT, (leaf: WorkspaceLeaf) => {
      return new ChatView(leaf, this);
    });

    // Add ribbon icon
    this.addRibbonIcon('message-circle', 'Open Vault Chat', () => {
      this.activateChatView();
    });

    // Add command
    this.addCommand({
      id: 'open-vault-chat',
      name: 'Open Vault Chat',
      callback: () => {
        this.activateChatView();
      },
    });

    // Build index when layout is ready
    this.app.workspace.onLayoutReady(async () => {
      await this.buildIndex();
      for (const ref of this.indexer.registerEventHandlers()) {
        this.registerEvent(ref);
      }

      // Initialize messaging channels (desktop only)
      if (this.agentCore) {
        const vaultName = this.app.vault.getName();
        await this.channelRegistry.initAll(this.agentCore, this.settings, vaultName);
      }
    });
  }

  async onunload(): Promise<void> {
    // Disconnect all messaging channels
    await this.channelRegistry.disconnectAll();

    // Clean up status indicator
    this.llmStatus.destroy();

    // Clean up views
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_VAULT_CHAT);
  }

  async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) ?? {};

    // Migrate old format: { endpoint, model } → { provider, model }
    if (saved.llm && 'endpoint' in saved.llm && !('provider' in saved.llm)) {
      const oldEndpoint: string = saved.llm.endpoint ?? '';
      const { PROVIDERS } = await import('./settings/providers');
      const matched = PROVIDERS.find((p) =>
        oldEndpoint.startsWith(p.endpoint.replace(/\/+$/, ''))
      );
      saved.llm.provider = matched?.id ?? 'custom';
      if (!matched) {
        saved.llm.customEndpoint = oldEndpoint;
        saved.llm.customModel = saved.llm.model ?? '';
      }
      delete saved.llm.endpoint;
    }

    this.settings = {
      llm: { ...DEFAULT_SETTINGS.llm, ...saved.llm },
      feishu: { ...DEFAULT_SETTINGS.feishu, ...saved.feishu },
      telegram: { ...DEFAULT_SETTINGS.telegram, ...saved.telegram },
      imessage: { ...DEFAULT_SETTINGS.imessage, ...saved.imessage },
      agent: { ...DEFAULT_SETTINGS.agent, ...saved.agent },
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    // Re-init agent when settings change (API key/endpoint/model may have changed)
    this.initAgent();
    // Re-init messaging channels when settings change
    if (this.agentCore) {
      const vaultName = this.app.vault.getName();
      await this.channelRegistry.initAll(this.agentCore, this.settings, vaultName);
    }
  }

  getAgentCore(): AgentCore | null {
    return this.agentCore;
  }

  getLLMStatus(): StatusIndicator {
    return this.llmStatus;
  }

  getChannelStatus(id: string): ConnectionStatus {
    return this.channelRegistry.getStatus(id);
  }

  async searchVault(query: string, limit = 10): Promise<SearchResult[]> {
    return this.ftsIndex.search(query, limit);
  }

  async getIndexedDocumentCount(): Promise<number> {
    return this.ftsIndex.getDocumentCount();
  }

  private initAgent(): void {
    this.toolRegistry = new ToolRegistry();

    // Level 1 — Discover
    this.toolRegistry.registerTool(createSearchVaultTool(this.ftsIndex), 1);
    this.toolRegistry.registerTool(createListFolderTool(this.app.vault), 1);
    this.toolRegistry.registerTool(createSearchByTagTool(this.app), 1);

    // Level 2 — Peek
    this.toolRegistry.registerTool(createGetMetadataTool(this.app), 2);
    this.toolRegistry.registerTool(createGetBacklinksTool(this.app), 2);
    this.toolRegistry.registerTool(createGetOutgoingTool(this.app), 2);

    // Level 3 — Read
    this.toolRegistry.registerTool(createReadNoteTool(this.app), 3);

    // Level 4 — Write (full mode only)
    this.toolRegistry.registerTool(createCreateNoteTool(this.app), 4);
    this.toolRegistry.registerTool(createUpdateNoteTool(this.app), 4);
    this.toolRegistry.registerTool(createAppendNoteTool(this.app), 4);

    this.agentCore = new AgentCore(this.toolRegistry, this.settings);

    // Update LLM status based on configuration
    if (!this.settings.llm.apiKey) {
      this.llmStatus.setState('disconnected', 'API key not configured');
    } else {
      this.llmStatus.setState('connected');
    }
  }

  private async buildIndex(): Promise<void> {
    try {
      const count = await this.indexer.buildFullIndex();
      console.debug(`Vault Chat: Index built with ${count} documents`);

      // Update chat view index status if open
      this.app.workspace.getLeavesOfType(VIEW_TYPE_VAULT_CHAT).forEach((leaf) => {
        const view = leaf.view;
        if (view instanceof ChatView) {
          view.updateIndexStatus();
        }
      });
    } catch (e) {
      console.error('Vault Chat: Failed to build index:', e);
    }
  }

  private async activateChatView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_VAULT_CHAT);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({
        type: VIEW_TYPE_VAULT_CHAT,
        active: true,
      });
      this.app.workspace.revealLeaf(leaf);
    }
  }
}
