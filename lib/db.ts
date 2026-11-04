import "server-only";

import { Pool } from "pg";

import { selectDatabaseUrl } from "@/lib/database-url";

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
  selectDatabaseUrl()
);

export const db = new Pool({
  connectionString: databaseUrl
});
