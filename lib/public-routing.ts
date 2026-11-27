import { extensionRegistry } from "./extension-registry.ts";
import type { ProductRuntimeId } from "./product-runtime.ts";

type PublicRoutingInput = {
  appHost: boolean;
  hostname: string;
  preview: boolean;
  productRuntime: ProductRuntimeId | null;
  // App path of the product this QA hostname opens into, or null (lib/product-host.ts).
  qaFocusHomePath: string | null;
};

export function computePublicRouting(input: PublicRoutingInput) {
  const appHost = input.appHost || input.productRuntime !== null;
  const productHomePath = input.productRuntime
    ? extensionRegistry.byTechnicalId(input.productRuntime).homePath
    : null;
  const dashboardPath = productHomePath ?? (
    input.qaFocusHomePath ?? (appHost ? "/dashboard" : "/app/dashboard")
  );
  const signInPath = `/sign-in?next=${encodeURIComponent(dashboardPath)}`;
  const appHomePath = productHomePath ?? (appHost ? "/" : "/app");

  return { appHomePath, appHost, dashboardPath, signInPath };
}
