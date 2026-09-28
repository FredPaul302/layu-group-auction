import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { getListingDescriptionConfig } from "../src/lib/ai/listing-description-config.js";
import { getSocialProviderConfig, socialProviders } from "../src/lib/auth/social-config.js";
import {
  AppEnvError,
  requireProductionOperationalEnv
} from "../src/lib/config/app-env.js";
import { mergeLocalEnvFiles } from "../src/lib/config/local-env-files.js";

export function getDeploymentCheckReport(
  source = mergeLocalEnvFiles(process.env)
) {
  const env = requireProductionOperationalEnv(source);
  const aiConfig = getListingDescriptionConfig(source);
  const aiListingDescriptionsEnabled = aiConfig.enabled;
  const openAiApiKeyConfigured = Boolean(source.OPENAI_API_KEY?.trim());
  const geminiApiKeyConfigured = Boolean(source.GEMINI_API_KEY?.trim());
  const socialLoginEnabled = { google: false, facebook: false };
  let facebookLoginReviewEnabled = false;

  for (const provider of socialProviders) {
    const config = getSocialProviderConfig(provider, source, env.app.url);
    socialLoginEnabled[provider] = Boolean(config && !config.reviewOnly);
    if (provider === "facebook") facebookLoginReviewEnabled = Boolean(config?.reviewOnly);
    const prefix = provider.toUpperCase();
    const enabledKey = provider === "facebook" && source.FACEBOOK_LOGIN_ENABLED !== "true" && source.FACEBOOK_LOGIN_REVIEW_ENABLED === "true" ? "FACEBOOK_LOGIN_REVIEW_ENABLED" : `${prefix}_LOGIN_ENABLED`;
    if (source[enabledKey] === "true" && !config) {
      const versionRequirement = provider === "facebook"
        ? " FACEBOOK_GRAPH_API_VERSION must also be configured in the form vN.N."
        : "";
      throw new AppEnvError(
        `${prefix}_CLIENT_ID and ${prefix}_CLIENT_SECRET must be configured as server credentials with a supported callback origin when ${enabledKey}=true.${versionRequirement}`,
        enabledKey
      );
    }
  }

  if (aiConfig.requested && !aiConfig.providerValid) {
    throw new AppEnvError(
      "AI_LISTING_DESCRIPTIONS_PROVIDER must be openai or gemini when AI_LISTING_DESCRIPTIONS_ENABLED=true.",
      "AI_LISTING_DESCRIPTIONS_PROVIDER"
    );
  }

  if (aiConfig.requested && !aiConfig.keyConfigured) {
    const keyName = aiConfig.provider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY";
    throw new AppEnvError(
      `${keyName} must be configured as a server secret when AI_LISTING_DESCRIPTIONS_ENABLED=true.`,
      keyName
    );
  }

  return {
    status: "ok",
    nodeEnv: env.runtime.nodeEnv,
    appUrl: env.app.url,
    diditConfigured: Boolean(env.didit.workflowId),
    emailDriver: env.email.driver,
    identityVerificationProvider: env.identityVerification.provider,
    storageDriver: env.storage.driver,
    personaConfigured: Boolean(env.persona.templateId),
    internalJobsConfigured: Boolean(env.jobs.internalSecret),
    aiListingDescriptionsEnabled,
    aiListingDescriptionsProvider: aiConfig.provider,
    openAiApiKeyConfigured,
    geminiApiKeyConfigured,
    googleLoginEnabled: socialLoginEnabled.google,
    facebookLoginEnabled: socialLoginEnabled.facebook,
    facebookLoginReviewEnabled
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
