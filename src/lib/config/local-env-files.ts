import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

const LOCAL_ENV_FILE_ORDER = [".env", ".env.local"] as const;

type EnvSource = Record<string, string | undefined>;

export function mergeLocalEnvFiles(
  source: EnvSource = process.env,
  cwd = process.cwd()
) {
  const mergedSource: EnvSource = { ...source };

  for (const fileName of LOCAL_ENV_FILE_ORDER) {
    const filePath = resolve(cwd, fileName);

    if (!existsSync(filePath)) {
      continue;
    }

    Object.assign(mergedSource, parseEnv(readFileSync(filePath, "utf8")));
  }

  return mergedSource;
}
