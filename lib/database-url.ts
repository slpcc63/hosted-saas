import {
  getProductEnvironmentPrefix,
  getProductRuntime
} from "./product-runtime.ts";

const localDatabaseUrl =
  "postgresql://postgres:postgres@127.0.0.1:5432/slpcc63?sslmode=disable";

type DatabaseEnvironment = {
  CALENDAR_SYNC_DATABASE_URL?: string;
  DATABASE_URL?: string;
  DATABASE_URL_UNPOOLED?: string;
  SLPCC63_PRODUCT_RUNTIME?: string;
  TCM_QA_DATABASE_URL?: string;
  TIME_CARD_MANAGER_DATABASE_URL?: string;
};

export function selectDatabaseUrl(
  environment?: DatabaseEnvironment
) {
  const resolvedEnvironment = environment ?? process.env as DatabaseEnvironment;
  const runtime = environment
    ? getProductRuntime(environment)
    : getProductRuntime();

  if (runtime) {
    const key = `${getProductEnvironmentPrefix(runtime)}_DATABASE_URL` as
      | "CALENDAR_SYNC_DATABASE_URL"
      | "TIME_CARD_MANAGER_DATABASE_URL";
    const productUrl = resolvedEnvironment[key];

    if (!productUrl?.trim()) {
      throw new Error(`${key} is required for the ${runtime} runtime.`);
    }

    return productUrl;
  }

  return resolvedEnvironment.TCM_QA_DATABASE_URL ??
    resolvedEnvironment.DATABASE_URL ??
    resolvedEnvironment.DATABASE_URL_UNPOOLED ??
    localDatabaseUrl;
}
