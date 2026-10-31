import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getCalendarSinkAccessState } from "../lib/calendar-sink-access.ts";
import { getCalendarSinkDeliveryPlan } from "../lib/calendar-sink-delivery-plan.ts";
import { getCalendarSinkEmailIdempotencyKey } from "../lib/calendar-sink-delivery-identity.ts";
import { getCalendarSinkReplyToEmail } from "../lib/calendar-sink-email.ts";
import { getPrivateCalendarCacheHeaders } from "../lib/calendar-sink-cache.ts";
import { copyTextToClipboard } from "../lib/copy-to-clipboard.ts";
import { buildSquareShiftCalendar } from "../lib/icalendar.ts";
import { collectSquarePages } from "../lib/square-pagination.ts";
import {
  classifySquareRevocationResponse,
  disconnectSquareAuthorization
} from "../lib/square-disconnect.ts";
import {
  decryptSquareToken,
  encryptSquareConnectionTokens,
  encryptSquareToken,
  SquareTokenEncryptionError
} from "../lib/square-token-crypto.ts";

const encryptionKey = Buffer.alloc(32, 7).toString("base64");

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

const secondCoworkerShift = {
  id: "SHIFT_C",
  published_shift_details: {
    team_member_id: "TM_JORDAN",
    location_id: "LOC_MAIN",
    job_id: "JOB_CASHIER",
    start_at: "2026-08-21T11:00:00-07:00",
    end_at: "2026-08-21T15:00:00-07:00",
    timezone: "America/Los_Angeles",
    is_deleted: false
  },
  updated_at: "2026-08-20T12:00:00Z",
  version: 1
};

const input = {
  calendarName: "Alex Work",
  coworkerShifts: [primaryShift, coworkerShift, secondCoworkerShift],
  jobs: [
    { id: "JOB_BARISTA", title: "Barista" },
    { id: "JOB_LEAD", title: "Shift Lead" },
    { id: "JOB_CASHIER", title: "Cashier" }
  ],
  locations: [{ id: "LOC_MAIN", name: "Main Street" }],
  shifts: [primaryShift],
  teamMembers: [
    { id: "TM_ALEX", given_name: "Alex", family_name: "Rivera" },
    { id: "TM_CASEY", given_name: "Casey", family_name: "Ng" },
    { id: "TM_JORDAN", given_name: "Jordan", family_name: "Lee" }
  ]
};

