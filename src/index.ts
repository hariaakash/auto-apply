import process from "node:process";
import * as puppeteer from "npm:rebrowser-puppeteer";
import { authCheck, scanJobsAndApply } from "./controllers/linkedin.ts";
import { PUPPETEER_EXECUTABLE_PATH, PUPPETEER_USER_DATA_DIR, } from "./helpers/constants.ts";
import { initialize } from "./controllers/manager.ts";

let browser: puppeteer.Browser;

(async () => {
	try {
		const {
			workPreferencesConfig: _workPreferencesConfig,
			secretsConfig: _secretsConfig,
		} = await initialize();

		browser = await puppeteer.launch({
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

		browser.on("disconnected", () => {
			console.log("disconnect");
		});

		const [page] = await browser.pages();
		// const page = await browser.newPage();

		// check session
		await authCheck(page);
		console.log("login success");

		// search and apply
        await scanJobsAndApply(page);
		console.log('end of life');
	} catch (err) {
		console.log(err);
	} finally {
		// await browser.close();
	}
})();

["SIGINT", "SIGTERM", "SIGQUIT"]
	.forEach((signal) =>
		process.on(signal, async () => {
			if (browser) await browser.close();
			process.exit();
		})
	);
