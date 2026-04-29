import { pathToFileURL } from "node:url";

type EnvShape = Record<string, string | undefined>;

export function assertLocalSeedAllowed(env: EnvShape = process.env) {
  if (env.NODE_ENV === "production") {
    throw new Error("SEED_LOCAL_DEV_DATA must not be enabled when NODE_ENV=production.");
  }
}

export function createLocalSeedEnvironment(env: EnvShape = process.env) {
  return {
    ...env,
    SEED_LOCAL_DEV_DATA: "true"
  };
}

async function runLocalSeed() {
  assertLocalSeedAllowed();
  process.env.SEED_LOCAL_DEV_DATA = createLocalSeedEnvironment().SEED_LOCAL_DEV_DATA;

  await import("../prisma/seed.js");
}

function isDirectExecution() {
  const scriptPath = process.argv[1];

  return Boolean(scriptPath && import.meta.url === pathToFileURL(scriptPath).href);
}

if (isDirectExecution()) {
  runLocalSeed().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
