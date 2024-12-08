import { z } from "https://deno.land/x/zod/mod.ts";

export const workPreferencesSchema = z.object({
    resume_path: z.string(),
    experience_level: z.object({
        internship: z.boolean(),
        entry_level: z.boolean(),
        associate: z.boolean(),
        mid_senior_level: z.boolean(),
        director: z.boolean(),
        executive: z.boolean(),
    }),
    work_type: z.object({
        on_site: z.boolean(),
        remote: z.boolean(),
        hybrid: z.boolean(),
    }),
    date: z.object({
        "24_hours": z.boolean(),
        week: z.boolean(),
        month: z.boolean(),
        all_time: z.boolean(),
    }),
    positions: z.array(z.string()).min(1),
    locations: z.array(z.string()),
    distance: z.union([
        z.literal(5),
        z.literal(10),
        z.literal(25),
        z.literal(50),
        z.literal(100),
    ]),
    company_blacklist: z.array(z.string()),
    title_blacklist: z.array(z.string()),
});

export type IWorkPreferences = z.infer<typeof workPreferencesSchema>;