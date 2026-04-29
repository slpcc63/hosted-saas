import "server-only";

import { db } from "@/lib/db";
import type { CustomerProfile } from "@/lib/customers";
import { ensureCustomerProfilesTable } from "@/lib/customers";
import {
  getDefaultManagedSenderEmail,
  parseManagedSenderLocalPart,
  resolveManagedSenderEmail,
  sendTransactionalEmail
} from "@/lib/email";
import { getSquareConnectionByCustomerId } from "@/lib/square-connections";
import {
  hasSquareScopes,
  listSquareLocations,
  searchSquareOpenTimecards,
  searchSquareTeamMembers
} from "@/lib/square";
import {
  SquarePluginId,
  removeSquarePluginInstallation,
  upsertSquarePluginInstallation
} from "@/lib/square-plugin-installations";
import {
  ActiveProductSubscription,
  getActiveSubscriptionForProduct
} from "@/lib/subscriptions";

const pluginId: SquarePluginId = "square-time-card-manager";
const timeCardManagerProductSlug = "square-time-card-manager";
const defaultTimezone = "America/Los_Angeles";

export type TimeCardNotificationMode = "email_only" | "text_only" | "email_and_text";
export type TimeCardEffectiveMode = TimeCardNotificationMode;
export type TimeCardBlockedReason = "texting_not_included" | "quota_exhausted" | null;

export type TimeCardManagerSettings = {
  automationEnabled: boolean;
  createdAt: Date;
  customerId: string;
  notificationMode: TimeCardNotificationMode;
  updatedAt: Date;
};

export type TimeCardManagerScheduleEntry = {
  createdAt: Date;
  customerId: string;
  dayOfWeek: number;
  enabled: boolean;
  id: string;
  runTimeLocal: string;
  timezone: string;
  updatedAt: Date;
};

export type TimeCardManagerTextUsage = {
  billingPeriodEnd: Date;
  billingPeriodStart: Date;
  customerId: string;
  textsSentCount: number;
  updatedAt: Date;
};

export type TimeCardManagerEntitlement = {
  billingPeriodEnd: Date;
  billingPeriodStart: Date;
  monthlyTextLimit: number;
  packageName: string;
  productSlug: string;
  status: string;
  subscriptionId: string;
  textingEnabled: boolean;
};

export type TimeCardDeliveryEvaluation = {
  canSendEmail: boolean;
  canSendText: boolean;
  configuredMode: TimeCardNotificationMode;
  effectiveMode: TimeCardEffectiveMode;
  textsRemaining: number;
  textingBlockedReason: TimeCardBlockedReason;
};

export type TimeCardManagerSenderProfile = {
  configuredLocalPart: string | null;
  defaultFromEmail: string;
  fromEmail: string;
  usesDefaultSender: boolean;
};

export type MissedClockOutCandidate = {
  clockInTimeLabel: string;
  hoursOpen: number;
  locationName: string | null;
  shiftDateLabel: string;
  teamMemberName: string;
  timecardId: string;
};

export type TimeCardManagerOverview = {
  alertMessage: string | null;
  currentUsage: TimeCardManagerTextUsage | null;
  delivery: TimeCardDeliveryEvaluation;
  entitlement: TimeCardManagerEntitlement | null;
  nextRunLabel: string | null;
  scheduleEntries: TimeCardManagerScheduleEntry[];
  senderProfile: TimeCardManagerSenderProfile;
  settings: TimeCardManagerSettings;
};

export type TimeCardManagerSquareStatus = {
  connected: boolean;
  missingScopes: string[];
};

let timeCardManagerSettingsTableReady: Promise<void> | null = null;
let timeCardManagerScheduleTableReady: Promise<void> | null = null;
let timeCardManagerUsageTableReady: Promise<void> | null = null;

function getDefaultPluginInstallConfig() {
  return {
    notifyOnExceptions: true,
    notifyOnMissedClockOuts: true,
    reviewMode: "manager-inbox"
  };
}

