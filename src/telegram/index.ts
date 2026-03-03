import type { ChannelDescriptor } from '../channels/types';

export const telegramChannel: ChannelDescriptor = {
  id: 'telegram',
  name: 'Telegram Integration',
  settingsFields: [
    {
      key: 'botToken',
      label: 'Bot Token',
      desc: 'Telegram bot token from @BotFather',
      placeholder: 'Enter Telegram Bot Token',
      secret: true,
    },
    {
      key: 'allowedUserIds',
      label: 'Allowed User IDs',
      desc: 'Comma-separated Telegram user IDs (e.g., 123456,789012). Leave empty to allow all users.',
      placeholder: '123456,789012',
    },
  ],
  isReady: (settings) => Boolean(settings.telegram.botToken),

  init: async (agentCore, settings, vaultName) => {
    const { TelegramBot } = await import('./telegram-bot');
    const { TelegramHandler } = await import('./telegram-handler');
    const { AllowlistFilter } = await import('../utils/allowlist');

    const bot = new TelegramBot({
      botToken: settings.telegram.botToken,
    });

    const allowlist = new AllowlistFilter(settings.telegram.allowedUserIds);
    const handler = new TelegramHandler(agentCore, vaultName, bot, allowlist);
    handler.start();

    return {
      connect: () => bot.connect(),
      disconnect: () => bot.disconnect(),
      getStatus: () => bot.getStatus(),
    };
  },
};
