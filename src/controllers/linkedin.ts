import path from "node:path";
import { URL } from "node:url";
import { sleep } from "../helpers/utils.ts";
import { JobApplicator } from "./manager.ts";
import { LINKEDIN_JOB_STATES, LINKEDIN_URLS } from "../helpers/constants.ts";
import type { IJobCard, IUnProcessedJobCard } from "./manager.ts";
import { FieldTypes } from "../types/linkedin.ts";
import type {
	IFormField,
	IFormInputField,
	IFormOptionField,
} from "../types/linkedin.ts";
import type { ElementHandle } from "npm:rebrowser-puppeteer";
import { writeFile } from "node:fs/promises";

export class LinkedinJobApplicator extends JobApplicator {
	public async start() {
		if (this.getSecretsConfig.DEVTOOLS) {
			await this.dev();
			return;
		}

		await this.validateSession();
		await this.performSearch();
	}

	private async validateSession(): Promise<void> {
		await this.currentPage.goto(LINKEDIN_URLS.login);

		const url = this.currentPage.url();

		const isSessionValid = url.includes(LINKEDIN_URLS.feed);
		console.log(isSessionValid ? "Session valid" : "Session not found", url);

		if (!isSessionValid) {
			await this.currentPage.goto(LINKEDIN_URLS.login);
		}
	}

	private async performSearch(pageNumber: number = 0): Promise<void> {
		const { locations: [location], positions: [position] } =
			this.getWorkPreferencesConfig;
		const searchURL = this.buildSearchURL(location, position, pageNumber);

		console.log(
			`Current Page: ${pageNumber}, Displaying Page: ${pageNumber + 1}`,
		);

		await this.currentPage.goto(searchURL.toString());

		// Check if empty results
		const res = await this.currentPage.$(
			"div > .jobs-search-no-results-banner__image",
		);
		if (res !== null) {
			return Promise.resolve();
		}

		// Extract and process results
		const jobs = await this.extractJobs();
		await this.processJobs(jobs);

		// WIP, search till page index 0
		if (pageNumber === 0) {
			return Promise.resolve();
		}

		// Recursively move to next page
		return this.performSearch(pageNumber + 1);
	}

	private async extractJobs(): Promise<IJobCard[]> {
		const itemSelector =
			".scaffold-layout__list div ul .scaffold-layout__list-item";
		const itemsEl = await this.currentPage.$$(itemSelector);

		const items: IJobCard[] = [];
		for (const [index, itemEl] of itemsEl.entries()) {
			await itemEl.scrollIntoView();
			await itemEl.click();
			await sleep(1000);

			const jobTitleSelector = ".job-card-list__title--link span strong";
			const jobTitle = await itemEl.$eval(
				jobTitleSelector,
				(el) => el.innerText,
			);

			const companySelector = ".artdeco-entity-lockup__subtitle span";
			const company = await itemEl.$eval(companySelector, (el) => el.innerText);

			const linkSelector = ".job-card-list__title--link";
			const urlSuffix = await itemEl.$eval(
				linkSelector,
				(el) => el.getAttribute("href"),
			);
			const id = urlSuffix?.split("/")[3] as string;

			const jobStateSelector = ".job-card-list__footer-wrapper li";
			const jobState = await itemEl.$eval(
				jobStateSelector,
				(el) => el.innerText,
			);

			const descriptionSelector = "#job-details p";
			const description = await this.currentPage.$eval(
				descriptionSelector,
				(el) => {
					const textWithNewlines = el.innerHTML
						.replace(/<span>\s*<p>/g, "\n") // Replace <p> inside <span> with a newline
						.replace(/<li>/g, "\n- ") // Replace <li> with a newline and bullet point
						.replace(/<\/li>/g, "") // Remove closing </li> tags
						.replace(/<\/ul>/g, "\n") // Add a newline after closing </ul> tags
						.replace(/<[^>]*>/g, "") // Remove all remaining HTML tags
						.replace(/\s*\n\s*/g, "\n") // Normalize newlines
						.trim(); // Trim spaces
					return textWithNewlines;
				},
			);

			items.push({
				jobTitle,
				company,
				id,
				description,
				// Set New state for not viewed jobs
				state: LINKEDIN_JOB_STATES.includes(jobState)
					? jobState
					: LINKEDIN_JOB_STATES[2],
				meta: {},
				selector: `${itemSelector}:nth-child(${index + 1})`,
			});
		}
		return items;
	}

