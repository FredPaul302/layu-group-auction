import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  AppEnvError,
  requireProductionOperationalEnv
} from "../src/lib/config/app-env.js";
import { mergeLocalEnvFiles } from "../src/lib/config/local-env-files.js";

export function getDeploymentCheckReport(
  source = mergeLocalEnvFiles(process.env)
) {
  const env = requireProductionOperationalEnv(source);

  return {
    status: "ok",
    nodeEnv: env.runtime.nodeEnv,
    appUrl: env.app.url,
    diditConfigured: Boolean(env.didit.workflowId),
    emailDriver: env.email.driver,
    identityVerificationProvider: env.identityVerification.provider,
    storageDriver: env.storage.driver,
    personaConfigured: Boolean(env.persona.templateId),
    internalJobsConfigured: Boolean(env.jobs.internalSecret)
  };
}

function isExecutedAsScript() {
  const entryPoint = process.argv[1];

  if (!entryPoint) {
    return false;
  }

  return import.meta.url === pathToFileURL(resolve(entryPoint)).href;
}

if (isExecutedAsScript()) {
  try {
    console.log(JSON.stringify(getDeploymentCheckReport(), null, 2));
  } catch (error) {
    if (error instanceof AppEnvError) {
      console.error(`[deploy:check] ${error.message}`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
