import "server-only";

import { randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import { getValidSquareConnectionByCustomerId } from "@/lib/square-connections";
import {
  SquarePluginId,
  removeSquarePluginInstallation,
  upsertSquarePluginInstallation
} from "@/lib/square-plugin-installations";
import {
  hasSquareScopes,
  isSquareAuthenticationError,
  listSquareJobs,
  listSquareLocations,
  searchSquareScheduledShifts,
  searchSquareTeamMembers
} from "@/lib/square";

const pluginId: SquarePluginId = "square-calendar-sink";
export const requiredSquareCalendarScopes = ["TIMECARDS_READ", "EMPLOYEES_READ"];

export type SquareCalendarSinkSettings = {
  calendarName: string;
  createdAt: Date;
  customerId: string;
  enabled: boolean;
  feedToken: string;
  id: string;
  teamMemberId: string | null;
  updatedAt: Date;
};

let settingsTableReady: Promise<void> | null = null;

function newFeedToken() {
  return randomBytes(32).toString("hex");
}

function mapSettings(row: Record<string, unknown>): SquareCalendarSinkSettings {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    teamMemberId: row.team_member_id ? String(row.team_member_id) : null,
    calendarName: String(row.calendar_name),
    enabled: Boolean(row.enabled),
    feedToken: String(row.feed_token),
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at))
  };
}

export async function ensureSquareCalendarSinkSettingsTable() {
  if (!settingsTableReady) {
    settingsTableReady = db.query(`
      create extension if not exists pgcrypto;

      create table if not exists public.square_calendar_sink_settings (
        id uuid primary key default gen_random_uuid(),
        customer_id uuid not null references public.customer_profiles(id) on delete cascade,
        team_member_id text,
        calendar_name text not null default 'Work',
        feed_token text not null unique,
        enabled boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (customer_id)
      );

      alter table public.square_calendar_sink_settings
        add column if not exists enabled boolean not null default true;

      create unique index if not exists square_calendar_sink_settings_customer_id_idx
        on public.square_calendar_sink_settings(customer_id)
        where customer_id is not null;
    `).then(() => undefined);
  }

  return settingsTableReady;
}

export async function getOrCreateSquareCalendarSinkSettings(customerId: string) {
  await ensureSquareCalendarSinkSettingsTable();

  await db.query(
    `insert into public.square_calendar_sink_settings (customer_id, feed_token)
     values ($1, $2)
     on conflict (customer_id) where customer_id is not null do nothing`,
    [customerId, newFeedToken()]
  );

  const result = await db.query(
    `select id, customer_id, team_member_id, calendar_name, feed_token, enabled,
            created_at, updated_at
     from public.square_calendar_sink_settings
     where customer_id = $1
     limit 1`,
    [customerId]
  );

  return mapSettings(result.rows[0]);
}

export async function installSquareCalendarSink(customerId: string) {
  await getOrCreateSquareCalendarSinkSettings(customerId);

  return upsertSquarePluginInstallation({
    customerId,
    pluginId,
    config: { status: "setup" }
  });
}

export async function uninstallSquareCalendarSink(customerId: string) {
  await ensureSquareCalendarSinkSettingsTable();
  await db.query(
    `delete from public.square_calendar_sink_settings where customer_id = $1`,
    [customerId]
  );

  return removeSquarePluginInstallation({ customerId, pluginId });
}

export async function getSquareCalendarSinkOverview(customerId: string) {
  const connection = await getValidSquareConnectionByCustomerId(customerId);

  if (!connection) {
    return {
      connected: false,
      connectionError: null,
      missingScopes: requiredSquareCalendarScopes,
      settings: null,
      teamMembers: [],
      upcomingShifts: []
    };
  }

  const settings = await getOrCreateSquareCalendarSinkSettings(customerId);
  const missingScopes = requiredSquareCalendarScopes.filter(
    (scope) => !connection.authorizedScopes.includes(scope)
  );

  if (missingScopes.length > 0) {
    return {
      connected: true,
      connectionError: null,
      missingScopes,
      settings,
      teamMembers: [],
      upcomingShifts: []
    };
  }

  try {
    const teamMembers = await searchSquareTeamMembers(connection.accessToken);
    const endAt = new Date();
    endAt.setDate(endAt.getDate() + 62);
    const upcomingShifts = settings.teamMemberId
      ? await searchSquareScheduledShifts({
          accessToken: connection.accessToken,
          teamMemberIds: [settings.teamMemberId],
          startAt: new Date(),
          endAt
        })
      : [];

    return {
      connected: true,
      connectionError: null,
      missingScopes,
      settings,
      teamMembers,
      upcomingShifts
    };
  } catch (error) {
    if (!isSquareAuthenticationError(error)) {
      throw error;
    }

    return {
      connected: true,
      connectionError: "authentication" as const,
      missingScopes: requiredSquareCalendarScopes,
      settings,
      teamMembers: [],
      upcomingShifts: []
    };
  }
}

