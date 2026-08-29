import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { getAppOrigin } from "@/lib/deployment";
import { sendTransactionalEmail } from "@/lib/email";
import {
  ensureTimeCardEmailWorkflowTables,
  type TimeCardConfirmationSettings
} from "@/lib/time-card-email-workflow";
import {
  buildMissingPunchSmsBody,
  buildWeeklyMissingPunchDigestSmsBody,
  detectMissingPunches,
  getLocalDate,
  localDateTimeToIso,
  validateReportedShiftAgainstSchedule,
  type MissingPunchKind
} from "@/lib/time-card-missing-punch";
import { buildCompletedConfirmationPeriod, isWeeklyConfirmationScheduleDue } from "@/lib/time-card-confirmation-schedule";
import { getActiveSubscriptionForProduct } from "@/lib/subscriptions";
import {
  createSquareTimecard,
  hasSquareScopes,
  listSquareTeamMemberWages,
  retrieveSquareTimecard,
  searchSquareScheduledShifts,
  searchSquareTimecardsByWorkday,
  updateSquareTimecard
} from "@/lib/square";
import { getValidSquareConnectionByCustomerId } from "@/lib/square-connections";
import { isTimeCardSmsLive, sendTwilioMessage } from "@/lib/twilio";

const timezoneFallback = "America/Los_Angeles";

type MissingPunchRow = {
  id: string;
  kind: MissingPunchKind;
  scheduledEndAt: Date;
  scheduledStartAt: Date;
  status: string;
  timezone: string;
};

export type PublicMissingPunchDigest = {
  companyName: string;
  employeeName: string;
  expiresAt: Date;
  items: MissingPunchRow[];
  periodEnd: string;
  periodStart: string;
  submittedAt: Date | null;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function mapSettings(row: Record<string, unknown>): TimeCardConfirmationSettings {
  return {
    automationEnabled: Boolean(row.automation_enabled),
    customerId: String(row.customer_id),
    graceMinutes: Number(row.grace_minutes ?? 30),
    managerReminderEnabled: Boolean(row.manager_reminder_enabled),
    managerReminderTimeLocal: String(row.manager_reminder_time_local),
    periodDays: Number(row.period_days ?? 7),
    sameDayEnabled: row.same_day_enabled !== false,
    sendDayOfWeek: Number(row.send_day_of_week),
    sendTimeLocal: String(row.send_time_local),
    timezone: String(row.timezone || timezoneFallback),
    workedResponseHandling: row.worked_response_handling === "automatic" ? "automatic" : "require_approval"
  };
}

async function getActiveSettings() {
  const result = await db.query(
    `select settings.*
     from public.time_card_confirmation_settings settings
     inner join public.customer_profiles customers on customers.id = settings.customer_id
     where settings.automation_enabled = true and customers.status = 'active'`
  );
  return result.rows.map((row) => mapSettings(row));
}

function formatShift(input: { endAt: Date; startAt: Date; timezone: string }) {
  const date = new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeZone: input.timezone
  }).format(input.startAt);
  const time = (value: Date) => new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: input.timezone
  }).format(value);
  return `${date}, ${time(input.startAt)}–${time(input.endAt)}`;
}

