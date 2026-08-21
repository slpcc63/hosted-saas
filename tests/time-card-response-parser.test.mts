import assert from "node:assert/strict";
import test from "node:test";

import { parseEmployeeTimeResponse } from "../lib/time-card-response-parser.ts";
import {
  buildCompletedConfirmationPeriod,
  isWeeklyConfirmationScheduleDue
} from "../lib/time-card-confirmation-schedule.ts";

test("parses a as did not work", () => {
  assert.deepEqual(parseEmployeeTimeResponse(" a "), { code: "a" });
});

test("parses b with 24-hour times", () => {
  assert.deepEqual(parseEmployeeTimeResponse("b + 09:15 - 17:45"), {
    code: "b",
    timeIn: "09:15",
    timeOut: "17:45"
  });
});

test("normalizes b with 12-hour times", () => {
  assert.deepEqual(parseEmployeeTimeResponse("B + 9am - 5:30 PM"), {
    code: "b",
    timeIn: "09:00",
    timeOut: "17:30"
  });
});

test("supports overnight shifts without changing the entered times", () => {
  assert.deepEqual(parseEmployeeTimeResponse("b + 10:00 pm - 6:00 am"), {
    code: "b",
    timeIn: "22:00",
    timeOut: "06:00"
  });
});

test("rejects incomplete and invalid responses", () => {
  assert.equal(parseEmployeeTimeResponse(""), null);
  assert.equal(parseEmployeeTimeResponse("b"), null);
  assert.equal(parseEmployeeTimeResponse("b + 25:00 - 17:00"), null);
  assert.equal(parseEmployeeTimeResponse("c + 09:00 - 17:00"), null);
});

test("detects a weekly schedule only inside its delivery window", () => {
  const scheduledNow = new Date("2026-08-24T16:00:00Z");
  const afterWindow = new Date("2026-08-24T16:16:00Z");
  const schedule = {
    dayOfWeek: 1,
    timeLocal: "09:00",
    timezone: "America/Los_Angeles",
    windowMinutes: 15
  };

  assert.equal(isWeeklyConfirmationScheduleDue({ ...schedule, now: scheduledNow }), true);
  assert.equal(isWeeklyConfirmationScheduleDue({ ...schedule, now: afterWindow }), false);
});

test("builds a completed seven-day period ending yesterday in the configured timezone", () => {
  assert.deepEqual(
    buildCompletedConfirmationPeriod({
      now: new Date("2026-08-24T16:00:00Z"),
      periodDays: 7,
      timezone: "America/Los_Angeles"
    }),
    { periodStart: "2026-08-17", periodEnd: "2026-08-23" }
  );
});
