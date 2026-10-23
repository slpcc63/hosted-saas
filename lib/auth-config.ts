const localSecret = "slpcc63-local-dev-secret-change-before-prod";

export function getAuthSettings(env: Record<string, string | undefined>) {
  const hosted = env.NODE_ENV === "production" || Boolean(env.VERCEL_ENV);
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (hosted && (!secret || secret.length < 32 || secret === localSecret || secret.startsWith("replace-with"))) {
    throw new Error("Authentication secret is not configured securely.");
  }
  return {
    secret: secret || localSecret,
    // Account provisioning is an explicit local operator task during controlled access.
    allowSignUp: !hosted && env.CONTROLLED_SIGNUP_ENABLED === "true"
  };
}

export function safeNextPath(value: string | undefined, fallback: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x20]/.test(value)) return fallback;
  try {
    const parsed = new URL(value, "https://local.invalid");
    return parsed.origin === "https://local.invalid" ? `${parsed.pathname}${parsed.search}${parsed.hash}` : fallback;
  } catch { return fallback; }
}
