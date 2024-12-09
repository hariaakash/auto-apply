import { parse } from "@std/yaml";
import { readFile } from "node:fs/promises";
import z from "https://deno.land/x/zod@v3.23.8/index.ts";

export const loadYAMLConfig = async <T extends z.ZodTypeAny>(filePath: string, zodSchema: T): Promise<z.infer<T>> => {
    const contents = await readFile(filePath, { encoding: 'utf8' });
    const config = parse(contents);
    const res = zodSchema.parse(config);
    return res;
};