// The app's installed extensions, one entry per product. Shared code reads product facts from here
// instead of writing "if this product … else that product". Adding a product = add its entry here.
//
// Both entries live in this one app-level file on purpose: each product runtime imports this file,
// and a per-product file under products/<id>/ would pull the other product's code into its import
// graph (tests/product-runtime-isolation.test.mts). When Sentinel and Cadence become separate apps
// (PLAN 3.2 / 4.2), each app builds its own registry containing only its own entry.
import { createExtensionRegistry, type ExtensionDefinition } from "../packages/runtime-kit/registry.ts";

// Values must match products/<technicalId>/product.json (checked by tests/extension-registry.test.mts).
const calendarSyncExtension = {
  technicalId: "calendar-sync",
  displayName: "Cadence",
  productSlug: "square-calendar-sink",
  homePath: "/calendar-sink",
  environmentPrefix: "CALENDAR_SYNC",
  connections: {
    square: {
      defaultScopes: ["MERCHANT_PROFILE_READ", "TIMECARDS_READ", "EMPLOYEES_READ"],
      legacyUnprefixedSettings: true,
      legacyRedirectUri: "https://hosted-saas.vercel.app/api/integrations/square/callback"
    }
  }
} as const satisfies ExtensionDefinition;

const timeCardManagerExtension = {
  technicalId: "time-card-manager",
  displayName: "Sentinel",
  productSlug: "square-time-card-manager",
  homePath: "/time-card-manager",
  environmentPrefix: "TIME_CARD_MANAGER",
  connections: {
    square: {
      defaultScopes: ["MERCHANT_PROFILE_READ", "TIMECARDS_READ", "TIMECARDS_WRITE", "EMPLOYEES_READ"]
    }
  }
} as const satisfies ExtensionDefinition;

export const extensionRegistry = createExtensionRegistry([
  calendarSyncExtension,
  timeCardManagerExtension
]);

export type InstalledExtension = (typeof extensionRegistry.definitions)[number];
export type InstalledExtensionId = InstalledExtension["technicalId"];
export type InstalledProductSlug = InstalledExtension["productSlug"];
