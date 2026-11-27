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
      legacyRedirectUri: "https://hosted-saas.vercel.app/api/integrations/square/callback",
      // The pre-split Square connection row (no product id) is Calendar Sync's.
      ownsLegacySharedConnection: true
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
  },
  // qa.tcm.slpcc63.com: the integration/v1 QA deployment opens straight into Sentinel.
  qa: {
    hostSetting: "TCM_QA_HOST",
    appOriginSetting: "TCM_QA_APP_ORIGIN",
    databaseUrlSetting: "TCM_QA_DATABASE_URL"
  }
} as const satisfies ExtensionDefinition;

export const extensionRegistry = createExtensionRegistry([
  calendarSyncExtension,
  timeCardManagerExtension
]);

type Environment = Readonly<Record<string, string | undefined>>;

function setting(environment: Environment, name: string) {
  return environment[name]?.trim() || null;
}

// The extension whose QA hostname matches, if any.
export function findQaFocusExtension(hostname: string, environment: Environment) {
  const host = hostname.toLowerCase();
  return extensionRegistry.definitions.find((definition: ExtensionDefinition) => {
    const configured = definition.qa && setting(environment, definition.qa.hostSetting);
    return Boolean(configured) && configured!.toLowerCase() === host;
  }) ?? null;
}

// First configured QA app-origin override, if any (trailing slash removed).
export function findQaAppOrigin(environment: Environment) {
  for (const definition of extensionRegistry.definitions as readonly ExtensionDefinition[]) {
    const origin = definition.qa && setting(environment, definition.qa.appOriginSetting);
    if (origin) return origin.replace(/\/$/, "");
  }
  return null;
}

// First configured QA database URL, if any (used as given, like DATABASE_URL).
export function findQaDatabaseUrl(environment: Environment) {
  for (const definition of extensionRegistry.definitions as readonly ExtensionDefinition[]) {
    const url = definition.qa ? environment[definition.qa.databaseUrlSetting] : undefined;
    if (url !== undefined) return url;
  }
  return undefined;
}

// Products that connect to Square, and the one that owns the pre-split shared connection row.
type SquareConnectedExtension = Extract<
  (typeof extensionRegistry.definitions)[number],
  { connections: { square: unknown } }
>;
export type SquareConnectedProductSlug = SquareConnectedExtension["productSlug"];

export const squareConnectedProductSlugs = extensionRegistry.definitions
  .filter((definition: ExtensionDefinition) => Boolean(definition.connections?.square))
  .map((definition) => definition.productSlug) as readonly SquareConnectedProductSlug[];

export const legacySquareConnectionOwner = (extensionRegistry.definitions.find(
  (definition: ExtensionDefinition) => definition.connections?.square?.ownsLegacySharedConnection
)?.productSlug ?? null) as SquareConnectedProductSlug | null;

export type InstalledExtension = (typeof extensionRegistry.definitions)[number];
export type InstalledExtensionId = InstalledExtension["technicalId"];
export type InstalledProductSlug = InstalledExtension["productSlug"];
