import fs from 'node:fs';
import process from 'node:process';
import * as puppeteer from 'npm:rebrowser-puppeteer';
import { loadYAMLConfig } from '../helpers/yml.ts';
import { IWorkPreferences, workPreferencesSchema } from '../schemas/preferences.ts';
import { ISecrets, secretsSchema } from '../schemas/secrets.ts';
import { PUPPETEER_EXECUTABLE_PATH, PUPPETEER_USER_DATA_DIR, SECRETS_YAML, WORK_PREFERENCES_YAML, TEXT_RESUME_YAML, LINKEDIN_JOB_STATES } from '../helpers/constants.ts';
import { lookAheadPatterns } from '../helpers/regex.ts';
import { ITextResume, textResumeSchema } from '../schemas/textResume.ts';
import { ChatLLM } from './chatllm.ts';

export interface IJobCard {
    jobTitle: string;
    company: string;
    id: string;
    description: string;
    state: string;
    // deno-lint-ignore no-explicit-any
    meta: any;
}

export interface IBlacklistedJobCard extends IJobCard {
    titleBlacklisted: boolean;
    companyBlacklisted: boolean;
    isBlacklisted: boolean;
}

export interface IUnProcessedJobCard extends IJobCard {
    isError: boolean;
    error: string;
}

export class JobApplicator {
    protected browser?: puppeteer.Browser;
    protected page?: puppeteer.Page;
    protected llm?: ChatLLM;

    protected workPreferencesConfig?: IWorkPreferences;
    protected secretsConfig?: ISecrets;
    protected textResumeConfig?: ITextResume;
    protected titleBlacklistPatterns: string[] = [];
    protected companyBlacklistPatterns: string[] = [];
    protected isResumeOnceUploaded: boolean = false;
    protected isReuseMobileAndEmail: boolean = false;

    constructor() {
        // Set up signal handlers for graceful shutdown
        ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach((signal) => {
                process.on(signal, async () => {
                    await this.shutdown();
                });
            }
        );
    }

    public async initialize() {
        // Load configurations
        this.workPreferencesConfig = await loadYAMLConfig(WORK_PREFERENCES_YAML, workPreferencesSchema);
        this.secretsConfig = await loadYAMLConfig(SECRETS_YAML, secretsSchema);
        this.textResumeConfig = await loadYAMLConfig(TEXT_RESUME_YAML, textResumeSchema);

        // Validate resume path
        if (!fs.existsSync(this.workPreferencesConfig.resume_path)) {
            throw new Error(`Resume file path doesn't exist, '${this.workPreferencesConfig.resume_path}'`);
        }

        // lookahead pattern generator
        const { company_blacklist = [], title_blacklist = [] } = this.workPreferencesConfig;
        this.companyBlacklistPatterns = lookAheadPatterns(company_blacklist);
        this.titleBlacklistPatterns = lookAheadPatterns(title_blacklist);

        // LLM Initialize
        this.llm = new ChatLLM(
            this.textResumeConfig,
            this.workPreferencesConfig,
            {
                modelType: this.getSecretsConfig.LLM_MODEL_TYPE,
                baseUrl: this.getSecretsConfig.LLM_API_URL,
                apiKey: this.getSecretsConfig.LLM_API_KEY,
                model: this.getSecretsConfig.LLM_MODEL,
            },
        );

        await this.launchBrowser();
    }

    private async launchBrowser(): Promise<void> {
        this.browser = await puppeteer.launch({
            executablePath: PUPPETEER_EXECUTABLE_PATH,
            userDataDir: PUPPETEER_USER_DATA_DIR,
            headless: false,
            args: [
                '--start-maximized',
                '--no-sandbox',
                '--disable-blink-features=AutomationControlled',
            ],
            defaultViewport: null,
            devtools: this.getSecretsConfig.DEVTOOLS,
        });

        this.browser.on('disconnected', () => {
            console.log('Browser disconnected');
        });

        // Get first page
        const pages = await this.browser.pages();
        this.page = pages.length > 0 ? pages[0] : await this.browser.newPage();
    }

    private async shutdown() {
        if (this.browser) {
            await this.browser.close();
            this.browser = undefined;
        }
        process.exit();
    }

    protected get currentPage(): puppeteer.Page {
        if (!this.page) {
            throw new Error('Page not initialized');
        }
        return this.page;
    }

    protected get currentBrowser(): puppeteer.Browser {
        if (!this.browser) {
            throw new Error('Browser not initialized');
        }
        return this.browser;
    }

    protected get getWorkPreferencesConfig(): IWorkPreferences {
        if (!this.workPreferencesConfig) {
            throw new Error('Work Preferences Config not found');
        }
        return this.workPreferencesConfig;
    }

    protected get getSecretsConfig(): ISecrets {
        if (!this.secretsConfig) {
            throw new Error('Secrets Config not found');
        }
        return this.secretsConfig;
    }

    protected get getTextResumeConfig(): ITextResume {
        if (!this.textResumeConfig) {
            throw new Error('Text Resume Config not found');
        }
        return this.textResumeConfig;
    }

    protected get getLLM(): ChatLLM {
        if (!this.llm) {
            throw new Error('LLM not found');
        }
        return this.llm;
    }

    /**
    * Checks if a job is blacklisted based on its title and company.
    *
    * @param jobTitle - The title of the job.
    * @param company - The company offering the job.
    * @returns An object with `isBlacklisted`, `titleBlacklisted`, and `companyBlacklisted` fields.
    */
    protected isBlacklisted(jobTitle: string, company: string): { isBlacklisted: boolean; titleBlacklisted: boolean; companyBlacklisted: boolean } {
        console.debug(`Checking if job is blacklisted: ${jobTitle} at ${company}`);

        const titleBlacklisted = this.titleBlacklistPatterns.some(pattern => new RegExp(pattern, 'i').test(jobTitle));
        const companyBlacklisted = this.companyBlacklistPatterns.some(pattern => new RegExp(pattern, 'i').test(company));
        const isBlacklisted = titleBlacklisted || companyBlacklisted;

        console.debug(`Job blacklisted status: ${isBlacklisted}`);
        return { isBlacklisted, titleBlacklisted, companyBlacklisted };
    }

    protected filterJobs(jobs: IJobCard[]): { readyToProcess: IJobCard[], blacklisted: IBlacklistedJobCard[], alreadyApplied: IJobCard[] } {
        const blacklisted: IBlacklistedJobCard[] = [];
        const readyToProcess: IJobCard[] = [];
        const alreadyApplied: IJobCard[] = [];
        for (const job of jobs) {
            const blacklistCheck = this.isBlacklisted(job.jobTitle, job.company);
            if (blacklistCheck.isBlacklisted) {
                blacklisted.push({ ...job, ...blacklistCheck });
            } else if (job.state === LINKEDIN_JOB_STATES[0]) {
                alreadyApplied.push({ ...job });
            } else {
                readyToProcess.push(job);
            }
        }
        return { blacklisted, readyToProcess, alreadyApplied };
    }
}