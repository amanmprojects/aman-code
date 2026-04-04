import type {LanguageModel} from 'ai';
import {createOpenAICompatible} from '@ai-sdk/openai-compatible';

const litellm = createOpenAICompatible({
	baseURL: 'https://openai-litellm.duckdns.org/v1',
	apiKey: 'sk-9833006363',
	name: 'litellm',
});

export const modelList: [LanguageModel, ...LanguageModel[]] = [
	litellm('vertex-glm-4.7'),
];
