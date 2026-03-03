/**
 * Central registry of all messaging channels.
 *
 * To add a new channel:
 *   1. Create src/<channel>/index.ts exporting a ChannelDescriptor
 *   2. Add the import + entry here
 *   3. Add the channel's settings type to PluginSettings in types.ts
 *   4. Add defaults in settings/settings.ts
 *
 * That's it — zero changes to main.ts or settings-tab.ts.
 */

import type { ChannelDescriptor } from './types';
import { feishuChannel } from '../feishu/index';
import { telegramChannel } from '../telegram/index';
import { imessageChannel } from '../imessage/index';

export const ALL_CHANNELS: ChannelDescriptor[] = [
  feishuChannel,
  telegramChannel,
  imessageChannel,
];
