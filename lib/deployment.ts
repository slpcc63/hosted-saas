function getVercelPreviewOrigin(environment: NodeJS.ProcessEnv) {
  const vercelUrl = environment.VERCEL_URL?.trim();
  return vercelUrl ? `https://${vercelUrl}` : null;
}

export function getAuthPreviewOrigin(
  environment: NodeJS.ProcessEnv = process.env
) {
  if (environment.VERCEL_ENV !== "preview") {
    return null;
  }

  const configuredOrigin = environment.AUTH_PREVIEW_ORIGIN?.trim();

  if (!configuredOrigin) {
    return null;
  }

  try {
    const parsed = new URL(configuredOrigin);

    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
}

export function isPreviewDeployment(
  environment: NodeJS.ProcessEnv = process.env
) {
  return (
    environment.VERCEL_ENV === "preview" &&
    Boolean(
      getVercelPreviewOrigin(environment) || getAuthPreviewOrigin(environment)
    )
  );
}

export function getAppOrigin(environment: NodeJS.ProcessEnv = process.env) {
  const previewOrigin = getVercelPreviewOrigin(environment);

  if (isPreviewDeployment(environment) && previewOrigin) {
    return previewOrigin;
  }

  return environment.NEXT_PUBLIC_APP_URL ?? "http://app.localhost:3000";
}

export function getMarketingOrigin(
  environment: NodeJS.ProcessEnv = process.env
) {
  const previewOrigin = getVercelPreviewOrigin(environment);

  if (isPreviewDeployment(environment) && previewOrigin) {
    return previewOrigin;
  }

  return environment.NEXT_PUBLIC_MARKETING_SITE_URL ?? "http://localhost:3000";
}

export function getBetterAuthOrigin(
  environment: NodeJS.ProcessEnv = process.env
) {
  const authPreviewOrigin = getAuthPreviewOrigin(environment);

  if (authPreviewOrigin) {
    return authPreviewOrigin;
  }

  if (environment.BETTER_AUTH_URL && !isPreviewDeployment(environment)) {
    return environment.BETTER_AUTH_URL;
  }

  return getAppOrigin(environment);
}

export function getBetterAuthTrustedOrigins(
  environment: NodeJS.ProcessEnv = process.env
) {
  return Array.from(
    new Set(
      [
        getAppOrigin(environment),
        getMarketingOrigin(environment),
        getAuthPreviewOrigin(environment)
      ].filter((origin): origin is string => Boolean(origin))
    )
  );
}
