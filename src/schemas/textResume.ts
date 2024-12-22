import { z } from 'https://deno.land/x/zod/mod.ts';

export const textResumeSchema = z.object({
  personal_information: z.object({
    firstname: z.string(),
    lastname: z.string(),
    date_of_birth: z.string(), // You can use a regex for stricter validation if required
    country: z.string(),
    city: z.string(),
    zip_code: z.string(),
    address: z.string(),
    phone_prefix: z.string(),
    phone: z.string(),
    email: z.string().email(),
    github: z.string().url(),
    linkedin: z.string().url(),
    website: z.string().url(),
  }),
  availability: z.object({
    notice_period: z.string(),
  }),
  salary_expectations: z.object({
    salary_range: z.string(),
  }),
  self_identification: z.object({
    gender: z.string(),
    pronouns: z.string(),
    veteran: z.string(),
    disability: z.string(),
    ethnicity: z.string(),
  }),
  work_preferences: z.object({
    remote_work: z.string(),
    in_person_work: z.string(),
    open_to_relocation: z.string(),
    willing_to_complete_assessments: z.string(),
    willing_to_undergo_drug_tests: z.string(),
    willing_to_undergo_background_checks: z.string(),
  }),
  legal_authorization: z.object({
    requires_us_sponsorship: z.string(),
    requires_eu_sponsorship: z.string(),
    requires_uk_sponsorship: z.string(),
  }),
});

export type ITextResume = z.infer<typeof textResumeSchema>;
