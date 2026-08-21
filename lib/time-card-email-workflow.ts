import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import { getAppOrigin } from "@/lib/deployment";
import { sendTransactionalEmail } from "@/lib/email";
import { getValidSquareConnectionByCustomerId } from "@/lib/square-connections";
import { hasSquareScopes, searchSquareTeamMembers } from "@/lib/square";
import { parseEmployeeTimeResponse } from "@/lib/time-card-response-parser";
import { getActiveSubscriptionForProduct } from "@/lib/subscriptions";
import {
  buildCompletedConfirmationPeriod,
  isWeeklyConfirmationScheduleDue
} from "@/lib/time-card-confirmation-schedule";

const employeeReadScope = "EMPLOYEES_READ";
const defaultTimezone = "America/Los_Angeles";

export type TimeCardEmployeeContact = {
  active: boolean;
  createdAt: Date;
  customerId: string;
  displayName: string;
  email: string | null;
  id: string;
  lastSyncedAt: Date;
  squareTeamMemberId: string;
  timezone: string;
  updatedAt: Date;
};

export type TimeCardConfirmationStatus =
  | "delivery_failed"
  | "pending"
  | "responded"
  | "approved"
  | "rejected";

export type TimeCardConfirmationRequest = {
  approvedAt: Date | null;
  createdAt: Date;
  customerId: string;
  employeeEmail: string;
  employeeId: string;
  employeeName: string;
  id: string;
  managerNote: string | null;
  lastReminderAt: Date | null;
  periodEnd: string;
  periodStart: string;
  reportedShiftDate: string | null;
  reportedTimeIn: string | null;
  reportedTimeOut: string | null;
  respondedAt: Date | null;
  responseCode: "a" | "b" | null;
  responseNote: string | null;
  reminderCount: number;
  reviewedAt: Date | null;
  reviewedByUserId: string | null;
  sentAt: Date | null;
  squareTeamMemberId: string;
  status: TimeCardConfirmationStatus;
  timezone: string;
  tokenExpiresAt: Date;
  updatedAt: Date;
};

export type TimeCardConfirmationRun = {
  completedAt: Date | null;
  createdAt: Date;
  customerId: string;
  failedCount: number;
  id: string;
  periodEnd: string;
  periodStart: string;
  skippedCount: number;
  sentCount: number;
  status: string;
};

export type PublicTimeCardConfirmationRequest = Pick<
  TimeCardConfirmationRequest,
  | "employeeName"
  | "periodEnd"
  | "periodStart"
  | "reportedShiftDate"
  | "reportedTimeIn"
  | "reportedTimeOut"
  | "respondedAt"
  | "responseCode"
  | "status"
  | "timezone"
  | "tokenExpiresAt"
> & {
  companyName: string;
};

export type TimeCardConfirmationAuditEvent = {
  actorIdentifier: string | null;
  actorType: "employee" | "manager" | "system";
  createdAt: Date;
  details: Record<string, unknown>;
  employeeName: string;
  eventType: string;
  id: string;
  requestId: string;
};

export type TimeCardConfirmationSettings = {
  automationEnabled: boolean;
  customerId: string;
  managerReminderEnabled: boolean;
  managerReminderTimeLocal: string;
  periodDays: number;
  sendDayOfWeek: number;
  sendTimeLocal: string;
  timezone: string;
};

let workflowTablesReady: Promise<void> | null = null;

function hashResponseToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeTimezone(value: string) {
  const candidate = value.trim() || defaultTimezone;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    throw new Error("A valid IANA timezone is required");
  }
}

function buildTeamMemberName(input: {
  family_name?: string;
  given_name?: string;
  reference_id?: string;
}) {
  const fullName = [input.given_name?.trim(), input.family_name?.trim()]
    .filter(Boolean)
    .join(" ");

  return fullName || input.reference_id?.trim() || "Unnamed team member";
}

function mapEmployee(row: Record<string, unknown>): TimeCardEmployeeContact {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    squareTeamMemberId: String(row.square_team_member_id),
    displayName: String(row.display_name),
    email: typeof row.email === "string" && row.email ? row.email : null,
    timezone: String(row.timezone),
    active: Boolean(row.active),
    lastSyncedAt: new Date(String(row.last_synced_at)),
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at))
  };
}

function mapRequest(row: Record<string, unknown>): TimeCardConfirmationRequest {
  const responseCode = row.response_code === "a" || row.response_code === "b"
    ? row.response_code
    : null;

  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    employeeId: String(row.employee_id),
    squareTeamMemberId: String(row.square_team_member_id),
    employeeName: String(row.employee_name),
    employeeEmail: String(row.employee_email),
    periodStart: String(row.period_start).slice(0, 10),
    periodEnd: String(row.period_end).slice(0, 10),
    timezone: String(row.timezone),
    status: String(row.status) as TimeCardConfirmationStatus,
    responseCode,
    reportedShiftDate: row.reported_shift_date
      ? String(row.reported_shift_date).slice(0, 10)
      : null,
    reportedTimeIn: typeof row.reported_time_in === "string" ? row.reported_time_in : null,
    reportedTimeOut: typeof row.reported_time_out === "string" ? row.reported_time_out : null,
    responseNote: typeof row.response_note === "string" ? row.response_note : null,
    managerNote: typeof row.manager_note === "string" ? row.manager_note : null,
    reminderCount: Number(row.reminder_count ?? 0),
    lastReminderAt: row.last_reminder_at ? new Date(String(row.last_reminder_at)) : null,
    sentAt: row.sent_at ? new Date(String(row.sent_at)) : null,
    respondedAt: row.responded_at ? new Date(String(row.responded_at)) : null,
    reviewedAt: row.reviewed_at ? new Date(String(row.reviewed_at)) : null,
    approvedAt: row.approved_at ? new Date(String(row.approved_at)) : null,
    reviewedByUserId:
      typeof row.reviewed_by_user_id === "string" ? row.reviewed_by_user_id : null,
    tokenExpiresAt: new Date(String(row.token_expires_at)),
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at))
  };
}

