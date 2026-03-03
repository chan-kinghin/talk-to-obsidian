import type { ChannelDescriptor } from '../channels/types';

export const feishuChannel: ChannelDescriptor = {
  id: 'feishu',
  name: 'Feishu Integration',
  settingsFields: [
    {
      key: 'appId',
      label: 'Feishu App ID',
      desc: 'Your Feishu app ID',
      placeholder: 'Enter Feishu App ID',
    },
    {
      key: 'appSecret',
      label: 'Feishu App Secret',
      desc: 'Your Feishu app secret',
      placeholder: 'Enter Feishu App Secret',
    },
  ],
  isReady: (settings) =>
    Boolean(settings.feishu.appId && settings.feishu.appSecret),

  init: async (agentCore, settings, vaultName) => {
    const { FeishuBot } = await import('./feishu-bot');
    const { FeishuHandler } = await import('./feishu-handler');

    const bot = new FeishuBot({
      appId: settings.feishu.appId,
      appSecret: settings.feishu.appSecret,
    });

    const handler = new FeishuHandler(agentCore, vaultName, bot);
    handler.start();

    return {
      connect: () => bot.connect(),
      disconnect: () => bot.disconnect(),
      getStatus: () => bot.getStatus(),
    };
  },
};
