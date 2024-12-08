import { URL } from "node:url";
import * as puppeteer from "npm:rebrowser-puppeteer";
import { sleep } from "../helpers/utils.ts";

export const LINKEDIN_URLS = {
	base: "https://www.linkedin.com",
	login: "https://www.linkedin.com/login",
	feed: "https://www.linkedin.com/feed",
	job: "https://www.linkedin.com/jobs/search",
};

export const authCheck = async (page: puppeteer.Page): Promise<boolean> => {
	await page.goto(LINKEDIN_URLS.login);

	const url = page.url();
	console.log(url, LINKEDIN_URLS.feed, url.includes(LINKEDIN_URLS.feed));
	if (!url.includes(LINKEDIN_URLS.feed)) {
		console.log("Session not found");
		await page.goto(LINKEDIN_URLS.login);
	}

	return true;
};

export const scanJobsAndApply = async (page: puppeteer.Page, currentPage: number = 0): Promise<void> => {
    const jobURL = new URL(LINKEDIN_URLS.job);

    // WIP-CONFIG, f_SB2 = Salary
    jobURL.searchParams.set('distance', '100');
    // experience 1: internship, 2: entry level, 3: associate, 4: mid-senior level, 5: director, 6: executive
	jobURL.searchParams.set('f_E', '3,4');
	// easy apply
    jobURL.searchParams.set('f_AL', 'true');
	// DD: most recent, R = relevant
    jobURL.searchParams.set('sortBy', 'DD');
	// work type 3: hybrid, 1: on-site, 2: remote
    jobURL.searchParams.set('f_WT', '3,1');
	// past time r86400: 24 hours, r604800: past week, r2592000: past month, "": any time
    jobURL.searchParams.set('f_TPR', 'r604800');
	// verified jobs true: verified, false: all
    jobURL.searchParams.set('f_VJ', 'true');
    jobURL.searchParams.set('location', 'London');
    jobURL.searchParams.set('keywords', 'software engineer');

	console.log(currentPage);
	console.log('page ', currentPage + 1);
	if (currentPage !== 0) {
		const offsetPage = String(currentPage * 25);
		jobURL.searchParams.set('start', offsetPage)
	}
	await page.goto(jobURL.toString());

	// check if empty results
	const res = await page.$('div > .jobs-search-no-results-banner__image');
	if (res !== null) {
		return Promise.resolve();
	}
	// find jobs
	await scanPageAndApply(page);

	if (currentPage == 0) {
		return Promise.resolve();
	}
	return scanJobsAndApply(page, currentPage + 1);
};

export const scanPageAndApply = async (page: puppeteer.Page) => {
	// scroll to bottom of page to load all
	const jobSelector = '.scaffold-layout__list div ul .scaffold-layout__list-item';

	const jobsEl = await page.$$(jobSelector);

	const jobs: { title: string; company: string; url: string }[] = [];
	for (const jobEl of jobsEl) {
		await jobEl.scrollIntoView();
		await jobEl.click();
		await sleep(1000);
		const jobTitleSelector = '.job-card-list__title--link span strong';
		const title = await jobEl.$eval(jobTitleSelector, (el) => el.innerText);
		const companySelector = '.artdeco-entity-lockup__subtitle span';
		const company = await jobEl.$eval(companySelector, (el) => el.innerText);
		const linkSelector = '.job-card-list__title--link'
		const urlSuffix = await jobEl.$eval(linkSelector, (el) => el.getAttribute('href'));
		jobs.push({
			title,
			company,
			url: `${LINKEDIN_URLS.base}/${urlSuffix}`,
		});
	}
	console.log(jobs);
};