async function sendSpecificMissingPunchRequest(input: {
  customerId: string;
  missingPunchId: string;
}) {
  const result = await db.query(
    `select punches.*, contacts.display_name, contacts.email, contacts.phone,
            contacts.sms_consent_status, customers.company_name, customers.contact_name
     from public.time_card_missing_punches punches
     inner join public.time_card_employee_contacts contacts on contacts.id = punches.employee_id
     inner join public.customer_profiles customers on customers.id = punches.customer_id
     where punches.id = $1 and punches.customer_id = $2 and punches.status = 'open'
     limit 1`,
    [input.missingPunchId, input.customerId]
  );
  const row = result.rows[0];
  if (!row) return { status: "skipped_not_open" };

  const token = randomBytes(32).toString("base64url");
  const shiftDate = getLocalDate(String(row.scheduled_start_at), String(row.timezone));
  const requestResult = await db.query(
    `insert into public.time_card_confirmation_requests (
       customer_id, employee_id, square_team_member_id, employee_name, employee_email,
       period_start, period_end, timezone, status, response_token_hash, token_expires_at,
       request_kind, missing_punch_id, missing_punch_kind, scheduled_shift_id,
       scheduled_start_at, scheduled_end_at, reported_shift_date
     ) values ($1,$2,$3,$4,$5,$6,$6,$7,'pending',$8,now() + interval '14 days',
       'missing_punch',$9,$10,$11,$12,$13,$6)
     on conflict (missing_punch_id) where missing_punch_id is not null do nothing
     returning id`,
    [
      row.customer_id,
      row.employee_id,
      row.square_team_member_id,
      row.display_name,
      typeof row.email === "string" ? row.email : "",
      shiftDate,
      row.timezone,
      hashToken(token),
      row.id,
      row.kind,
      row.scheduled_shift_id,
      row.scheduled_start_at,
      row.scheduled_end_at
    ]
  );
  if (!requestResult.rows[0]) return { status: "skipped_already_created" };

  const requestId = String(requestResult.rows[0].id);
  const responseUrl = `${getAppOrigin()}/app/time-card-response/${encodeURIComponent(token)}`;
  const companyName = String(row.company_name || row.contact_name || "Your employer");
  const shiftLabel = formatShift({
    startAt: new Date(String(row.scheduled_start_at)),
    endAt: new Date(String(row.scheduled_end_at)),
    timezone: String(row.timezone)
  });
  const kindLabel = row.kind === "missing_clock_in" ? "clock-in" : "clock-out";
  let delivered = false;

  if (isEmail(row.email)) {
    try {
      await sendTransactionalEmail({
        to: row.email,
        subject: `${companyName}: missing ${kindLabel} for ${shiftDate}`,
        idempotencyKey: `time-card-missing-punch-${String(row.id)}-email`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2933"><h1>Missing ${escapeHtml(kindLabel)}</h1><p>Hello ${escapeHtml(String(row.display_name))},</p><p>We are missing your <strong>${escapeHtml(kindLabel)}</strong> for <strong>${escapeHtml(shiftLabel)}</strong>.</p><p>Tell us whether you did not work, or provide the actual time in and time out.</p><p><a href="${escapeHtml(responseUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#235f49;color:#fff;text-decoration:none;font-weight:700">Respond securely</a></p></div>`,
        text: `We are missing your ${kindLabel} for ${shiftLabel}. Respond securely: ${responseUrl}`
      });
      delivered = true;
    } catch (error) {
      console.error("[missing-punch] email failed", { requestId, error });
    }
  }

  if (isTimeCardSmsLive() && row.sms_consent_status === "opted_in" && typeof row.phone === "string" && row.phone) {
    try {
      const body = buildMissingPunchSmsBody({
        companyName,
        kind: row.kind,
        responseUrl,
        scheduledEndAt: String(row.scheduled_end_at),
        scheduledStartAt: String(row.scheduled_start_at),
        timezone: String(row.timezone)
      });
      const message = await sendTwilioMessage({
        body,
        statusCallback: `${getAppOrigin()}/api/webhooks/twilio/status`,
        to: row.phone
      });
      await db.query(
        `insert into public.time_card_sms_messages (
          customer_id, employee_id, request_id, twilio_message_sid, direction,
          to_phone, body, status, processing_result
        ) values ($1,$2,$3,$4,'outbound',$5,$6,$7,'missing_punch_sent')
        on conflict (twilio_message_sid) do nothing`,
        [row.customer_id, row.employee_id, requestId, message.sid, row.phone, body, message.status]
      );
      delivered = true;
    } catch (error) {
      console.error("[missing-punch] SMS failed", { requestId, error });
    }
  }

  await db.query(
    `update public.time_card_missing_punches set notified_at = case when $2 then now() else notified_at end,
       updated_at = now() where id = $1`,
    [row.id, delivered]
  );
  if (!delivered) {
    await db.query(`update public.time_card_confirmation_requests set status = 'delivery_failed', updated_at = now() where id = $1`, [requestId]);
  }
  return { status: delivered ? "sent" : "delivery_failed" };
}

async function detectForCustomer(settings: TimeCardConfirmationSettings, now: Date) {
  if (!settings.sameDayEnabled) return { detected: 0, sent: 0, status: "same_day_disabled" };
  const subscription = await getActiveSubscriptionForProduct({
    customerId: settings.customerId,
    productSlug: "square-time-card-manager"
  });
  if (!subscription) return { detected: 0, sent: 0, status: "no_subscription" };

  const connection = await getValidSquareConnectionByCustomerId(settings.customerId);
  if (!connection || !hasSquareScopes(connection.authorizedScopes, ["TIMECARDS_READ"])) {
    return { detected: 0, sent: 0, status: "square_read_unavailable" };
  }

  const contactsResult = await db.query(
    `select id, square_team_member_id from public.time_card_employee_contacts
     where customer_id = $1 and active = true`,
    [settings.customerId]
  );
  const contacts = new Map(contactsResult.rows.map((row) => [String(row.square_team_member_id), String(row.id)]));
  if (!contacts.size) return { detected: 0, sent: 0, status: "no_employees" };

  const startAt = new Date(now.getTime() - 36 * 60 * 60 * 1000);
  const endAt = new Date(now.getTime() + 60 * 60 * 1000);
  const shifts = await searchSquareScheduledShifts({
    accessToken: connection.accessToken,
    startAt,
    endAt,
    teamMemberIds: [...contacts.keys()]
  });
  const startDate = getLocalDate(startAt.toISOString(), settings.timezone);
  const endDate = getLocalDate(endAt.toISOString(), settings.timezone);
  const timecards = await searchSquareTimecardsByWorkday({
    accessToken: connection.accessToken,
    startDate,
    endDate,
    teamMemberIds: [...contacts.keys()],
    timezone: settings.timezone
  });
  const candidates = detectMissingPunches({
    graceMinutes: settings.graceMinutes,
    now,
    scheduledShifts: shifts.flatMap((shift) => {
      const details = shift.published_shift_details;
      return details?.team_member_id ? [{
        id: shift.id,
        locationId: details.location_id,
        scheduledEndAt: details.end_at,
        scheduledStartAt: details.start_at,
        teamMemberId: details.team_member_id,
        timezone: details.timezone || settings.timezone
      }] : [];
    }),
    timecards: timecards.flatMap((timecard) => timecard.team_member_id ? [{
      endAt: timecard.end_at ?? null,
      id: timecard.id,
      locationId: timecard.location_id,
      startAt: timecard.start_at,
      teamMemberId: timecard.team_member_id
    }] : [])
  });

  let detected = 0;
  let sent = 0;
  for (const candidate of candidates) {
    const employeeId = contacts.get(candidate.teamMemberId);
    if (!employeeId) continue;
    const insert = await db.query(
      `insert into public.time_card_missing_punches (
        customer_id, employee_id, square_team_member_id, scheduled_shift_id, timecard_id,
        kind, location_id, scheduled_start_at, scheduled_end_at, timezone
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      on conflict (customer_id, scheduled_shift_id) do nothing returning id`,
      [settings.customerId, employeeId, candidate.teamMemberId, candidate.scheduledShiftId,
        candidate.timecardId, candidate.kind, candidate.locationId, candidate.scheduledStartAt,
        candidate.scheduledEndAt, candidate.timezone]
    );
    if (!insert.rows[0]) continue;
    detected += 1;
    const delivery = await sendSpecificMissingPunchRequest({
      customerId: settings.customerId,
      missingPunchId: String(insert.rows[0].id)
    });
    if (delivery.status === "sent") sent += 1;
  }
  return { detected, sent, status: "completed" };
}

async function sendWeeklyDigest(input: {
  customerId: string;
  employeeId: string;
  missingPunchIds: string[];
  periodEnd: string;
  periodStart: string;
}) {
  const employeeResult = await db.query(
    `select contacts.display_name, contacts.email, contacts.phone, contacts.sms_consent_status,
            customers.company_name, customers.contact_name
     from public.time_card_employee_contacts contacts
     inner join public.customer_profiles customers on customers.id = contacts.customer_id
     where contacts.id = $1 and contacts.customer_id = $2`,
    [input.employeeId, input.customerId]
  );
  const employee = employeeResult.rows[0];
  if (!employee) return "skipped_employee_missing";
  const token = randomBytes(32).toString("base64url");
  const digestResult = await db.query(
    `insert into public.time_card_missing_punch_digests (
      customer_id, employee_id, period_start, period_end, response_token_hash, token_expires_at
    ) values ($1,$2,$3,$4,$5,now() + interval '14 days')
    on conflict (employee_id, period_start, period_end) do nothing returning id`,
    [input.customerId, input.employeeId, input.periodStart, input.periodEnd, hashToken(token)]
  );
  if (!digestResult.rows[0]) return "skipped_already_sent";
  const digestId = String(digestResult.rows[0].id);
  for (const missingPunchId of input.missingPunchIds) {
    await db.query(
      `insert into public.time_card_missing_punch_digest_items (digest_id, missing_punch_id)
       values ($1,$2) on conflict do nothing`,
      [digestId, missingPunchId]
    );
  }
  const responseUrl = `${getAppOrigin()}/app/time-card-digest/${encodeURIComponent(token)}`;
  const companyName = String(employee.company_name || employee.contact_name || "Your employer");
  let delivered = false;
  if (isEmail(employee.email)) {
    await sendTransactionalEmail({
      to: employee.email,
      subject: `${companyName}: review ${input.missingPunchIds.length} unresolved time punch${input.missingPunchIds.length === 1 ? "" : "es"}`,
      idempotencyKey: `time-card-weekly-digest-${digestId}-email`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2933"><h1>Weekly time review</h1><p>Hello ${escapeHtml(String(employee.display_name))},</p><p>You have <strong>${input.missingPunchIds.length}</strong> unresolved time punch${input.missingPunchIds.length === 1 ? "" : "es"}. Review every item in one secure form.</p><p><a href="${escapeHtml(responseUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#235f49;color:#fff;text-decoration:none;font-weight:700">Review missing punches</a></p></div>`,
      text: `You have ${input.missingPunchIds.length} unresolved time punches. Review them securely: ${responseUrl}`
    });
    delivered = true;
  }
  if (isTimeCardSmsLive() && employee.sms_consent_status === "opted_in" && typeof employee.phone === "string" && employee.phone) {
    const body = buildWeeklyMissingPunchDigestSmsBody({ companyName, count: input.missingPunchIds.length, responseUrl });
    await sendTwilioMessage({ body, statusCallback: `${getAppOrigin()}/api/webhooks/twilio/status`, to: employee.phone });
    delivered = true;
  }
  if (delivered) await db.query(`update public.time_card_missing_punch_digests set sent_at = now(), updated_at = now() where id = $1`, [digestId]);
  return delivered ? "sent" : "delivery_failed";
}

async function runWeeklyDigests(settings: TimeCardConfirmationSettings, now: Date, windowMinutes: number) {
  if (!isWeeklyConfirmationScheduleDue({
    now,
    dayOfWeek: settings.sendDayOfWeek,
    timeLocal: settings.sendTimeLocal,
    timezone: settings.timezone,
    windowMinutes
  })) return { sent: 0, status: "not_due" };
  const period = buildCompletedConfirmationPeriod({ now, timezone: settings.timezone, periodDays: settings.periodDays });
  const run = await db.query(
    `insert into public.time_card_confirmation_runs (customer_id, period_start, period_end, status)
     values ($1,$2,$3,'running') on conflict (customer_id, period_start, period_end) do nothing returning id`,
    [settings.customerId, period.periodStart, period.periodEnd]
  );
  if (!run.rows[0]) return { sent: 0, status: "already_processed" };
  const punches = await db.query(
    `select id, employee_id from public.time_card_missing_punches
     where customer_id = $1 and status in ('open','rejected','apply_failed')
       and (scheduled_start_at at time zone $4)::date between $2::date and $3::date
     order by employee_id, scheduled_start_at`,
    [settings.customerId, period.periodStart, period.periodEnd, settings.timezone]
  );
  const grouped = new Map<string, string[]>();
  for (const row of punches.rows) {
    const employeeId = String(row.employee_id);
    grouped.set(employeeId, [...(grouped.get(employeeId) ?? []), String(row.id)]);
  }
  let sent = 0;
  for (const [employeeId, missingPunchIds] of grouped) {
    const result = await sendWeeklyDigest({
      customerId: settings.customerId,
      employeeId,
      missingPunchIds,
      ...period
    });
    if (result === "sent") sent += 1;
  }
  await db.query(
    `update public.time_card_confirmation_runs set status = 'completed', sent_count = $2, completed_at = now() where id = $1`,
    [run.rows[0].id, sent]
  );
  return { sent, status: "completed" };
}

async function sendManagerSummary(settings: TimeCardConfirmationSettings, now: Date, windowMinutes: number) {
  if (!settings.managerReminderEnabled || !isWeeklyConfirmationScheduleDue({
    now,
    dayOfWeek: settings.sendDayOfWeek,
    timeLocal: settings.managerReminderTimeLocal,
    timezone: settings.timezone,
    windowMinutes
  })) return { outstanding: 0, status: "not_due" };
  const period = buildCompletedConfirmationPeriod({ now, timezone: settings.timezone, periodDays: settings.periodDays });
  const claim = await db.query(
    `update public.time_card_confirmation_runs set manager_reminder_sent_at = now()
     where customer_id = $1 and period_start = $2 and period_end = $3 and manager_reminder_sent_at is null
     returning id`,
    [settings.customerId, period.periodStart, period.periodEnd]
  );
  if (!claim.rows[0]) return { outstanding: 0, status: "already_processed_or_no_run" };
  const result = await db.query(
    `select contacts.display_name, count(*)::int as punch_count,
            customers.email as manager_email, customers.company_name, customers.contact_name
     from public.time_card_missing_punches punches
     inner join public.time_card_employee_contacts contacts on contacts.id = punches.employee_id
     inner join public.customer_profiles customers on customers.id = punches.customer_id
     where punches.customer_id = $1 and punches.status in ('open','rejected','apply_failed')
     group by contacts.display_name, customers.email, customers.company_name, customers.contact_name
     order by contacts.display_name`,
    [settings.customerId]
  );
  if (!result.rows.length) return { outstanding: 0, status: "none_outstanding" };
  const managerEmail = result.rows[0].manager_email;
  if (!isEmail(managerEmail)) return { outstanding: result.rows.length, status: "invalid_manager_email" };
  const companyName = String(result.rows[0].company_name || result.rows[0].contact_name || "Your team");
  const items = result.rows.map((row) => `<li><strong>${escapeHtml(String(row.display_name))}</strong>: ${Number(row.punch_count)} unresolved</li>`).join("");
  await sendTransactionalEmail({
    to: managerEmail,
    subject: `${companyName}: ${result.rows.length} employee${result.rows.length === 1 ? "" : "s"} still have missing punches`,
    idempotencyKey: `time-card-manager-summary-${String(claim.rows[0].id)}`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2933"><h1>Outstanding punches</h1><p>These employees still need follow-up:</p><ul>${items}</ul><p><a href="${escapeHtml(`${getAppOrigin()}/time-card-manager/responses?status=pending`)}">Open manager inbox</a></p></div>`,
    text: result.rows.map((row) => `${row.display_name}: ${row.punch_count} unresolved`).join("\n")
  });
  return { outstanding: result.rows.length, status: "sent" };
}

export async function runMissingPunchAutomationBatch(input?: { now?: Date }) {
  await ensureTimeCardEmailWorkflowTables();
  const now = input?.now ?? new Date();
  if (!process.env.CRON_SECRET || process.env.TIME_CARD_AUTOMATION_LIVE === "false") {
    return { now: now.toISOString(), status: "automation_disabled", customers: [] };
  }
  const windowMinutes = Math.min(Math.max(Number(process.env.TIME_CARD_AUTOMATION_WINDOW_MINUTES ?? 15) || 15, 5), 60);
  const settings = await getActiveSettings();
  const customers = [];
  for (const setting of settings) {
    try {
      customers.push({
        customerId: setting.customerId,
        detection: await detectForCustomer(setting, now),
        weekly: await runWeeklyDigests(setting, now, windowMinutes),
        manager: await sendManagerSummary(setting, now, windowMinutes)
      });
    } catch (error) {
      customers.push({ customerId: setting.customerId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { now: now.toISOString(), status: "completed", customers };
}

export async function getPublicMissingPunchDigest(token: string): Promise<PublicMissingPunchDigest | null> {
  await ensureTimeCardEmailWorkflowTables();
  if (!token || token.length > 200) return null;
  const digestResult = await db.query(
    `select digests.id, digests.period_start, digests.period_end, digests.token_expires_at,
            digests.submitted_at, contacts.display_name, customers.company_name, customers.contact_name
     from public.time_card_missing_punch_digests digests
     inner join public.time_card_employee_contacts contacts on contacts.id = digests.employee_id
     inner join public.customer_profiles customers on customers.id = digests.customer_id
     where digests.response_token_hash = $1`,
    [hashToken(token)]
  );
  const digest = digestResult.rows[0];
  if (!digest) return null;
  const itemsResult = await db.query(
    `select punches.id, punches.kind, punches.scheduled_start_at, punches.scheduled_end_at,
            punches.timezone, punches.status
     from public.time_card_missing_punch_digest_items items
     inner join public.time_card_missing_punches punches on punches.id = items.missing_punch_id
     where items.digest_id = $1 order by punches.scheduled_start_at`,
    [digest.id]
  );
  return {
    companyName: String(digest.company_name || digest.contact_name || "Your employer"),
    employeeName: String(digest.display_name),
    expiresAt: new Date(String(digest.token_expires_at)),
    items: itemsResult.rows.map((row) => ({
      id: String(row.id),
      kind: row.kind as MissingPunchKind,
      scheduledEndAt: new Date(String(row.scheduled_end_at)),
      scheduledStartAt: new Date(String(row.scheduled_start_at)),
      status: String(row.status),
      timezone: String(row.timezone)
    })),
    periodEnd: String(digest.period_end).slice(0, 10),
    periodStart: String(digest.period_start).slice(0, 10),
    submittedAt: digest.submitted_at ? new Date(String(digest.submitted_at)) : null
  };
}

export async function submitMissingPunchDigest(input: {
  responses: Array<{ code: "a" | "b"; missingPunchId: string; timeIn?: string; timeOut?: string }>;
  token: string;
}) {
  await ensureTimeCardEmailWorkflowTables();
  const digestResult = await db.query(
    `select id, token_expires_at, submitted_at from public.time_card_missing_punch_digests
     where response_token_hash = $1`,
    [hashToken(input.token)]
  );
  const digest = digestResult.rows[0];
  if (!digest || new Date(String(digest.token_expires_at)).getTime() <= Date.now()) throw new Error("This weekly review link is invalid or expired");
  if (digest.submitted_at) throw new Error("This weekly review was already submitted");
  const allowed = await db.query(
    `select punches.id, punches.scheduled_start_at, punches.scheduled_end_at, punches.timezone
     from public.time_card_missing_punch_digest_items items
     inner join public.time_card_missing_punches punches on punches.id = items.missing_punch_id
     where items.digest_id = $1 and punches.status in ('open','rejected','apply_failed')`,
    [digest.id]
  );
  if (input.responses.length !== allowed.rows.length) throw new Error("Please answer every missing punch");
  const byId = new Map(allowed.rows.map((row) => [String(row.id), row]));
  const requestIds: string[] = [];
  for (const response of input.responses) {
    const row = byId.get(response.missingPunchId);
    if (!row) throw new Error("This weekly review contains an invalid item");
    let timeIn: string | null = null;
    let timeOut: string | null = null;
    if (response.code === "b") {
      if (!response.timeIn || !response.timeOut) throw new Error("Time in and time out are required for worked shifts");
      const date = getLocalDate(String(row.scheduled_start_at), String(row.timezone));
      const start = localDateTimeToIso({ date, time: response.timeIn, timezone: String(row.timezone) });
      let end = localDateTimeToIso({ date, time: response.timeOut, timezone: String(row.timezone) });
      if (new Date(end).getTime() <= new Date(start).getTime()) {
        const nextDate = getLocalDate(new Date(new Date(start).getTime() + 24 * 60 * 60 * 1000).toISOString(), String(row.timezone));
        end = localDateTimeToIso({ date: nextDate, time: response.timeOut, timezone: String(row.timezone) });
      }
      const guard = validateReportedShiftAgainstSchedule({
        scheduledStartAt: String(row.scheduled_start_at),
        scheduledEndAt: String(row.scheduled_end_at),
        submittedStartAt: start,
        submittedEndAt: end
      });
      if (!guard.valid) throw new Error("One of the reported shifts is outside the allowed range");
      timeIn = response.timeIn;
      timeOut = response.timeOut;
    }
    const requestResult = await db.query(
      `update public.time_card_confirmation_requests set status = 'responded', response_code = $2,
         reported_time_in = $3, reported_time_out = $4, response_note = 'Submitted in weekly secure digest',
         responded_at = now(), updated_at = now()
       where missing_punch_id = $1 and status in ('pending','delivery_failed','rejected')
       returning id, customer_id`,
      [response.missingPunchId, response.code, timeIn, timeOut]
    );
    if (requestResult.rows[0]) requestIds.push(String(requestResult.rows[0].id));
    await db.query(
      `update public.time_card_missing_punches set status = 'responded', updated_at = now() where id = $1`,
      [response.missingPunchId]
    );
  }
  await db.query(`update public.time_card_missing_punch_digests set submitted_at = now(), updated_at = now() where id = $1`, [digest.id]);
  return requestIds;
}

export async function processMissingPunchResponse(input: { customerId: string; requestId: string }) {
  const result = await db.query(
    `select requests.response_code, requests.status, requests.missing_punch_id,
            settings.worked_response_handling
     from public.time_card_confirmation_requests requests
     inner join public.time_card_confirmation_settings settings on settings.customer_id = requests.customer_id
     where requests.id = $1 and requests.customer_id = $2 and requests.request_kind = 'missing_punch'`,
    [input.requestId, input.customerId]
  );
  const row = result.rows[0];
  if (!row || row.status !== "responded") return { status: "manager_review" };
  const shouldAutoApprove = row.response_code === "a" || row.worked_response_handling === "automatic";
  if (!shouldAutoApprove) return { status: "manager_review" };
  await db.query(
    `update public.time_card_confirmation_requests set status = 'approved', reviewed_at = now(),
       approved_at = now(), reviewed_by_user_id = 'automatic_workflow', updated_at = now()
     where id = $1 and status = 'responded'`,
    [input.requestId]
  );
  const applied = await applyApprovedMissingPunch(input);
  if (row.response_code === "b" && applied.status !== "applied") {
    await db.query(
      `update public.time_card_confirmation_requests set status = 'responded', reviewed_at = null,
       approved_at = null, reviewed_by_user_id = null, updated_at = now() where id = $1`,
      [input.requestId]
    );
    return { status: "manager_review_exception", reason: applied.status };
  }
  return applied;
}

export async function applyApprovedMissingPunch(input: { customerId: string; requestId: string }) {
  const result = await db.query(
    `select requests.response_code, requests.reported_shift_date, requests.reported_time_in,
            requests.reported_time_out, punches.*
     from public.time_card_confirmation_requests requests
     inner join public.time_card_missing_punches punches on punches.id = requests.missing_punch_id
     where requests.id = $1 and requests.customer_id = $2 and requests.status = 'approved'`,
    [input.requestId, input.customerId]
  );
  const row = result.rows[0];
  if (!row) return { status: "not_applicable" };
  if (row.response_code === "a") {
    await db.query(`update public.time_card_missing_punches set status = 'approved', resolved_at = now(), updated_at = now() where id = $1`, [row.id]);
    return { status: "resolved_no_work" };
  }
  if (process.env.TIME_CARD_SQUARE_WRITES_LIVE !== "true") {
    return { status: "review_required_square_writes_disabled" };
  }
  const connection = await getValidSquareConnectionByCustomerId(input.customerId);
  if (!connection || !hasSquareScopes(connection.authorizedScopes, ["TIMECARDS_WRITE"])) {
    await db.query(`update public.time_card_missing_punches set status = 'apply_failed', square_error = 'Square write access is not authorized', updated_at = now() where id = $1`, [row.id]);
    return { status: "review_required_square_write_scope" };
  }
  const localDate = String(row.reported_shift_date).slice(0, 10);
  const startAt = localDateTimeToIso({ date: localDate, time: String(row.reported_time_in), timezone: String(row.timezone) });
  let endAt = localDateTimeToIso({ date: localDate, time: String(row.reported_time_out), timezone: String(row.timezone) });
  if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
    const nextDate = getLocalDate(new Date(new Date(startAt).getTime() + 24 * 60 * 60 * 1000).toISOString(), String(row.timezone));
    endAt = localDateTimeToIso({ date: nextDate, time: String(row.reported_time_out), timezone: String(row.timezone) });
  }
  const guard = validateReportedShiftAgainstSchedule({
    scheduledStartAt: String(row.scheduled_start_at),
    scheduledEndAt: String(row.scheduled_end_at),
    submittedStartAt: startAt,
    submittedEndAt: endAt
  });
  if (!guard.valid) return { status: "review_required_guardrail" };
  try {
    let applied;
    if (row.kind === "missing_clock_out" && row.timecard_id) {
      const current = await retrieveSquareTimecard({ accessToken: connection.accessToken, timecardId: String(row.timecard_id) });
      if (!current || current.status !== "OPEN" || typeof current.version !== "number") return { status: "review_required_square_changed" };
      applied = await updateSquareTimecard({
        accessToken: connection.accessToken,
        timecard: { id: current.id, version: current.version, end_at: endAt }
      });
    } else {
      const wages = await listSquareTeamMemberWages({ accessToken: connection.accessToken, teamMemberId: String(row.square_team_member_id) });
      const wage = wages[0];
      if (!wage?.hourly_rate?.currency || typeof wage.hourly_rate.amount !== "number") return { status: "review_required_wage" };
      applied = await createSquareTimecard({
        accessToken: connection.accessToken,
        idempotencyKey: randomUUID(),
        timecard: {
          location_id: String(row.location_id),
          team_member_id: String(row.square_team_member_id),
          start_at: startAt,
          end_at: endAt,
          wage: { job_id: wage.job_id, title: wage.title, hourly_rate: wage.hourly_rate, tip_eligible: wage.tip_eligible }
        }
      });
    }
    await db.query(
      `update public.time_card_missing_punches set status = 'applied', resolved_at = now(),
       square_result_timecard_id = $2, square_error = null, updated_at = now() where id = $1`,
      [row.id, applied?.id ?? null]
    );
    return { status: "applied", timecardId: applied?.id ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.query(`update public.time_card_missing_punches set status = 'apply_failed', square_error = $2, updated_at = now() where id = $1`, [row.id, message.slice(0, 2000)]);
    return { status: "apply_failed" };
  }
}
