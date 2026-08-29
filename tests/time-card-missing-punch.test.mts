import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMissingPunchSmsBody,
  buildWeeklyMissingPunchDigestSmsBody,
  detectMissingPunches,
  getLocalDate,
  localDateTimeToIso,
  validateReportedShiftAgainstSchedule
} from "../lib/time-card-missing-punch.ts";

const scheduledShift = {
  id: "scheduled-1",
  locationId: "location-1",
  scheduledEndAt: "2026-08-29T17:00:00-07:00",
  scheduledStartAt: "2026-08-29T09:00:00-07:00",
  teamMemberId: "team-1",
  timezone: "America/Los_Angeles"
};

test("detects a missing clock-in after the grace period", () => {
  const candidates = detectMissingPunches({
    graceMinutes: 30,
    now: new Date("2026-08-29T16:31:00Z"),
    scheduledShifts: [scheduledShift],
    timecards: []
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.kind, "missing_clock_in");
});

test("does not alert for a missing clock-in inside the grace period", () => {
  const candidates = detectMissingPunches({
    graceMinutes: 30,
    now: new Date("2026-08-29T16:29:00Z"),
    scheduledShifts: [scheduledShift],
    timecards: []
  });

  assert.deepEqual(candidates, []);
});

test("detects a missing clock-out on an open matching timecard", () => {
  const candidates = detectMissingPunches({
    graceMinutes: 30,
    now: new Date("2026-08-30T00:31:00Z"),
    scheduledShifts: [scheduledShift],
    timecards: [{
      endAt: null,
      id: "timecard-1",
      locationId: "location-1",
      startAt: "2026-08-29T16:05:00Z",
      teamMemberId: "team-1"
    }]
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.kind, "missing_clock_out");
  assert.equal(candidates[0]?.timecardId, "timecard-1");
});

test("does not alert for a completed matching timecard", () => {
  const candidates = detectMissingPunches({
    graceMinutes: 30,
    now: new Date("2026-08-30T01:00:00Z"),
    scheduledShifts: [scheduledShift],
    timecards: [{
      endAt: "2026-08-30T00:03:00Z",
      id: "timecard-1",
      locationId: "location-1",
      startAt: "2026-08-29T16:05:00Z",
      teamMemberId: "team-1"
    }]
  });

  assert.deepEqual(candidates, []);
});

test("builds a shift-specific direct-reply SMS", () => {
  const message = buildMissingPunchSmsBody({
    companyName: "SLPCC63",
    kind: "missing_clock_in",
    responseUrl: "https://app.slpcc63.com/app/time-card-response/token",
    scheduledEndAt: scheduledShift.scheduledEndAt,
    scheduledStartAt: scheduledShift.scheduledStartAt,
    timezone: scheduledShift.timezone
  });

  assert.match(message, /Aug 29, 2026/);
  assert.match(message, /9:00 AM–5:00 PM/);
  assert.match(message, /Reply A/);
  assert.match(message, /B \+ 9am - 5pm/);
});

test("builds one weekly secure-form digest without direct reply options", () => {
  const message = buildWeeklyMissingPunchDigestSmsBody({
    companyName: "SLPCC63",
    count: 3,
    responseUrl: "https://app.slpcc63.com/app/time-card-digest/token"
  });

  assert.match(message, /3 unresolved time punches/);
  assert.match(message, /secure form/);
  assert.doesNotMatch(message, /Reply A/);
  assert.doesNotMatch(message, /Reply B/);
});

test("formats the scheduled shift date in its local timezone", () => {
  assert.equal(
    getLocalDate("2026-08-30T01:00:00Z", "America/Los_Angeles"),
    "2026-08-29"
  );
});

test("converts a Pacific local punch time to UTC", () => {
  assert.equal(
    localDateTimeToIso({
      date: "2026-08-29",
      time: "09:15",
      timezone: "America/Los_Angeles"
    }),
    "2026-08-29T16:15:00.000Z"
  );
});

test("applies automatic-processing schedule guardrails", () => {
  assert.deepEqual(validateReportedShiftAgainstSchedule({
    scheduledEndAt: scheduledShift.scheduledEndAt,
    scheduledStartAt: scheduledShift.scheduledStartAt,
    submittedEndAt: "2026-08-29T17:10:00-07:00",
    submittedStartAt: "2026-08-29T09:05:00-07:00"
  }), { valid: true, reason: null });

  assert.deepEqual(validateReportedShiftAgainstSchedule({
    scheduledEndAt: scheduledShift.scheduledEndAt,
    scheduledStartAt: scheduledShift.scheduledStartAt,
    submittedEndAt: "2026-08-30T08:00:00-07:00",
    submittedStartAt: "2026-08-29T01:00:00-07:00"
  }), { valid: false, reason: "shift_too_long" });
});