export async function updateSquareCalendarSinkSettings(input: {
  calendarName: string;
  customerId: string;
  teamMemberId: string;
}) {
  const connection = await getValidSquareConnectionByCustomerId(input.customerId);

  if (!connection || !hasSquareScopes(connection.authorizedScopes, requiredSquareCalendarScopes)) {
    throw new Error("Square must be connected with schedule and employee access.");
  }

  const teamMembers = await searchSquareTeamMembers(connection.accessToken);

  if (!teamMembers.some((member) => member.id === input.teamMemberId)) {
    throw new Error("Choose an active Square team member.");
  }

  await getOrCreateSquareCalendarSinkSettings(input.customerId);
  const result = await db.query(
    `update public.square_calendar_sink_settings
     set team_member_id = $2,
         calendar_name = $3,
         updated_at = now()
     where customer_id = $1
     returning id, customer_id, team_member_id, calendar_name, feed_token, enabled,
               created_at, updated_at`,
    [input.customerId, input.teamMemberId, input.calendarName.trim() || "Work"]
  );

  await upsertSquarePluginInstallation({
    customerId: input.customerId,
    pluginId,
    config: { status: "active" }
  });

  return mapSettings(result.rows[0]);
}

export async function rotateSquareCalendarSinkFeedToken(customerId: string) {
  await getOrCreateSquareCalendarSinkSettings(customerId);
  const result = await db.query(
    `update public.square_calendar_sink_settings
     set feed_token = $2,
         updated_at = now()
     where customer_id = $1
     returning id, customer_id, team_member_id, calendar_name, feed_token, enabled,
               created_at, updated_at`,
    [customerId, newFeedToken()]
  );

  return mapSettings(result.rows[0]);
}

export async function setSquareCalendarSinkEnabled(customerId: string, enabled: boolean) {
  await getOrCreateSquareCalendarSinkSettings(customerId);
  const result = await db.query(
    `update public.square_calendar_sink_settings
     set enabled = $2,
         updated_at = now()
     where customer_id = $1
     returning id, customer_id, team_member_id, calendar_name, feed_token, enabled,
               created_at, updated_at`,
    [customerId, enabled]
  );

  return mapSettings(result.rows[0]);
}

export async function getSquareCalendarSinkFeed(feedToken: string) {
  await ensureSquareCalendarSinkSettingsTable();
  const result = await db.query(
    `select id, customer_id, team_member_id, calendar_name, feed_token, enabled,
            created_at, updated_at
     from public.square_calendar_sink_settings
     where feed_token = $1
     limit 1`,
    [feedToken]
  );

  if (!result.rows[0]) {
    return null;
  }

  const settings = mapSettings(result.rows[0]);

  if (!settings.enabled) {
    return null;
  }

  if (!settings.teamMemberId) {
    return { settings, coworkerShifts: [], jobs: [], locations: [], shifts: [], teamMembers: [] };
  }

  const connection = await getValidSquareConnectionByCustomerId(settings.customerId);

  if (!connection || !hasSquareScopes(connection.authorizedScopes, requiredSquareCalendarScopes)) {
    return null;
  }

  const startAt = new Date();
  startAt.setDate(startAt.getDate() - 7);
  const endAt = new Date();
  endAt.setDate(endAt.getDate() + 62);
  try {
    const [jobs, locations, shifts, teamMembers] = await Promise.all([
      listSquareJobs(connection.accessToken),
      listSquareLocations(connection.accessToken),
      searchSquareScheduledShifts({
        accessToken: connection.accessToken,
        teamMemberIds: [settings.teamMemberId],
        startAt,
        endAt
      }),
      searchSquareTeamMembers(connection.accessToken)
    ]);

    const locationIds = Array.from(
      new Set(
        shifts
          .map((shift) => shift.published_shift_details?.location_id)
          .filter((locationId): locationId is string => Boolean(locationId))
      )
    );
    const coworkerShifts = locationIds.length
      ? await searchSquareScheduledShifts({
          accessToken: connection.accessToken,
          locationIds,
          startAt,
          endAt
        })
      : [];

    return { settings, jobs, locations, shifts, teamMembers, coworkerShifts };
  } catch (error) {
    if (isSquareAuthenticationError(error)) {
      return null;
    }

    throw error;
  }
}
