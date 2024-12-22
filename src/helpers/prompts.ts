export const optionsTemplate = `
The following is a resume and an answered question about the resume, the answer is one of the options.

## Rules
- Never choose the default/placeholder option, examples are: 'Select an option', 'None', 'Choose from the options below', etc.
- The answer must be one of the options.
- The answer must exclusively contain one of the options.

## Example
My resume: I'm a software engineer with 10 years of experience on swift, python, C, C++.
Question: How many years of experience do you have on python?
Options: [1-2, 3-5, 6-10, 10+]
10+

-----

## My resume:
\`\`\`
{textResume}
{workPreferences}
\`\`\`

## Question:
{question}

## Options:
{options}
-----
Do not output anything else in the response other than the answer and make sure it's the complete option which is present inside double quotes.
`;

export const numericQuestionTemplate = `
Read the following resume carefully and answer the specific questions regarding the candidate's experience with a number of years. Follow these strategic guidelines when responding:

1. **Related and Inferred Experience:**
   - **Similar Technologies:** If experience with a specific technology is not explicitly stated, but the candidate has experience with similar or related technologies, provide a plausible number of years reflecting this related experience. For instance, if the candidate has experience with Python and projects involving technologies similar to Java, estimate a reasonable number of years for Java.
   - **Projects and Studies:** Examine the candidate’s projects and studies to infer skills not explicitly mentioned. Complex and advanced projects often indicate deeper expertise.

2. **Indirect Experience and Academic Background:**
   - **Type of University and Studies:** Consider the type of university and course followed.
   - **Exam Grades:** Consider exam grades achieved. High grades in relevant subjects can indicate stronger proficiency and understanding.
   - **Relevant thesis:** Consider the thesis of the candidate has worked. Advanced projects suggest deeper skills.
   - **Roles and Responsibilities:** Evaluate the roles and responsibilities held to estimate experience with specific technologies or skills.

3. **Experience Estimates:**
   - **No Zero Experience:** A response of "0" is absolutely forbidden. If direct experience cannot be confirmed, provide a minimum of "2" years based on inferred or related experience.
   - **For Low Experience (up to 5 years):** Estimate experience based on inferred bachelor’s skills and projects, always providing at least "2" years when relevant.
   - **For High Experience:** For high levels of experience, provide a number based on clear evidence from the resume. Avoid making inferences for high experience levels unless the evidence is strong.

4. **Rules:**
   - Answer the question directly with a number, avoiding "0" entirely.

## Example 1
\`\`\`
## Curriculum

I had a degree in computer science. I have worked  years with  MQTT protocol.

## Question

How many years of experience do you have with IoT?

## Answer

4
\`\`\`

## Example 2
\`\`\`
## Curriculum

I had a degree in computer science.

## Question

How many years of experience do you have with Bash?

## Answer

2
\`\`\`

## Example 3
\`\`\`
## Curriculum

I am a software engineer with 5 years of experience in Swift and Python. I have worked on an AI project.

## Question

How many years of experience do you have with AI?

## Answer

2
\`\`\`

## Resume:
\`\`\`
{textResume}
\`\`\`

## Question:
{question}

---

When responding, consider all available information, including projects, work experience, and academic background, to provide an accurate and well-reasoned answer. Make every effort to infer relevant experience and avoid defaulting to 0 if any related experience can be estimated.
Do not output anything else in the response other than the answer.
`;

export const textualQuestionTemplate = `
The following is a resume, job application profile, and job description provided to answer a question about the candidate's suitability.

## Rules
- Use the resume, job application profile, or job description to determine the best response.
- Answer concisely and accurately, using only relevant details.
- Do not include any additional explanations or formatting beyond the direct answer.

## Example 1
\`\`\`
## Resume

John Doe, experienced software engineer with expertise in Python, JavaScript, and cloud technologies.

## Job Application Profile

Preferred work location: Remote.
Available to start immediately.

## Job Description

Looking for a software engineer skilled in cloud technologies and full-stack development.

## Question

What is your preferred work location?

## Answer

Remote
\`\`\`

## Example 2
\`\`\`
## Resume

Jane Smith, data scientist with experience in Python, machine learning, and data visualization tools.

## Job Application Profile

Fluent in English and Spanish.
Certified in Data Science from MIT.

## Job Description

Data scientist role requiring experience in Python and machine learning for building predictive models.

## Question

What certifications do you hold?

## Answer

Certified in Data Science from MIT
\`\`\`

## Provided Information:
\`\`\`
{textResume}
{workPreferences}
\`\`\`

## Question:
{question}

---

When answering, ensure the response is direct and uses the most relevant section of the information provided.
Do not output anything else in the response other than the answer.
`;
