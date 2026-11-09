import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";

import { selectDatabaseUrl } from "../lib/database-url.ts";
import { getProductRuntime } from "../lib/product-runtime.ts";
import { computePublicRouting } from "../lib/public-routing.ts";
import {
  getSquareProductEnvironmentValue,
  getSquareProductRedirectUri
} from "../lib/square-product-config.ts";

const root = resolve(import.meta.dirname, "..");
const sourceExtensions = [".ts", ".tsx", ".mts", ".js", ".jsx"];

function sourceFiles(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = resolve(path, entry.name);
    return entry.isDirectory()
      ? sourceFiles(child)
      : sourceExtensions.includes(extname(entry.name)) ? [child] : [];
  });
}

function resolveSource(specifier: string, importer: string) {
  if (!specifier.startsWith("@/") && !specifier.startsWith(".")) return null;
  const base = specifier.startsWith("@/")
    ? resolve(root, specifier.slice(2))
    : resolve(dirname(importer), specifier);
  const candidates = [
    base,
    ...sourceExtensions.map((extension) => `${base}${extension}`),
    ...sourceExtensions.map((extension) => resolve(base, `index${extension}`))
  ];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
}

function transitiveSourceGraph(product: "calendar-sync" | "time-card-manager") {
  const queue = sourceFiles(resolve(root, "products", product, "app"));
  const visited = new Set<string>();
  const importPattern = /(?:from\s+|import\s*\()(["'])([^"']+)\1/g;

  while (queue.length) {
    const file = queue.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(importPattern)) {
      const dependency = resolveSource(match[2], file);
      if (dependency && !visited.has(dependency)) queue.push(dependency);
    }
  }

  return [...visited].map((path) => path.slice(root.length + 1));
}

test("Cadence transitive application graph excludes Sentinel runtime and routes", () => {
  const graph = transitiveSourceGraph("calendar-sync");
  assert.ok(graph.includes("lib/square-calendar-sink.ts"));
  assert.equal(graph.some((path) => /time-card|square-time-card-manager/.test(path)), false,
    `Cadence graph crossed into Sentinel:\n${graph.filter((path) => /time-card|square-time-card-manager/.test(path)).join("\n")}`);
});

test("Sentinel transitive application graph excludes Cadence runtime and routes", () => {
  const graph = transitiveSourceGraph("time-card-manager");
  assert.ok(graph.includes("lib/square-time-card-manager.ts"));
  assert.equal(graph.some((path) => /calendar-sink|square-calendar/.test(path)), false,
    `Sentinel graph crossed into Cadence:\n${graph.filter((path) => /calendar-sink|square-calendar/.test(path)).join("\n")}`);
});

test("product runtime database selection requires only its owned URL", () => {
  assert.equal(getProductRuntime({ SLPCC63_PRODUCT_RUNTIME: "calendar-sync" }), "calendar-sync");
  assert.equal(selectDatabaseUrl({
    SLPCC63_PRODUCT_RUNTIME: "calendar-sync",
    CALENDAR_SYNC_DATABASE_URL: "postgresql://calendar-owned",
    TIME_CARD_MANAGER_DATABASE_URL: "postgresql://sentinel-forbidden"
  }), "postgresql://calendar-owned");
  assert.equal(selectDatabaseUrl({
    SLPCC63_PRODUCT_RUNTIME: "time-card-manager",
    CALENDAR_SYNC_DATABASE_URL: "postgresql://calendar-forbidden",
    TIME_CARD_MANAGER_DATABASE_URL: "postgresql://sentinel-owned"
  }), "postgresql://sentinel-owned");
  assert.throws(() => selectDatabaseUrl({
    SLPCC63_PRODUCT_RUNTIME: "calendar-sync",
    TIME_CARD_MANAGER_DATABASE_URL: "postgresql://sentinel-only"
  }), /CALENDAR_SYNC_DATABASE_URL is required/);
  assert.throws(() => selectDatabaseUrl({
    SLPCC63_PRODUCT_RUNTIME: "time-card-manager",
    CALENDAR_SYNC_DATABASE_URL: "postgresql://calendar-only"
  }), /TIME_CARD_MANAGER_DATABASE_URL is required/);
});

test("each OAuth application route is fixed to one installer and plugin ID", () => {
  const calendarRoutes = sourceFiles(resolve(root, "products/calendar-sync/app/api/integrations/square"))
    .map((path) => readFileSync(path, "utf8")).join("\n");
  const timeCardRoutes = sourceFiles(resolve(root, "products/time-card-manager/app/api/integrations/square"))
    .map((path) => readFileSync(path, "utf8")).join("\n");

  assert.match(calendarRoutes, /square-calendar-sink/);
  assert.match(calendarRoutes, /installSquareCalendarSink/);
  assert.doesNotMatch(calendarRoutes, /square-time-card-manager|installSquareTimeCardManager/);
  assert.match(timeCardRoutes, /square-time-card-manager/);
  assert.match(timeCardRoutes, /installSquareTimeCardManager/);
  assert.doesNotMatch(timeCardRoutes, /square-calendar-sink|installSquareCalendarSink/);
});

test("shared identity package is side-effect-free and contains no product/provider ownership", () => {
  const source = readFileSync(resolve(root, "packages/shared-identity/index.ts"), "utf8");
  const manifest = JSON.parse(readFileSync(resolve(root, "packages/shared-identity/package.json"), "utf8"));
  assert.equal(manifest.sideEffects, false);
  assert.doesNotMatch(source, /process\.env|square|database|calendar|time.card/i);
  assert.match(source, /authUserId/);
  assert.match(source, /customerProfileId/);
});

test("Cadence routing keeps sign-in and post-auth destinations inside Cadence", () => {
  const routing = computePublicRouting({
    appHost: false,
    hostname: "cadence.localhost",
    preview: false,
    productRuntime: "calendar-sync",
    timeCardManagerQaHost: false
  });
  assert.equal(routing.appHost, true);
  assert.equal(routing.appHomePath, "/calendar-sink");
  assert.equal(routing.dashboardPath, "/calendar-sink");
  assert.equal(routing.signInPath, "/sign-in?next=%2Fcalendar-sink");
});

test("Sentinel routing keeps sign-in and post-auth destinations inside Sentinel", () => {
  const routing = computePublicRouting({
    appHost: false,
    hostname: "sentinel.localhost",
    preview: false,
    productRuntime: "time-card-manager",
    timeCardManagerQaHost: false
  });
  assert.equal(routing.appHost, true);
  assert.equal(routing.appHomePath, "/time-card-manager");
  assert.equal(routing.dashboardPath, "/time-card-manager");
  assert.equal(routing.signInPath, "/sign-in?next=%2Ftime-card-manager");
});

test("product roots preserve every legacy product-owned /app path", () => {
  const expected = [
    "products/calendar-sync/app/app/calendar-sink/page.tsx",
    "products/calendar-sync/app/app/calendar-sink/subscribe/[token]/page.tsx",
    "products/calendar-sync/app/app/reset-password/page.tsx",
    "products/time-card-manager/app/app/time-card-manager/page.tsx",
    "products/time-card-manager/app/app/time-card-manager/responses/page.tsx",
    "products/time-card-manager/app/app/time-card-response/[token]/page.tsx",
    "products/time-card-manager/app/app/time-card-digest/[token]/page.tsx",
    "products/time-card-manager/app/app/reset-password/page.tsx"
  ];
  assert.equal(expected.every((path) => existsSync(resolve(root, path))), true);
});

test("independent runtimes fail closed instead of reading legacy or other-product Square settings", () => {
  const calendarEnvironment = {
    SLPCC63_PRODUCT_RUNTIME: "calendar-sync",
    SQUARE_APPLICATION_ID: "legacy-id",
    SQUARE_APPLICATION_SECRET: "legacy-secret",
    SQUARE_REDIRECT_URI: "https://legacy.invalid/callback",
    TIME_CARD_MANAGER_SQUARE_APPLICATION_ID: "other-product-id"
  };
  assert.equal(
    getSquareProductEnvironmentValue("square-calendar-sink", "APPLICATION_ID", calendarEnvironment),
    ""
  );
  assert.equal(getSquareProductRedirectUri("square-calendar-sink", calendarEnvironment), "");
  assert.throws(
    () => getSquareProductEnvironmentValue("square-time-card-manager", "APPLICATION_ID", calendarEnvironment),
    /cannot access/
  );

  const sentinelEnvironment = {
    SLPCC63_PRODUCT_RUNTIME: "time-card-manager",
    SQUARE_APPLICATION_ID: "legacy-id",
    CALENDAR_SYNC_SQUARE_APPLICATION_ID: "other-product-id"
  };
  assert.equal(
    getSquareProductEnvironmentValue("square-time-card-manager", "APPLICATION_ID", sentinelEnvironment),
    ""
  );
  assert.throws(
    () => getSquareProductEnvironmentValue("square-calendar-sink", "APPLICATION_ID", sentinelEnvironment),
    /cannot access/
  );
});

test("legacy shared root alone retains the historical Calendar Square fallback", () => {
  const legacyEnvironment = {
    SQUARE_APPLICATION_ID: "legacy-id",
    SQUARE_REDIRECT_URI: "https://legacy.invalid/callback"
  };
  assert.equal(
    getSquareProductEnvironmentValue("square-calendar-sink", "APPLICATION_ID", legacyEnvironment),
    "legacy-id"
  );
  assert.equal(
    getSquareProductRedirectUri("square-calendar-sink", legacyEnvironment),
    "https://legacy.invalid/callback"
  );
});

test("default selectors use the direct runtime marker while explicit environments stay injectable", () => {
  const previousRuntime = process.env.SLPCC63_PRODUCT_RUNTIME;
  const previousCalendarDatabase = process.env.CALENDAR_SYNC_DATABASE_URL;
  const previousLegacyDatabase = process.env.DATABASE_URL;
  const previousCalendarSquareId = process.env.CALENDAR_SYNC_SQUARE_APPLICATION_ID;
  const previousLegacySquareId = process.env.SQUARE_APPLICATION_ID;

  try {
    process.env.SLPCC63_PRODUCT_RUNTIME = "calendar-sync";
    process.env.CALENDAR_SYNC_DATABASE_URL = "postgresql://direct-calendar";
    process.env.DATABASE_URL = "postgresql://legacy-forbidden";
    process.env.CALENDAR_SYNC_SQUARE_APPLICATION_ID = "direct-calendar-id";
    process.env.SQUARE_APPLICATION_ID = "legacy-forbidden-id";
    assert.equal(selectDatabaseUrl(), "postgresql://direct-calendar");
    assert.equal(
      getSquareProductEnvironmentValue("square-calendar-sink", "APPLICATION_ID"),
      "direct-calendar-id"
    );
    assert.throws(
      () => getSquareProductEnvironmentValue("square-time-card-manager", "APPLICATION_ID"),
      /cannot access/
    );
  } finally {
    if (previousRuntime === undefined) delete process.env.SLPCC63_PRODUCT_RUNTIME;
    else process.env.SLPCC63_PRODUCT_RUNTIME = previousRuntime;
    if (previousCalendarDatabase === undefined) delete process.env.CALENDAR_SYNC_DATABASE_URL;
    else process.env.CALENDAR_SYNC_DATABASE_URL = previousCalendarDatabase;
    if (previousLegacyDatabase === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousLegacyDatabase;
    if (previousCalendarSquareId === undefined) delete process.env.CALENDAR_SYNC_SQUARE_APPLICATION_ID;
    else process.env.CALENDAR_SYNC_SQUARE_APPLICATION_ID = previousCalendarSquareId;
    if (previousLegacySquareId === undefined) delete process.env.SQUARE_APPLICATION_ID;
    else process.env.SQUARE_APPLICATION_ID = previousLegacySquareId;
  }
});
