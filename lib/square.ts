import "server-only";

import { collectSquarePages } from "@/lib/square-pagination";
import { classifySquareRevocationResponse } from "@/lib/square-disconnect";
import type { SquarePluginId } from "@/lib/square-plugin-installations";

export type SquareEnvironment = "production" | "sandbox";

const squareVersion = "2026-01-22";
const defaultSquareScopes: Record<SquarePluginId, string[]> = {
  "square-calendar-sink": [
    "MERCHANT_PROFILE_READ",
    "TIMECARDS_READ",
    "EMPLOYEES_READ"
  ],
  "square-time-card-manager": [
    "MERCHANT_PROFILE_READ",
    "TIMECARDS_READ",
    "TIMECARDS_WRITE",
    "EMPLOYEES_READ"
  ]
};

const squarePluginEnvironmentPrefixes: Record<SquarePluginId, string> = {
  "square-calendar-sink": "CALENDAR_SYNC",
  "square-time-card-manager": "TIME_CARD_MANAGER"
};

function getSquarePluginEnvironmentValue(pluginId: SquarePluginId, name: string) {
  const prefix = squarePluginEnvironmentPrefixes[pluginId];
  const productValue = process.env[`${prefix}_SQUARE_${name}`];

  if (productValue !== undefined) {
    return productValue;
  }

  // Calendar Sync owns the legacy connection and keeps the unprefixed values
  // until its controlled environment migration. TCM must never silently reuse
  // those credentials, because revoking one shared Square authorization would
  // break both products again.
  if (pluginId === "square-calendar-sink") {
    return process.env[`SQUARE_${name}`] ?? "";
  }

  return "";
}

function getSquareEnvironment(pluginId?: SquarePluginId): SquareEnvironment {
  const configured = pluginId
    ? getSquarePluginEnvironmentValue(pluginId, "ENVIRONMENT")
    : process.env.SQUARE_ENVIRONMENT;

  return configured === "sandbox"
    ? "sandbox"
    : "production";
}

