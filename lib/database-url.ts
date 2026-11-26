import { findQaDatabaseUrl } from "./extension-registry.ts";
import {
  getProductEnvironmentPrefix,
  getProductRuntime
} from "./product-runtime.ts";

const localDatabaseUrl =
  "postgresql://postgres:postgres@127.0.0.1:5432/slpcc63?sslmode=disable";

type DatabaseEnvironment = Readonly<Record<string, string | undefined>> & {
  DATABASE_URL?: string;
  DATABASE_URL_UNPOOLED?: string;
  SLPCC63_PRODUCT_RUNTIME?: string;
};

export function selectDatabaseUrl(
  environment?: DatabaseEnvironment
) {
  const resolvedEnvironment = environment ?? process.env as DatabaseEnvironment;
  const runtime = environment
    ? getProductRuntime(environment)
    : getProductRuntime();

  if (runtime) {
    const key = `${getProductEnvironmentPrefix(runtime)}_DATABASE_URL`;
    const productUrl = resolvedEnvironment[key];

    if (!productUrl?.trim()) {
      throw new Error(`${key} is required for the ${runtime} runtime.`);
    }

    return productUrl;
  }

  return findQaDatabaseUrl(resolvedEnvironment) ??
    resolvedEnvironment.DATABASE_URL ??
    resolvedEnvironment.DATABASE_URL_UNPOOLED ??
    localDatabaseUrl;
}
