export interface LLMProvider {
  id: string;
  name: string;
  endpoint: string;
  models: string[];
  apiKeyUrl: string;
}

export const PROVIDERS: LLMProvider[] = [
  {
    id: 'qwen',
    name: 'Qwen (DashScope)',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen-flash'],
    apiKeyUrl: 'https://dashscope.console.aliyun.com/apiKey',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'glm',
    name: 'GLM (Zhipu AI)',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-plus', 'glm-4-flash', 'glm-4-long'],
    apiKeyUrl: 'https://open.bigmodel.cn',
  },
  {
    id: 'minimax',
    name: 'Minimax',
    endpoint: 'https://api.minimax.io/v1',
    models: ['MiniMax-M1', 'MiniMax-M1-highspeed'],
    apiKeyUrl: 'https://platform.minimax.io',
  },
];

export function getProvider(id: string): LLMProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function getDefaultModel(providerId: string): string {
  const provider = getProvider(providerId);
  return provider?.models[0] ?? '';
}
