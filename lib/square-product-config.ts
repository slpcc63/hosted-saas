import type { ExtensionDefinition } from "../packages/runtime-kit/registry.ts";
import { extensionRegistry, type InstalledProductSlug } from "./extension-registry.ts";
import {
  getProductRuntime,
  type ProductRuntimeId
} from "./product-runtime.ts";

export type SquareProductPluginId = InstalledProductSlug;

type SquareConfigurationEnvironment = Record<string, string | undefined> & {
  SLPCC63_PRODUCT_RUNTIME?: string;
};

export function getRuntimePluginId(runtime: ProductRuntimeId): SquareProductPluginId {
  return extensionRegistry.byTechnicalId(runtime).productSlug;
}

export function getSquareProductEnvironmentValue(
  pluginId: SquareProductPluginId,
  name: string,
  environment?: SquareConfigurationEnvironment
) {
  const resolvedEnvironment = environment ?? process.env;
  const runtime = environment
    ? getProductRuntime(environment)
    : getProductRuntime();

  if (runtime && pluginId !== getRuntimePluginId(runtime)) {
    throw new Error(`${runtime} runtime cannot access ${pluginId} Square configuration.`);
  }

  const extension: ExtensionDefinition = extensionRegistry.byProductSlug(pluginId);
  const prefix = extension.environmentPrefix;
  const productValue = resolvedEnvironment[`${prefix}_SQUARE_${name}`];

  if (productValue !== undefined) return productValue;

  // Only the legacy shared-root runtime may read a product's historical
  // unprefixed settings while they are being retired (declared in the registry).
  if (!runtime && extension.connections?.square?.legacyUnprefixedSettings) {
    return resolvedEnvironment[`SQUARE_${name}`] ?? "";
  }

  return "";
}

export function getSquareProductRedirectUri(
  pluginId: SquareProductPluginId,
  environment?: SquareConfigurationEnvironment
) {
  const configured = environment
    ? getSquareProductEnvironmentValue(pluginId, "REDIRECT_URI", environment)
    : getSquareProductEnvironmentValue(pluginId, "REDIRECT_URI");
  if (configured) return configured;

  const runtime = environment
    ? getProductRuntime(environment)
    : getProductRuntime();
  const extension: ExtensionDefinition = extensionRegistry.byProductSlug(pluginId);
  const legacyRedirectUri = extension.connections?.square?.legacyRedirectUri;
  return !runtime && legacyRedirectUri ? legacyRedirectUri : "";
}
