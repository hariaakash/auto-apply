import path from 'node:path';
import { URL } from 'node:url';
import { sleep } from '../helpers/utils.ts';
import { JobApplicator } from './manager.ts';
import { LINKEDIN_JOB_STATES, LINKEDIN_URLS } from '../helpers/constants.ts';
import type { IJobCard, IUnProcessedJobCard } from './manager.ts';
import { FieldTypes } from '../types/linkedin.ts';
import type { IFormField, IFormOptionField, IFormInputField } from '../types/linkedin.ts';
import type { ElementHandle } from 'npm:rebrowser-puppeteer';
import { writeFile } from "node:fs/promises";

export class LinkedinJobApplicator extends JobApplicator {
	public async start() {
		// await this.validateSession();

        if (this.getSecretsConfig.DEVTOOLS) {
            await this.dev();
        } else {
            await this.performSearch();
        }
	}

	private async validateSession(): Promise<void> {
		await this.currentPage.goto(LINKEDIN_URLS.login);

		const url = this.currentPage.url();

		const isSessionValid = url.includes(LINKEDIN_URLS.feed);
        console.log(isSessionValid ? 'Session valid' : 'Session not found', url);

		if (!isSessionValid) {
            await this.currentPage.goto(LINKEDIN_URLS.login);
        }
	}

	private async performSearch(pageNumber: number = 0): Promise<void> {
        const { locations: [location], positions: [position] } = this.getWorkPreferencesConfig;
        const searchURL = this.buildSearchURL(location, position, pageNumber);

		console.log(`Current Page: ${pageNumber}, Displaying Page: ${pageNumber + 1}`);

        await this.currentPage.goto(searchURL.toString());

        // Check if empty results
        const res = await this.currentPage.$('div > .jobs-search-no-results-banner__image');
        if (res !== null) {
            return Promise.resolve();
        }

        // Extract and process results
        const jobs = await this.extractJobs();
        await this.processJobs(jobs);

		// WIP, search till page index 1
        if (pageNumber === 1) {
            return Promise.resolve();
        }

        // Recursively move to next page
        return this.performSearch(pageNumber + 1);
	}

	private async extractJobs(): Promise<IJobCard[]> {
		const itemSelector = '.scaffold-layout__list div ul .scaffold-layout__list-item';
        const itemsEl = await this.currentPage.$$(itemSelector);

        const items: IJobCard[] = [];
        for (const itemEl of itemsEl) {
            await itemEl.scrollIntoView();
            await itemEl.click();
            await sleep(1000);

            const jobTitleSelector = '.job-card-list__title--link span strong';
            const jobTitle = await itemEl.$eval(jobTitleSelector, (el) => el.innerText);

            const companySelector = '.artdeco-entity-lockup__subtitle span';
            const company = await itemEl.$eval(companySelector, (el) => el.innerText);

            const linkSelector = '.job-card-list__title--link';
            const urlSuffix = await itemEl.$eval(linkSelector, (el) => el.getAttribute('href'));
			const id = urlSuffix?.split('/')[3] as string;

            const jobStateSelector = '.job-card-list__footer-wrapper li';
            const jobState = await itemEl.$eval(jobStateSelector, (el) => el.innerText);

			const descriptionSelector = '#job-details p';
            const description = await this.currentPage.$eval(descriptionSelector, (el) => {
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
                jobTitle,
                company,
                id,
				description,
                // Set New state for not viewed jobs
				state: LINKEDIN_JOB_STATES.includes(jobState) ? jobState : LINKEDIN_JOB_STATES[2],
                meta: {},
            });
        }
        return items;
	}

	private async processJobs(jobs: IJobCard[]): Promise<void> {
        // save jobs
        const { readyToProcess, blacklisted, alreadyApplied } = this.filterJobs(jobs);
        const { processed, unprocessed } = await this.applyToJobs(readyToProcess);
        // store these data WIP
        await writeFile(
            `./data/applied_${Date.now()}.json`,
            JSON.stringify({
                processed,
                unprocessed,
                blacklisted,
                alreadyApplied,
            }, null, 2),
            'utf8'
        );
	}

