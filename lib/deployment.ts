const productionAppOrigin =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://app.localhost:3000";
const productionMarketingOrigin =
  process.env.NEXT_PUBLIC_MARKETING_SITE_URL ?? "http://localhost:3000";
const timeCardManagerQaOrigin = process.env.TCM_QA_APP_ORIGIN?.replace(/\/$/, "") ?? null;
const previewOrigin = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : null;

export function isPreviewDeployment() {
  return process.env.VERCEL_ENV === "preview" && Boolean(previewOrigin);
}

export function getAppOrigin() {
  if (timeCardManagerQaOrigin) {
    return timeCardManagerQaOrigin;
  }

  if (isPreviewDeployment() && previewOrigin) {
    return previewOrigin;
  }

  return productionAppOrigin;
}

export function getMarketingOrigin() {
  if (timeCardManagerQaOrigin) {
    return timeCardManagerQaOrigin;
  }

  if (isPreviewDeployment() && previewOrigin) {
    return previewOrigin;
  }

  return productionMarketingOrigin;
}

export function getBetterAuthOrigin() {
  if (process.env.BETTER_AUTH_URL && !isPreviewDeployment()) {
    return process.env.BETTER_AUTH_URL;
  }

  return getAppOrigin();
}

export function getBetterAuthTrustedOrigins() {
  const configuredOrigins = (
    process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? ""
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return [...new Set([
    getAppOrigin(),
    getMarketingOrigin(),
    ...configuredOrigins
  ])];
}
