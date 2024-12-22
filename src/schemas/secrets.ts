import { z } from 'https://deno.land/x/zod/mod.ts';

export const secretsSchema = z.object({
    DEVTOOLS: z.boolean().default(false),

    LLM_MODEL_TYPE: z.string(),
    LLM_MODEL: z.string(),
    LLM_API_KEY: z.string(),
    LLM_API_URL: z.string(),
});

export type ISecrets = z.infer<typeof secretsSchema>;