export function normalizeNotificationMode(value: string): TimeCardNotificationMode {
  if (
    value === "email_only" ||
    value === "text_only" ||
    value === "email_and_text"
  ) {
    return value;
  }

  return "email_only";
}

function mapSettings(row: Record<string, unknown>): TimeCardManagerSettings {
  return {
    customerId: String(row.customer_id),
    notificationMode: normalizeNotificationMode(String(row.notification_mode)),
    automationEnabled: Boolean(row.automation_enabled),
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at))
  };
}

function mapScheduleEntry(row: Record<string, unknown>): TimeCardManagerScheduleEntry {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    dayOfWeek: Number(row.day_of_week),
    runTimeLocal: String(row.run_time_local),
    timezone: String(row.timezone),
    enabled: Boolean(row.enabled),
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at))
  };
}

function mapUsage(row: Record<string, unknown>): TimeCardManagerTextUsage {
  return {
    customerId: String(row.customer_id),
    billingPeriodStart: new Date(String(row.billing_period_start)),
    billingPeriodEnd: new Date(String(row.billing_period_end)),
    textsSentCount: Number(row.texts_sent_count),
    updatedAt: new Date(String(row.updated_at))
  };
}

function sortScheduleEntries(entries: TimeCardManagerScheduleEntry[]) {
  return [...entries].sort((left, right) => {
    if (left.dayOfWeek !== right.dayOfWeek) {
      return left.dayOfWeek - right.dayOfWeek;
    }

    return left.runTimeLocal.localeCompare(right.runTimeLocal);
  });
}

function buildEntitlement(subscription: ActiveProductSubscription | null): TimeCardManagerEntitlement | null {
  if (!subscription) {
    return null;
  }

  const billingPeriodEnd =
    subscription.renewalDate ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const billingPeriodStart = new Date(
    billingPeriodEnd.getTime() - 30 * 24 * 60 * 60 * 1000
  );

  return {
    subscriptionId: subscription.id,
    productSlug: subscription.productSlug,
    packageName: subscription.planName ?? "Unassigned plan",
    textingEnabled: subscription.textingEnabled,
    monthlyTextLimit: subscription.monthlyTextLimit,
    billingPeriodStart,
    billingPeriodEnd,
    status: subscription.status
  };
}

function buildAlertMessage(input: {
  delivery: TimeCardDeliveryEvaluation;
}) {
  if (input.delivery.configuredMode === "email_only") {
    return null;
  }

  if (input.delivery.textingBlockedReason === "quota_exhausted") {
    return "Text notifications are paused because your monthly text limit has been reached. Email notifications still run where enabled. Manage your subscription to restore texting.";
  }

  if (input.delivery.textingBlockedReason === "texting_not_included") {
    return "Your current package does not include text notifications. Email notifications remain available where enabled. Manage your subscription to add texting.";
  }

  return null;
}

function getDayLabel(dayOfWeek: number) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dayOfWeek] ?? "Day";
}

function buildNextRunLabel(entries: TimeCardManagerScheduleEntry[]) {
  const enabledEntries = sortScheduleEntries(entries.filter((entry) => entry.enabled));

  if (!enabledEntries.length) {
    return null;
  }

  const nextEntry = enabledEntries[0];
  return `${getDayLabel(nextEntry.dayOfWeek)} at ${nextEntry.runTimeLocal} (${nextEntry.timezone})`;
}