	private async processJobs(jobs: IJobCard[]): Promise<void> {
		// save jobs
		const { readyToProcess, blacklisted, alreadyApplied } = this.filterJobs(
			jobs,
		);
		const { processed, unprocessed } = await this.applyToJobs(readyToProcess);
		// Ignore blacklisted and processed jobs for next time
		await this.closeJobCard([...blacklisted, ...processed]);
		// store these data WIP
		await writeFile(
			`./data/applied_${Date.now()}.json`,
			JSON.stringify(
				{
					processed,
					unprocessed,
					blacklisted,
					alreadyApplied,
				},
				null,
				2,
			),
			"utf8",
		);
	}

	private async applyToJobs(
		jobs: IJobCard[],
	): Promise<{ processed: IJobCard[]; unprocessed: IUnProcessedJobCard[] }> {
		const processed = [];
		const unprocessed = [];
		for (const job of jobs) {
			const jobUrl = `${LINKEDIN_URLS.jobPage}${job.id}`;
			await this.currentPage.goto(jobUrl);

			// easy apply button
			const easyApplySelector = ".scaffold-layout__inner .jobs-apply-button";
			await this.currentPage.waitForSelector(easyApplySelector);
			await this.currentPage.click(easyApplySelector);

			// fill application
			try {
				await this.fillJob(job);
				processed.push({
					...job,
				});
			} catch (error) {
				if (error instanceof Error) {
					unprocessed.push({
						...job,
						isError: true,
						error: error.message,
					});
				}
			}
		}
		return { processed, unprocessed };
	}

	private async fillJob(job: IJobCard): Promise<void> {
		let stepCounter = 0; // Track the current step
		while (true) {
			console.log(`Step ${stepCounter}: Filling the job form...`);
			await this.fillJobForm(job); // Fill the form for the current step

			const nextBtnSelector =
				'.jobs-easy-apply-modal__content footer button[aria-label="Continue to next step"]';
			const reviewBtnSelector =
				'.jobs-easy-apply-modal__content footer button[aria-label="Review your application"]';

			// Check for next or review button
			const [nextBtnElement, reviewBtnElement] = await Promise.all([
				this.currentPage.$(nextBtnSelector),
				this.currentPage.$(reviewBtnSelector),
			]);

			// Exit the loop if neither button is found
			if (!nextBtnElement && !reviewBtnElement) {
				console.log("No further steps, exiting loop.");
				break;
			}

			// Click the appropriate button
			const buttonToClick = nextBtnElement
				? nextBtnSelector
				: reviewBtnSelector;
			console.log(`Click next button from ${stepCounter}:`);
			await this.currentPage.click(buttonToClick);

			// Wait for the next page or step to load
			await sleep(1000);

			// Check for form errors
			const feedbackSelector = ".artdeco-inline-feedback--error";
			const feedbackElement = await this.currentPage.$(feedbackSelector);
			if (feedbackElement) {
				throw new Error("Job Application failed due to a question submission");
			}

			// Increment step counter
			stepCounter++;
			console.log("\n\n\n\n\n");
		}

		// Unfollow the company page, click the checkbox if it exists
		const followCompanyCheckBoxSelector =
			'label[for="follow-company-checkbox"]';
		const checkBoxElement = await this.currentPage.$(
			followCompanyCheckBoxSelector,
		);
		if (checkBoxElement) {
			await checkBoxElement.click();
			console.log("Follow company checkbox clicked.");
		}

		// Submit app
		const submitAppBtnSelector =
			'.jobs-easy-apply-modal__content footer button[aria-label="Submit application"]';
		await this.currentPage.click(submitAppBtnSelector);
	}

	private async fillJobForm(_job: IJobCard): Promise<void> {
		console.log("fill form called");
		// 1. Fill Resume
		// Check if form has resume upload button
		// Only upload resume the first time, select from next time
		const resumeUploadBtnSelector = ".js-jobs-document-upload__container input";
		if (
			await this.currentPage.$(resumeUploadBtnSelector) &&
			!this.isResumeOnceUploaded
		) {
			// const uploadedResumeCardSelector = '.jobs-document-upload-redesign-card__container';
			// await this.currentPage.click(uploadedResumeCardSelector);

			const resumeUploadBtnElement = await this.currentPage.$(
				resumeUploadBtnSelector,
			);
			if (!resumeUploadBtnElement) {
				throw new Error("File input element not found");
			}
			const filePath = path.resolve(this.getWorkPreferencesConfig.resume_path);
			await resumeUploadBtnElement.uploadFile(filePath);
			this.isResumeOnceUploaded = true;
		}

		// 2. Fill other inputs
		const inputElementsSelector =
			".jobs-easy-apply-modal__content form .fb-dash-form-element";
		const inputEls = await this.currentPage.$$(inputElementsSelector);
		await this.handleFormFields(inputEls);
	}