	private async applyToJobs(jobs: IJobCard[]): Promise<{ processed: IJobCard[], unprocessed: IUnProcessedJobCard[] }> {
        const processed = [];
        const unprocessed = [];
        for (const job of jobs) {
            const jobUrl = `${LINKEDIN_URLS.jobPage}${job.id}`;
            await this.currentPage.goto(jobUrl);

            // easy apply button
            const easyApplySelector = '.scaffold-layout__inner .jobs-apply-button';
            await this.currentPage.waitForSelector(easyApplySelector);
            await this.currentPage.click(easyApplySelector);

            // fill application
            try {
                await this.fillJob(job);
                processed.push({
                    ...job,
                })
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

            const nextBtnSelector = '.jobs-easy-apply-modal__content footer button[aria-label="Continue to next step"]';
            const reviewBtnSelector = '.jobs-easy-apply-modal__content footer button[aria-label="Review your application"]';

            // Check for next or review button
            const [nextBtnElement, reviewBtnElement] = await Promise.all([
                this.currentPage.$(nextBtnSelector),
                this.currentPage.$(reviewBtnSelector),
            ]);

            // Exit the loop if neither button is found
            if (!nextBtnElement && !reviewBtnElement) {
                console.log('No further steps, exiting loop.');
                break;
            }

            // Click the appropriate button
            const buttonToClick = nextBtnElement ? nextBtnSelector : reviewBtnSelector;
            console.log(`Step ${stepCounter}: Clicking button: ${buttonToClick}`);
            await this.currentPage.click(buttonToClick);

            // Wait for the next page or step to load
            await sleep(1000);

            // Check for form errors
            const feedbackSelector = '.artdeco-inline-feedback--error';
            const feedbackElement = await this.currentPage.$(feedbackSelector);
            if (feedbackElement) {
                throw new Error('Job Application failed due to a question submission');
            }

            // Increment step counter
            stepCounter++;
            console.log('\n\n\n\n\n')
        }

        // Unfollow the company page, click the checkbox if it exists
        const followCompanyCheckBoxSelector = 'label[for="follow-company-checkbox"]';
        const checkBoxElement = await this.currentPage.$(followCompanyCheckBoxSelector);
        if (checkBoxElement) {
            await checkBoxElement.click();
            console.log('Follow company checkbox clicked.');
        }

        // Submit app
        const submitAppBtnSelector = '.jobs-easy-apply-modal__content footer button[aria-label="Submit application"]';
        await this.currentPage.click(submitAppBtnSelector);
    }

    private async fillJobForm(_job: IJobCard): Promise<void> {
        console.log('fill form called');
        // 1. Fill Resume
        // Check if form has resume upload button
        // Only upload resume the first time, select from next time
        const resumeUploadBtnSelector = '.js-jobs-document-upload__container input';
        if (await this.currentPage.$(resumeUploadBtnSelector) && !this.isResumeOnceUploaded) {
            // const uploadedResumeCardSelector = '.jobs-document-upload-redesign-card__container';
            // await this.currentPage.click(uploadedResumeCardSelector);

            const resumeUploadBtnElement = await this.currentPage.$(resumeUploadBtnSelector);
            if (!resumeUploadBtnElement) {
                throw new Error('File input element not found');
            }
            const filePath = path.resolve(this.getWorkPreferencesConfig.resume_path);
            await resumeUploadBtnElement.uploadFile(filePath);
            this.isResumeOnceUploaded = true;
        }

        // 2. Fill other inputs
        const inputElementsSelector = '.jobs-easy-apply-modal__content form .fb-dash-form-element';
        const inputEls = await this.currentPage.$$(inputElementsSelector);
        await this.handleFormFields(inputEls);
    }

    private async handleFormFields(inputEls: ElementHandle<Element>[]): Promise<void> {
        const fields: IFormField[] = [];
        for (const inputEl of inputEls) {
            // 1. Check for text input
            const textInputSelector = 'input[type="text"], input[type="number"]';
            const textLabelSelector = 'label';
            const textInput = await inputEl.$(textInputSelector);
            if (textInput) {
                const [label, selector] = await Promise.all([
                    inputEl.$eval(textLabelSelector, (el) => el.innerText.trim()),
                    textInput.evaluate((el) => el.getAttribute('id'), textInput),
                ]);
                fields.push({
                    label,
                    type: selector?.includes('-numeric') ? FieldTypes.NUMERIC : FieldTypes.TEXT,
                    selector: `#${selector}`,
                });
                continue;
            }

            // 2. Check for radio input
            const radioInputSelector = 'fieldset div input[type="radio"]';
            const radioLabelSelector = 'legend span span';
            const radioOptions = await inputEl.$$eval(
                radioInputSelector,
                (inputs) =>
                    inputs.map((input) => {
                        const option = input.getAttribute('value') ?? '';
                        return {
                            option,
                            selector: `input[value="${option}"]`,
                        };
                    }),
            );

            if (radioOptions.length) {
                const radioFieldsetID = await inputEl.$eval('fieldset', (fieldset) => fieldset.getAttribute('id') ?? '');
                const label = await inputEl.$eval(
                    radioLabelSelector,
                    (el) => el.innerText.trim()
                );

                fields.push({
                    label,
                    type: FieldTypes.RADIO,
                    options: radioOptions.map((x) => ({...x, selector: `#${radioFieldsetID} ${x.selector}` })),
                    selector: radioInputSelector,
                });
                continue;
            }

            // 3. Check for select input (dropdown)
            const selectInputSelector = 'select';
            const selectLabelSelector = 'label span';
            const selectInput = await inputEl.$(selectInputSelector);
            if (selectInput) {
                const [label, selectOptions] = await Promise.all([
                    inputEl.$eval(selectLabelSelector, (el) => el.innerText.trim()),
                    selectInput.$$eval(
                        'option',
                        (options, parentSelector) =>
                            options.map((option, index) => ({
                                option: option.innerText.trim(),
                                selector: `${parentSelector} option:nth-of-type(${index + 1})`,
                            })),
                        selectInputSelector // Pass the parent selector dynamically
                    ),
                ]);
                const selector = `#${await (await selectInput.getProperty('id')).jsonValue()}`;
                fields.push({
                    label,
                    type: FieldTypes.SELECT,
                    options: selectOptions,
                    selector,
                });
                continue;
            }

            // 4. Check for checkbox input
            const checkboxInputSelector = 'input[type="checkbox"]';
            const checkBoxOptionAttributeName = 'data-test-text-selectable-option__input';
            const checkBoxInputs = await inputEl.$$eval(checkboxInputSelector, (inputs, checkBoxOptionAttributeName) => inputs.map((input) => {
                const option = input.getAttribute(checkBoxOptionAttributeName) ?? '';
                const selector = `input[${checkBoxOptionAttributeName}="${option}"]`;
                return {
                    option,
                    selector,
                };
            }), checkBoxOptionAttributeName);
            if (checkBoxInputs.length) {
                const checkBoxLabelSelector = 'fieldset legend span';
                const [label, selector] = await Promise.all([
                    inputEl.$eval(checkBoxLabelSelector, (el) => el.innerText.trim()),
                    inputEl.$eval('fieldset', (el) => `#${el.getAttribute('id')}`),
                ]);
                fields.push({
                    label,
                    type: FieldTypes.CHECKBOX,
                    options: checkBoxInputs,
                    selector,
                });
                continue;
            }
        }

        // Handle form answering
        if (fields.length === 0) {
            console.log('No fields to handle');
            return ;
        }
        if (this.isReuseMobileAndEmail) {
            this.isReuseMobileAndEmail = true;
        } else {
            console.log('handle email, country and mobile')
            // Handle email - Not required for now
            // Handle country code
            const countryCodeEl = fields.find((x) => x.label === 'Phone country code') as IFormOptionField | undefined;
            if (countryCodeEl) {
                const countryCodeItem = countryCodeEl.options.find(
                    (x) => x.option.includes(this.getTextResumeConfig.personal_information.phone_prefix),
                );
                if (!countryCodeItem) {
                    throw new Error('Country Code Item not found when submitting form');
                }
                await this.currentPage.type(countryCodeEl.selector, countryCodeItem.option);
            }
            // Handle mobile phone
            const mobilePhoneEl = fields.find((x) => x.label === 'Mobile phone number') as IFormInputField | undefined;
            if (mobilePhoneEl) {
                await this.handleTextField(mobilePhoneEl.selector, this.getTextResumeConfig.personal_information.phone);
            }
        }

        const fieldsToProcess = fields.filter(
            (x) => !['Email address', 'Phone country code', 'Mobile phone number'].includes(x.label)
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
                await this.handleTextField(field.selector, res);
            } else if (field.type === FieldTypes.NUMERIC) {
                const res = await this.getLLM.answerQuestionNumeric(field);
                await this.handleTextField(field.selector, res);
            } else {
                throw new Error('Field type not found');
            }
            console.log('\n\n\n\n');
        }
    }