export async function ensureTimeCardEmailWorkflowTables() {
  if (!workflowTablesReady) {
    workflowTablesReady = db.query(`
      create extension if not exists pgcrypto;

      create table if not exists public.time_card_employee_contacts (
        id uuid primary key default gen_random_uuid(),
        customer_id uuid not null references public.customer_profiles(id) on delete cascade,
        square_team_member_id text not null,
        display_name text not null,
        email text,
        timezone text not null default '${defaultTimezone}',
        active boolean not null default true,
        last_synced_at timestamptz not null default now(),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (customer_id, square_team_member_id)
      );

      create table if not exists public.time_card_confirmation_settings (
        customer_id uuid primary key references public.customer_profiles(id) on delete cascade,
        automation_enabled boolean not null default false,
        send_day_of_week integer not null default 1 check (send_day_of_week between 0 and 6),
        send_time_local text not null default '09:00',
        manager_reminder_enabled boolean not null default true,
        manager_reminder_time_local text not null default '15:00',
        timezone text not null default '${defaultTimezone}',
        period_days integer not null default 7 check (period_days between 1 and 31),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create table if not exists public.time_card_confirmation_requests (
        id uuid primary key default gen_random_uuid(),
        customer_id uuid not null references public.customer_profiles(id) on delete cascade,
        employee_id uuid not null references public.time_card_employee_contacts(id) on delete restrict,
        square_team_member_id text not null,
        employee_name text not null,
        employee_email text not null,
        period_start date not null,
        period_end date not null,
        timezone text not null,
        status text not null default 'pending'
          check (status in ('delivery_failed', 'pending', 'responded', 'approved', 'rejected')),
        response_token_hash text not null unique,
        token_expires_at timestamptz not null,
        response_code text check (response_code in ('a', 'b')),
        reported_shift_date date,
        reported_time_in text,
        reported_time_out text,
        response_note text,
        manager_note text,
        reminder_count integer not null default 0,
        last_reminder_at timestamptz,
        sent_at timestamptz,
        responded_at timestamptz,
        reviewed_at timestamptz,
        approved_at timestamptz,
        reviewed_by_user_id text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        check (period_end >= period_start),
        unique (employee_id, period_start, period_end)
      );

      create table if not exists public.time_card_confirmation_audit_events (
        id uuid primary key default gen_random_uuid(),
        request_id uuid not null references public.time_card_confirmation_requests(id) on delete cascade,
        customer_id uuid not null references public.customer_profiles(id) on delete cascade,
        event_type text not null,
        actor_type text not null check (actor_type in ('system', 'employee', 'manager')),
        actor_identifier text,
        details jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      );

      create table if not exists public.time_card_confirmation_runs (
        id uuid primary key default gen_random_uuid(),
        customer_id uuid not null references public.customer_profiles(id) on delete cascade,
        period_start date not null,
        period_end date not null,
        status text not null default 'running',
        sent_count integer not null default 0,
        skipped_count integer not null default 0,
        failed_count integer not null default 0,
        manager_reminder_sent_at timestamptz,
        completed_at timestamptz,
        created_at timestamptz not null default now(),
        unique (customer_id, period_start, period_end)
      );

      alter table public.time_card_confirmation_requests
        add column if not exists reminder_count integer not null default 0;
      alter table public.time_card_confirmation_requests
        add column if not exists last_reminder_at timestamptz;
      alter table public.time_card_confirmation_settings
        add column if not exists manager_reminder_enabled boolean not null default true;
      alter table public.time_card_confirmation_settings
        add column if not exists manager_reminder_time_local text not null default '15:00';
      alter table public.time_card_confirmation_runs
        add column if not exists manager_reminder_sent_at timestamptz;

      create index if not exists time_card_contacts_customer_idx
        on public.time_card_employee_contacts(customer_id, active, display_name);
      create index if not exists time_card_requests_customer_status_idx
        on public.time_card_confirmation_requests(customer_id, status, created_at desc);
      create index if not exists time_card_requests_employee_idx
        on public.time_card_confirmation_requests(employee_id, created_at desc);
      create unique index if not exists time_card_requests_employee_period_idx
        on public.time_card_confirmation_requests(employee_id, period_start, period_end);
      create index if not exists time_card_audit_request_idx
        on public.time_card_confirmation_audit_events(request_id, created_at);
      create index if not exists time_card_confirmation_runs_customer_idx
        on public.time_card_confirmation_runs(customer_id, created_at desc);
    `).then(() => undefined);
  }

  return workflowTablesReady;
}

export async function syncTimeCardEmployeesFromSquare(customerId: string) {
  await ensureTimeCardEmailWorkflowTables();
  const connection = await getValidSquareConnectionByCustomerId(customerId);

  if (!connection) {
    throw new Error("Square is not connected for this customer");
  }

  if (!hasSquareScopes(connection.authorizedScopes, [employeeReadScope])) {
    throw new Error("Square connection is missing employee read access");
  }

  const teamMembers = await searchSquareTeamMembers(connection.accessToken);
  const syncedIds: string[] = [];

  for (const teamMember of teamMembers) {
    syncedIds.push(teamMember.id);
    await db.query(
      `insert into public.time_card_employee_contacts (
        customer_id,
        square_team_member_id,
        display_name,
        last_synced_at,
        updated_at
      ) values ($1, $2, $3, now(), now())
      on conflict (customer_id, square_team_member_id)
      do update set
        display_name = excluded.display_name,
        active = true,
        last_synced_at = now(),
        updated_at = now()`,
      [customerId, teamMember.id, buildTeamMemberName(teamMember)]
    );
  }

  await db.query(
    `update public.time_card_employee_contacts
     set active = false,
         updated_at = now()
     where customer_id = $1
       and not (square_team_member_id = any($2::text[]))`,
    [customerId, syncedIds]
  );

  return teamMembers.length;
}

