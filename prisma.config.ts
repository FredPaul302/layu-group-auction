import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

import { defineConfig } from "prisma/config";

const localEnv = [".env", ".env.local"].reduce<Record<string, string | undefined>>(
  (mergedEnv, fileName) => {
    if (!existsSync(fileName)) {
      return mergedEnv;
    }

    return {
      ...mergedEnv,
      ...parseEnv(readFileSync(fileName, "utf8"))
    };
  },
  {}
);

for (const [key, value] of Object.entries(localEnv)) {
  process.env[key] ??= value;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts"
  }
});
