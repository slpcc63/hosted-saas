export type MissingPunchKind = "missing_clock_in" | "missing_clock_out";

export type MissingPunchCandidate = {
  kind: MissingPunchKind;
  locationId: string;
  scheduledEndAt: string;
  scheduledShiftId: string;
  scheduledStartAt: string;
  teamMemberId: string;
  timecardId: string | null;
  timezone: string;
};

export type ScheduledShiftForPunchDetection = {
  id: string;
  locationId: string;
  scheduledEndAt: string;
  scheduledStartAt: string;
  teamMemberId: string;
  timezone: string;
};

export type TimecardForPunchDetection = {
  endAt: string | null;
  id: string;
  locationId: string;
  startAt: string;
  teamMemberId: string;
};

function getTime(value: string) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function overlapsScheduledShift(
  shift: ScheduledShiftForPunchDetection,
  timecard: TimecardForPunchDetection,
  now: Date
) {
  if (
    shift.teamMemberId !== timecard.teamMemberId ||
    shift.locationId !== timecard.locationId
  ) {
    return false;
  }

  const scheduledStart = getTime(shift.scheduledStartAt);
  const scheduledEnd = getTime(shift.scheduledEndAt);
  const timecardStart = getTime(timecard.startAt);
  const timecardEnd = timecard.endAt ? getTime(timecard.endAt) : now.getTime();

  if (
    scheduledStart === null ||
    scheduledEnd === null ||
    timecardStart === null ||
    timecardEnd === null
  ) {
    return false;
  }

  const matchingBufferMs = 6 * 60 * 60 * 1000;
  return timecardStart <= scheduledEnd + matchingBufferMs &&
    timecardEnd >= scheduledStart - matchingBufferMs;
}

export function detectMissingPunches(input: {
  graceMinutes: number;
  now: Date;
  scheduledShifts: ScheduledShiftForPunchDetection[];
  timecards: TimecardForPunchDetection[];
}) {
  const graceMs = Math.max(0, input.graceMinutes) * 60 * 1000;
  const candidates: MissingPunchCandidate[] = [];

  for (const shift of input.scheduledShifts) {
    const scheduledStart = getTime(shift.scheduledStartAt);
    const scheduledEnd = getTime(shift.scheduledEndAt);

    if (scheduledStart === null || scheduledEnd === null || scheduledEnd <= scheduledStart) {
      continue;
    }

    const matchingTimecards = input.timecards
      .filter((timecard) => overlapsScheduledShift(shift, timecard, input.now))
      .sort((left, right) => {
        const leftDistance = Math.abs((getTime(left.startAt) ?? 0) - scheduledStart);
        const rightDistance = Math.abs((getTime(right.startAt) ?? 0) - scheduledStart);
        return leftDistance - rightDistance;
      });
    const timecard = matchingTimecards[0];

    if (!timecard) {
      if (input.now.getTime() >= scheduledStart + graceMs) {
        candidates.push({
          kind: "missing_clock_in",
          locationId: shift.locationId,
          scheduledEndAt: shift.scheduledEndAt,
          scheduledShiftId: shift.id,
          scheduledStartAt: shift.scheduledStartAt,
          teamMemberId: shift.teamMemberId,
          timecardId: null,
          timezone: shift.timezone
        });
      }
      continue;
    }

    if (!timecard.endAt && input.now.getTime() >= scheduledEnd + graceMs) {
      candidates.push({
        kind: "missing_clock_out",
        locationId: shift.locationId,
        scheduledEndAt: shift.scheduledEndAt,
        scheduledShiftId: shift.id,
        scheduledStartAt: shift.scheduledStartAt,
        teamMemberId: shift.teamMemberId,
        timecardId: timecard.id,
        timezone: shift.timezone
      });
    }
  }

  return candidates;
}

function formatDateTime(value: string, timezone: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone
  }).format(date);
}

function formatTime(value: string, timezone: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone
  }).format(date);
}

export function buildMissingPunchSmsBody(input: {
  companyName: string;
  kind: MissingPunchKind;
  responseUrl: string;
  scheduledEndAt: string;
  scheduledStartAt: string;
  timezone: string;
}) {
  const dateLabel = formatDateTime(input.scheduledStartAt, input.timezone).replace(/, \d{1,2}:\d{2} .M$/, "");
  const scheduledTimes = `${formatTime(input.scheduledStartAt, input.timezone)}–${formatTime(input.scheduledEndAt, input.timezone)}`;
  const missingLabel = input.kind === "missing_clock_in" ? "clock-in" : "clock-out";

  return [
    `${input.companyName}: We are missing your ${missingLabel} for ${dateLabel}, scheduled ${scheduledTimes}.`,
    "Reply A if you did not work, or B + 9am - 5pm with your actual times.",
    `Secure form: ${input.responseUrl}`,
    "Reply STOP to opt out; HELP for help."
  ].join(" ");
}

export function buildWeeklyMissingPunchDigestSmsBody(input: {
  companyName: string;
  count: number;
  responseUrl: string;
}) {
  return [
    `${input.companyName}: You have ${input.count} unresolved time punch${input.count === 1 ? "" : "es"} from this week.`,
    `Review and correct ${input.count === 1 ? "it" : "them"} securely: ${input.responseUrl}`,
    "Weekly digest responses must use the secure form. Reply STOP to opt out; HELP for help."
  ].join(" ");
}

export function getLocalDate(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric"
  }).formatToParts(new Date(value));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

export function localDateTimeToIso(input: {
  date: string;
  time: string;
  timezone: string;
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.time)) {
    throw new Error("Invalid local date or time");
  }
  const [year, month, day] = input.date.split("-").map(Number);
  const [hour, minute] = input.time.split(":").map(Number);
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: input.timezone,
    year: "numeric"
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value])
    );
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute)
    );
    const adjustment = Date.UTC(year, month - 1, day, hour, minute) - represented;
    if (adjustment === 0) return new Date(guess).toISOString();
    guess += adjustment;
  }
  return new Date(guess).toISOString();
}

export function validateReportedShiftAgainstSchedule(input: {
  scheduledEndAt: string;
  scheduledStartAt: string;
  submittedEndAt: string;
  submittedStartAt: string;
}) {
  const scheduledStart = getTime(input.scheduledStartAt);
  const scheduledEnd = getTime(input.scheduledEndAt);
  const submittedStart = getTime(input.submittedStartAt);
  const submittedEnd = getTime(input.submittedEndAt);

  if (
    scheduledStart === null ||
    scheduledEnd === null ||
    submittedStart === null ||
    submittedEnd === null ||
    submittedEnd <= submittedStart
  ) {
    return { valid: false, reason: "invalid_time_range" } as const;
  }

  if (submittedEnd - submittedStart > 24 * 60 * 60 * 1000) {
    return { valid: false, reason: "shift_too_long" } as const;
  }

  const allowedVarianceMs = 6 * 60 * 60 * 1000;
  if (
    submittedStart < scheduledStart - allowedVarianceMs ||
    submittedEnd > scheduledEnd + allowedVarianceMs
  ) {
    return { valid: false, reason: "outside_schedule_guardrail" } as const;
  }

  return { valid: true, reason: null } as const;
}