	private async handleFormFields(
		inputEls: ElementHandle<Element>[],
	): Promise<void> {
		const fields: IFormField[] = [];
		for (const inputEl of inputEls) {
			// 1. Check for text input
			const textInputSelector = 'input[type="text"], input[type="number"]';
			const textLabelSelector = "label";
			const textInput = await inputEl.$(textInputSelector);
			if (textInput) {
				const [label, selector, required] = await Promise.all([
					inputEl.$eval(textLabelSelector, (el) => el.innerText.trim()),
					textInput.evaluate((el) => el.getAttribute("id")),
					textInput.evaluate((el) => el.required),
				]);
				fields.push({
					label,
					type: selector?.includes("-numeric")
						? FieldTypes.NUMERIC
						: FieldTypes.TEXT,
					selector: `#${selector}`,
					required,
				});
				continue;
			}

			// 2. Check for radio input
			const radioInputSelector = 'fieldset div input[type="radio"]';
			const radioLabelSelector = "legend span span";
			const radioOptions = await inputEl.$$eval(
				radioInputSelector,
				(inputs) =>
					inputs.map((input) => {
						const option = input.getAttribute("value") ?? "";
						return {
							option,
							selector: `input[value="${option}"]`,
							required: input.required,
						};
					}),
			);

			if (radioOptions.length) {
				const radioFieldsetID = await inputEl.$eval(
					"fieldset",
					(fieldset) => fieldset.getAttribute("id") ?? "",
				);
				const label = await inputEl.$eval(
					radioLabelSelector,
					(el) => el.innerText.trim(),
				);

				fields.push({
					label,
					type: FieldTypes.RADIO,
					options: radioOptions.map((x) => ({
						...x,
						selector: `#${radioFieldsetID} ${x.selector}`,
					})),
					selector: radioInputSelector,
					required: radioOptions.some((x) => x.required),
				});
				continue;
			}

			// 3. Check for select input (dropdown)
			const selectInputSelector = "select";
			const selectLabelSelector = "label span";
			const selectInput = await inputEl.$(selectInputSelector);
			if (selectInput) {
				const [label, selectOptions, required] = await Promise.all([
					inputEl.$eval(selectLabelSelector, (el) => el.innerText.trim()),
					selectInput.$$eval(
						"option",
						(options, parentSelector) =>
							options.map((option, index) => ({
								option: option.innerText.trim(),
								selector: `${parentSelector} option:nth-of-type(${index + 1})`,
							})),
						selectInputSelector, // Pass the parent selector dynamically
					),
					selectInput.evaluate((el) => el.required),
				]);
				const selector = `#${await (await selectInput.getProperty("id"))
					.jsonValue()}`;
				fields.push({
					label,
					type: FieldTypes.SELECT,
					options: selectOptions,
					selector,
					required,
				});
				continue;
			}

			// 4. Check for checkbox input
			const checkboxInputSelector = 'input[type="checkbox"]';
			const checkBoxOptionAttributeName =
				"data-test-text-selectable-option__input";
			const checkBoxInputs = await inputEl.$$eval(
				checkboxInputSelector,
				(inputs, checkBoxOptionAttributeName) =>
					inputs.map((input) => {
						const option = input.getAttribute(checkBoxOptionAttributeName) ??
							"";
						const selector =
							`input[${checkBoxOptionAttributeName}="${option}"]`;
						return {
							option,
							selector,
						};
					}),
				checkBoxOptionAttributeName,
			);
			if (checkBoxInputs.length) {
				const checkBoxLabelSelector = "fieldset legend span";
				const checkIsRequiredTitle = "fieldset legend div";
				const isInputRequiredClass =
					"fb-dash-form-element__label-title--is-required";
				const [label, selector, required] = await Promise.all([
					inputEl.$eval(checkBoxLabelSelector, (el) => el.innerText.trim()),
					inputEl.$eval("fieldset", (el) => `#${el.getAttribute("id")}`),
					inputEl.$eval(
						checkIsRequiredTitle,
						(el, isInputRequiredClass) => Object.values(el.classList).includes(isInputRequiredClass),
						isInputRequiredClass,
					),
				]);
				fields.push({
					label,
					type: FieldTypes.CHECKBOX,
					options: checkBoxInputs,
					selector,
					required,
				});
				continue;
			}
		}

		// Handle form answering
		if (fields.length === 0) {
			console.log("No fields to handle");
			return;
		}
		// console.log(fields.filter((x) => x.type === FieldTypes.CHECKBOX).map((x) => ({
		//     label: x.label,
		//     required: x.required,
		//     type: x.type,
		// })));

		if (!this.isReuseMobileAndEmail) {
			this.isReuseMobileAndEmail = true;
			console.log("handle email, country and mobile");
			// Handle email - Not required for now
			// Handle country code
			const countryCodeEl = fields.find((x) =>
				x.label === "Phone country code"
			) as IFormOptionField | undefined;
			if (countryCodeEl) {
				const countryCodeItem = countryCodeEl.options.find(
					(x) =>
						x.option.includes(
							this.getTextResumeConfig.personal_information.phone_prefix,
						),
				);
				if (!countryCodeItem) {
					throw new Error("Country Code Item not found when submitting form");
				}
				await this.currentPage.type(
					countryCodeEl.selector,
					countryCodeItem.option,
				);
			}
			// Handle mobile phone
			const mobilePhoneEl = fields.find((x) =>
				x.label === "Mobile phone number"
			) as IFormInputField | undefined;
			if (mobilePhoneEl) {
				await this.handleTextField(
					mobilePhoneEl.selector,
					this.getTextResumeConfig.personal_information.phone,
				);
			}
		}

		// Handle city
		const cityEl = fields.find((x) =>
			x.label === "City\nCity"
		) as IFormInputField | undefined;
		console.log(fields);
		if (cityEl) {
			console.log('City element found');
			// await this.currentPage.click(cityEl.selector);
			await this.currentPage.type(cityEl.selector, this.getTextResumeConfig.personal_information.city, { delay: 100 });
			await sleep(1000);
			await this.currentPage.waitForSelector('.basic-typeahead__triggered-content', { visible: true });
			await this.currentPage.keyboard.press("ArrowDown");
			await this.currentPage.keyboard.press('Enter');
		}

		const fieldsToProcess = fields.filter(
			(x) =>
				!["Email address", "Phone country code", "Mobile phone number", "First name", "Last name", "City\nCity"]
					.includes(x.label),
		);
		for (const field of fieldsToProcess) {
			console.log(`Processing field: ${field.type}----${field.label}`);
			// if (field.type === FieldTypes.CHECKBOX) {
			//     console.log(field);
			// }
			if (field.type === FieldTypes.RADIO) {
				const option = await this.getLLM.answerQuestionFromOptions(field);
				await this.currentPage.click(option.selector);
			} else if (field.type === FieldTypes.SELECT) {
				const option = await this.getLLM.answerQuestionFromOptions(field);
				await this.currentPage.type(field.selector, option.option);
			} else if (field.type === FieldTypes.CHECKBOX) {
				const option = await this.getLLM.answerQuestionFromOptions(field);
				const selector = `${field.selector} ${option.selector}`;
				await this.currentPage.click(selector);
			} else if (field.type === FieldTypes.TEXT) {
				const res = await this.getLLM.answerQuestionText(field);
				console.log(`Answer: `, res);
				await this.handleTextField(field.selector, res);
			} else if (field.type === FieldTypes.NUMERIC) {
				const res = await this.getLLM.answerQuestionNumeric(field);
				console.log(`Answer: `, res);
				await this.handleTextField(field.selector, res);
			} else {
				throw new Error("Field type not found");
			}
			console.log("\n\n\n\n");
		}
	}