export async function getTimeCardEmployeeContacts(customerId: string) {
  await ensureTimeCardEmailWorkflowTables();
  const result = await db.query(
    `select id, customer_id, square_team_member_id, display_name, email, timezone,
            active, last_synced_at, created_at, updated_at
     from public.time_card_employee_contacts
     where customer_id = $1
     order by active desc, display_name asc`,
    [customerId]
  );

  return result.rows.map((row) => mapEmployee(row));
}

function mapConfirmationSettings(row: Record<string, unknown>): TimeCardConfirmationSettings {
  return {
    customerId: String(row.customer_id),
    automationEnabled: Boolean(row.automation_enabled),
    managerReminderEnabled: Boolean(row.manager_reminder_enabled),
    managerReminderTimeLocal: String(row.manager_reminder_time_local),
    sendDayOfWeek: Number(row.send_day_of_week),
    sendTimeLocal: String(row.send_time_local),
    timezone: String(row.timezone),
    periodDays: Number(row.period_days)
  };
}

export async function getOrCreateTimeCardConfirmationSettings(customerId: string) {
  await ensureTimeCardEmailWorkflowTables();
  const result = await db.query(
    `insert into public.time_card_confirmation_settings (customer_id)
     values ($1)
     on conflict (customer_id) do update
       set updated_at = public.time_card_confirmation_settings.updated_at
     returning customer_id, automation_enabled, send_day_of_week, send_time_local,
               manager_reminder_enabled, manager_reminder_time_local, timezone, period_days`,
    [customerId]
  );

  return mapConfirmationSettings(result.rows[0]);
}

export async function upsertTimeCardConfirmationSettings(input: {
  automationEnabled: boolean;
  customerId: string;
  managerReminderEnabled: boolean;
  managerReminderTimeLocal: string;
  periodDays: number;
  sendDayOfWeek: number;
  sendTimeLocal: string;
  timezone: string;
}) {
  await ensureTimeCardEmailWorkflowTables();

  if (
    !Number.isInteger(input.sendDayOfWeek) ||
    input.sendDayOfWeek < 0 ||
    input.sendDayOfWeek > 6 ||
    !/^\d{2}:\d{2}$/.test(input.sendTimeLocal) ||
    !/^\d{2}:\d{2}$/.test(input.managerReminderTimeLocal) ||
    !Number.isInteger(input.periodDays) ||
    input.periodDays < 1 ||
    input.periodDays > 31
  ) {
    throw new Error("Confirmation automation settings are invalid");
  }

  const [hour, minute] = input.sendTimeLocal.split(":").map(Number);
  const [managerReminderHour, managerReminderMinute] = input.managerReminderTimeLocal.split(":").map(Number);

  if (hour > 23 || minute > 59 || managerReminderHour > 23 || managerReminderMinute > 59) {
    throw new Error("Confirmation automation settings are invalid");
  }

  const result = await db.query(
    `insert into public.time_card_confirmation_settings (
      customer_id, automation_enabled, send_day_of_week, send_time_local,
      manager_reminder_enabled, manager_reminder_time_local,
      timezone, period_days, updated_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, now())
    on conflict (customer_id) do update set
      automation_enabled = excluded.automation_enabled,
      send_day_of_week = excluded.send_day_of_week,
      send_time_local = excluded.send_time_local,
      manager_reminder_enabled = excluded.manager_reminder_enabled,
      manager_reminder_time_local = excluded.manager_reminder_time_local,
      timezone = excluded.timezone,
      period_days = excluded.period_days,
      updated_at = now()
    returning customer_id, automation_enabled, send_day_of_week, send_time_local,
              manager_reminder_enabled, manager_reminder_time_local, timezone, period_days`,
    [
      input.customerId,
      input.automationEnabled,
      input.sendDayOfWeek,
      input.sendTimeLocal,
      input.managerReminderEnabled,
      input.managerReminderTimeLocal,
      normalizeTimezone(input.timezone),
      input.periodDays
    ]
  );

  return mapConfirmationSettings(result.rows[0]);
}

export async function updateTimeCardEmployeeContact(input: {
  customerId: string;
  email: string;
  employeeId: string;
  timezone: string;
}) {
  await ensureTimeCardEmailWorkflowTables();
  const email = input.email.trim().toLowerCase();

  if (email && !isValidEmail(email)) {
    throw new Error("A valid employee email is required");
  }

  const result = await db.query(
    `update public.time_card_employee_contacts
     set email = $3,
         timezone = $4,
         updated_at = now()
     where id = $1 and customer_id = $2
     returning id, customer_id, square_team_member_id, display_name, email, timezone,
               active, last_synced_at, created_at, updated_at`,
    [input.employeeId, input.customerId, email || null, normalizeTimezone(input.timezone)]
  );

  if (!result.rows[0]) {
    throw new Error("Employee contact was not found");
  }

  return mapEmployee(result.rows[0]);
}

export async function getTimeCardConfirmationRequests(customerId: string, limit = 100) {
  await ensureTimeCardEmailWorkflowTables();
  const result = await db.query(
    `select id, customer_id, employee_id, square_team_member_id, employee_name,
            employee_email, period_start, period_end, timezone, status, response_code,
            reported_shift_date, reported_time_in, reported_time_out, response_note,
            manager_note, sent_at, responded_at, reviewed_at, approved_at,
            reviewed_by_user_id, reminder_count, last_reminder_at,
            token_expires_at, created_at, updated_at
     from public.time_card_confirmation_requests
     where customer_id = $1
     order by
       case status when 'responded' then 0 when 'pending' then 1 else 2 end,
       created_at desc
     limit $2`,
    [customerId, Math.min(Math.max(limit, 1), 250)]
  );

  return result.rows.map((row) => mapRequest(row));
}

