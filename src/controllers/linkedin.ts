import { URL } from "node:url";
import { sleep } from "../helpers/utils.ts";
import { JobApplicator } from "./manager.ts";
import { LINKEDIN_JOB_STATES, LINKEDIN_URLS } from "../helpers/constants.ts";

export class LinkedinJobApplicator extends JobApplicator {
	public async start() {
		await this.validateSession();

		await this.performSearch();
	}
	private async validateSession(): Promise<void> {
		if (!this.page) {
            throw new Error('Page not initialized');
        }

		await this.page.goto(LINKEDIN_URLS.login);

		const url = this.page.url();

		const isSessionValid = url.includes(LINKEDIN_URLS.feed);
        console.log(isSessionValid ? 'Session valid' : 'Session not found', url);

		if (!isSessionValid) {
            await this.page.goto(LINKEDIN_URLS.login);
        }
	}

	private async performSearch(pageNumber: number = 0): Promise<void> {
		if (!this.page) {
            throw new Error('Page not initialized');
        }

        const searchURL = new URL(LINKEDIN_URLS.job);
		// WIP-CONFIG, f_SB2 = Salary
		searchURL.searchParams.set('distance', '100');
		// experience 1: internship, 2: entry level, 3: associate, 4: mid-senior level, 5: director, 6: executive
		searchURL.searchParams.set('f_E', '3,4');
		// easy apply
		searchURL.searchParams.set('f_AL', 'true');
		// DD: most recent, R = relevant
		searchURL.searchParams.set('sortBy', 'DD');
		// work type 3: hybrid, 1: on-site, 2: remote
		searchURL.searchParams.set('f_WT', '3,1');
		// past time r86400: 24 hours, r604800: past week, r2592000: past month, "": any time
		searchURL.searchParams.set('f_TPR', 'r604800');
		// verified jobs true: verified, false: all
		searchURL.searchParams.set('f_VJ', 'true');
		searchURL.searchParams.set('location', 'London');
		searchURL.searchParams.set('keywords', 'software engineer');

		console.log(`Current Page: ${pageNumber}, Displaying Page: ${pageNumber + 1}`);

		if (pageNumber !== 0) {
            const offsetPage = String(pageNumber * 25);
            searchURL.searchParams.set('start', offsetPage);
        }

        await this.page.goto(searchURL.toString());

        // Check if empty results
        const res = await this.page.$('div > .jobs-search-no-results-banner__image');
        if (res !== null) {
            return Promise.resolve();
        }

        // Extract and process results
        await this.extractJobs();


		// WIP
        if (pageNumber === 0) {
            return Promise.resolve();
        }

        // Recursively move to next page
        return this.performSearch(pageNumber + 1);
	}

	private async extractJobs(): Promise<void> {
		if (!this.page) {
            throw new Error('Page not initialized');
        }

		const itemSelector = '.scaffold-layout__list div ul .scaffold-layout__list-item';
        const itemsEl = await this.page.$$(itemSelector);

        const items: any[] = [];
        for (const itemEl of itemsEl.slice(0, 2)) {
            await itemEl.scrollIntoView();
            await itemEl.click();
            await sleep(1000);

            const titleSelector = '.job-card-list__title--link span strong';
            const title = await itemEl.$eval(titleSelector, (el) => el.innerText);

            const companySelector = '.artdeco-entity-lockup__subtitle span';
            const company = await itemEl.$eval(companySelector, (el) => el.innerText);

            const linkSelector = '.job-card-list__title--link';
            const urlSuffix = await itemEl.$eval(linkSelector, (el) => el.getAttribute('href'));
			const id = urlSuffix?.split('/')[3]

            const jobStateSelector = '.job-card-list__footer-wrapper li';
            const jobState = await itemEl.$eval(jobStateSelector, (el) => el.innerText);

			const descriptionSelector = '#job-details p';
            const description = await this.page.$eval(descriptionSelector, (el) => {
                const textWithNewlines = el.innerHTML
                    .replace(/<span>\s*<p>/g, '\n')     // Replace <p> inside <span> with a newline
                    .replace(/<li>/g, '\n- ')           // Replace <li> with a newline and bullet point
                    .replace(/<\/li>/g, '')             // Remove closing </li> tags
                    .replace(/<\/ul>/g, '\n')           // Add a newline after closing </ul> tags
                    .replace(/<[^>]*>/g, '')            // Remove all remaining HTML tags
                    .replace(/\s*\n\s*/g, '\n')         // Normalize newlines
                    .trim();                            // Trim spaces
                return textWithNewlines;
            });

            items.push({
                title,
                company,
                id,
				description,
                // Set New state for not viewed jobs
				state: LINKEDIN_JOB_STATES.includes(jobState) ? jobState : LINKEDIN_JOB_STATES[2],
            });
        }

        // Optional: Add method to process these items further
        await this.processJobs(items);
	}

	private async processJobs(jobs: any[]): Promise<void> {

	}
}
