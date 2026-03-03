import { PluginSettings } from '../types';

export const DEFAULT_SETTINGS: PluginSettings = {
  llm: {
    provider: 'qwen',
    apiKey: '',
    model: 'qwen-plus',
    customEndpoint: '',
    customModel: '',
  },
  feishu: {
    enabled: false,
    appId: '',
    appSecret: '',
  },
  telegram: {
    enabled: false,
    botToken: '',
    allowedUserIds: '',
  },
  imessage: {
    enabled: false,
    serverUrl: '',
    password: '',
    allowedAddresses: '',
  },
  agent: {
    mode: 'readonly',
    maxTurns: 20,
    maxToolRounds: 10,
  },
};