    private async handleTextField(selector: string, input: string): Promise<void> {
        // simulate triple click to clear input field
        await this.currentPage.click(selector, { clickCount: 3 });
        await this.currentPage.type(selector, input);
    }

    private buildSearchURL(location: string, keyword: string, pageNumber: number = 0): string {
        const {
            experience_level,
            work_type,
            date,
            distance,
        } = this.getWorkPreferencesConfig;

        // Helper function to build filter strings
        const buildFilterString = (filters: Record<string, boolean>, mapping: Record<string, string>): string =>
            Object.entries(filters)
                .filter(([, value]) => value)
                .map(([key]) => mapping[key])
                .join(',');

        // Experience level mapping
        const experienceMapping = {
            internship: '1',
            entry_level: '2',
            associate: '3',
            mid_senior_level: '4',
            director: '5',
            executive: '6',
        };

        // Work type mapping
        const workTypeMapping = {
            on_site: '1',
            remote: '2',
            hybrid: '3',
        };

        // Date filter mapping
        const dateMapping = {
            '24_hours': 'r86400',
            week: 'r604800',
            month: 'r2592000',
            all_time: '',
        };

        const experienceFilter = buildFilterString(experience_level, experienceMapping);
        const workTypeFilter = buildFilterString(work_type, workTypeMapping);
        const dateFilter = buildFilterString(date, dateMapping);

        // Construct the search URL
        const searchURL = new URL(LINKEDIN_URLS.job);
		// WIP-CONFIG, f_SB2 = Salary
        searchURL.searchParams.set('distance', String(distance));
        searchURL.searchParams.set('f_E', experienceFilter);
        searchURL.searchParams.set('f_WT', workTypeFilter);
        searchURL.searchParams.set('f_TPR', dateFilter);
        searchURL.searchParams.set('f_AL', 'true'); // Easy Apply filter
        searchURL.searchParams.set('f_VJ', 'true'); // Verified jobs
        searchURL.searchParams.set('location', location);
        searchURL.searchParams.set('keywords', keyword);
        searchURL.searchParams.set('sortBy', 'DD'); // Sort by most recent

        if (pageNumber !== 0) {
            const offsetPage = String(pageNumber * 25);
            searchURL.searchParams.set('start', offsetPage);
        }

        return searchURL.toString();
    }

