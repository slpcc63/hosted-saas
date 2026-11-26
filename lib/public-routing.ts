import { extensionRegistry } from "./extension-registry.ts";
import type { ProductRuntimeId } from "./product-runtime.ts";

type PublicRoutingInput = {
  appHost: boolean;
  hostname: string;
  preview: boolean;
  productRuntime: ProductRuntimeId | null;
  timeCardManagerQaHost: boolean;
};

export function computePublicRouting(input: PublicRoutingInput) {
  const appHost = input.appHost || input.productRuntime !== null;
  const productHomePath = input.productRuntime
    ? extensionRegistry.byTechnicalId(input.productRuntime).homePath
    : null;
  const dashboardPath = productHomePath ?? (
    input.timeCardManagerQaHost
      ? "/time-card-manager"
      : appHost ? "/dashboard" : "/app/dashboard"
  );
  const signInPath = `/sign-in?next=${encodeURIComponent(dashboardPath)}`;
  const appHomePath = productHomePath ?? (appHost ? "/" : "/app");

  return { appHomePath, appHost, dashboardPath, signInPath };
}
