import {
  getProductEnvironmentPrefix,
  getProductRuntime
} from "./product-runtime.ts";

const localDatabaseUrl =
  "postgresql://postgres:postgres@127.0.0.1:5432/slpcc63?sslmode=disable";

type DatabaseEnvironment = {
  VERCEL_ENV?: string;
  SLPCC63_CONTROLLED_PREVIEW?: string;
  AUTH_PREVIEW_DATABASE_HOST?: string;
  TCM_PREVIEW_DATABASE_URL?: string;
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

  // Use the connection already provisioned on Vercel, without extracting or
  // copying its credential. An explicit destination check prevents fallback to
  // an inherited shared/production database during preview builds or requests.
  if (resolvedEnvironment.SLPCC63_CONTROLLED_PREVIEW === "1") {
    if (resolvedEnvironment.VERCEL_ENV !== "preview" || runtime) {
      throw new Error("Controlled account preview requires the preview hub runtime.");
    }
    const expectedHost = resolvedEnvironment.AUTH_PREVIEW_DATABASE_HOST;
    let url: URL;
    try { url = new URL(resolvedEnvironment.TCM_PREVIEW_DATABASE_URL ?? ""); }
    catch { throw new Error("Controlled preview database is not configured."); }
    if (!expectedHost || !["postgres:", "postgresql:"].includes(url.protocol) ||
        url.hostname.replace("-pooler.", ".") !== expectedHost ||
        url.pathname !== "/neondb") {
      throw new Error("Controlled preview database destination does not match.");
    }
    return url.toString();
  }

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
