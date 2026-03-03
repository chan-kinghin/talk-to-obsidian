/**
 * ChannelRegistry — manages lifecycle of all registered messaging channels.
 *
 * Handles initialization, disconnection, status queries, and renders
 * a unified settings UI for all channels. Adding a new channel requires
 * zero changes here — just register its ChannelDescriptor.
 */

import { Platform, Setting } from 'obsidian';
import type { AgentCore } from '../agent/agent-core';
import type { PluginSettings } from '../types';
import type {
  ChannelDescriptor,
  ChannelInstance,
  ConnectionStatus,
} from './types';

export class ChannelRegistry {
  private descriptors: ChannelDescriptor[] = [];
  private instances: Map<string, ChannelInstance> = new Map();

  /** Register a channel descriptor. Call once per channel at load time. */
  registerChannel(descriptor: ChannelDescriptor): void {
    this.descriptors.push(descriptor);
  }

  /**
   * Initialize (or re-initialize) all registered channels.
   * Disconnects any existing instances first, then starts channels
   * whose settings indicate they are ready.
   *
   * Desktop-only — skips silently on mobile.
   */
  async initAll(
    agentCore: AgentCore,
    settings: PluginSettings,
    vaultName: string
  ): Promise<void> {
    if (!Platform.isDesktop) {
      return;
    }

    for (const desc of this.descriptors) {
      // Disconnect existing instance if any
      const existing = this.instances.get(desc.id);
      if (existing) {
        try {
          await existing.disconnect();
        } catch {
          // Ignore disconnect errors during re-init
        }
        this.instances.delete(desc.id);
      }

      // Get the channel's enabled flag from settings
      const channelSettings = settings[desc.id as keyof PluginSettings] as
        | { enabled?: boolean }
        | undefined;
      if (!channelSettings?.enabled) {
        continue;
      }

      // Check if credentials are configured
      if (!desc.isReady(settings)) {
        console.debug(`Vault Chat: ${desc.name} enabled but credentials not set`);
        continue;
      }

      try {
        const instance = await desc.init(agentCore, settings, vaultName);
        await instance.connect();
        this.instances.set(desc.id, instance);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        console.error(`Vault Chat: Failed to initialize ${desc.name}:`, msg);
      }
    }
  }

  /** Disconnect all active channel instances. */
  async disconnectAll(): Promise<void> {
    for (const [id, instance] of this.instances) {
      try {
        await instance.disconnect();
      } catch {
        // Ignore disconnect errors during shutdown
      }
      this.instances.delete(id);
    }
  }

  /** Get the connection status of a specific channel. */
  getStatus(id: string): ConnectionStatus {
    const instance = this.instances.get(id);
    if (!instance) {
      return 'disconnected';
    }
    return instance.getStatus();
  }

  /**
   * Render settings UI for all registered channels.
   * Generates status indicator, enable toggle, and credential fields
   * for each channel — no channel-specific code needed here.
   */
  renderSettings(
    containerEl: HTMLElement,
    settings: PluginSettings,
    saveSettings: () => Promise<void>,
    refreshDisplay: () => void
  ): void {
    if (!Platform.isDesktop) {
      return;
    }

    const statusLabels: Record<string, string> = {
      connected: 'Connected',
      disconnected: 'Disconnected',
      error: 'Error',
    };

    for (const desc of this.descriptors) {
      containerEl.createEl('h2', { text: desc.name });

      // Connection status indicator
      const status = this.getStatus(desc.id);
      const statusSetting = new Setting(containerEl)
        .setName('Connection Status')
        .setDesc(
          `${desc.name.split(' ')[0]} bot is currently ${statusLabels[status] ?? 'unknown'}`
        );
      statusSetting.descEl.createEl('span', {
        cls: `vault-chat-status-dot vault-chat-status-${status}`,
        text: ' \u25CF',
      });

      // Enable toggle
      const channelSettings = settings[desc.id as keyof PluginSettings] as
        | Record<string, unknown>
        | undefined;
      new Setting(containerEl)
        .setName(`Enable ${desc.name.split(' ')[0]} Bot`)
        .setDesc(`Connect a ${desc.name.split(' ')[0]} bot to query your vault via DM`)
        .addToggle((toggle) =>
          toggle
            .setValue((channelSettings?.enabled as boolean) ?? false)
            .onChange(async (value) => {
              if (channelSettings) {
                channelSettings.enabled = value;
              }
              await saveSettings();
              refreshDisplay();
            })
        );

      // Credential / config fields
      for (const field of desc.settingsFields) {
        new Setting(containerEl)
          .setName(field.label)
          .setDesc(field.desc)
          .addText((text) => {
            text
              .setPlaceholder(field.placeholder)
              .setValue(
                String((channelSettings?.[field.key] as string) ?? '')
              )
              .onChange(async (value) => {
                if (channelSettings) {
                  channelSettings[field.key] = value;
                }
                await saveSettings();
              });
            if (field.secret) {
              text.inputEl.type = 'password';
            }
          });
      }
    }
  }
}