function buildSenderProfile(subscription: ActiveProductSubscription | null): TimeCardManagerSenderProfile {
  const requestedLocalPart =
    typeof subscription?.customSettings.notificationSenderLocalPart === "string"
      ? subscription.customSettings.notificationSenderLocalPart
      : "";
  const parsedLocalPart = parseManagedSenderLocalPart(requestedLocalPart);
  const configuredLocalPart = parsedLocalPart.normalized;

  return {
    configuredLocalPart,
    defaultFromEmail: getDefaultManagedSenderEmail(),
    fromEmail: resolveManagedSenderEmail(configuredLocalPart),
    usesDefaultSender: !configuredLocalPart
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getNotificationDisplayName(customer: Pick<CustomerProfile, "companyName" | "contactName">) {
  if (customer.companyName?.trim()) {
    return `${customer.companyName.trim()} Notifications`;
  }

  if (customer.contactName?.trim()) {
    return `${customer.contactName.trim()} Notifications`;
  }

  return "SLPCC63 Notifications";
}

function formatOptionalLine(label: string, value?: string | null) {
  if (!value?.trim()) {
    return null;
  }

  return `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value.trim())}</li>`;
}

function formatDateLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium"
  }).format(date);
}

function formatTimeLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function buildTeamMemberName(input: { family_name?: string; given_name?: string; reference_id?: string }) {
  const fullName = [input.given_name?.trim(), input.family_name?.trim()].filter(Boolean).join(" ");

  if (fullName) {
    return fullName;
  }

  if (input.reference_id?.trim()) {
    return input.reference_id.trim();
  }

  return "Unknown team member";
}

export async function installSquareTimeCardManager(customerId: string) {
  return upsertSquarePluginInstallation({
    customerId,
    pluginId,
    config: getDefaultPluginInstallConfig()
  });
}

export async function uninstallSquareTimeCardManager(customerId: string) {
  return removeSquarePluginInstallation({
    customerId,
    pluginId
  });
}

export async function ensureTimeCardManagerSettingsTable() {
  await ensureCustomerProfilesTable();

  if (!timeCardManagerSettingsTableReady) {
    timeCardManagerSettingsTableReady = db.query(`
      create extension if not exists pgcrypto;

      create table if not exists public.square_time_card_manager_settings (
        customer_id uuid primary key references public.customer_profiles(id) on delete cascade,
        notification_mode text not null default 'email_only'
          check (notification_mode in ('email_only', 'text_only', 'email_and_text')),
        automation_enabled boolean not null default false,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
    `).then(() => undefined);
  }

  return timeCardManagerSettingsTableReady;
}

export async function ensureTimeCardManagerScheduleTable() {
  await ensureCustomerProfilesTable();

  if (!timeCardManagerScheduleTableReady) {
    timeCardManagerScheduleTableReady = db.query(`
      create extension if not exists pgcrypto;

      create table if not exists public.square_time_card_manager_schedule_entries (
        id uuid primary key default gen_random_uuid(),
        customer_id uuid not null references public.customer_profiles(id) on delete cascade,
        day_of_week integer not null check (day_of_week between 0 and 6),
        run_time_local text not null,
        timezone text not null default '${defaultTimezone}',
        enabled boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (customer_id, day_of_week, run_time_local, timezone)
      );
    `).then(() => undefined);
  }

  return timeCardManagerScheduleTableReady;
}

export async function ensureTimeCardManagerUsageTable() {
  await ensureCustomerProfilesTable();

  if (!timeCardManagerUsageTableReady) {
    timeCardManagerUsageTableReady = db.query(`
      create extension if not exists pgcrypto;

      create table if not exists public.square_time_card_manager_text_usage (
        customer_id uuid not null references public.customer_profiles(id) on delete cascade,
        billing_period_start timestamptz not null,
        billing_period_end timestamptz not null,
        texts_sent_count integer not null default 0,
        updated_at timestamptz not null default now(),
        primary key (customer_id, billing_period_start)
      );
    `).then(() => undefined);
  }

  return timeCardManagerUsageTableReady;
}

export async function getTimeCardManagerSettings(customerId: string) {
  await ensureTimeCardManagerSettingsTable();

  const result = await db.query(
    `select customer_id, notification_mode, automation_enabled, created_at, updated_at
     from public.square_time_card_manager_settings
     where customer_id = $1
     limit 1`,
    [customerId]
  );

  if (!result.rows[0]) {
    return null;
  }

  return mapSettings(result.rows[0]);
}

