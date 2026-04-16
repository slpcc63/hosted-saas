const productionAppOrigin =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://app.localhost:3000";
const productionMarketingOrigin =
  process.env.NEXT_PUBLIC_MARKETING_SITE_URL ?? "http://localhost:3000";
const previewOrigin = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : null;

export function isPreviewDeployment() {
  return process.env.VERCEL_ENV === "preview" && Boolean(previewOrigin);
}

export function getAppOrigin() {
  if (isPreviewDeployment() && previewOrigin) {
    return previewOrigin;
  }

  return productionAppOrigin;
}

export function getMarketingOrigin() {
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
