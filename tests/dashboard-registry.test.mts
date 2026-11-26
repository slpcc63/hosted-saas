import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildTimeCardManagerDashboardSummary } from "../lib/square-time-card-manager-dashboard-summary.ts";

const base = {
  settings: { notificationMode: "email_and_text" },
  delivery: { effectiveMode: "text_first", textsRemaining: 42 },
  senderProfile: { fromEmail: "notify@slpcc63.com" }
};
const appPath = (path: string) => `/app${path}`;

test("dashboard page imports no extension code, only the provider list", () => {
  const page = readFileSync(new URL("../app/app/dashboard/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /square-time-card-manager|square-calendar-sink|getTimeCardManagerOverview/);
  assert.match(page, /from "\.\/providers"/);
});

test("Sentinel card without a plan keeps its old wording", () => {
  const summary = buildTimeCardManagerDashboardSummary({
    ...base, entitlement: null, currentUsage: null, textingLive: false, automationLive: false, nextRunLabel: null, alertMessage: null
  } as never, { appPath });

  assert.equal(summary.alert, undefined);
  assert.deepEqual(summary.headlineStats, [
    { label: "Subscriptions", value: "No time card plan yet" },
    { label: "Billing", value: "No text usage yet" }
  ]);
  assert.equal(summary.card.title, "Square Time Card Manager");
  assert.equal(summary.card.description, "Subscribe first to unlock time card notification controls.");
  assert.equal(summary.card.statusLabel, "email live");
  assert.deepEqual(summary.card.stats, []);
  assert.deepEqual(summary.card.actions, [{ label: "Subscribe to Time Card Manager", href: "/app/subscriptions", primary: true }]);
});

test("Sentinel card with a plan keeps its figures, next-run wording and links", () => {
  const summary = buildTimeCardManagerDashboardSummary({
    ...base,
    entitlement: { packageName: "Scale", monthlyTextLimit: 500 },
    currentUsage: { textsSentCount: 12 },
    textingLive: true,
    automationLive: false,
    nextRunLabel: "Wed 6:00 AM",
    alertMessage: "Text limit reached."
  } as never, { appPath: (path) => path });

  assert.deepEqual(summary.alert, {
    title: "Time card texting paused",
    message: "Text limit reached.",
    action: { label: "Manage subscription", href: "/subscriptions" }
  });
  assert.deepEqual(summary.headlineStats, [
    { label: "Subscriptions", value: "Scale" },
    { label: "Billing", value: "12/500 texts used" }
  ]);
  assert.equal(summary.card.description, "Configured mode: email and text");
  assert.equal(summary.card.statusLabel, "text first");
  assert.deepEqual(summary.card.stats, [
    { label: "Package", value: "Scale" },
    { label: "Texts left", value: "42" },
    { label: "Next run", value: "Wed 6:00 AM (cron setup needed)" },
    { label: "Email sender", value: "notify@slpcc63.com" }
  ]);
  assert.deepEqual(summary.card.actions, [
    { label: "Manage time card settings", href: "/time-card-manager", primary: true },
    { label: "Manage subscription", href: "/subscriptions" }
  ]);
});