export async function getTimeCardConfirmationAuditEvents(customerId: string, limit = 30) {
  await ensureTimeCardEmailWorkflowTables();
  const result = await db.query(
    `select events.id, events.request_id, events.event_type, events.actor_type,
            events.actor_identifier, events.details, events.created_at,
            requests.employee_name
     from public.time_card_confirmation_audit_events events
     inner join public.time_card_confirmation_requests requests on requests.id = events.request_id
     where events.customer_id = $1
     order by events.created_at desc
     limit $2`,
    [customerId, Math.min(Math.max(limit, 1), 100)]
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    requestId: String(row.request_id),
    eventType: String(row.event_type),
    actorType: String(row.actor_type) as TimeCardConfirmationAuditEvent["actorType"],
    actorIdentifier:
      typeof row.actor_identifier === "string" ? row.actor_identifier : null,
    details:
      row.details && typeof row.details === "object" && !Array.isArray(row.details)
        ? row.details as Record<string, unknown>
        : {},
    employeeName: String(row.employee_name),
    createdAt: new Date(String(row.created_at))
  } satisfies TimeCardConfirmationAuditEvent));
}

export async function getTimeCardConfirmationRuns(customerId: string, limit = 12) {
  await ensureTimeCardEmailWorkflowTables();
  const result = await db.query(
    `select id, customer_id, period_start, period_end, status, sent_count,
            skipped_count, failed_count, completed_at, created_at
     from public.time_card_confirmation_runs
     where customer_id = $1
     order by created_at desc
     limit $2`,
    [customerId, Math.min(Math.max(limit, 1), 50)]
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    customerId: String(row.customer_id),
    periodStart: String(row.period_start).slice(0, 10),
    periodEnd: String(row.period_end).slice(0, 10),
    status: String(row.status),
    sentCount: Number(row.sent_count),
    skippedCount: Number(row.skipped_count),
    failedCount: Number(row.failed_count),
    completedAt: row.completed_at ? new Date(String(row.completed_at)) : null,
    createdAt: new Date(String(row.created_at))
  } satisfies TimeCardConfirmationRun));
}