    public async dev() {
        const jobs: IJobCard[] = [
            {
              "jobTitle": "GenAI Software Engineer – Senior Consultant",
              "company": "Visa",
              "id": "4098233356",
              "description": "Company DescriptionVisa is a world leader in payments and technology, with over 259 billion payments transactions flowing safely between consumers, merchants, financial institutions, and government entities in more than 200 countries and territories each year. Our mission is to connect the world through the most innovative, convenient, reliable, and secure payments network, enabling individuals, businesses, and economies to thrive while driven by a common purpose – to uplift everyone, everywhere by being the best way to pay and be paid.Make an impact with a purpose-driven industry leader. Join us today and experience Life at Visa.Job DescriptionThis role requires an experienced GenAI engineer with a passion for working on LLM-based applications. The team is tasked with building key GenAI applications and scalable pipelines. The successful candidate should have a proven track record of developing multiple GenAI applications and be adept at managing the entire spectrum of GenAI application development while leading multiple workstreams.Key responsibilities include:\n- Leading and delivering specific project deliverables as a Senior GenAI Engineer\n- Providing guidance to the engineering team on building new LLM applications and leveraging existing GenAI applications\n- Improving the productivity of the engineering organization by infusing GenAI into our coding standards and practices.\n- Acting as the GenAI projects design authority\n- Shaping best practices and methodologies within the team\nThis role involves 70% GenAI and 30% Core Payments application development. The successful candidate should be open to working on payments application development to understand the current processes and suggest enhancements to improve productivity using LLM models. This position offers an excellent opportunity for a candidate with strong AI engineering credentials to increase their knowledge and experience in the payments industry.This is a hybrid position. Hybrid employees can alternate time between both remote and office. Employees in hybrid roles are expected to work from the office 2-3 set days a week (determined by leadership/site), with a general guidepost of being in the office 50% or more of the time based on business needs.QualificationsBasic Qualifications\n- 8+ years of relevant work experience with a Bachelor’s Degree or at least 5 years of experience with an Advanced Degree (e.g. Masters, MBA, JD, MD) or 2 years of work experience with a PhD, OR 11+ years of relevant work experience.\nPreferred Qualifications\n- 9 or more years of relevant work experience with a Bachelor Degree or 7 or more relevant years of experience with an Advanced Degree (e.g. Masters, MBA, JD, MD) or 3 or more years of experience with a PhD\n- Bachelor’s Degree in Computer Science, Electronics/ Electrical Engineering or a related technical discipline is required\n- Strong knowledge of AI and data technologies, with expertise in Python\n- Experience in using machine learning technologies such as TensorFlow, PyTorch, and Scikit-learn is a plus.\n- Demonstrated experience in developing scalable AI pipelines and integrating models into real-time systems.\n- Proven track record of managing and executing multiple high-impact LLM based projects, balancing delivery speed with quality.\n- Able to showcase the productivity improvement by collecting relevant metrics.\n- Self-driven and act as a leader in the GenAI space within the department.\n- Act as a mentor to the rest of the developers to leverage existing and new GenAI toolsets.\n- Ability to communicate complex AI concepts to both technical and non-technical stakeholders.\n- Spearhead development, embedding, automation, and operation of scalable AI applications.\n- Ensure technical quality and reliability of AI solutions through rigorous testing, validation, and implementing frameworks for scalable data ingestion.\n- Optimize AI application performance and efficiency.\n- Collaborate across teams to drive AI innovation, while expanding your expertise within an experienced, inclusive, and international team.\n- Extensive relevant mid level work experience\n- Proficient in Python, software development, and application of AI models.\n- Highly skilled in realizing the full potential of LLM-based AI frameworks.\n- Electronic payment systems experience is preferred\n- Hands on experience on Golang is preferred\n- Ability to take ownership of open ended and highly complex problems and drive them to completion\n- Ability to work effectively on multiple concurrent assignments with both AI and non-AI applications projects\n- Excellent communication skills, with examples of influencing, listening actively and negotiating within a team environment to effectively advocate for Software Engineering best practice within the department and communicate design decisions effectively\n- Positive attitude, friendly to others, encouraging of co-operation, honesty, and respectfulness in the workplace\n- Collaborative mindset, with an ability to empathise with colleagues and establish relationships\n- Flexibility, self-motivated, high work standards, attention to detail, ability to perform as a leader of a team\n- Willingness and desire to learn new skills and take on new tasks and initiatives.\n- Proven ability to multi-task independently in a fast-paced environment and handle multiple competing priorities with minimal direction from management.\n- Should be process oriented and possess good planning and organizational skills\nAdditional InformationVisa is an EEO Employer. Qualified applicants will receive consideration for employment without regard to race, color, religion, sex, national origin, sexual orientation, gender identity, disability or protected veteran status. Visa will also consider for employment qualified applicants with criminal histories in a manner consistent with EEOC guidelines and applicable local law.",
              "state": "Viewed",
              "meta": {},
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
}
