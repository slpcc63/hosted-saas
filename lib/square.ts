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
    "https://hosted-saas.vercel.app/api/integrations/square/callback"
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

export type SquareTeamMember = {
  family_name?: string;
  given_name?: string;
  id: string;
  reference_id?: string;
};

type SquareSearchTeamMembersResponse = {
  cursor?: string;
  team_members?: SquareTeamMember[];
};

export type SquareJob = {
  id: string;
  title?: string;
};

type SquareListJobsResponse = {
  cursor?: string;
  jobs?: SquareJob[];
};

export type SquareScheduledShift = {
  id: string;
  published_shift_details?: {
    end_at: string;
    is_deleted?: boolean;
    job_id: string;
    location_id: string;
    notes?: string;
    start_at: string;
    team_member_id?: string;
    timezone?: string;
  };
  updated_at?: string;
  version?: number;
};

type SquareSearchScheduledShiftsResponse = {
  cursor?: string;
  scheduled_shifts?: SquareScheduledShift[];
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

export async function searchSquareScheduledShifts(input: {
  accessToken: string;
  endAt: Date;
  locationIds?: string[];
  startAt: Date;
  teamMemberIds?: string[];
}) {
  const scheduledShifts: SquareScheduledShift[] = [];
  let cursor: string | undefined;

  do {
    const response = await squareApiRequest<SquareSearchScheduledShiftsResponse>({
      accessToken: input.accessToken,
      path: "/v2/labor/scheduled-shifts/search",
      body: {
        cursor,
        limit: 50,
        query: {
          filter: {
            assignment_status: "ASSIGNED",
            scheduled_shift_statuses: ["PUBLISHED"],
            start: {
              end_at: input.endAt.toISOString()
            },
            end: {
              start_at: input.startAt.toISOString()
            },
            ...(input.locationIds?.length ? { location_ids: input.locationIds } : {}),
            ...(input.teamMemberIds?.length ? { team_member_ids: input.teamMemberIds } : {})
          },
          sort: {
            field: "START_AT",
            order: "ASC"
          }
        }
      }
    });

    if (response.scheduled_shifts?.length) {
      scheduledShifts.push(...response.scheduled_shifts);
    }

    cursor = response.cursor;
  } while (cursor);

  return scheduledShifts.filter(
    (shift) => shift.published_shift_details && !shift.published_shift_details.is_deleted
  );
}

export async function listSquareJobs(accessToken: string) {
  const jobs: SquareJob[] = [];
  let cursor: string | undefined;

  do {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const response = await squareApiRequest<SquareListJobsResponse>({
      accessToken,
      path: `/v2/team-members/jobs${query}`
    });

    if (response.jobs?.length) {
      jobs.push(...response.jobs);
    }

    cursor = response.cursor;
  } while (cursor);

  return jobs;
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

export async function refreshSquareAuthorization(refreshToken: string) {
  const response = await fetch(`${getSquareBaseUrl()}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Square-Version": squareVersion
    },
    body: JSON.stringify({
      client_id: getSquareAppId(),
      client_secret: getSquareAppSecret(),
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Square token refresh failed: ${errorText}`);
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
