export const productRuntimeIds = [
  "calendar-sync",
  "time-card-manager"
] as const;

export type ProductRuntimeId = (typeof productRuntimeIds)[number];

type ProductRuntimeEnvironment = {
  SLPCC63_PRODUCT_RUNTIME?: string;
};

export function getProductRuntime(
  environment?: ProductRuntimeEnvironment
): ProductRuntimeId | null {
  // Keep the default access direct so Next can replace the product marker from
  // each application's next.config.ts in server bundles.
  const value = environment
    ? environment.SLPCC63_PRODUCT_RUNTIME
    : process.env.SLPCC63_PRODUCT_RUNTIME;

  return productRuntimeIds.includes(value as ProductRuntimeId)
    ? value as ProductRuntimeId
    : null;
}

export function requireProductRuntime(
  expected: ProductRuntimeId,
  environment?: ProductRuntimeEnvironment
) {
  const actual = getProductRuntime(environment);

  if (actual !== expected) {
    throw new Error(
      `Expected ${expected} product runtime, received ${actual ?? "shared-root"}.`
    );
  }

  return actual;
}

export function getProductEnvironmentPrefix(runtime: ProductRuntimeId) {
  return runtime === "calendar-sync"
    ? "CALENDAR_SYNC"
    : "TIME_CARD_MANAGER";
}