export function getSquareBaseUrl(pluginId?: SquarePluginId) {
  return getSquareEnvironment(pluginId) === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

export function getSquareAppId(pluginId: SquarePluginId) {
  return getSquarePluginEnvironmentValue(pluginId, "APPLICATION_ID");
}

export function getSquareAppSecret(pluginId: SquarePluginId) {
  return getSquarePluginEnvironmentValue(pluginId, "APPLICATION_SECRET");
}

export function getSquareRedirectUri(pluginId: SquarePluginId) {
  const configured = getSquarePluginEnvironmentValue(pluginId, "REDIRECT_URI");

  if (configured) {
    return configured;
  }

  return pluginId === "square-calendar-sink"
    ? "https://hosted-saas.vercel.app/api/integrations/square/callback"
    : "";
}

export function getSquareScopes(pluginId: SquarePluginId) {
  const configuredScopes = getSquarePluginEnvironmentValue(pluginId, "SCOPES").trim();

  if (!configuredScopes) {
    return defaultSquareScopes[pluginId];
  }

  return configuredScopes
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

type SquareApiRequestInit = {
  accessToken: string;
  body?: unknown;
  method?: "GET" | "POST" | "PUT";
  path: string;
};

type SquareListLocationsResponse = {
  locations?: Array<{
    id: string;
    name?: string;
  }>;
};

export type SquareTimecard = {
  id: string;
  location_id: string;
  start_at: string;
  end_at?: string;
  status: "OPEN" | "CLOSED";
  team_member_id?: string;
  updated_at?: string;
  version?: number;
  wage?: {
    job_id?: string;
    title?: string;
    hourly_rate?: { amount?: number; currency?: string };
    tip_eligible?: boolean;
  };
};

type SquareSearchTimecardsResponse = {
  cursor?: string;
  timecards?: SquareTimecard[];
};

type SquareTimecardResponse = { timecard?: SquareTimecard };

export type SquareTeamMemberWage = {
  id?: string;
  team_member_id?: string;
  title?: string;
  job_id?: string;
  hourly_rate?: { amount?: number; currency?: string };
  tip_eligible?: boolean;
};

type SquareListTeamMemberWagesResponse = {
  cursor?: string;
  team_member_wages?: SquareTeamMemberWage[];
};

export type SquareTeamMember = {
  email_address?: string;
  family_name?: string;
  given_name?: string;
  id: string;
  phone_number?: string;
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

export class SquareApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly responseBody: string
  ) {
    super(`Square request failed with status ${status}`);
    this.name = "SquareApiError";
  }
}

export function isSquareAuthenticationError(error: unknown) {
  return error instanceof SquareApiError &&
    (error.status === 401 ||
      error.responseBody.includes("AUTHENTICATION_ERROR") ||
      error.responseBody.includes("UNAUTHORIZED"));
}

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
    throw new SquareApiError(response.status, errorText);
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

export async function searchSquareTimecardsByWorkday(input: {
  accessToken: string;
  endDate: string;
  locationIds?: string[];
  startDate: string;
  teamMemberIds?: string[];
  timezone: string;
}) {
  const timecards: SquareTimecard[] = [];
  let cursor: string | undefined;

  do {
    const response = await squareApiRequest<SquareSearchTimecardsResponse>({
      accessToken: input.accessToken,
      path: "/v2/labor/timecards/search",
      body: {
        cursor,
        limit: 200,
        query: {
          filter: {
            workday: {
              date_range: { start_date: input.startDate, end_date: input.endDate },
              default_timezone: input.timezone,
              match_timecards_by: "START_AT"
            },
            ...(input.locationIds?.length ? { location_ids: input.locationIds } : {}),
            ...(input.teamMemberIds?.length ? { team_member_ids: input.teamMemberIds } : {})
          },
          sort: { field: "START_AT", order: "ASC" }
        }
      }
    });

    if (response.timecards?.length) timecards.push(...response.timecards);
    cursor = response.cursor;
  } while (cursor);

  return timecards;
}

export async function retrieveSquareTimecard(input: {
  accessToken: string;
  timecardId: string;
}) {
  const response = await squareApiRequest<SquareTimecardResponse>({
    accessToken: input.accessToken,
    path: `/v2/labor/timecards/${encodeURIComponent(input.timecardId)}`
  });
  return response.timecard ?? null;
}

export async function createSquareTimecard(input: {
  accessToken: string;
  idempotencyKey: string;
  timecard: Omit<SquareTimecard, "id" | "status">;
}) {
  const response = await squareApiRequest<SquareTimecardResponse>({
    accessToken: input.accessToken,
    path: "/v2/labor/timecards",
    body: { idempotency_key: input.idempotencyKey, timecard: input.timecard }
  });
  return response.timecard ?? null;
}

export async function updateSquareTimecard(input: {
  accessToken: string;
  timecard: Pick<SquareTimecard, "id" | "version"> & Partial<SquareTimecard>;
}) {
  const response = await squareApiRequest<SquareTimecardResponse>({
    accessToken: input.accessToken,
    method: "PUT",
    path: `/v2/labor/timecards/${encodeURIComponent(input.timecard.id)}`,
    body: { timecard: input.timecard }
  });
  return response.timecard ?? null;
}

export async function listSquareTeamMemberWages(input: {
  accessToken: string;
  teamMemberId: string;
}) {
  const wages: SquareTeamMemberWage[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({ team_member_id: input.teamMemberId, limit: "200" });
    if (cursor) params.set("cursor", cursor);
    const response = await squareApiRequest<SquareListTeamMemberWagesResponse>({
      accessToken: input.accessToken,
      path: `/v2/labor/team-member-wages?${params.toString()}`
    });
    if (response.team_member_wages?.length) wages.push(...response.team_member_wages);
    cursor = response.cursor;
  } while (cursor);

  return wages;
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
  const scheduledShifts = await collectSquarePages<SquareScheduledShift>(async (cursor) => {
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

    return { cursor: response.cursor, items: response.scheduled_shifts };
  });

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

export function getSquareAuthorizationUrl(pluginId: SquarePluginId, state: string) {
  const params = new URLSearchParams({
    client_id: getSquareAppId(pluginId),
    scope: getSquareScopes(pluginId).join(" "),
    state
  });

  if (getSquareEnvironment(pluginId) !== "sandbox") {
    params.set("session", "false");
  }

  return `${getSquareBaseUrl(pluginId)}/oauth2/authorize?${params.toString()}`;
}

export async function exchangeSquareAuthorizationCode(pluginId: SquarePluginId, code: string) {
  const response = await fetch(`${getSquareBaseUrl(pluginId)}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Square-Version": squareVersion
    },
    body: JSON.stringify({
      client_id: getSquareAppId(pluginId),
      client_secret: getSquareAppSecret(pluginId),
      code,
      grant_type: "authorization_code",
      redirect_uri: getSquareRedirectUri(pluginId)
    })
  });

  if (!response.ok) {
    throw new Error(`Square token exchange failed with status ${response.status}.`);
  }

  const tokenResponse = await response.json() as {
    access_token: string;
    expires_at?: string;
    merchant_id: string;
    refresh_token: string;
    scopes?: string[];
    token_type: string;
  };
  const tokenStatus = await retrieveSquareTokenStatus(pluginId, tokenResponse.access_token);

  return {
    ...tokenResponse,
    scopes: tokenStatus.scopes ?? []
  };
}

export async function retrieveSquareTokenStatus(
  pluginId: SquarePluginId,
  accessToken: string
) {
  const response = await fetch(`${getSquareBaseUrl(pluginId)}/oauth2/token/status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Square-Version": squareVersion
    }
  });

  if (!response.ok) {
    throw new Error(`Square token status failed with status ${response.status}.`);
  }

  return response.json() as Promise<{
    expires_at?: string;
    merchant_id?: string;
    scopes?: string[];
  }>;
}

