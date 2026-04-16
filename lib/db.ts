import "server-only";

import { Pool } from "pg";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/slpcc63?sslmode=disable";

export const db = new Pool({
  connectionString: databaseUrl
});
