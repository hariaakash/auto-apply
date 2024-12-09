import fs from "node:fs";
import process from "node:process";
import * as puppeteer from "npm:rebrowser-puppeteer";
import { loadYAMLConfig } from "../helpers/yml.ts";
import { IWorkPreferences, workPreferencesSchema } from "../schemas/preferences.ts";
import { ISecrets, secretsSchema } from "../schemas/secrets.ts";
import { PUPPETEER_EXECUTABLE_PATH, PUPPETEER_USER_DATA_DIR, SECRETS_YAML, WORK_PREFERENCES_YAML } from "../helpers/constants.ts";

export class JobApplicator {
    protected browser?: puppeteer.Browser;
    protected page?: puppeteer.Page;

    protected workPreferencesConfig?: IWorkPreferences;
    protected secretsConfig?: ISecrets;

    constructor() {
        // Set up signal handlers for graceful shutdown
        ["SIGINT", "SIGTERM", "SIGQUIT"].forEach((signal) =>
            process.on(signal, async () => {
                await this.shutdown();
            })
        );
    }

    public async initialize() {
        // Load configurations
        this.workPreferencesConfig = await loadYAMLConfig(WORK_PREFERENCES_YAML, workPreferencesSchema);
        this.secretsConfig = await loadYAMLConfig(SECRETS_YAML, secretsSchema);

        // Validate resume path
        if (!fs.existsSync(this.workPreferencesConfig.resume_path)) {
            throw new Error(`Resume file path doesn't exist, "${this.workPreferencesConfig.resume_path}"`);
        }

        await this.launchBrowser();
    }

    private async launchBrowser(): Promise<void> {
        this.browser = await puppeteer.launch({
            executablePath: PUPPETEER_EXECUTABLE_PATH,
            userDataDir: PUPPETEER_USER_DATA_DIR,
            headless: false,
            args: [
                "--start-maximized",
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
            ],
            defaultViewport: null,
        });

        this.browser.on("disconnected", () => {
            console.log("Browser disconnected");
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

    protected get currentPage(): puppeteer.Page | undefined {
        return this.page;
    }

    protected get currentBrowser(): puppeteer.Browser | undefined {
        return this.browser;
    }
}