test("calendar output includes stable identity and coworker context", () => {
  const calendar = buildSquareShiftCalendar(input);
  const unfoldedCalendar = calendar.body.replaceAll("\r\n ", "");

  assert.match(calendar.body, /^BEGIN:VCALENDAR\r\n/);
  assert.match(calendar.body, /UID:SHIFT_A-TM_ALEX@square-calendar-sync\.slpcc63\.com/);
  assert.match(
    unfoldedCalendar,
    /SUMMARY:Alex Rivera shift as Barista with Casey Ng \(Shift Lead\) and Jordan Lee \(Cashier\)/
  );
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

test("Square pagination follows cursors and combines every page", async () => {
  const requestedCursors: Array<string | undefined> = [];
  const items = await collectSquarePages(async (cursor) => {
    requestedCursors.push(cursor);

    if (!cursor) {
      return { cursor: "page-2", items: ["SHIFT_A", "SHIFT_B"] };
    }

    return { items: ["SHIFT_C"] };
  });

  assert.deepEqual(requestedCursors, [undefined, "page-2"]);
  assert.deepEqual(items, ["SHIFT_A", "SHIFT_B", "SHIFT_C"]);
});

test("initial calendar invitation retries retain their feed idempotency identity", () => {
  assert.equal(
    getCalendarSinkEmailIdempotencyKey({
      attemptId: "ignored",
      feedId: "FEED_A",
      kind: "initial"
    }),
    "calendar-sink-created-FEED_A"
  );
});

test("each resend attempt receives a new idempotency identity", () => {
  const first = getCalendarSinkEmailIdempotencyKey({
    attemptId: "ATTEMPT_A",
    feedId: "FEED_A",
    kind: "resend"
  });
  const second = getCalendarSinkEmailIdempotencyKey({
    attemptId: "ATTEMPT_B",
    feedId: "FEED_A",
    kind: "resend"
  });

  assert.equal(first, "calendar-sink-resend-FEED_A-ATTEMPT_A");
  assert.equal(second, "calendar-sink-resend-FEED_A-ATTEMPT_B");
  assert.notEqual(first, second);
});

test("Calendar Sync replies use product support rather than the manager login", () => {
  assert.equal(
    getCalendarSinkReplyToEmail({
      CALENDAR_SINK_REPLY_TO_EMAIL: " Calendar-Sync@SLPCC63.com ",
      NEXT_PUBLIC_SUPPORT_EMAIL: "support@slpcc63.com"
    }),
    "calendar-sync@slpcc63.com"
  );
  assert.equal(
    getCalendarSinkReplyToEmail({ NEXT_PUBLIC_SUPPORT_EMAIL: " Support@SLPCC63.com " }),
    "support@slpcc63.com"
  );
});

test("copy controls fall back when Clipboard API permission is denied", async () => {
  let fallbackValue = "";

  await copyTextToClipboard("private-calendar-url", {
    legacyCopy: (value) => {
      fallbackValue = value;
      return true;
    },
    writeText: async () => {
      throw new Error("permission denied");
    }
  });

  assert.equal(fallbackValue, "private-calendar-url");
  await assert.rejects(
    copyTextToClipboard("private-calendar-url", {
      legacyCopy: () => false,
      writeText: async () => {
        throw new Error("permission denied");
      }
    }),
    /Clipboard access is unavailable/
  );
});

test("Square OAuth tokens use authenticated versioned encryption", () => {
  const encrypted = encryptSquareToken({
    customerId: "CUSTOMER_A",
    encodedKey: encryptionKey,
    token: "test-access-value",
    tokenKind: "access"
  });

  assert.match(encrypted, /^sqtoken:v1:/);
  assert.doesNotMatch(encrypted, /test-access-value/);
  assert.deepEqual(
    decryptSquareToken({
      customerId: "CUSTOMER_A",
      encodedKey: encryptionKey,
      storedToken: encrypted,
      tokenKind: "access"
    }),
    { token: "test-access-value", needsRewrite: false }
  );
});

test("legacy Square tokens are identified and can be rewritten without outputting their values", () => {
  const legacy = decryptSquareToken({
    customerId: "CUSTOMER_A",
    encodedKey: encryptionKey,
    storedToken: "legacy-test-value",
    tokenKind: "refresh"
  });
  const rewritten = encryptSquareToken({
    customerId: "CUSTOMER_A",
    encodedKey: encryptionKey,
    token: legacy.token,
    tokenKind: "refresh"
  });

  assert.equal(legacy.needsRewrite, true);
  assert.match(rewritten, /^sqtoken:v1:/);
  assert.doesNotMatch(rewritten, /legacy-test-value/);
});

test("refreshed Square access and refresh tokens are both prepared for encrypted persistence", () => {
  const encrypted = encryptSquareConnectionTokens({
    accessToken: "refreshed-access-value",
    customerId: "CUSTOMER_A",
    encodedKey: encryptionKey,
    refreshToken: "refreshed-refresh-value"
  });

  assert.match(encrypted.accessToken, /^sqtoken:v1:/);
  assert.match(encrypted.refreshToken, /^sqtoken:v1:/);
  assert.doesNotMatch(JSON.stringify(encrypted), /refreshed-(access|refresh)-value/);
});

test("invalid Square ciphertext and a missing encryption key fail without exposing token material", () => {
  assert.throws(
    () => decryptSquareToken({
      customerId: "CUSTOMER_A",
      encodedKey: encryptionKey,
      storedToken: "sqtoken:v1:invalid:invalid:invalid",
      tokenKind: "access"
    }),
    (error: unknown) => error instanceof SquareTokenEncryptionError &&
      error.message === "Square token ciphertext is invalid."
  );
  assert.throws(
    () => encryptSquareToken({
      customerId: "CUSTOMER_A",
      encodedKey: "",
      token: "test-secret-value",
      tokenKind: "access"
    }),
    (error: unknown) => error instanceof SquareTokenEncryptionError &&
      error.message === "Square token encryption key is not configured."
  );
  assert.throws(
    () => decryptSquareToken({
      customerId: "CUSTOMER_A",
      encodedKey: encryptionKey,
      storedToken: "sqtoken:v2:future-envelope",
      tokenKind: "access"
    }),
    (error: unknown) => error instanceof SquareTokenEncryptionError &&
      error.message === "Square token ciphertext version is unsupported."
  );
});

test("Square disconnect finalizes locally only after revocation is accepted", async () => {
  const events: string[] = [];
  const result = await disconnectSquareAuthorization({
    getConnection: async () => ({ id: "CONNECTION_A", accessToken: "test-access-value" }),
    revokeAccess: async () => {
      events.push("revoked");
      return "already_inactive";
    },
    finalizeLocalDisconnect: async (connectionId) => {
      events.push(`finalized:${connectionId}`);
    }
  });

  assert.equal(result, "already_disconnected");
  assert.deepEqual(events, ["revoked", "finalized:CONNECTION_A"]);

  await assert.rejects(
    disconnectSquareAuthorization({
      getConnection: async () => ({ id: "CONNECTION_B", accessToken: "test-access-value" }),
      revokeAccess: async () => { throw new Error("revocation unavailable"); },
      finalizeLocalDisconnect: async () => { events.push("must-not-finalize"); }
    })
  );
  assert.doesNotMatch(events.join(","), /must-not-finalize/);
});

test("private calendar responses disable browser and shared CDN caching", () => {
  const headers = getPrivateCalendarCacheHeaders();
  const serialized = JSON.stringify(headers);

  assert.equal(headers["Cache-Control"], "private, no-store, max-age=0");
  assert.equal(headers["CDN-Cache-Control"], "no-store");
  assert.equal(headers["Vercel-CDN-Cache-Control"], "no-store");
  assert.doesNotMatch(serialized, /public|s-maxage|stale-while-revalidate/);
});

test("calendar delivery planning covers initial email, manual delivery, and missing email", () => {
  assert.deepEqual(
    getCalendarSinkDeliveryPlan({
      emailAddress: " Employee@Example.com ",
      feedToken: "FEED_A",
      mode: "email",
      setupBaseUrl: "https://app.example.test/calendar-sink/subscribe/"
    }),
    {
      channel: "email",
      recipient: "employee@example.com",
      setupUrl: "https://app.example.test/calendar-sink/subscribe/FEED_A",
      status: "ready"
    }
  );
  assert.equal(
    getCalendarSinkDeliveryPlan({
      feedToken: "FEED_A",
      mode: "email",
      setupBaseUrl: "https://app.example.test/calendar-sink/subscribe"
    }).status,
    "needs_contact"
  );
  assert.equal(
    getCalendarSinkDeliveryPlan({
      emailAddress: "employee@example.com",
      feedToken: "FEED_A",
      mode: "manual",
      setupBaseUrl: "https://app.example.test/calendar-sink/subscribe"
    }).status,
    "manual"
  );
});

test("paused, deleted, and rotated-away feeds are unavailable", () => {
  assert.equal(getCalendarSinkAccessState({ enabled: true }), "active");
  assert.equal(getCalendarSinkAccessState({ enabled: false }), "paused");
  assert.equal(getCalendarSinkAccessState(null), "not_found");
});

test("Square revocation treats revoked and invalid credentials as safe terminal results", () => {
  assert.equal(
    classifySquareRevocationResponse({ ok: true, status: 200, success: true }),
    "revoked"
  );
  assert.equal(
    classifySquareRevocationResponse({
      errorCodes: ["ACCESS_TOKEN_REVOKED"],
      ok: false,
      status: 400
    }),
    "already_inactive"
  );
  assert.equal(
    classifySquareRevocationResponse({ ok: false, status: 401 }),
    "already_inactive"
  );
  assert.equal(
    classifySquareRevocationResponse({ ok: false, status: 500 }),
    null
  );
});

test("employee setup page keeps accurate Apple and Google actions and paused wording", async () => {
  const pageSource = await readFile(
    new URL("../app/app/calendar-sink/subscribe/[token]/page.tsx", import.meta.url),
    "utf8"
  );

  assert.match(pageSource, /Add to Apple Calendar/);
  assert.match(pageSource, /Use a computer browser/);
  assert.match(pageSource, /Other calendars → From URL/);
  assert.match(pageSource, /This calendar is paused/);
  assert.match(pageSource, /No SLPCC63\s*account or sign-in is required/);
});

test("Calendar Sync initializes customer profiles before its foreign-key tables", async () => {
  const source = await readFile(
    new URL("../lib/square-calendar-sink.ts", import.meta.url),
    "utf8"
  );
  const initializerStart = source.indexOf(
    "export async function ensureSquareCalendarSinkSettingsTable()"
  );
  const customerProfilesCall = source.indexOf(
    "await ensureCustomerProfilesTable();",
    initializerStart
  );
  const calendarTablesCall = source.indexOf("settingsTableReady = db.query", initializerStart);

  assert.ok(initializerStart >= 0);
  assert.ok(customerProfilesCall > initializerStart);
  assert.ok(calendarTablesCall > customerProfilesCall);
});
