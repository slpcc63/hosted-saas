import "server-only";

export type SquareEnvironment = "production" | "sandbox";

const squareVersion = "2026-01-22";
const defaultSquareScopes = [
  "MERCHANT_PROFILE_READ",
  "TIMECARDS_READ",
  "EMPLOYEES_READ"
];

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
    return defaultSquareScopes;
  }

  return configuredScopes
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

type SquareApiRequestInit = {
  accessToken: string;
  body?: unknown;
  method?: "GET" | "POST";
  path: string;
};

type SquareListLocationsResponse = {
  locations?: Array<{
    id: string;
    name?: string;
  }>;
};

type SquareSearchTimecardsResponse = {
  cursor?: string;
  timecards?: Array<{
    id: string;
    location_id: string;
    start_at: string;
    status: "OPEN" | "CLOSED";
    team_member_id?: string;
  }>;
};

type SquareSearchTeamMembersResponse = {
  cursor?: string;
  team_members?: Array<{
    family_name?: string;
    given_name?: string;
    id: string;
    reference_id?: string;
  }>;
};

export async function squareApiRequest<T>(input: SquareApiRequestInit) {
  const response = await fetch(`${getSquareBaseUrl()}${input.path}`, {
    method: input.method ?? (input.body ? "POST" : "GET"),
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
      "Square-Version": squareVersion
    },
    body: input.body ? JSON.stringify(input.body) : undefined
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Square request failed: ${errorText}`);
  }

  return response.json() as Promise<T>;
}

export async function listSquareLocations(accessToken: string) {
  const response = await squareApiRequest<SquareListLocationsResponse>({
    accessToken,
    path: "/v2/locations"
  });

  return response.locations ?? [];
}

export async function searchSquareOpenTimecards(accessToken: string) {
  const timecards: NonNullable<SquareSearchTimecardsResponse["timecards"]> = [];
  let cursor: string | undefined;

  do {
    const response = await squareApiRequest<SquareSearchTimecardsResponse>({
      accessToken,
      path: "/v2/labor/timecards/search",
      body: {
        cursor,
        limit: 200,
        query: {
          filter: {
            status: "OPEN"
          },
          sort: {
            field: "START_AT",
            order: "ASC"
          }
        }
      }
    });

    if (response.timecards?.length) {
      timecards.push(...response.timecards);
    }

    cursor = response.cursor;
  } while (cursor);

  return timecards;
}

export async function searchSquareTeamMembers(accessToken: string) {
  const teamMembers: NonNullable<SquareSearchTeamMembersResponse["team_members"]> = [];
  let cursor: string | undefined;

  do {
    const response = await squareApiRequest<SquareSearchTeamMembersResponse>({
      accessToken,
      path: "/v2/team-members/search",
      body: {
        cursor,
        limit: 200,
        query: {
          filter: {
            status: "ACTIVE"
          }
        }
      }
    });

    if (response.team_members?.length) {
      teamMembers.push(...response.team_members);
    }

    cursor = response.cursor;
  } while (cursor);

  return teamMembers;
}

export function hasSquareScopes(
  authorizedScopes: string[],
  requiredScopes: string[]
) {
  const scopeSet = new Set(authorizedScopes);

  return requiredScopes.every((scope) => scopeSet.has(scope));
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
