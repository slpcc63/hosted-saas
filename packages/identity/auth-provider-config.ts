type GoogleProviderEnvironment = {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
};

export function getGoogleProviderConfig(environment: GoogleProviderEnvironment) {
  const clientId = environment.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = environment.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return {};
  }

  return {
    google: {
      clientId,
      clientSecret,
      prompt: "select_account" as const
    }
  };
}

export function isGoogleAuthConfigured(environment: GoogleProviderEnvironment) {
  return Boolean(
    environment.GOOGLE_CLIENT_ID?.trim() &&
      environment.GOOGLE_CLIENT_SECRET?.trim()
  );
}