export async function getOrCreateTimeCardManagerSettings(customerId: string) {
  const existing = await getTimeCardManagerSettings(customerId);

  if (existing) {
    return existing;
  }

  await ensureTimeCardManagerSettingsTable();

  const created = await db.query(
    `insert into public.square_time_card_manager_settings (
      customer_id
    ) values ($1)
    on conflict (customer_id)
    do update set updated_at = public.square_time_card_manager_settings.updated_at
    returning customer_id, notification_mode, automation_enabled, created_at, updated_at`,
    [customerId]
  );

  return mapSettings(created.rows[0]);
}

export async function upsertTimeCardManagerSettings(input: {
  automationEnabled: boolean;
  customerId: string;
  notificationMode: TimeCardNotificationMode;
}) {
  await ensureTimeCardManagerSettingsTable();

  const result = await db.query(
    `insert into public.square_time_card_manager_settings (
      customer_id,
      notification_mode,
      automation_enabled
    ) values ($1, $2, $3)
    on conflict (customer_id)
    do update set
      notification_mode = excluded.notification_mode,
      automation_enabled = excluded.automation_enabled,
      updated_at = now()
    returning customer_id, notification_mode, automation_enabled, created_at, updated_at`,
    [input.customerId, input.notificationMode, input.automationEnabled]
  );

  return mapSettings(result.rows[0]);
}

export async function getTimeCardManagerScheduleEntries(customerId: string) {
  await ensureTimeCardManagerScheduleTable();

  const result = await db.query(
    `select id, customer_id, day_of_week, run_time_local, timezone, enabled, created_at, updated_at
     from public.square_time_card_manager_schedule_entries
     where customer_id = $1
     order by day_of_week asc, run_time_local asc`,
    [customerId]
  );

  return result.rows.map((row) => mapScheduleEntry(row));
}

export async function addTimeCardManagerScheduleEntry(input: {
  customerId: string;
  dayOfWeek: number;
  runTimeLocal: string;
  timezone?: string;
}) {
  await ensureTimeCardManagerScheduleTable();

  const result = await db.query(
    `insert into public.square_time_card_manager_schedule_entries (
      customer_id,
      day_of_week,
      run_time_local,
      timezone,
      enabled
    ) values ($1, $2, $3, $4, true)
    on conflict (customer_id, day_of_week, run_time_local, timezone)
    do update set enabled = true, updated_at = now()
    returning id, customer_id, day_of_week, run_time_local, timezone, enabled, created_at, updated_at`,
    [input.customerId, input.dayOfWeek, input.runTimeLocal, input.timezone ?? defaultTimezone]
  );

  return mapScheduleEntry(result.rows[0]);
}

export async function removeTimeCardManagerScheduleEntry(input: {
  customerId: string;
  scheduleEntryId: string;
}) {
  await ensureTimeCardManagerScheduleTable();

  await db.query(
    `delete from public.square_time_card_manager_schedule_entries
     where id = $1 and customer_id = $2`,
    [input.scheduleEntryId, input.customerId]
  );
}

export async function getTimeCardManagerEntitlement(customerId: string) {
  const subscription = await getActiveSubscriptionForProduct({
    customerId,
    productSlug: timeCardManagerProductSlug
  });

  return buildEntitlement(subscription);
}

export async function getTimeCardManagerCurrentUsage(input: {
  customerId: string;
  entitlement: TimeCardManagerEntitlement | null;
}) {
  await ensureTimeCardManagerUsageTable();

  if (!input.entitlement) {
    return null;
  }

  const result = await db.query(
    `select customer_id, billing_period_start, billing_period_end, texts_sent_count, updated_at
     from public.square_time_card_manager_text_usage
     where customer_id = $1
       and billing_period_start = $2
     limit 1`,
    [input.customerId, input.entitlement.billingPeriodStart.toISOString()]
  );

  if (!result.rows[0]) {
    const created = await db.query(
      `insert into public.square_time_card_manager_text_usage (
        customer_id,
        billing_period_start,
        billing_period_end,
        texts_sent_count,
        updated_at
      ) values ($1, $2, $3, 0, now())
      returning customer_id, billing_period_start, billing_period_end, texts_sent_count, updated_at`,
      [
        input.customerId,
        input.entitlement.billingPeriodStart.toISOString(),
        input.entitlement.billingPeriodEnd.toISOString()
      ]
    );

    return mapUsage(created.rows[0]);
  }

  return mapUsage(result.rows[0]);
}

