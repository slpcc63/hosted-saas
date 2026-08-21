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
  searchSquareTeamMembers,
  SquareTeamMember
} from "@/lib/square";
import { getActiveSubscriptionForProduct } from "@/lib/subscriptions";

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
  emailAddress: string | null;
  lastDelivery: SquareCalendarSinkDelivery | null;
  phoneNumber: string | null;
  teamMemberName: string;
  upcomingShiftCount: number;
};

export type SquareCalendarSinkDeliveryChannel = "email" | "manual" | "text";
export type SquareCalendarSinkDeliveryStatus = "failed" | "manual" | "needs_contact" | "sent";

export type SquareCalendarSinkDelivery = {
  attemptedAt: Date;
  channel: SquareCalendarSinkDeliveryChannel;
  errorMessage: string | null;
  id: string;
  providerMessageId: string | null;
  recipient: string | null;
  status: SquareCalendarSinkDeliveryStatus;
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

function mapDelivery(row: Record<string, unknown>): SquareCalendarSinkDelivery {
  return {
    id: String(row.id),
    channel: String(row.channel) as SquareCalendarSinkDeliveryChannel,
    status: String(row.status) as SquareCalendarSinkDeliveryStatus,
    recipient: row.recipient ? String(row.recipient) : null,
    providerMessageId: row.provider_message_id ? String(row.provider_message_id) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    attemptedAt: new Date(String(row.created_at))
  };
}

function buildEmployeeFeeds(input: {
  deliveries: Map<string, SquareCalendarSinkDelivery>;
  settings: SquareCalendarSinkSettings[];
  shiftCounts?: Map<string, number>;
  teamMembers?: SquareTeamMember[];
}) {
  const members = new Map((input.teamMembers ?? []).map((member) => [member.id, member]));

  return input.settings.map((feed): SquareCalendarSinkEmployeeFeed => {
    const member = feed.teamMemberId ? members.get(feed.teamMemberId) : null;
    const memberName = member
      ? [member.given_name, member.family_name].filter(Boolean).join(" ") || member.id
      : feed.calendarName;

    return {
      ...feed,
      emailAddress: member?.email_address?.trim() || null,
      lastDelivery: input.deliveries.get(feed.id) ?? null,
      phoneNumber: member?.phone_number?.trim() || null,
      teamMemberName: memberName,
      upcomingShiftCount:
        feed.teamMemberId && input.shiftCounts
          ? input.shiftCounts.get(feed.teamMemberId) ?? 0
          : 0
    };
  });
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

      create table if not exists public.square_calendar_sink_deliveries (
        id uuid primary key default gen_random_uuid(),
        customer_id uuid not null references public.customer_profiles(id) on delete cascade,
        feed_id uuid not null references public.square_calendar_sink_feeds(id) on delete cascade,
        channel text not null check (channel in ('email', 'manual', 'text')),
        recipient text,
        status text not null check (status in ('failed', 'manual', 'needs_contact', 'sent')),
        provider_message_id text,
        error_message text,
        created_at timestamptz not null default now()
      );

      create index if not exists square_calendar_sink_deliveries_feed_idx
        on public.square_calendar_sink_deliveries(feed_id, created_at desc);

      create table if not exists public.square_calendar_sink_migrations (
        migration_key text primary key,
        completed_at timestamptz not null default now()
      );

      do $$
      begin
        if not exists (
          select 1
          from public.square_calendar_sink_migrations
          where migration_key = 'legacy_settings_to_employee_feeds_v1'
        ) then
          insert into public.square_calendar_sink_feeds
            (customer_id, team_member_id, calendar_name, feed_token, enabled, created_at, updated_at)
          select customer_id, team_member_id, calendar_name, feed_token, enabled, created_at, updated_at
          from public.square_calendar_sink_settings
          where team_member_id is not null
          on conflict (customer_id, team_member_id) do nothing;

          insert into public.square_calendar_sink_migrations (migration_key)
          values ('legacy_settings_to_employee_feeds_v1')
          on conflict (migration_key) do nothing;
        end if;
      end
      $$;
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

export async function listLatestSquareCalendarSinkDeliveries(customerId: string) {
  await ensureSquareCalendarSinkSettingsTable();
  const result = await db.query(
    `select distinct on (feed_id)
        id, feed_id, channel, recipient, status, provider_message_id, error_message, created_at
     from public.square_calendar_sink_deliveries
     where customer_id = $1
     order by feed_id, created_at desc`,
    [customerId]
  );

  return new Map(
    result.rows.map((row) => [String(row.feed_id), mapDelivery(row)] as const)
  );
}

export async function recordSquareCalendarSinkDelivery(input: {
  channel: SquareCalendarSinkDeliveryChannel;
  customerId: string;
  errorMessage?: string | null;
  feedId: string;
  providerMessageId?: string | null;
  recipient?: string | null;
  status: SquareCalendarSinkDeliveryStatus;
}) {
  await ensureSquareCalendarSinkSettingsTable();
  const result = await db.query(
    `insert into public.square_calendar_sink_deliveries
       (customer_id, feed_id, channel, recipient, status, provider_message_id, error_message)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, channel, recipient, status, provider_message_id, error_message, created_at`,
    [
      input.customerId,
      input.feedId,
      input.channel,
      input.recipient?.trim() || null,
      input.status,
      input.providerMessageId?.trim() || null,
      input.errorMessage?.slice(0, 500) || null
    ]
  );

  return mapDelivery(result.rows[0]);
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
  const [connection, settings, deliveries, subscription] = await Promise.all([
    getValidSquareConnectionByCustomerId(customerId),
    listSquareCalendarSinkSettings(customerId),
    listLatestSquareCalendarSinkDeliveries(customerId),
    getActiveSubscriptionForProduct({ customerId, productSlug: pluginId })
  ]);
  const textingEntitled = Boolean(subscription?.textingEnabled);

  if (!connection) {
    return {
      connected: false,
      connectionError: null,
      missingScopes: requiredSquareCalendarScopes,
      feeds: buildEmployeeFeeds({ deliveries, settings }),
      settings: settings[0] ?? null,
      teamMembers: [],
      textingEntitled,
      textingPlanName: subscription?.planName ?? null,
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
      feeds: buildEmployeeFeeds({ deliveries, settings }),
      settings: settings[0] ?? null,
      teamMembers: [],
      textingEntitled,
      textingPlanName: subscription?.planName ?? null,
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
    const shiftCounts = new Map<string, number>();
    for (const shift of upcomingShifts) {
      const teamMemberId = shift.published_shift_details?.team_member_id;
      if (teamMemberId) {
        shiftCounts.set(teamMemberId, (shiftCounts.get(teamMemberId) ?? 0) + 1);
      }
    }
    const feeds = buildEmployeeFeeds({ deliveries, settings, shiftCounts, teamMembers });

    return {
      connected: true,
      connectionError: null,
      missingScopes,
      feeds,
      settings: settings[0] ?? null,
      teamMembers,
      textingEntitled,
      textingPlanName: subscription?.planName ?? null,
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
      feeds: buildEmployeeFeeds({ deliveries, settings }),
      settings: settings[0] ?? null,
      teamMembers: [],
      textingEntitled,
      textingPlanName: subscription?.planName ?? null,
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

  const teamMemberName = [teamMember.given_name, teamMember.family_name]
    .filter(Boolean)
    .join(" ") || teamMember.id;
  const calendarName = input.calendarName?.trim() || `${teamMemberName} Work`;
  const feed = await upsertSquareCalendarSinkFeedRecord({
    calendarName,
    customerId: input.customerId,
    teamMemberId: teamMember.id
  });

  await upsertSquarePluginInstallation({
    customerId: input.customerId,
    pluginId,
    config: { status: "active" }
  });

  return { feed, teamMember };
}

async function upsertSquareCalendarSinkFeedRecord(input: {
  calendarName: string;
  customerId: string;
  teamMemberId: string;
}) {
  await ensureSquareCalendarSinkSettingsTable();
  const result = await db.query(
    `insert into public.square_calendar_sink_feeds
       (customer_id, team_member_id, calendar_name, feed_token)
     values ($1, $2, $3, $4)
     on conflict (customer_id, team_member_id)
     do update set calendar_name = excluded.calendar_name,
                   updated_at = now()
     returning id, customer_id, team_member_id, calendar_name, feed_token, enabled,
               created_at, updated_at`,
    [input.customerId, input.teamMemberId, input.calendarName, newFeedToken()]
  );

  return mapSettings(result.rows[0]);
}

export async function createMissingSquareCalendarSinkEmployeeFeeds(customerId: string) {
  const connection = await getValidSquareConnectionByCustomerId(customerId);

  if (!connection || !hasSquareScopes(connection.authorizedScopes, requiredSquareCalendarScopes)) {
    throw new Error("Square must be connected with schedule and employee access.");
  }

  const [teamMembers, existingFeeds] = await Promise.all([
    searchSquareTeamMembers(connection.accessToken),
    listSquareCalendarSinkSettings(customerId)
  ]);
  const existingTeamMemberIds = new Set(
    existingFeeds
      .map((feed) => feed.teamMemberId)
      .filter((teamMemberId): teamMemberId is string => Boolean(teamMemberId))
  );
  const missingTeamMembers = teamMembers.filter((member) => !existingTeamMemberIds.has(member.id));
  const created = await Promise.all(
    missingTeamMembers.map(async (teamMember) => {
      const teamMemberName = [teamMember.given_name, teamMember.family_name]
        .filter(Boolean)
        .join(" ") || teamMember.id;
      const feed = await upsertSquareCalendarSinkFeedRecord({
        calendarName: `${teamMemberName} Work`,
        customerId,
        teamMemberId: teamMember.id
      });

      return { feed, teamMember };
    })
  );

  await upsertSquarePluginInstallation({
    customerId,
    pluginId,
    config: { status: created.length || existingFeeds.length ? "active" : "setup" }
  });

  return created;
}

export async function rotateSquareCalendarSinkFeedToken(customerId: string, feedId: string) {
  await ensureSquareCalendarSinkSettingsTable();
  const result = await db.query(
    `with updated as (
       update public.square_calendar_sink_feeds
       set feed_token = $2,
           updated_at = now()
       where customer_id = $1 and id = $3
       returning id, customer_id, team_member_id, calendar_name, feed_token, enabled,
                 created_at, updated_at
     ), legacy as (
       update public.square_calendar_sink_settings legacy_settings
       set feed_token = updated.feed_token,
           updated_at = now()
       from updated
       where legacy_settings.customer_id = updated.customer_id
         and legacy_settings.team_member_id = updated.team_member_id
     )
     select id, customer_id, team_member_id, calendar_name, feed_token, enabled,
            created_at, updated_at
     from updated`,
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
    `with updated as (
       update public.square_calendar_sink_feeds
       set enabled = $2,
           updated_at = now()
       where customer_id = $1 and id = $3
       returning id, customer_id, team_member_id, calendar_name, feed_token, enabled,
                 created_at, updated_at
     ), legacy as (
       update public.square_calendar_sink_settings legacy_settings
       set enabled = updated.enabled,
           updated_at = now()
       from updated
       where legacy_settings.customer_id = updated.customer_id
         and legacy_settings.team_member_id = updated.team_member_id
     )
     select id, customer_id, team_member_id, calendar_name, feed_token, enabled,
            created_at, updated_at
     from updated`,
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
    `with deleted as (
       delete from public.square_calendar_sink_feeds
       where customer_id = $1 and id = $2
       returning id, customer_id, team_member_id
     ), legacy as (
       delete from public.square_calendar_sink_settings legacy_settings
       using deleted
       where legacy_settings.customer_id = deleted.customer_id
         and legacy_settings.team_member_id = deleted.team_member_id
     )
     select id from deleted`,
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
