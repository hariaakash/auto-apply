import fs from "node:fs";
import { ymlConfigReader } from "../helpers/yml.ts";
import { workPreferencesSchema } from "../schemas/preferences.ts";
import { secretsSchema } from "../schemas/secrets.ts";
import { SECRETS_YAML, WORK_PREFERENCES_YAML } from "../helpers/constants.ts";

export const initialize = async () => {
    // Prep
    const workPreferencesConfig = await ymlConfigReader(WORK_PREFERENCES_YAML, workPreferencesSchema);
    const secretsConfig = await ymlConfigReader(SECRETS_YAML, secretsSchema);
    if (!fs.existsSync(workPreferencesConfig.resume_path)) {
        throw new Error(`Resume file path doesn't exist, "${workPreferencesConfig.resume_path}"`);
    }
    return {
        workPreferencesConfig,
        secretsConfig,
    }
};