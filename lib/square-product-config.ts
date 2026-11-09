import {
  getProductEnvironmentPrefix,
  getProductRuntime,
  type ProductRuntimeId
} from "./product-runtime.ts";

export type SquareProductPluginId =
  | "square-calendar-sink"
  | "square-time-card-manager";

type SquareConfigurationEnvironment = Record<string, string | undefined> & {
  SLPCC63_PRODUCT_RUNTIME?: string;
};

export function getRuntimePluginId(runtime: ProductRuntimeId): SquareProductPluginId {
  return runtime === "calendar-sync"
    ? "square-calendar-sink"
    : "square-time-card-manager";
}

export function getSquareProductEnvironmentValue(
  pluginId: SquareProductPluginId,
  name: string,
  environment: SquareConfigurationEnvironment = process.env
) {
  const runtime = getProductRuntime(environment);

  if (runtime && pluginId !== getRuntimePluginId(runtime)) {
    throw new Error(`${runtime} runtime cannot access ${pluginId} Square configuration.`);
  }

  const prefix = pluginId === "square-calendar-sink"
    ? "CALENDAR_SYNC"
    : "TIME_CARD_MANAGER";
  const productValue = environment[`${prefix}_SQUARE_${name}`];

  if (productValue !== undefined) return productValue;

  // Only the legacy shared-root runtime may read Calendar Sync's historical
  // unprefixed settings while it is being retired.
  if (!runtime && pluginId === "square-calendar-sink") {
    return environment[`SQUARE_${name}`] ?? "";
  }

  return "";
}

export function getSquareProductRedirectUri(
  pluginId: SquareProductPluginId,
  environment: SquareConfigurationEnvironment = process.env
) {
  const configured = getSquareProductEnvironmentValue(pluginId, "REDIRECT_URI", environment);
  if (configured) return configured;

  return !getProductRuntime(environment) && pluginId === "square-calendar-sink"
    ? "https://hosted-saas.vercel.app/api/integrations/square/callback"
    : "";
}
