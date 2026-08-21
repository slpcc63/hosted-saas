import assert from "node:assert/strict";
import test from "node:test";

import { parseEmployeeTimeResponse } from "../lib/time-card-response-parser.ts";
import {
  buildCompletedConfirmationPeriod,
  buildDefaultManualConfirmationPeriod,
  isWeeklyConfirmationScheduleDue
} from "../lib/time-card-confirmation-schedule.ts";
import {
  buildTimeCardReportCsv,
  filterTimeCardConfirmationRequests,
  isTimeCardRequestOverdue
} from "../lib/time-card-report.ts";
import type { TimeCardConfirmationRequest } from "../lib/time-card-email-workflow.ts";

function buildRequest(
  overrides: Partial<TimeCardConfirmationRequest> = {}
): TimeCardConfirmationRequest {
  return {
    approvedAt: null,
    createdAt: new Date("2026-08-01T12:00:00Z"),
    customerId: "customer-1",
    employeeEmail: "john@example.com",
    employeeId: "employee-1",
    employeeName: "John Appleseed",
    id: "request-1",
    lastReminderAt: null,
    managerNote: null,
    periodEnd: "2026-08-07",
    periodStart: "2026-08-01",
    reminderCount: 0,
    reportedShiftDate: null,
    reportedTimeIn: null,
    reportedTimeOut: null,
    respondedAt: null,
    responseCode: null,
    responseNote: null,
    reviewedAt: null,
    reviewedByUserId: null,
    sentAt: new Date("2026-08-08T12:00:00Z"),
    squareTeamMemberId: "square-1",
    status: "pending",
    timezone: "America/Los_Angeles",
    tokenExpiresAt: new Date("2026-08-22T12:00:00Z"),
    updatedAt: new Date("2026-08-08T12:00:00Z"),
    ...overrides
  };
}

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

test("allows a delayed automation runner inside the hardened one-hour window", () => {
  assert.equal(isWeeklyConfirmationScheduleDue({
    dayOfWeek: 1,
    now: new Date("2026-08-24T16:45:00Z"),
    timeLocal: "09:00",
    timezone: "America/Los_Angeles",
    windowMinutes: 60
  }), true);
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

test("defaults manual confirmation requests to the last seven completed days", () => {
  assert.deepEqual(
    buildDefaultManualConfirmationPeriod(new Date("2026-08-21T19:00:00Z")),
    { periodStart: "2026-08-14", periodEnd: "2026-08-20" }
  );
});

test("marks only expired pending requests overdue", () => {
  const now = new Date("2026-08-23T12:00:00Z");

  assert.equal(isTimeCardRequestOverdue(buildRequest(), now), true);
  assert.equal(isTimeCardRequestOverdue(buildRequest({ status: "approved" }), now), false);
});

test("filters confirmation reports by employee, status, and overlapping period", () => {
  const requests = [
    buildRequest(),
    buildRequest({
      employeeName: "Shannon Phillips",
      id: "request-2",
      periodEnd: "2026-08-14",
      periodStart: "2026-08-08",
      status: "approved"
    })
  ];

  assert.deepEqual(
    filterTimeCardConfirmationRequests(requests, {
      employee: "shannon",
      periodStart: "2026-08-10",
      status: "approved"
    }).map((request) => request.id),
    ["request-2"]
  );
});

test("exports quoted CSV and neutralizes spreadsheet formulas", () => {
  const csv = buildTimeCardReportCsv([
    buildRequest({ employeeName: "=2+2, Inc." })
  ]);

  assert.match(csv, /"'=2\+2, Inc\."/);
  assert.match(csv, /"Reminder count"/);
});
