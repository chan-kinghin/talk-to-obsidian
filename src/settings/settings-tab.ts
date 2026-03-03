import { App, PluginSettingTab, Setting } from 'obsidian';
import type VaultChatPlugin from '../main';
import { PROVIDERS, getProvider, getDefaultModel } from './providers';

export class VaultChatSettingTab extends PluginSettingTab {
  plugin: VaultChatPlugin;

  constructor(app: App, plugin: VaultChatPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ── LLM Configuration ──
    containerEl.createEl('h2', { text: 'LLM Configuration' });

    // Provider dropdown
    new Setting(containerEl)
      .setName('Provider')
      .setDesc('Select your LLM provider')
      .addDropdown((dropdown) => {
        for (const p of PROVIDERS) {
          dropdown.addOption(p.id, p.name);
        }
        dropdown.addOption('custom', 'Custom (OpenAI-compatible)');
        dropdown.setValue(this.plugin.settings.llm.provider);
        dropdown.onChange(async (value) => {
          this.plugin.settings.llm.provider = value;
          // Set default model when switching providers
          if (value !== 'custom') {
            this.plugin.settings.llm.model = getDefaultModel(value);
          }
          await this.plugin.saveSettings();
          this.display(); // Re-render to show/hide custom fields
        });
      });

    // Model dropdown (for preset providers)
    const provider = getProvider(this.plugin.settings.llm.provider);
    if (provider) {
      new Setting(containerEl)
        .setName('Model')
        .setDesc('Model to use for chat completions')
        .addDropdown((dropdown) => {
          for (const m of provider.models) {
            dropdown.addOption(m, m);
          }
          dropdown.setValue(this.plugin.settings.llm.model);
          dropdown.onChange(async (value) => {
            this.plugin.settings.llm.model = value;
            await this.plugin.saveSettings();
          });
        });
    }

    // Custom endpoint + model fields (only when provider is 'custom')
    if (this.plugin.settings.llm.provider === 'custom') {
      new Setting(containerEl)
        .setName('API Endpoint')
        .setDesc('OpenAI-compatible API endpoint URL (without /chat/completions)')
        .addText((text) =>
          text
            .setPlaceholder('https://api.example.com/v1')
            .setValue(this.plugin.settings.llm.customEndpoint)
            .onChange(async (value) => {
              this.plugin.settings.llm.customEndpoint = value;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName('Model')
        .setDesc('Model name to use for chat completions')
        .addText((text) =>
          text
            .setPlaceholder('gpt-4')
            .setValue(this.plugin.settings.llm.customModel)
            .onChange(async (value) => {
              this.plugin.settings.llm.customModel = value;
              await this.plugin.saveSettings();
            })
        );
    }

    // API key with save button
    const apiKeySetting = new Setting(containerEl)
      .setName('API Key')
      .setDesc('Your LLM provider API key');

    apiKeySetting.addText((text) => {
      text
        .setPlaceholder('Enter your API key')
        .setValue(this.plugin.settings.llm.apiKey);
      text.inputEl.type = 'password';
      // Save on blur instead of every keystroke
      text.inputEl.addEventListener('change', async () => {
        this.plugin.settings.llm.apiKey = text.getValue();
        await this.plugin.saveSettings();
      });
    });

    // "Get API key" link
    if (provider) {
      const linkSetting = new Setting(containerEl)
        .setName('Get API Key')
        .setDesc(`Get your ${provider.name} API key`);
      const linkEl = linkSetting.descEl.createEl('a', {
        text: provider.apiKeyUrl,
        href: provider.apiKeyUrl,
      });
      linkEl.setAttr('target', '_blank');
    }

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

    // ── Agent Configuration ──
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

    // ── Channel settings — rendered by the registry (desktop only) ──
    this.plugin.channelRegistry.renderSettings(
      containerEl,
      this.plugin.settings,
      async () => {
        await this.plugin.saveSettings();
      },
      () => {
        this.display();
      }
    );

    // ── Feishu Setup Guide (after channel settings) ──
    this.renderFeishuGuide(containerEl);
  }

  private renderFeishuGuide(containerEl: HTMLElement): void {
    const details = containerEl.createEl('details', {
      cls: 'vault-chat-setup-guide',
    });
    details.createEl('summary', { text: 'Feishu Bot Setup Guide' });

    const ol = details.createEl('ol');
    const steps = [
      'Go to open.feishu.cn and create a new app',
      'Enable the "Bot" capability under Features',
      'In "Event subscriptions", add: im.message.receive_v1',
      'Set the subscription mode to "WebSocket" (no public URL needed)',
      'Copy the App ID and App Secret into the Feishu settings above',
      'Enable the toggle and the bot will connect automatically',
    ];
    for (const step of steps) {
      ol.createEl('li', { text: step });
    }
  }

  private async testLLMConnection(): Promise<void> {
    const { apiKey, provider, model, customEndpoint, customModel } =
      this.plugin.settings.llm;
    if (!apiKey) {
      throw new Error('API key is not set');
    }

    let endpoint: string;
    let testModel: string;
    if (provider === 'custom') {
      endpoint = customEndpoint;
      testModel = customModel;
    } else {
      endpoint = getProvider(provider)?.endpoint ?? '';
      testModel = model;
    }

    if (!endpoint) {
      throw new Error('API endpoint is not configured');
    }

    const url = `${endpoint.replace(/\/+$/, '')}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: testModel,
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
