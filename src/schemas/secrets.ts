import { z } from "https://deno.land/x/zod/mod.ts";

export const secretsSchema = z.object({
    LLM_API_URL: z.string(),
    LLM_MODEL: z.string(),
    LLM_MODEL_TYPE: z.string(),
});

export type ISecrets = z.infer<typeof secretsSchema>;