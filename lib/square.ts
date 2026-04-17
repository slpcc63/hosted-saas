import "server-only";

export type SquareEnvironment = "production" | "sandbox";

const squareVersion = "2026-01-22";

function getSquareEnvironment(): SquareEnvironment {
  return process.env.SQUARE_ENVIRONMENT === "sandbox"
    ? "sandbox"
    : "production";
}

export function getSquareBaseUrl() {
  return getSquareEnvironment() === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

export function getSquareAppId() {
  return process.env.SQUARE_APPLICATION_ID ?? "";
}

export function getSquareAppSecret() {
  return process.env.SQUARE_APPLICATION_SECRET ?? "";
}

export function getSquareRedirectUri() {
  return (
    process.env.SQUARE_REDIRECT_URI ??
    "https://app.slpcc63.com/api/integrations/square/callback"
  );
}

export function getSquareScopes() {
  const configuredScopes = process.env.SQUARE_SCOPES?.trim();

  if (!configuredScopes) {
    return ["MERCHANT_PROFILE_READ"];
  }

  return configuredScopes
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export function getSquareAuthorizationUrl(state: string) {
  const params = new URLSearchParams({
    client_id: getSquareAppId(),
    scope: getSquareScopes().join(" "),
    state
  });

  if (getSquareEnvironment() !== "sandbox") {
    params.set("session", "false");
  }

  return `${getSquareBaseUrl()}/oauth2/authorize?${params.toString()}`;
}

export async function exchangeSquareAuthorizationCode(code: string) {
  const response = await fetch(`${getSquareBaseUrl()}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Square-Version": squareVersion
    },
    body: JSON.stringify({
      client_id: getSquareAppId(),
      client_secret: getSquareAppSecret(),
      code,
      grant_type: "authorization_code",
      redirect_uri: getSquareRedirectUri()
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Square token exchange failed: ${errorText}`);
  }

  return response.json() as Promise<{
    access_token: string;
    expires_at?: string;
    merchant_id: string;
    refresh_token: string;
    scopes?: string[];
    token_type: string;
  }>;
}

export async function revokeSquareAccessToken(accessToken: string) {
  const response = await fetch(`${getSquareBaseUrl()}/oauth2/revoke`, {
    method: "POST",
    headers: {
      Authorization: `Client ${getSquareAppSecret()}`,
      "Content-Type": "application/json",
      "Square-Version": squareVersion
    },
    body: JSON.stringify({
      access_token: accessToken,
      client_id: getSquareAppId(),
      revoke_only_access_token: false
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Square token revoke failed: ${errorText}`);
  }
}

export function isSquareConfigured() {
  return Boolean(
    getSquareAppId() &&
      getSquareAppSecret() &&
      getSquareRedirectUri()
  );
}

export function getSquareEnvironmentLabel() {
  return getSquareEnvironment() === "sandbox" ? "Sandbox" : "Production";
}
