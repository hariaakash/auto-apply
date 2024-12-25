import {
	numericQuestionTemplate,
	optionsTemplate,
	textualQuestionTemplate,
} from "../helpers/prompts.ts";
import { IWorkPreferences } from "../schemas/preferences.ts";
import { ITextResume } from "../schemas/textResume.ts";
import {
	IFormInputField,
	IFormOptionField,
	Option,
} from "../types/linkedin.ts";
import { AIAdapter, ModelArgs } from "./llm.ts";
import { PromptTemplate } from "npm:@langchain/core/prompts";

export class ChatLLM extends AIAdapter {
	private textResumeConfig: ITextResume;
	protected workPreferencesConfig: IWorkPreferences;

	constructor(
		textResumeConfig: ITextResume,
		workPreferencesConfig: IWorkPreferences,
		modelArgs: ModelArgs,
	) {
		super(modelArgs);
		this.textResumeConfig = textResumeConfig;
		this.workPreferencesConfig = workPreferencesConfig;
	}

	private preprocessTemplateString(template: string): string {
		// Add preprocessing logic if needed, for now returning as-is
		return this.dedent(template);
	}

	private dedent(text: string): string {
		// Normalize blank lines to just a newline character
		const blankLineRegex = /^[ \t]+$/gm;
		text = text.replace(blankLineRegex, "");

		// Find the common leading whitespace
		const leadingWhitespaceRegex = /^[ \t]*/gm;
		const indents = Array.from(text.matchAll(leadingWhitespaceRegex)).map(
			(match) => match[0],
		);
		const margin = indents.reduce((commonIndent, currentIndent) => {
			if (commonIndent === null) return currentIndent;
			let i = 0;
			while (
				i < commonIndent.length && i < currentIndent.length &&
				commonIndent[i] === currentIndent[i]
			) {
				i++;
			}
			return commonIndent.slice(0, i);
		}, null as string | null);

		// Remove the common leading whitespace
		if (margin) {
			const marginRegex = new RegExp(`^${margin}`, "gm");
			text = text.replace(marginRegex, "");
		}

		return text;
	}

	private extractNumberFromString(output: string): number {
		const match = output.match(/\d+/);
		if (match) {
			return parseInt(match[0], 10);
		}
		throw new Error("No number found in the string");
	}

	private findBestMatch(output: string, options: Option[]): Option {
		const bestMatch = options.find((option) => output.includes(option.option));
		return bestMatch || options[0];
	}

	public async answerQuestionFromOptions(
		field: IFormOptionField,
	): Promise<Option> {
		const funcTemplate = this.preprocessTemplateString(optionsTemplate);
		const prompt = PromptTemplate.fromTemplate(funcTemplate);

		const promptStr = await prompt.format({
			textResume: JSON.stringify(this.textResumeConfig),
			workPreferences: JSON.stringify(this.workPreferencesConfig),
			question: field.label,
			options: field.options.map((x) => x.option),
		});

		const content = await this.invoke(promptStr);
		// console.log(promptStr);
		console.log(`Answer: `, content);
		const res = this.findBestMatch(content, field.options);
		return res;
	}

	public async answerQuestionText(field: IFormInputField): Promise<string> {
		const funcTemplate = this.preprocessTemplateString(textualQuestionTemplate);
		const prompt = PromptTemplate.fromTemplate(funcTemplate);

		const promptStr = await prompt.format({
			textResume: JSON.stringify(this.textResumeConfig),
			workPreferences: JSON.stringify(this.workPreferencesConfig),
			question: field.label,
		});

		const content = await this.invoke(promptStr);
		return content;
	}

	public async answerQuestionNumeric(
		field: IFormInputField,
		defaultExperience: number = 1,
	): Promise<string> {
		const funcTemplate = this.preprocessTemplateString(numericQuestionTemplate);
		const prompt = PromptTemplate.fromTemplate(funcTemplate);

		const promptStr = await prompt.format({
			textResume: JSON.stringify(this.textResumeConfig),
			question: field.label,
		});

		try {
			const content = await this.invoke(promptStr);
			const extractedNumber = this.extractNumberFromString(content);
			return String(extractedNumber);
		} catch (_error) {
			console.warn(
				`Failed to extract number, using default experience: ${defaultExperience}`,
			);
			return String(defaultExperience);
		}
	}
}
