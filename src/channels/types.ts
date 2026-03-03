/**
 * Channel registry types — shared interfaces for pluggable messaging channels.
 *
 * Each channel (Feishu, Telegram, iMessage, etc.) implements a ChannelDescriptor
 * that describes its settings fields, readiness check, and initialization logic.
 */

import type { AgentCore } from '../agent/agent-core';
import type { PluginSettings } from '../types';

/** Unified connection status for all channels. */
export type ConnectionStatus = 'disconnected' | 'connected' | 'error';

/** Describes a single settings field for a channel. */
export interface ChannelSettingsField {
  /** Settings key within the channel's settings object (e.g. 'botToken'). */
  key: string;
  /** Display label in the settings UI. */
  label: string;
  /** Description text shown below the setting. */
  desc: string;
  /** Placeholder text for the input. */
  placeholder: string;
  /** If true, render as a password input. */
  secret?: boolean;
}

/**
 * Registration manifest for a messaging channel.
 * This is the ONE thing a new channel needs to export.
 */
export interface ChannelDescriptor {
  /** Unique channel identifier (e.g. 'feishu', 'telegram'). */
  id: string;
  /** Display name for the settings UI (e.g. 'Feishu Integration'). */
  name: string;
  /** Settings fields to render (credentials, allowlist, etc.). */
  settingsFields: ChannelSettingsField[];
  /** Check whether the channel has all required credentials configured. */
  isReady: (settings: PluginSettings) => boolean;
  /** Initialize the channel. Returns a ChannelInstance for lifecycle management. */
  init: (
    agentCore: AgentCore,
    settings: PluginSettings,
    vaultName: string
  ) => Promise<ChannelInstance>;
}

/** What init() returns — a running channel instance with lifecycle hooks. */
export interface ChannelInstance {
  /** Start connection (e.g. WebSocket connect, polling start). */
  connect: () => Promise<void>;
  /** Stop and clean up. */
  disconnect: () => Promise<void>;
  /** Current connection status. */
  getStatus: () => ConnectionStatus;
}