export async function evaluateTimeCardManagerDelivery(input: {
  customerId: string;
  requestedTextCount?: number;
}) {
  const settings = await getOrCreateTimeCardManagerSettings(input.customerId);
  const configuredMode = normalizeNotificationMode(settings.notificationMode);
  const entitlement = await getTimeCardManagerEntitlement(input.customerId);
  const usage = await getTimeCardManagerCurrentUsage({
    customerId: input.customerId,
    entitlement
  });
  const requestedTextCount = input.requestedTextCount ?? 1;
  const textsRemaining = entitlement
    ? Math.max(entitlement.monthlyTextLimit - (usage?.textsSentCount ?? 0), 0)
    : 0;

  let textingBlockedReason: TimeCardBlockedReason = null;

  if (configuredMode !== "email_only" && !entitlement?.textingEnabled) {
    textingBlockedReason = "texting_not_included";
  } else if (configuredMode !== "email_only" && textsRemaining < requestedTextCount) {
    textingBlockedReason = "quota_exhausted";
  }

  const effectiveMode: TimeCardEffectiveMode =
    textingBlockedReason && configuredMode !== "email_only"
      ? "email_only"
      : configuredMode;

  const canSendEmail =
    effectiveMode === "email_only" || effectiveMode === "email_and_text";
  const canSendText =
    (effectiveMode === "text_only" || effectiveMode === "email_and_text") &&
    !textingBlockedReason;

  return {
    configuredMode,
    effectiveMode,
    canSendEmail,
    canSendText,
    textsRemaining,
    textingBlockedReason
  } satisfies TimeCardDeliveryEvaluation;
}

export async function recordTimeCardManagerTextUsage(input: {
  customerId: string;
  sentCount: number;
}) {
  const entitlement = await getTimeCardManagerEntitlement(input.customerId);

  if (!entitlement) {
    throw new Error("No active time card manager subscription found");
  }

  const existing = await getTimeCardManagerCurrentUsage({
    customerId: input.customerId,
    entitlement
  });

  const result = await db.query(
    `insert into public.square_time_card_manager_text_usage (
      customer_id,
      billing_period_start,
      billing_period_end,
      texts_sent_count,
      updated_at
    ) values ($1, $2, $3, $4, now())
    on conflict (customer_id, billing_period_start)
    do update set
      texts_sent_count = excluded.texts_sent_count,
      billing_period_end = excluded.billing_period_end,
      updated_at = now()
    returning customer_id, billing_period_start, billing_period_end, texts_sent_count, updated_at`,
    [
      input.customerId,
      entitlement.billingPeriodStart.toISOString(),
      entitlement.billingPeriodEnd.toISOString(),
      (existing?.textsSentCount ?? 0) + input.sentCount
    ]
  );

  return mapUsage(result.rows[0]);
}

export async function getTimeCardManagerOverview(customerId: string) {
  const [settings, scheduleEntries, subscription, delivery] = await Promise.all([
    getOrCreateTimeCardManagerSettings(customerId),
    getTimeCardManagerScheduleEntries(customerId),
    getActiveSubscriptionForProduct({
      customerId,
      productSlug: timeCardManagerProductSlug
    }),
    evaluateTimeCardManagerDelivery({ customerId })
  ]);
  const entitlement = buildEntitlement(subscription);
  const currentUsage = await getTimeCardManagerCurrentUsage({
    customerId,
    entitlement
  });
  const senderProfile = buildSenderProfile(subscription);

  return {
    settings,
    scheduleEntries,
    entitlement,
    currentUsage,
    delivery,
    senderProfile,
    alertMessage: buildAlertMessage({ delivery }),
    nextRunLabel:
      settings.automationEnabled ? buildNextRunLabel(scheduleEntries) : null
  } satisfies TimeCardManagerOverview;
}

