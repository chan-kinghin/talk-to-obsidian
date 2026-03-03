import type { ChannelDescriptor } from '../channels/types';

export const imessageChannel: ChannelDescriptor = {
  id: 'imessage',
  name: 'iMessage Integration (BlueBubbles)',
  settingsFields: [
    {
      key: 'serverUrl',
      label: 'BlueBubbles Server URL',
      desc: 'Your BlueBubbles server URL',
      placeholder: 'http://localhost:1234',
    },
    {
      key: 'password',
      label: 'BlueBubbles Password',
      desc: 'Your BlueBubbles server password',
      placeholder: 'Enter BlueBubbles Password',
      secret: true,
    },
    {
      key: 'allowedAddresses',
      label: 'Allowed Addresses',
      desc: 'Comma-separated phone numbers or emails (e.g., +1234567890,user@example.com). Leave empty to allow all senders.',
      placeholder: '+1234567890,user@example.com',
    },
  ],
  isReady: (settings) =>
    Boolean(settings.imessage.serverUrl && settings.imessage.password),

  init: async (agentCore, settings, vaultName) => {
    const { IMessageBot } = await import('./imessage-bot');
    const { IMessageHandler } = await import('./imessage-handler');
    const { AllowlistFilter } = await import('../utils/allowlist');

    const bot = new IMessageBot({
      serverUrl: settings.imessage.serverUrl,
      password: settings.imessage.password,
    });

    const allowlist = new AllowlistFilter(settings.imessage.allowedAddresses);
    const handler = new IMessageHandler(agentCore, vaultName, bot, allowlist);
    handler.start();

    return {
      connect: () => bot.connect(),
      disconnect: () => bot.disconnect(),
      getStatus: () => bot.getStatus(),
    };
  },
};
