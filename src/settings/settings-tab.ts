import { App, Platform, PluginSettingTab, Setting } from 'obsidian';
import type VaultChatPlugin from '../main';

export class VaultChatSettingTab extends PluginSettingTab {
  plugin: VaultChatPlugin;

  constructor(app: App, plugin: VaultChatPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // LLM Configuration
    containerEl.createEl('h2', { text: 'LLM Configuration' });

    new Setting(containerEl)
      .setName('API Key')
      .setDesc('Your LLM provider API key')
      .addText((text) =>
        text
          .setPlaceholder('Enter your API key')
          .setValue(this.plugin.settings.llm.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.llm.apiKey = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('API Endpoint')
      .setDesc('OpenAI-compatible API endpoint URL')
      .addText((text) =>
        text
          .setPlaceholder('https://dashscope.aliyuncs.com/compatible-mode/v1')
          .setValue(this.plugin.settings.llm.endpoint)
          .onChange(async (value) => {
            this.plugin.settings.llm.endpoint = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Model')
      .setDesc('Model name to use for chat completions')
      .addText((text) =>
        text
          .setPlaceholder('qwen-plus')
          .setValue(this.plugin.settings.llm.model)
          .onChange(async (value) => {
            this.plugin.settings.llm.model = value;
            await this.plugin.saveSettings();
          })
      );

    // Test LLM Connection button
    const testLLMSetting = new Setting(containerEl)
      .setName('Test Connection')
      .setDesc('Verify your LLM API key and endpoint work correctly');
    testLLMSetting.addButton((btn) =>
      btn.setButtonText('Test').onClick(async () => {
        btn.setButtonText('Testing...');
        btn.setDisabled(true);
        try {
          await this.testLLMConnection();
          testLLMSetting.setDesc('Connection successful!');
          testLLMSetting.descEl.classList.add('vault-chat-test-success');
          testLLMSetting.descEl.classList.remove('vault-chat-test-error');
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Unknown error';
          testLLMSetting.setDesc(`Connection failed: ${msg}`);
          testLLMSetting.descEl.classList.add('vault-chat-test-error');
          testLLMSetting.descEl.classList.remove('vault-chat-test-success');
        } finally {
          btn.setButtonText('Test');
          btn.setDisabled(false);
        }
      })
    );

    // Agent Configuration
    containerEl.createEl('h2', { text: 'Agent Configuration' });

    new Setting(containerEl)
      .setName('Agent Mode')
      .setDesc('Read-only: search and read only. Full: can also create/update notes.')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('readonly', 'Read-only')
          .addOption('full', 'Full')
          .setValue(this.plugin.settings.agent.mode)
          .onChange(async (value) => {
            this.plugin.settings.agent.mode = value as 'readonly' | 'full';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Max Conversation Turns')
      .setDesc('Maximum number of conversation turns to keep in context')
      .addText((text) =>
        text
          .setPlaceholder('20')
          .setValue(String(this.plugin.settings.agent.maxTurns))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.agent.maxTurns = num;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName('Max Tool Rounds')
      .setDesc('Maximum number of tool-use rounds per query (safety limit)')
      .addText((text) =>
        text
          .setPlaceholder('10')
          .setValue(String(this.plugin.settings.agent.maxToolRounds))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.agent.maxToolRounds = num;
              await this.plugin.saveSettings();
            }
          })
      );

    // Feishu Configuration — desktop only
    if (Platform.isDesktop) {
      containerEl.createEl('h2', { text: 'Feishu Integration' });

      // Connection status indicator
      const status = this.plugin.getFeishuStatus();
      const statusLabels: Record<string, string> = {
        connected: 'Connected',
        disconnected: 'Disconnected',
        error: 'Error',
      };

      const statusSetting = new Setting(containerEl)
        .setName('Connection Status')
        .setDesc(`Feishu bot is currently ${statusLabels[status] ?? 'unknown'}`);
      statusSetting.descEl.createEl('span', {
        cls: `vault-chat-status-dot vault-chat-status-${status}`,
        text: ' \u25CF',
      });

      new Setting(containerEl)
        .setName('Enable Feishu Bot')
        .setDesc('Connect a Feishu bot to query your vault via DM')
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.feishu.enabled)
            .onChange(async (value) => {
              this.plugin.settings.feishu.enabled = value;
              await this.plugin.saveSettings();
              // Re-render to update status
              this.display();
            })
        );

      new Setting(containerEl)
        .setName('Feishu App ID')
        .setDesc('Your Feishu app ID')
        .addText((text) =>
          text
            .setPlaceholder('Enter Feishu App ID')
            .setValue(this.plugin.settings.feishu.appId)
            .onChange(async (value) => {
              this.plugin.settings.feishu.appId = value;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName('Feishu App Secret')
        .setDesc('Your Feishu app secret')
        .addText((text) =>
          text
            .setPlaceholder('Enter Feishu App Secret')
            .setValue(this.plugin.settings.feishu.appSecret)
            .onChange(async (value) => {
              this.plugin.settings.feishu.appSecret = value;
              await this.plugin.saveSettings();
            })
        );
    }
  }

  private async testLLMConnection(): Promise<void> {
    const { apiKey, endpoint, model } = this.plugin.settings.llm;
    if (!apiKey) {
      throw new Error('API key is not set');
    }
    const url = `${endpoint.replace(/\/+$/, '')}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 1,
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      if (response.status === 401) {
        throw new Error('Invalid API key');
      }
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 100)}`);
    }
  }
}
