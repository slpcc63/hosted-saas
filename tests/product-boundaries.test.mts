import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

type ProductContract = {
  technicalId: string;
  ownedPluginId: string;
  currentRuntimeStatus: string;
  runtimeModules: string[];
  requiredEnvironment: string[];
  forbiddenEnvironment: string[];
  sharedIdentityContract: string[];
};

function readContract(product: "calendar-sync" | "time-card-manager") {
  return JSON.parse(
    readFileSync(resolve(root, "products", product, "product.json"), "utf8")
  ) as ProductContract;
}

function buildContract(product: "calendar-sync" | "time-card-manager") {
  const productRoot = resolve(root, "products", product);
  rmSync(resolve(productRoot, ".build"), { recursive: true, force: true });
  execFileSync("npm", ["run", "build:contract"], {
    cwd: productRoot,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? ""
    },
    stdio: "pipe"
  });
  return JSON.parse(
    readFileSync(resolve(productRoot, ".build", "product-manifest.json"), "utf8")
  ) as { buildKind: string; claim: string; currentRuntimeStatus: string; contract: ProductContract };
}

test("Calendar Sync contract-consistency manifest excludes Time Card Manager declarations", () => {
  const manifest = buildContract("calendar-sync");
  assert.equal(manifest.buildKind, "local-product-boundary-contract");
  assert.equal(manifest.contract.ownedPluginId, "square-calendar-sink");
  assert.equal(manifest.currentRuntimeStatus, "independent-local-build-root");
  assert.ok(manifest.contract.runtimeModules.every((path) => !path.includes("time-card")));
  assert.ok(manifest.contract.requiredEnvironment.every((key) => !key.startsWith("TIME_CARD_MANAGER_")));
  assert.match(manifest.claim, /not a standalone Next\.js deployment/);
});

test("Time Card Manager contract-consistency manifest excludes Calendar Sync declarations", () => {
  const manifest = buildContract("time-card-manager");
  assert.equal(manifest.buildKind, "local-product-boundary-contract");
  assert.equal(manifest.contract.ownedPluginId, "square-time-card-manager");
  assert.equal(manifest.currentRuntimeStatus, "independent-local-build-root");
  assert.ok(manifest.contract.runtimeModules.every((path) => !path.includes("calendar")));
  assert.ok(manifest.contract.requiredEnvironment.every((key) => !key.startsWith("CALENDAR_SYNC_")));
  assert.match(manifest.claim, /not a standalone Next\.js deployment/);
});

test("product contracts share identity only and own disjoint provider configuration", () => {
  const calendar = readContract("calendar-sync");
  const timeCard = readContract("time-card-manager");
  assert.deepEqual(calendar.sharedIdentityContract, timeCard.sharedIdentityContract);
  assert.deepEqual(calendar.sharedIdentityContract, [
    "auth_user_id",
    "customer_profile_id",
    "display_name",
    "email"
  ]);
  assert.equal(
    calendar.requiredEnvironment.filter((key) => timeCard.requiredEnvironment.includes(key)).length,
    0
  );
  assert.ok(calendar.forbiddenEnvironment.includes("TIME_CARD_MANAGER_SQUARE_APPLICATION_SECRET"));
  assert.ok(timeCard.forbiddenEnvironment.includes("CALENDAR_SYNC_SQUARE_APPLICATION_SECRET"));
});