export async function sendTimeCardManagerTestEmail(input: {
  customer: Pick<CustomerProfile, "companyName" | "contactName" | "email" | "id">;
}) {
  const overview = await getTimeCardManagerOverview(input.customer.id);

  if (!overview.entitlement) {
    throw new Error("An active Time Card Manager subscription is required before sending email");
  }

  if (!overview.delivery.canSendEmail) {
    throw new Error("Email delivery is not enabled for the current notification mode");
  }

  const senderName = getNotificationDisplayName(input.customer);
  const currentPackage = overview.entitlement.packageName;
  const currentMode = overview.delivery.effectiveMode.replaceAll("_", " ");
  const nextRun = overview.nextRunLabel ?? "No scheduled run configured";
  const senderAddress = overview.senderProfile.fromEmail;
  const recipientEmail = input.customer.email;

  const subject = `${senderName} Time Card Manager test notification`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2933;">
      <h1 style="margin-bottom: 0.5rem;">Time Card Manager test email</h1>
      <p>
        This confirms that your Time Card Manager email path is active and can send
        notifications from <strong>${escapeHtml(senderAddress)}</strong>.
      </p>
      <ul>
        <li><strong>Subscription package:</strong> ${escapeHtml(currentPackage)}</li>
        <li><strong>Effective delivery mode:</strong> ${escapeHtml(currentMode)}</li>
        <li><strong>Next scheduled run:</strong> ${escapeHtml(nextRun)}</li>
        <li><strong>Recipient:</strong> ${escapeHtml(recipientEmail)}</li>
      </ul>
      <p>
        Scheduled automation and SMS delivery are still separate follow-up steps, but
        the managed sender and Resend-backed email path are now working from the app.
      </p>
    </div>
  `;
  const text = [
    "Time Card Manager test email",
    "",
    `Sender: ${senderAddress}`,
    `Package: ${currentPackage}`,
    `Effective delivery mode: ${currentMode}`,
    `Next scheduled run: ${nextRun}`,
    `Recipient: ${recipientEmail}`,
    "",
    "This confirms that the managed sender and email delivery path are active."
  ].join("\n");

  return sendTransactionalEmail({
    fromEmail: senderAddress,
    fromName: senderName,
    subject,
    html,
    text,
    to: recipientEmail
  });
}

export async function sendTimeCardManagerMissedClockOutEmail(input: {
  clockInTime: string;
  customer: Pick<CustomerProfile, "companyName" | "contactName" | "email" | "id">;
  employeeName: string;
  expectedClockOutTime?: string;
  locationName?: string;
  shiftDate: string;
}) {
  const overview = await getTimeCardManagerOverview(input.customer.id);

  if (!overview.entitlement) {
    throw new Error("An active Time Card Manager subscription is required before sending email");
  }

  if (!overview.delivery.canSendEmail) {
    throw new Error("Email delivery is not enabled for the current notification mode");
  }

  const senderName = getNotificationDisplayName(input.customer);
  const senderAddress = overview.senderProfile.fromEmail;
  const recipientEmail = input.customer.email;
  const companyName = input.customer.companyName?.trim() || "Your team";
  const employeeName = input.employeeName.trim();
  const shiftDate = input.shiftDate.trim();
  const clockInTime = input.clockInTime.trim();
  const expectedClockOutTime = input.expectedClockOutTime?.trim() || null;
  const locationName = input.locationName?.trim() || null;

  const subject = `${companyName}: missed clock-out alert for ${employeeName}`;
  const htmlListItems = [
    `<li><strong>Employee:</strong> ${escapeHtml(employeeName)}</li>`,
    `<li><strong>Shift date:</strong> ${escapeHtml(shiftDate)}</li>`,
    `<li><strong>Clock-in time:</strong> ${escapeHtml(clockInTime)}</li>`,
    formatOptionalLine("Expected clock-out", expectedClockOutTime),
    formatOptionalLine("Location", locationName)
  ]
    .filter(Boolean)
    .join("");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2933;">
      <h1 style="margin-bottom: 0.5rem;">Missed clock-out alert</h1>
      <p>
        ${escapeHtml(employeeName)} appears to still be clocked in and may need a
        time card review.
      </p>
      <ul>${htmlListItems}</ul>
      <p>
        This is the first event-shaped Time Card Manager email path. It uses your
        current subscription sender and delivery rules, so it matches how future
        live alerts will be delivered.
      </p>
    </div>
  `;
  const text = [
    "Missed clock-out alert",
    "",
    `${employeeName} appears to still be clocked in and may need a time card review.`,
    "",
    `Employee: ${employeeName}`,
    `Shift date: ${shiftDate}`,
    `Clock-in time: ${clockInTime}`,
    expectedClockOutTime ? `Expected clock-out: ${expectedClockOutTime}` : null,
    locationName ? `Location: ${locationName}` : null,
    "",
    `Sender: ${senderAddress}`
  ]
    .filter(Boolean)
    .join("\n");

  return sendTransactionalEmail({
    fromEmail: senderAddress,
    fromName: senderName,
    subject,
    html,
    text,
    to: recipientEmail
  });
}

