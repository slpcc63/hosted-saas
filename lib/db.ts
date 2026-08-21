import "server-only";

import { Pool } from "pg";

const localDatabaseUrl =
  "postgresql://postgres:postgres@127.0.0.1:5432/slpcc63?sslmode=disable";

function normalizeDatabaseUrl(value: string) {
  try {
    const parsed = new URL(value);
    const sslMode = parsed.searchParams.get("sslmode");

    if (sslMode === "prefer" || sslMode === "require" || sslMode === "verify-ca") {
      parsed.searchParams.set("sslmode", "verify-full");
    }

    return parsed.toString();
  } catch {
    return value;
  }
}

const databaseUrl = normalizeDatabaseUrl(
  process.env.DATABASE_URL ??
  process.env.DATABASE_URL_UNPOOLED ??
  localDatabaseUrl
);

export const db = new Pool({
  connectionString: databaseUrl
});
