import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { createExtensionRegistry, type ExtensionDefinition } from "../packages/runtime-kit/registry.ts";
import { extensionRegistry } from "../lib/extension-registry.ts";
import { getProductEnvironmentPrefix, productRuntimeIds } from "../lib/product-runtime.ts";
import { computePublicRouting } from "../lib/public-routing.ts";
import {
  getRuntimePluginId,
  getSquareProductEnvironmentValue,
  getSquareProductRedirectUri
} from "../lib/square-product-config.ts";

const root = resolve(import.meta.dirname, "..");

// PLAN 2.7: these are the values the code hardcoded before the registry. They must not change.
const before = {
  "calendar-sync": {
    pluginId: "square-calendar-sink",
    prefix: "CALENDAR_SYNC",
    homePath: "/calendar-sink",
    scopes: ["MERCHANT_PROFILE_READ", "TIMECARDS_READ", "EMPLOYEES_READ"]
  },
  "time-card-manager": {
    pluginId: "square-time-card-manager",
    prefix: "TIME_CARD_MANAGER",
    homePath: "/time-card-manager",
    scopes: ["MERCHANT_PROFILE_READ", "TIMECARDS_READ", "TIMECARDS_WRITE", "EMPLOYEES_READ"]
  }
} as const;

test("the registry lists exactly the two runtimes the code knew before", () => {
  assert.deepEqual([...productRuntimeIds], ["calendar-sync", "time-card-manager"]);
});

test("registry reproduces each product's plugin id, settings prefix, home path and Square scopes", () => {
  for (const [id, expected] of Object.entries(before)) {
    const runtime = id as keyof typeof before;
    const entry: ExtensionDefinition = extensionRegistry.byTechnicalId(runtime);
    assert.equal(getRuntimePluginId(runtime), expected.pluginId, id);
    assert.equal(getProductEnvironmentPrefix(runtime), expected.prefix, id);
    assert.deepEqual([...(entry.connections?.square?.defaultScopes ?? [])], [...expected.scopes], id);
    assert.equal(
      computePublicRouting({ appHost: false, hostname: "x", preview: false, productRuntime: runtime, timeCardManagerQaHost: false }).dashboardPath,
      expected.homePath,
      id
    );
  }
});

test("product-prefixed Square settings resolve exactly as before", () => {
  const environment = {
    CALENDAR_SYNC_SQUARE_APPLICATION_ID: "cal-app",
    TIME_CARD_MANAGER_SQUARE_APPLICATION_ID: "tcm-app",
    SQUARE_APPLICATION_ID: "legacy-app",
    SQUARE_ENVIRONMENT: "sandbox"
  };

  assert.equal(getSquareProductEnvironmentValue("square-calendar-sink", "APPLICATION_ID", environment), "cal-app");
  assert.equal(getSquareProductEnvironmentValue("square-time-card-manager", "APPLICATION_ID", environment), "tcm-app");
  // Legacy unprefixed fallback: Calendar Sync only, shared-root runtime only.
  assert.equal(getSquareProductEnvironmentValue("square-calendar-sink", "ENVIRONMENT", environment), "sandbox");
  assert.equal(getSquareProductEnvironmentValue("square-time-card-manager", "ENVIRONMENT", environment), "");
  assert.equal(
    getSquareProductEnvironmentValue("square-calendar-sink", "ENVIRONMENT", { ...environment, SLPCC63_PRODUCT_RUNTIME: "calendar-sync" }),
    ""
  );
  // A product runtime still cannot read the other product's Square settings.
  assert.throws(
    () => getSquareProductEnvironmentValue("square-time-card-manager", "APPLICATION_ID", { ...environment, SLPCC63_PRODUCT_RUNTIME: "calendar-sync" }),
    /cannot access square-time-card-manager/
  );
});

test("legacy redirect URI applies to Calendar Sync on the shared root only", () => {
  assert.equal(getSquareProductRedirectUri("square-calendar-sink", {}), "https://hosted-saas.vercel.app/api/integrations/square/callback");
  assert.equal(getSquareProductRedirectUri("square-time-card-manager", {}), "");
  assert.equal(getSquareProductRedirectUri("square-calendar-sink", { SLPCC63_PRODUCT_RUNTIME: "calendar-sync" }), "");
  assert.equal(
    getSquareProductRedirectUri("square-time-card-manager", { TIME_CARD_MANAGER_SQUARE_REDIRECT_URI: "https://x/cb" }),
    "https://x/cb"
  );
});

test("each registry entry agrees with its product.json manifest", () => {
  for (const entry of extensionRegistry.definitions) {
    const manifest = JSON.parse(
      readFileSync(resolve(root, "products", entry.technicalId, "product.json"), "utf8")
    ) as { technicalId: string; displayName: string; ownedPluginId: string; requiredEnvironment: string[] };
    assert.equal(manifest.technicalId, entry.technicalId);
    assert.equal(manifest.displayName, entry.displayName);
    assert.equal(manifest.ownedPluginId, entry.productSlug);
    for (const name of manifest.requiredEnvironment) {
      assert.ok(name.startsWith(`${entry.environmentPrefix}_`), `${name} should use ${entry.environmentPrefix}_`);
    }
  }
});

test("the registry rejects duplicate ids, slugs, prefixes and bad values", () => {
  const ok = { technicalId: "a", displayName: "A", productSlug: "a-slug", homePath: "/a", environmentPrefix: "A_PRODUCT" };
  assert.doesNotThrow(() => createExtensionRegistry([ok]));
  assert.throws(() => createExtensionRegistry([ok, { ...ok, productSlug: "b", environmentPrefix: "B" }]), /id must be present and unique/);
  assert.throws(() => createExtensionRegistry([ok, { ...ok, technicalId: "b", environmentPrefix: "B" }]), /slug must be present and unique/);
  assert.throws(() => createExtensionRegistry([ok, { ...ok, technicalId: "b", productSlug: "b" }]), /prefix must be UPPER_SNAKE and unique/);
  assert.throws(() => createExtensionRegistry([{ ...ok, environmentPrefix: "lower" }]), /UPPER_SNAKE/);
  assert.throws(() => createExtensionRegistry([{ ...ok, homePath: "no-slash" }]), /home path/);
  assert.throws(() => createExtensionRegistry([{ ...ok, connections: { anyProvider: { defaultScopes: [] } } }]), /without default scopes/);
  assert.throws(() => createExtensionRegistry([ok]).byTechnicalId("missing"), /Unknown extension id/);
});

test("a product without Square fits the registry (Trace, Lens)", () => {
  const registry = createExtensionRegistry([
    { technicalId: "no-square", displayName: "No Square", productSlug: "no-square", homePath: "/no-square", environmentPrefix: "NO_SQUARE" }
  ]);
  assert.equal(registry.byProductSlug("no-square").connections, undefined);
});