export async function refreshSquareAuthorization(
  pluginId: SquarePluginId,
  refreshToken: string
) {
  const response = await fetch(`${getSquareBaseUrl(pluginId)}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Square-Version": squareVersion
    },
    body: JSON.stringify({
      client_id: getSquareAppId(pluginId),
      client_secret: getSquareAppSecret(pluginId),
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });

  if (!response.ok) {
    throw new Error(`Square token refresh failed with status ${response.status}.`);
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

export async function revokeSquareAccessToken(
  pluginId: SquarePluginId,
  accessToken: string
) {
  const response = await fetch(`${getSquareBaseUrl(pluginId)}/oauth2/revoke`, {
    method: "POST",
    headers: {
      Authorization: `Client ${getSquareAppSecret(pluginId)}`,
      "Content-Type": "application/json",
      "Square-Version": squareVersion
    },
    body: JSON.stringify({
      access_token: accessToken,
      client_id: getSquareAppId(pluginId),
      revoke_only_access_token: false
    })
  });

  const body = await response.json().catch(() => null) as {
    errors?: Array<{ code?: string }>;
    success?: boolean;
  } | null;

  const result = classifySquareRevocationResponse({
    errorCodes: body?.errors
      ?.map((error) => error.code)
      .filter((code): code is string => Boolean(code)),
    ok: response.ok,
    status: response.status,
    success: body?.success
  });

  if (result) {
    return result;
  }

  throw new Error(`Square token revoke failed with status ${response.status}.`);
}

export function isSquareConfigured(pluginId: SquarePluginId) {
  return Boolean(
    getSquareAppId(pluginId) &&
      getSquareAppSecret(pluginId) &&
      getSquareRedirectUri(pluginId)
  );
}

export function getSquareEnvironmentLabel(pluginId: SquarePluginId) {
  return getSquareEnvironment(pluginId) === "sandbox" ? "Sandbox" : "Production";
}