export async function createAndSendTimeCardConfirmationRequest(input: {
  actorType?: "manager" | "system";
  customerId: string;
  employeeId: string;
  periodEnd: string;
  periodStart: string;
}) {
  await ensureTimeCardEmailWorkflowTables();

  if (!isValidDate(input.periodStart) || !isValidDate(input.periodEnd)) {
    throw new Error("A valid confirmation period is required");
  }

  if (input.periodEnd < input.periodStart) {
    throw new Error("The period end must be on or after the period start");
  }

  const employeeResult = await db.query(
    `select contacts.id, contacts.customer_id, contacts.square_team_member_id,
            contacts.display_name, contacts.email, contacts.timezone,
            customers.company_name, customers.contact_name
     from public.time_card_employee_contacts contacts
     inner join public.customer_profiles customers on customers.id = contacts.customer_id
     where contacts.id = $1 and contacts.customer_id = $2 and contacts.active = true
     limit 1`,
    [input.employeeId, input.customerId]
  );
  const employee = employeeResult.rows[0];

  if (!employee) {
    throw new Error("Employee contact was not found");
  }

  const employeeEmail = typeof employee.email === "string" ? employee.email.trim() : "";

  if (!isValidEmail(employeeEmail)) {
    throw new Error("The employee needs a valid email before a request can be sent");
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashResponseToken(token);
  const expirationDays = 14;
  const insertResult = await db.query(
    `insert into public.time_card_confirmation_requests (
      customer_id,
      employee_id,
      square_team_member_id,
      employee_name,
      employee_email,
      period_start,
      period_end,
      timezone,
      status,
      response_token_hash,
      token_expires_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, now() + ($10 * interval '1 day'))
    on conflict (employee_id, period_start, period_end) do update set
      square_team_member_id = excluded.square_team_member_id,
      employee_name = excluded.employee_name,
      employee_email = excluded.employee_email,
      timezone = excluded.timezone,
      status = 'pending',
      response_token_hash = excluded.response_token_hash,
      token_expires_at = excluded.token_expires_at,
      response_code = null,
      reported_shift_date = null,
      reported_time_in = null,
      reported_time_out = null,
      response_note = null,
      sent_at = null,
      responded_at = null,
      updated_at = now()
    where public.time_card_confirmation_requests.status = 'delivery_failed'
    returning id`,
    [
      input.customerId,
      input.employeeId,
      employee.square_team_member_id,
      employee.display_name,
      employeeEmail,
      input.periodStart,
      input.periodEnd,
      employee.timezone,
      tokenHash,
      expirationDays
    ]
  );

  if (!insertResult.rows[0]) {
    throw new Error("A confirmation request already exists for this employee and period");
  }

  const requestId = String(insertResult.rows[0].id);
  const companyName =
    (typeof employee.company_name === "string" && employee.company_name.trim()) ||
    (typeof employee.contact_name === "string" && employee.contact_name.trim()) ||
    "Your employer";
  const responseUrl = `${getAppOrigin()}/app/time-card-response/${encodeURIComponent(token)}`;

  await db.query(
    `insert into public.time_card_confirmation_audit_events (
      request_id, customer_id, event_type, actor_type, details
    ) values ($1, $2, 'request_created', $3, $4::jsonb)`,
    [
      requestId,
      input.customerId,
      input.actorType ?? "manager",
      JSON.stringify({ periodEnd: input.periodEnd, periodStart: input.periodStart })
    ]
  );

  try {
    await sendTransactionalEmail({
      to: employeeEmail,
      subject: `${companyName}: confirm your time for ${input.periodStart} through ${input.periodEnd}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2933;">
          <h1>Confirm your time</h1>
          <p>Hello ${escapeHtml(String(employee.display_name))},</p>
          <p>${escapeHtml(companyName)} is asking you to confirm whether you worked between
            <strong>${escapeHtml(input.periodStart)}</strong> and
            <strong>${escapeHtml(input.periodEnd)}</strong>.</p>
          <p>Choose <strong>I did not work</strong>, or choose <strong>I worked</strong> and enter your shift date, time in, and time out.</p>
          <p><a href="${escapeHtml(responseUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#235f49;color:#fff;text-decoration:none;font-weight:700;">Respond securely</a></p>
          <p>This private link expires in ${expirationDays} days and can be submitted once.</p>
        </div>
      `,
      text: [
        `Hello ${String(employee.display_name)},`,
        "",
        `${companyName} is asking you to confirm whether you worked between ${input.periodStart} and ${input.periodEnd}.`,
        "Choose I did not work, or choose I worked and enter your shift date, time in, and time out.",
        "",
        `Respond securely: ${responseUrl}`,
        `This private link expires in ${expirationDays} days and can be submitted once.`
      ].join("\n")
    });

    await db.query(
      `update public.time_card_confirmation_requests
       set sent_at = now(), updated_at = now()
       where id = $1`,
      [requestId]
    );
    await db.query(
      `insert into public.time_card_confirmation_audit_events (
        request_id, customer_id, event_type, actor_type, actor_identifier
      ) values ($1, $2, 'email_sent', 'system', $3)`,
      [requestId, input.customerId, employeeEmail]
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email delivery failed";
    await db.query(
      `update public.time_card_confirmation_requests
       set status = 'delivery_failed', updated_at = now()
       where id = $1`,
      [requestId]
    );
    await db.query(
      `insert into public.time_card_confirmation_audit_events (
        request_id, customer_id, event_type, actor_type, details
      ) values ($1, $2, 'email_failed', 'system', $3::jsonb)`,
      [requestId, input.customerId, JSON.stringify({ message })]
    );
    throw error;
  }

  return requestId;
}

export async function resendTimeCardConfirmationRequest(input: {
  actorIdentifier: string;
  customerId: string;
  requestId: string;
}) {
  await ensureTimeCardEmailWorkflowTables();
  const result = await db.query(
    `select requests.id, requests.customer_id, requests.employee_name,
            requests.employee_email, requests.period_start, requests.period_end,
            requests.status, requests.reminder_count, requests.updated_at,
            customers.company_name, customers.contact_name
     from public.time_card_confirmation_requests requests
     inner join public.customer_profiles customers on customers.id = requests.customer_id
     where requests.id = $1 and requests.customer_id = $2
       and requests.status in ('pending', 'delivery_failed')
     limit 1`,
    [input.requestId, input.customerId]
  );
  const request = result.rows[0];

  if (!request) {
    throw new Error("Only an open request can be resent");
  }

  const employeeEmail = String(request.employee_email).trim().toLowerCase();

  if (!isValidEmail(employeeEmail)) {
    throw new Error("The employee needs a valid email before a request can be resent");
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashResponseToken(token);
  const expirationDays = 14;
  const companyName =
    (typeof request.company_name === "string" && request.company_name.trim()) ||
    (typeof request.contact_name === "string" && request.contact_name.trim()) ||
    "Your employer";
  const periodStart = String(request.period_start).slice(0, 10);
  const periodEnd = String(request.period_end).slice(0, 10);
  const employeeName = String(request.employee_name);
  const responseUrl = `${getAppOrigin()}/app/time-card-response/${encodeURIComponent(token)}`;

  const claimResult = await db.query(
     `update public.time_card_confirmation_requests
     set status = 'pending', response_token_hash = $3,
         token_expires_at = now() + ($4 * interval '1 day'),
         reminder_count = reminder_count + 1, last_reminder_at = now(), updated_at = now()
     where id = $1 and customer_id = $2 and updated_at = $5
     returning id, reminder_count`,
    [input.requestId, input.customerId, tokenHash, expirationDays, request.updated_at]
  );

  if (!claimResult.rows[0]) {
    throw new Error("This request was already updated; refresh before sending another reminder");
  }
  const reminderCount = Number(claimResult.rows[0].reminder_count);

  try {
    await sendTransactionalEmail({
      to: employeeEmail,
      subject: `${companyName}: reminder to confirm your time for ${periodStart} through ${periodEnd}`,
      idempotencyKey: `time-card-confirmation-${input.requestId}-reminder-${reminderCount}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2933;">
          <h1>Reminder: confirm your time</h1>
          <p>Hello ${escapeHtml(employeeName)},</p>
          <p>Please confirm whether you worked between <strong>${escapeHtml(periodStart)}</strong>
            and <strong>${escapeHtml(periodEnd)}</strong>.</p>
          <p><a href="${escapeHtml(responseUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#235f49;color:#fff;text-decoration:none;font-weight:700;">Respond securely</a></p>
          <p>This new private link replaces the earlier link, expires in ${expirationDays} days, and can be submitted once.</p>
        </div>
      `,
      text: [
        `Hello ${employeeName},`,
        "",
        `Please confirm whether you worked between ${periodStart} and ${periodEnd}.`,
        `Respond securely: ${responseUrl}`,
        `This new private link replaces the earlier link, expires in ${expirationDays} days, and can be submitted once.`
      ].join("\n")
    });

    await db.query(
      `update public.time_card_confirmation_requests
       set status = 'pending', sent_at = now(), updated_at = now()
       where id = $1 and customer_id = $2`,
      [input.requestId, input.customerId]
    );
    await db.query(
      `insert into public.time_card_confirmation_audit_events (
        request_id, customer_id, event_type, actor_type, actor_identifier, details
      ) values ($1, $2, 'email_resent', 'manager', $3, $4::jsonb)`,
      [
        input.requestId,
        input.customerId,
        input.actorIdentifier,
        JSON.stringify({ employeeEmail, reminderCount })
      ]
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email delivery failed";
    await db.query(
      `update public.time_card_confirmation_requests
       set status = 'delivery_failed', updated_at = now()
       where id = $1 and customer_id = $2`,
      [input.requestId, input.customerId]
    );
    await db.query(
      `insert into public.time_card_confirmation_audit_events (
        request_id, customer_id, event_type, actor_type, details
      ) values ($1, $2, 'email_resend_failed', 'system', $3::jsonb)`,
      [input.requestId, input.customerId, JSON.stringify({ message })]
    );
    throw error;
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function getPublicTimeCardConfirmationRequest(token: string) {
  await ensureTimeCardEmailWorkflowTables();

  if (!token || token.length > 200) {
    return null;
  }

  const result = await db.query(
    `select requests.id, requests.customer_id, requests.employee_id,
            requests.square_team_member_id, requests.employee_name,
            requests.employee_email, requests.period_start, requests.period_end,
            requests.timezone, requests.status, requests.response_code,
            requests.reported_shift_date, requests.reported_time_in,
            requests.reported_time_out, requests.response_note, requests.manager_note,
            requests.sent_at, requests.responded_at, requests.reviewed_at,
            requests.approved_at, requests.reviewed_by_user_id,
            requests.token_expires_at, requests.created_at, requests.updated_at,
            customers.company_name, customers.contact_name
     from public.time_card_confirmation_requests requests
     inner join public.customer_profiles customers on customers.id = requests.customer_id
     where requests.response_token_hash = $1
     limit 1`,
    [hashResponseToken(token)]
  );

  if (!result.rows[0]) {
    return null;
  }

  const request = mapRequest(result.rows[0]);
  return {
    companyName:
      (typeof result.rows[0].company_name === "string" && result.rows[0].company_name.trim()) ||
      (typeof result.rows[0].contact_name === "string" && result.rows[0].contact_name.trim()) ||
      "Your employer",
    employeeName: request.employeeName,
    periodEnd: request.periodEnd,
    periodStart: request.periodStart,
    reportedShiftDate: request.reportedShiftDate,
    reportedTimeIn: request.reportedTimeIn,
    reportedTimeOut: request.reportedTimeOut,
    respondedAt: request.respondedAt,
    responseCode: request.responseCode,
    status: request.status,
    timezone: request.timezone,
    tokenExpiresAt: request.tokenExpiresAt
  } satisfies PublicTimeCardConfirmationRequest;
}

export async function submitTimeCardEmployeeResponse(input: {
  responseCode: string;
  responseNote: string;
  shiftDate: string;
  timeIn: string;
  timeOut: string;
  token: string;
}) {
  await ensureTimeCardEmailWorkflowTables();
  const responseCode = input.responseCode.trim().toLowerCase();
  const rawResponse = responseCode === "a"
    ? "a"
    : `b + ${input.timeIn.trim()} - ${input.timeOut.trim()}`;
  const parsed = parseEmployeeTimeResponse(rawResponse);

  if (!parsed) {
    throw new Error("Choose whether you worked and enter valid times when required");
  }

  if (parsed.code === "b" && !isValidDate(input.shiftDate)) {
    throw new Error("A valid shift date is required when reporting worked time");
  }

  const client = await db.connect();
  let managerEmail = "";
  let companyName = "Your team";
  let employeeName = "Employee";
  let requestId = "";

  try {
    await client.query("begin");
    const result = await client.query(
      `select requests.id, requests.customer_id, requests.employee_name,
              requests.status, requests.token_expires_at,
              customers.email as manager_email, customers.company_name,
              customers.contact_name
       from public.time_card_confirmation_requests requests
       inner join public.customer_profiles customers on customers.id = requests.customer_id
       where requests.response_token_hash = $1
       for update`,
      [hashResponseToken(input.token)]
    );
    const request = result.rows[0];

    if (!request) {
      throw new Error("This response link is invalid");
    }

    if (String(request.status) !== "pending") {
      throw new Error("This response has already been submitted or is no longer available");
    }

    if (new Date(String(request.token_expires_at)).getTime() <= Date.now()) {
      throw new Error("This response link has expired");
    }

    requestId = String(request.id);
    managerEmail = String(request.manager_email);
    employeeName = String(request.employee_name);
    companyName =
      (typeof request.company_name === "string" && request.company_name.trim()) ||
      (typeof request.contact_name === "string" && request.contact_name.trim()) ||
      "Your team";

    await client.query(
      `update public.time_card_confirmation_requests
       set status = 'responded',
           response_code = $2,
           reported_shift_date = $3,
           reported_time_in = $4,
           reported_time_out = $5,
           response_note = $6,
           responded_at = now(),
           updated_at = now()
       where id = $1`,
      [
        requestId,
        parsed.code,
        parsed.code === "b" ? input.shiftDate : null,
        parsed.code === "b" ? parsed.timeIn : null,
        parsed.code === "b" ? parsed.timeOut : null,
        input.responseNote.trim().slice(0, 2000) || null
      ]
    );
    await client.query(
      `insert into public.time_card_confirmation_audit_events (
        request_id, customer_id, event_type, actor_type, actor_identifier, details
      ) values ($1, $2, 'employee_responded', 'employee', $3, $4::jsonb)`,
      [
        requestId,
        request.customer_id,
        employeeName,
        JSON.stringify({
          responseCode: parsed.code,
          shiftDate: parsed.code === "b" ? input.shiftDate : null,
          timeIn: parsed.code === "b" ? parsed.timeIn : null,
          timeOut: parsed.code === "b" ? parsed.timeOut : null
        })
      ]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  try {
    await sendTransactionalEmail({
      to: managerEmail,
      subject: `${companyName}: ${employeeName} submitted a time confirmation`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2933;">
          <h1>Time confirmation received</h1>
          <p><strong>${escapeHtml(employeeName)}</strong> submitted response <strong>${parsed.code.toUpperCase()}</strong>.</p>
          <p><a href="${escapeHtml(`${getAppOrigin()}/app/time-card-manager/responses`)}">Open the manager review inbox</a></p>
        </div>
      `,
      text: `${employeeName} submitted response ${parsed.code.toUpperCase()}. Review it at ${getAppOrigin()}/app/time-card-manager/responses`
    });
  } catch (error) {
    console.error("[time-card-confirmation] manager notification failed", {
      error: error instanceof Error ? error.message : String(error),
      requestId
    });
  }
}

export async function reviewTimeCardConfirmationRequest(input: {
  customerId: string;
  decision: "approved" | "rejected";
  managerNote: string;
  requestId: string;
  reviewerUserId: string;
  shiftDate: string;
  timeIn: string;
  timeOut: string;
}) {
  await ensureTimeCardEmailWorkflowTables();
  const client = await db.connect();

  try {
    await client.query("begin");
    const result = await client.query(
      `select id, customer_id, response_code
       from public.time_card_confirmation_requests
       where id = $1 and customer_id = $2 and status = 'responded'
       for update`,
      [input.requestId, input.customerId]
    );
    const request = result.rows[0];

    if (!request) {
      throw new Error("The response is no longer awaiting review");
    }

    let shiftDate: string | null = null;
    let timeIn: string | null = null;
    let timeOut: string | null = null;

    if (request.response_code === "b") {
      const parsed = parseEmployeeTimeResponse(`b + ${input.timeIn} - ${input.timeOut}`);

      if (!parsed || parsed.code !== "b" || !isValidDate(input.shiftDate)) {
        throw new Error("Valid approved shift details are required");
      }

      shiftDate = input.shiftDate;
      timeIn = parsed.timeIn;
      timeOut = parsed.timeOut;
    }

    await client.query(
      `update public.time_card_confirmation_requests
       set status = $3,
           reported_shift_date = $4,
           reported_time_in = $5,
           reported_time_out = $6,
           manager_note = $7,
           reviewed_at = now(),
           approved_at = case when $3 = 'approved' then now() else null end,
           reviewed_by_user_id = $8,
           updated_at = now()
       where id = $1 and customer_id = $2`,
      [
        input.requestId,
        input.customerId,
        input.decision,
        shiftDate,
        timeIn,
        timeOut,
        input.managerNote.trim().slice(0, 2000) || null,
        input.reviewerUserId
      ]
    );
    await client.query(
      `insert into public.time_card_confirmation_audit_events (
        request_id, customer_id, event_type, actor_type, actor_identifier, details
      ) values ($1, $2, $3, 'manager', $4, $5::jsonb)`,
      [
        input.requestId,
        input.customerId,
        input.decision === "approved" ? "manager_approved" : "manager_rejected",
        input.reviewerUserId,
        JSON.stringify({
          managerNote: input.managerNote.trim().slice(0, 2000) || null,
          shiftDate,
          timeIn,
          timeOut
        })
      ]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function sendManagerOutstandingReminder(input: {
  customerId: string;
  periodEnd: string;
  periodStart: string;
}) {
  const runResult = await db.query(
    `select runs.id, customers.email as manager_email, customers.company_name,
            customers.contact_name
     from public.time_card_confirmation_runs runs
     inner join public.customer_profiles customers on customers.id = runs.customer_id
     where runs.customer_id = $1 and runs.period_start = $2 and runs.period_end = $3
     limit 1`,
    [input.customerId, input.periodStart, input.periodEnd]
  );
  const run = runResult.rows[0];

  if (!run) {
    return { outstandingCount: 0, status: "skipped_no_confirmation_run" };
  }

  const claimResult = await db.query(
    `update public.time_card_confirmation_runs
     set manager_reminder_sent_at = now()
     where id = $1 and manager_reminder_sent_at is null
     returning id`,
    [run.id]
  );

  if (!claimResult.rows[0]) {
    return { outstandingCount: 0, status: "skipped_already_notified" };
  }

  const outstandingResult = await db.query(
    `select employee_name, employee_email, status
     from public.time_card_confirmation_requests
     where customer_id = $1 and period_start = $2 and period_end = $3
       and status in ('pending', 'delivery_failed')
     order by employee_name`,
    [input.customerId, input.periodStart, input.periodEnd]
  );
  const outstanding = outstandingResult.rows;

  if (!outstanding.length) {
    return { outstandingCount: 0, status: "no_outstanding_employees" };
  }

  const managerEmail = String(run.manager_email ?? "").trim().toLowerCase();
  const companyName =
    (typeof run.company_name === "string" && run.company_name.trim()) ||
    (typeof run.contact_name === "string" && run.contact_name.trim()) ||
    "Your team";

  if (!isValidEmail(managerEmail)) {
    return { outstandingCount: outstanding.length, status: "skipped_invalid_manager_email" };
  }

  const reviewUrl = `${getAppOrigin()}/time-card-manager/responses?status=pending`;
  const htmlItems = outstanding.map((request) => {
    const deliveryNote = request.status === "delivery_failed" ? " — employee email failed" : "";
    return `<li><strong>${escapeHtml(String(request.employee_name))}</strong>${escapeHtml(deliveryNote)}</li>`;
  }).join("");
  const textItems = outstanding.map((request) => {
    const deliveryNote = request.status === "delivery_failed" ? " (employee email failed)" : "";
    return `- ${String(request.employee_name)}${deliveryNote}`;
  }).join("\n");

  try {
    await sendTransactionalEmail({
      to: managerEmail,
      subject: `${companyName}: ${outstanding.length} outstanding time confirmation${outstanding.length === 1 ? "" : "s"}`,
      idempotencyKey: `time-card-manager-outstanding-${String(run.id)}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2933;">
          <h1>Outstanding employee time confirmations</h1>
          <p>The following employees have not responded for <strong>${escapeHtml(input.periodStart)}</strong>
            through <strong>${escapeHtml(input.periodEnd)}</strong>:</p>
          <ul>${htmlItems}</ul>
          <p>You can message them personally, then track their responses in the manager inbox.</p>
          <p><a href="${escapeHtml(reviewUrl)}">Open outstanding confirmations</a></p>
        </div>
      `,
      text: [
        `Outstanding employee time confirmations for ${input.periodStart} through ${input.periodEnd}:`,
        "",
        textItems,
        "",
        `Open outstanding confirmations: ${reviewUrl}`
      ].join("\n")
    });
  } catch (error) {
    await db.query(
      `update public.time_card_confirmation_runs
       set manager_reminder_sent_at = null
       where id = $1`,
      [run.id]
    );
    throw error;
  }

  return { outstandingCount: outstanding.length, status: "manager_notified" };
}

export async function runTimeCardConfirmationAutomationBatch(input?: { now?: Date }) {
  await ensureTimeCardEmailWorkflowTables();
  const now = input?.now ?? new Date();

  if (!process.env.CRON_SECRET || process.env.TIME_CARD_AUTOMATION_LIVE === "false") {
    return {
      now: now.toISOString(),
      dueCustomers: 0,
      managerReminders: [],
      sentCount: 0,
      results: [],
      status: "automation_disabled"
    };
  }

  const parsedWindow = Number(process.env.TIME_CARD_AUTOMATION_WINDOW_MINUTES ?? 60);
  const windowMinutes = Number.isFinite(parsedWindow) && parsedWindow >= 5 && parsedWindow <= 60
    ? parsedWindow
    : 60;
  const settingsResult = await db.query(
    `select settings.customer_id, settings.automation_enabled, settings.send_day_of_week,
            settings.send_time_local, settings.manager_reminder_enabled,
            settings.manager_reminder_time_local, settings.timezone, settings.period_days
     from public.time_card_confirmation_settings settings
     inner join public.customer_profiles customers on customers.id = settings.customer_id
     where settings.automation_enabled = true and customers.status = 'active'`
  );
  const settings = settingsResult.rows.map((row) => mapConfirmationSettings(row));
  const dueSettings = settings
    .filter((settings) => isWeeklyConfirmationScheduleDue({
      now,
      dayOfWeek: settings.sendDayOfWeek,
      timeLocal: settings.sendTimeLocal,
      timezone: settings.timezone,
      windowMinutes
    }));
  const results: Array<{
    customerId: string;
    failedCount: number;
    skippedCount: number;
    sentCount: number;
    status: string;
  }> = [];

  for (const settings of dueSettings) {
    const { periodStart, periodEnd } = buildCompletedConfirmationPeriod({
      now,
      timezone: settings.timezone,
      periodDays: settings.periodDays
    });
    const runResult = await db.query(
      `insert into public.time_card_confirmation_runs (
        customer_id, period_start, period_end, status
      ) values ($1, $2, $3, 'running')
      on conflict (customer_id, period_start, period_end) do nothing
      returning id`,
      [settings.customerId, periodStart, periodEnd]
    );
    const runId = runResult.rows[0]?.id ? String(runResult.rows[0].id) : null;

    if (!runId) {
      results.push({
        customerId: settings.customerId,
        failedCount: 0,
        skippedCount: 0,
        sentCount: 0,
        status: "skipped_already_processed"
      });
      continue;
    }

    const subscription = await getActiveSubscriptionForProduct({
      customerId: settings.customerId,
      productSlug: "square-time-card-manager"
    });

    if (!subscription) {
      await db.query(
        `update public.time_card_confirmation_runs
         set status = 'skipped_no_subscription', completed_at = now()
         where id = $1`,
        [runId]
      );
      results.push({
        customerId: settings.customerId,
        failedCount: 0,
        skippedCount: 0,
        sentCount: 0,
        status: "skipped_no_subscription"
      });
      continue;
    }

    const employeeResult = await db.query(
      `select id
       from public.time_card_employee_contacts
       where customer_id = $1 and active = true and email is not null and email <> ''
       order by display_name`,
      [settings.customerId]
    );
    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const employee of employeeResult.rows) {
      try {
        await createAndSendTimeCardConfirmationRequest({
          actorType: "system",
          customerId: settings.customerId,
          employeeId: String(employee.id),
          periodStart,
          periodEnd
        });
        sentCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to send request";

        if (message.includes("already exists")) {
          skippedCount += 1;
        } else {
          failedCount += 1;
          console.error("[time-card-confirmation] automated request failed", {
            customerId: settings.customerId,
            employeeId: String(employee.id),
            error: message
          });
        }
      }
    }

    const status = failedCount ? "completed_with_errors" : "completed";
    await db.query(
      `update public.time_card_confirmation_runs
       set status = $2, sent_count = $3, skipped_count = $4,
           failed_count = $5, completed_at = now()
       where id = $1`,
      [runId, status, sentCount, skippedCount, failedCount]
    );
    results.push({
      customerId: settings.customerId,
      sentCount,
      skippedCount,
      failedCount,
      status
    });
  }

  const managerReminders: Array<{
    customerId: string;
    outstandingCount: number;
    status: string;
  }> = [];
  const dueManagerReminders = settings.filter((setting) =>
    setting.managerReminderEnabled && isWeeklyConfirmationScheduleDue({
      now,
      dayOfWeek: setting.sendDayOfWeek,
      timeLocal: setting.managerReminderTimeLocal,
      timezone: setting.timezone,
      windowMinutes
    })
  );

  for (const setting of dueManagerReminders) {
    const { periodStart, periodEnd } = buildCompletedConfirmationPeriod({
      now,
      timezone: setting.timezone,
      periodDays: setting.periodDays
    });

    try {
      const reminder = await sendManagerOutstandingReminder({
        customerId: setting.customerId,
        periodStart,
        periodEnd
      });
      managerReminders.push({ customerId: setting.customerId, ...reminder });
    } catch (error) {
      console.error("[time-card-confirmation] manager outstanding reminder failed", {
        customerId: setting.customerId,
        error: error instanceof Error ? error.message : String(error)
      });
      managerReminders.push({
        customerId: setting.customerId,
        outstandingCount: 0,
        status: "notification_failed"
      });
    }
  }

  return {
    now: now.toISOString(),
    dueCustomers: dueSettings.length,
    managerReminders,
    sentCount: results.reduce((total, result) => total + result.sentCount, 0),
    results
  };
}
