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
  const productHomePath = input.productRuntime === "calendar-sync"
    ? "/calendar-sink"
    : input.productRuntime === "time-card-manager"
      ? "/time-card-manager"
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
