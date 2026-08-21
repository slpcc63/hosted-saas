import assert from "node:assert/strict";
import test from "node:test";

import { buildSquareShiftCalendar } from "../lib/icalendar.ts";

const primaryShift = {
  id: "SHIFT_A",
  published_shift_details: {
    team_member_id: "TM_ALEX",
    location_id: "LOC_MAIN",
    job_id: "JOB_BARISTA",
    start_at: "2026-08-21T09:00:00-07:00",
    end_at: "2026-08-21T17:00:00-07:00",
    timezone: "America/Los_Angeles",
    is_deleted: false
  },
  updated_at: "2026-08-20T12:00:00Z",
  version: 3
};

const coworkerShift = {
  id: "SHIFT_B",
  published_shift_details: {
    team_member_id: "TM_CASEY",
    location_id: "LOC_MAIN",
    job_id: "JOB_LEAD",
    start_at: "2026-08-21T10:00:00-07:00",
    end_at: "2026-08-21T18:00:00-07:00",
    timezone: "America/Los_Angeles",
    is_deleted: false
  },
  updated_at: "2026-08-20T12:00:00Z",
  version: 1
};

const input = {
  calendarName: "Alex Work",
  coworkerShifts: [primaryShift, coworkerShift],
  jobs: [
    { id: "JOB_BARISTA", title: "Barista" },
    { id: "JOB_LEAD", title: "Shift Lead" }
  ],
  locations: [{ id: "LOC_MAIN", name: "Main Street" }],
  shifts: [primaryShift],
  teamMembers: [
    { id: "TM_ALEX", given_name: "Alex", family_name: "Rivera" },
    { id: "TM_CASEY", given_name: "Casey", family_name: "Ng" }
  ]
};

test("calendar output includes stable identity and coworker context", () => {
  const calendar = buildSquareShiftCalendar(input);

  assert.match(calendar.body, /^BEGIN:VCALENDAR\r\n/);
  assert.match(calendar.body, /UID:SHIFT_A-TM_ALEX@square-calendar-sync\.slpcc63\.com/);
  assert.match(calendar.body, /SUMMARY:Alex Rivera shift as Barista with Casey Ng \(Shift Lead\)/);
  assert.match(calendar.body, /LOCATION:Main Street/);
  assert.match(calendar.body, /SEQUENCE:3/);
  assert.equal(buildSquareShiftCalendar(input).etag, calendar.etag);
});

test("deleted published details are excluded", () => {
  const deleted = {
    ...primaryShift,
    published_shift_details: { ...primaryShift.published_shift_details, is_deleted: true }
  };
  const calendar = buildSquareShiftCalendar({ ...input, shifts: [deleted] });

  assert.doesNotMatch(calendar.body, /BEGIN:VEVENT/);
});
