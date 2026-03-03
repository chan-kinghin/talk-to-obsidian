import { PluginSettings } from '../types';

export const DEFAULT_SETTINGS: PluginSettings = {
  llm: {
    apiKey: '',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  },
  feishu: {
    enabled: false,
    appId: '',
    appSecret: '',
  },
  agent: {
    mode: 'readonly',
    maxTurns: 20,
    maxToolRounds: 10,
  },
};