	private async handleTextField(
		selector: string,
		input: string,
	): Promise<void> {
		// simulate triple click to clear input field
		await this.currentPage.click(selector, { clickCount: 3 });
		await this.currentPage.type(selector, input);
	}

	private buildSearchURL(
		location: string,
		keyword: string,
		pageNumber: number = 0,
	): string {
		const {
			experience_level,
			work_type,
			date,
			distance,
		} = this.getWorkPreferencesConfig;

		// Helper function to build filter strings
		const buildFilterString = (
			filters: Record<string, boolean>,
			mapping: Record<string, string>,
		): string =>
			Object.entries(filters)
				.filter(([, value]) => value)
				.map(([key]) => mapping[key])
				.join(",");

		// Experience level mapping
		const experienceMapping = {
			internship: "1",
			entry_level: "2",
			associate: "3",
			mid_senior_level: "4",
			director: "5",
			executive: "6",
		};

		// Work type mapping
		const workTypeMapping = {
			on_site: "1",
			remote: "2",
			hybrid: "3",
		};

		// Date filter mapping
		const dateMapping = {
			"24_hours": "r86400",
			week: "r604800",
			month: "r2592000",
			all_time: "",
		};

		const experienceFilter = buildFilterString(
			experience_level,
			experienceMapping,
		);
		const workTypeFilter = buildFilterString(work_type, workTypeMapping);
		const dateFilter = buildFilterString(date, dateMapping);

		// Construct the search URL
		const searchURL = new URL(LINKEDIN_URLS.job);
		// WIP-CONFIG, f_SB2 = Salary
		searchURL.searchParams.set("distance", String(distance));
		searchURL.searchParams.set("f_E", experienceFilter);
		searchURL.searchParams.set("f_WT", workTypeFilter);
		searchURL.searchParams.set("f_TPR", dateFilter);
		searchURL.searchParams.set("f_AL", "true"); // Easy Apply filter
		searchURL.searchParams.set("f_VJ", "true"); // Verified jobs
		searchURL.searchParams.set("location", location);
		searchURL.searchParams.set("keywords", keyword);
		searchURL.searchParams.set("sortBy", "DD"); // Sort by most recent

		if (pageNumber !== 0) {
			const offsetPage = String(pageNumber * 25);
			searchURL.searchParams.set("start", offsetPage);
		}

		return searchURL.toString();
	}

