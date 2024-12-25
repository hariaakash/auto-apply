import { ChatOllama } from "npm:@langchain/ollama";
import { ChatOpenAI } from "npm:@langchain/openai";
import { SUPPORTED_LLM_TYPES } from "../helpers/constants.ts";

export type AIAdapterModel = ChatOllama | ChatOpenAI;

export type ModelArgs = {
	modelType: string;
	baseUrl?: string;
	apiKey?: string;
	model?: string;
};

export class AIAdapter {
	private model: AIAdapterModel;
	protected temperature = 0.4;

	constructor({ modelType, baseUrl, apiKey, model }: ModelArgs) {
		if (modelType === SUPPORTED_LLM_TYPES.OLLAMA) {
			this.model = new ChatOllama({
				model,
				temperature: this.temperature,
				baseUrl,
			});
		} else if (modelType === SUPPORTED_LLM_TYPES.OPENAI) {
			this.model = new ChatOpenAI({
				model: modelType,
				temperature: this.temperature,
				apiKey,
			});
		} else {
			throw new Error(`Unsupported model type: ${modelType}`);
		}
	}

	protected async invoke(prompt: string): Promise<string> {
		const { content } = await this.model.invoke(prompt);
		const cleanOutput = this.cleanLLMOutput(content as string);
		return cleanOutput;
	}

	private cleanLLMOutput(output: string): string {
		return output.replace(/\*/g, "").replace(/#/g, "").trim();
	}
}
