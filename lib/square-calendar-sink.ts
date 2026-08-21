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

export type SquareCalendarSinkEmployeeFeed = SquareCalendarSinkSettings & {
  teamMemberName: string;
  upcomingShiftCount: number;
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

      create table if not exists public.square_calendar_sink_feeds (
        id uuid primary key default gen_random_uuid(),
        customer_id uuid not null references public.customer_profiles(id) on delete cascade,
        team_member_id text not null,
        calendar_name text not null default 'Work',
        feed_token text not null unique,
        enabled boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (customer_id, team_member_id)
      );

      create index if not exists square_calendar_sink_feeds_customer_idx
        on public.square_calendar_sink_feeds(customer_id);

      insert into public.square_calendar_sink_feeds
        (customer_id, team_member_id, calendar_name, feed_token, enabled, created_at, updated_at)
      select customer_id, team_member_id, calendar_name, feed_token, enabled, created_at, updated_at
      from public.square_calendar_sink_settings
      where team_member_id is not null
      on conflict (customer_id, team_member_id) do nothing;
    `).then(() => undefined);
  }

  return settingsTableReady;
}

export async function listSquareCalendarSinkSettings(customerId: string) {
  await ensureSquareCalendarSinkSettingsTable();

  const result = await db.query(
    `select id, customer_id, team_member_id, calendar_name, feed_token, enabled,
            created_at, updated_at
     from public.square_calendar_sink_feeds
     where customer_id = $1 and team_member_id is not null
     order by created_at asc`,
    [customerId]
  );

  return result.rows.map(mapSettings);
}

export async function installSquareCalendarSink(customerId: string) {
  await ensureSquareCalendarSinkSettingsTable();

  return upsertSquarePluginInstallation({
    customerId,
    pluginId,
    config: { status: "setup" }
  });
}

export async function uninstallSquareCalendarSink(customerId: string) {
  await ensureSquareCalendarSinkSettingsTable();
  await db.query(
    `delete from public.square_calendar_sink_feeds where customer_id = $1;
     delete from public.square_calendar_sink_settings where customer_id = $1`,
    [customerId]
  );

  return removeSquarePluginInstallation({ customerId, pluginId });
}

export async function getSquareCalendarSinkOverview(customerId: string) {
  const [connection, settings] = await Promise.all([
    getValidSquareConnectionByCustomerId(customerId),
    listSquareCalendarSinkSettings(customerId)
  ]);

  if (!connection) {
    return {
      connected: false,
      connectionError: null,
      missingScopes: requiredSquareCalendarScopes,
      feeds: settings.map((feed) => ({
        ...feed,
        teamMemberName: feed.calendarName,
        upcomingShiftCount: 0
      })),
      settings: settings[0] ?? null,
      teamMembers: [],
      upcomingShifts: [],
      totalUpcomingShifts: 0
    };
  }

  const missingScopes = requiredSquareCalendarScopes.filter(
    (scope) => !connection.authorizedScopes.includes(scope)
  );

  if (missingScopes.length > 0) {
    return {
      connected: true,
      connectionError: null,
      missingScopes,
      feeds: settings.map((feed) => ({
        ...feed,
        teamMemberName: feed.calendarName,
        upcomingShiftCount: 0
      })),
      settings: settings[0] ?? null,
      teamMembers: [],
      upcomingShifts: [],
      totalUpcomingShifts: 0
    };
  }

  try {
    const teamMembers = await searchSquareTeamMembers(connection.accessToken);
    const configuredTeamMemberIds = settings
      .map((feed) => feed.teamMemberId)
      .filter((teamMemberId): teamMemberId is string => Boolean(teamMemberId));
    const endAt = new Date();
    endAt.setDate(endAt.getDate() + 62);
    const upcomingShifts = configuredTeamMemberIds.length
      ? await searchSquareScheduledShifts({
          accessToken: connection.accessToken,
          teamMemberIds: configuredTeamMemberIds,
          startAt: new Date(),
          endAt
        })
      : [];
    const memberNames = new Map(
      teamMembers.map((member) => [
        member.id,
        [member.given_name, member.family_name].filter(Boolean).join(" ") || member.id
      ])
    );
    const shiftCounts = new Map<string, number>();
    for (const shift of upcomingShifts) {
      const teamMemberId = shift.published_shift_details?.team_member_id;
      if (teamMemberId) {
        shiftCounts.set(teamMemberId, (shiftCounts.get(teamMemberId) ?? 0) + 1);
      }
    }
    const feeds: SquareCalendarSinkEmployeeFeed[] = settings.map((feed) => ({
      ...feed,
      teamMemberName: feed.teamMemberId
        ? memberNames.get(feed.teamMemberId) ?? feed.calendarName
        : feed.calendarName,
      upcomingShiftCount: feed.teamMemberId ? shiftCounts.get(feed.teamMemberId) ?? 0 : 0
    }));

    return {
      connected: true,
      connectionError: null,
      missingScopes,
      feeds,
      settings: settings[0] ?? null,
      teamMembers,
      upcomingShifts,
      totalUpcomingShifts: upcomingShifts.length
    };
  } catch (error) {
    if (!isSquareAuthenticationError(error)) {
      throw error;
    }

    return {
      connected: true,
      connectionError: "authentication" as const,
      missingScopes: requiredSquareCalendarScopes,
      feeds: settings.map((feed) => ({
        ...feed,
        teamMemberName: feed.calendarName,
        upcomingShiftCount: 0
      })),
      settings: settings[0] ?? null,
      teamMembers: [],
      upcomingShifts: [],
      totalUpcomingShifts: 0
    };
  }
}

export async function upsertSquareCalendarSinkEmployeeFeed(input: {
  calendarName?: string;
  customerId: string;
  teamMemberId: string;
}) {
  const connection = await getValidSquareConnectionByCustomerId(input.customerId);

  if (!connection || !hasSquareScopes(connection.authorizedScopes, requiredSquareCalendarScopes)) {
    throw new Error("Square must be connected with schedule and employee access.");
  }

  const teamMembers = await searchSquareTeamMembers(connection.accessToken);

  const teamMember = teamMembers.find((member) => member.id === input.teamMemberId);

  if (!teamMember) {
    throw new Error("Choose an active Square team member.");
  }

  await ensureSquareCalendarSinkSettingsTable();
  const teamMemberName = [teamMember.given_name, teamMember.family_name]
    .filter(Boolean)
    .join(" ") || teamMember.id;
  const calendarName = input.calendarName?.trim() || `${teamMemberName} Work`;
  const result = await db.query(
    `insert into public.square_calendar_sink_feeds
       (customer_id, team_member_id, calendar_name, feed_token)
     values ($1, $2, $3, $4)
     on conflict (customer_id, team_member_id)
     do update set calendar_name = excluded.calendar_name,
                   updated_at = now()
     returning id, customer_id, team_member_id, calendar_name, feed_token, enabled,
               created_at, updated_at`,
    [input.customerId, input.teamMemberId, calendarName, newFeedToken()]
  );

  await upsertSquarePluginInstallation({
    customerId: input.customerId,
    pluginId,
    config: { status: "active" }
  });

  return mapSettings(result.rows[0]);
}

export async function rotateSquareCalendarSinkFeedToken(customerId: string, feedId: string) {
  await ensureSquareCalendarSinkSettingsTable();
  const result = await db.query(
    `update public.square_calendar_sink_feeds
     set feed_token = $2,
         updated_at = now()
     where customer_id = $1 and id = $3
     returning id, customer_id, team_member_id, calendar_name, feed_token, enabled,
               created_at, updated_at`,
    [customerId, newFeedToken(), feedId]
  );

  if (!result.rows[0]) {
    throw new Error("Employee calendar feed not found.");
  }

  return mapSettings(result.rows[0]);
}

export async function setSquareCalendarSinkEnabled(
  customerId: string,
  feedId: string,
  enabled: boolean
) {
  await ensureSquareCalendarSinkSettingsTable();
  const result = await db.query(
    `update public.square_calendar_sink_feeds
     set enabled = $2,
         updated_at = now()
     where customer_id = $1 and id = $3
     returning id, customer_id, team_member_id, calendar_name, feed_token, enabled,
               created_at, updated_at`,
    [customerId, enabled, feedId]
  );

  if (!result.rows[0]) {
    throw new Error("Employee calendar feed not found.");
  }

  return mapSettings(result.rows[0]);
}

export async function deleteSquareCalendarSinkEmployeeFeed(customerId: string, feedId: string) {
  await ensureSquareCalendarSinkSettingsTable();
  const result = await db.query(
    `delete from public.square_calendar_sink_feeds
     where customer_id = $1 and id = $2
     returning id`,
    [customerId, feedId]
  );

  if (!result.rows[0]) {
    throw new Error("Employee calendar feed not found.");
  }
}

export async function getSquareCalendarSinkSubscription(feedToken: string) {
  await ensureSquareCalendarSinkSettingsTable();
  const result = await db.query(
    `select id, customer_id, team_member_id, calendar_name, feed_token, enabled,
            created_at, updated_at
     from public.square_calendar_sink_feeds
     where feed_token = $1
     limit 1`,
    [feedToken]
  );

  return result.rows[0] ? mapSettings(result.rows[0]) : null;
}

export async function getSquareCalendarSinkFeed(feedToken: string) {
  await ensureSquareCalendarSinkSettingsTable();
  const result = await db.query(
    `select id, customer_id, team_member_id, calendar_name, feed_token, enabled,
            created_at, updated_at
     from public.square_calendar_sink_feeds
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