	public async dev() {
		const jobs: IJobCard[] = [
			{
				"jobTitle": "Engineer",
				"company": "IC Resources",
				"id": "4104747669",
				"description":
					"Role: Defence Systems Engineer\nLocation: Stevenage (4-5 days onsite)\nThe Company:\nMy client is a cutting-edge leader in advanced defence technology. This global company specializes in creating state-of-the-art missile systems and defence solutions, safeguarding nations worldwide with its unwavering commitment to precision and innovation. With a legacy of excellence, it continues to shape the future of defence technology, ensuring security and resilience in an ever-evolving world.\nThe Role:\nAs part of our clients' Systems Design Emerging Portfolio &amp; Capability function you will deliver systems engineering expertise to projects focusing on the front end of the product life cycle, designing the latest Complex Weapons capabilities for the UK and partner nation Armed Forces in response to advanced threats in all domains (Air, Land &amp; Sea).\nWhether embedded in a multi-disciplinary team, or leading an individual work package, you will gain broad engineering experience, engaging stakeholders, coordinating technology specialists, and developing advanced systems engineering techniques.\nYour Experience:\n- Strong understanding of MATLAB and Simulink\n- Requirements and Use Case analysis\n- Concept assessment and design trade studies\n- System architecture design and functional modelling\n- Performance assessment and systems behaviour analysis\n- Verification, Validation and Certification\n- Model based engineering techniques, including MBSE - Model Based Systems Engineering\n- DOORS / Rhapsody (or similar)\n- Knowledge of air platforms (Typhoon / F35 etc.)\n- MIL-STD1760/1553 + Avionics knowledge would be beneficial\n- Some understanding of electronics/firmware/software\nPerks/ Benefits:\n- £45,000 - £55,000\n- Annual Pay Review\n- £2,500 Bonus\n- 14% Pension\n- 25 Days Annual Leave + Bank Holidays\n- 6x Annual Salary Life Assurance Cover\n- Access to world class training and development programme\n- Paid Over-Time",
				"state": "New",
				"meta": {},
				"selector": "",
			},
		];
		await this.processJobs(jobs);

		// const fields: IFormOptionField[] = [
		//     {
		//         label: "Will you now or in the future require sponsorship for employment visa status?",
		//         type: FieldTypes.RADIO,
		//         options: [
		//             { option: "Yes", selector: "fieldset div label:nth-of-type(1)" },
		//             { option: "No", selector: "fieldset div label:nth-of-type(2)" }
		//         ],
		//         selector: 'fieldset div label',
		//     },
		// ];
		// await this.getLLM.answerQuestionFromOptions(fields[0]);
	}
	private async closeJobCard(jobs: IJobCard[]): Promise<void> {
		if (this.getSecretsConfig.CLOSE_BLACKLISTED_JOBS && jobs.length) {
			console.log(`Closing jobs: ${jobs.length}`);
			for (const job of jobs) {
				const closeCardSelector = `.job-card-container__action`;
				await this.currentPage.click(`${job.selector} ${closeCardSelector}`);
			}
		}
	}
}
