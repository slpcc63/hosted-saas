import "server-only";
import { Pool } from "pg";
import { getDatabaseUrl } from "@/lib/db-config";
export const db = new Pool({ connectionString: getDatabaseUrl(process.env) });
