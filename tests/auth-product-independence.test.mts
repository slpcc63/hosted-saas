import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const authAndIdentityFiles = [
  "lib/auth.ts",
  "lib/auth-password-config.ts",
  "lib/auth-provider-config.ts",
  "lib/auth-recovery-content.ts",
  "lib/auth-recovery.ts",
  "lib/auth-redirect.ts",
  "lib/google-sign-in.ts",
  "lib/customer-profile-initialization.ts",
  "lib/customers.ts"
];

async function readSources(paths: string[]) {
  return Promise.all(
    paths.map(async (path) => ({
      path,
      source: await readFile(new URL(`../${path}`, import.meta.url), "utf8")
    }))
  );
}

test("shared authentication and customer identity do not depend on either Square product", async () => {
  const sources = await readSources(authAndIdentityFiles);
  const forbiddenProductAuthorization = [
    /CALENDAR_SYNC_SQUARE_/,
    /TIME_CARD_MANAGER_SQUARE_/,
    /SQUARE_APPLICATION_(?:ID|SECRET)/,
    /square-calendar-sink/,
    /square-time-card-manager/,
    /@\/lib\/square/,
    /@\/lib\/products/,
    /@\/lib\/stripe/,
    /subscription/i,
    /plugin_installation/i
  ];

  for (const { path, source } of sources) {
    for (const pattern of forbiddenProductAuthorization) {
      assert.doesNotMatch(
        source,
        pattern,
        `${path} must not acquire product authorization or installation dependencies`
      );
    }
  }
});

test("the auth-only candidate retains production origin and database selection", async () => {
  const [{ source: deployment }, { source: database }] = await readSources([
    "lib/deployment.ts",
    "lib/db.ts"
  ]);

  assert.match(deployment, /NEXT_PUBLIC_APP_URL/);
  assert.match(deployment, /NEXT_PUBLIC_MARKETING_SITE_URL/);
  assert.doesNotMatch(deployment, /TCM_QA_|CALENDAR_SYNC_|TIME_CARD_MANAGER_/);

  assert.match(database, /process\.env\.DATABASE_URL/);
  assert.match(database, /process\.env\.DATABASE_URL_UNPOOLED/);
  assert.doesNotMatch(database, /TCM_QA_DATABASE_URL/);
});

test("protected product pages consume shared identity without cross-product fallback arguments", async () => {
  const callsites = await readSources([
    "app/app/calendar-sink/actions.ts",
    "app/app/calendar-sink/manager-page.tsx",
    "app/app/time-card-manager/page.tsx",
    "app/app/time-card-manager/responses/page.tsx"
  ]);

  for (const { path, source } of callsites) {
    assert.match(source, /requireCurrentCustomer\(/, `${path} should require shared identity`);
    assert.doesNotMatch(
      source,
      /requireCurrentCustomer\([^)]*,/,
      `${path} must not redirect through or depend on the other product`
    );
  }
});