export const requiredSquareLaborScopes = ["TIMECARDS_READ", "EMPLOYEES_READ"] as const;

export async function getTimeCardManagerSquareStatus(customerId: string) {
  const connection = await getSquareConnectionByCustomerId(customerId);

  if (!connection) {
    return {
      connected: false,
      missingScopes: [...requiredSquareLaborScopes]
    } satisfies TimeCardManagerSquareStatus;
  }

  return {
    connected: true,
    missingScopes: requiredSquareLaborScopes.filter(
      (scope) => !connection.authorizedScopes.includes(scope)
    )
  } satisfies TimeCardManagerSquareStatus;
}

export async function findMissedClockOutCandidatesForCustomer(input: {
  customerId: string;
  thresholdHours: number;
}) {
  const connection = await getSquareConnectionByCustomerId(input.customerId);

  if (!connection) {
    throw new Error("Square is not connected for this customer");
  }

  if (!hasSquareScopes(connection.authorizedScopes, [...requiredSquareLaborScopes])) {
    throw new Error("Square connection is missing labor scopes");
  }

  const [timecards, teamMembers, locations] = await Promise.all([
    searchSquareOpenTimecards(connection.accessToken),
    searchSquareTeamMembers(connection.accessToken),
    listSquareLocations(connection.accessToken)
  ]);

  const teamMemberMap = new Map(
    teamMembers.map((teamMember) => [
      teamMember.id,
      buildTeamMemberName(teamMember)
    ])
  );
  const locationMap = new Map(
    locations.map((location) => [location.id, location.name?.trim() || "Unknown location"])
  );
  const now = Date.now();

  return timecards
    .map((timecard) => {
      const startAt = new Date(timecard.start_at);
      const hoursOpen = (now - startAt.getTime()) / (1000 * 60 * 60);

      return {
        clockInTimeLabel: formatTimeLabel(startAt),
        hoursOpen,
        locationName: locationMap.get(timecard.location_id) ?? null,
        shiftDateLabel: formatDateLabel(startAt),
        teamMemberName: teamMemberMap.get(timecard.team_member_id ?? "") ?? "Unknown team member",
        timecardId: timecard.id
      } satisfies MissedClockOutCandidate;
    })
    .filter((candidate) => candidate.hoursOpen >= input.thresholdHours)
    .sort((left, right) => right.hoursOpen - left.hoursOpen);
}
