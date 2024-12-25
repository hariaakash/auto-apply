// Can be modified
export const WORK_PREFERENCES_YAML = "./config/preferences.yml";
export const SECRETS_YAML = "./config/secrets.yml";
export const TEXT_RESUME_YAML = "./config/textResume.yml";

export const PUPPETEER_USER_DATA_DIR = "./puppeteer-local";
export const PUPPETEER_EXECUTABLE_PATH =
	"/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary";

// DON'T TOUCH
export const LINKEDIN_URLS = {
	base: "https://www.linkedin.com",
	login: "https://www.linkedin.com/login",
	feed: "https://www.linkedin.com/feed",
	job: "https://www.linkedin.com/jobs/search",
	// jobPage: 'https://www.linkedin.com/jobs/search/?currentJobId=',
	jobPage: "https://www.linkedin.com/jobs/view/",
};

export const LINKEDIN_JOB_STATES = ["Applied", "Viewed", "New"];

export enum SUPPORTED_LLM_TYPES {
	OLLAMA = "OLLAMA",
	OPENAI = "OPENAI",
}
