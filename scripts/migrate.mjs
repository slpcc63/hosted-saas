#!/usr/bin/env node
// Run database migrations from db/migrations.
//
//   node scripts/migrate.mjs plan                                  # report only (default)
//   node scripts/migrate.mjs apply --confirm-database <name>       # run pending migrations
//   node scripts/migrate.mjs baseline --confirm-database <name>    # record baseline files as applied
//
// Connection: MIGRATION_DATABASE_URL (use the direct/unpooled Neon URL). Never printed.
// apply/baseline require --confirm-database to match the connected database's name, so a wrong
// secret cannot silently change the wrong database.

import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { loadMigrations, runMigrations } from "./migrate-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const mode = args[0] && !args[0].startsWith("--") ? args[0] : "plan";
const confirmIndex = args.indexOf("--confirm-database");
const confirmDatabase = confirmIndex >= 0 ? args[confirmIndex + 1] : undefined;
const directory = path.join(root, "db", "migrations");

async function main() {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error("MIGRATION_DATABASE_URL is not set.");

  const migrations = await loadMigrations(directory);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query("select current_database() as name, inet_server_addr() is null as local_socket");
    const host = new URL(url).hostname;
    console.log(`Database: ${rows[0].name} on ${host}. Mode: ${mode}. Migration files: ${migrations.length}.`);

    if (mode !== "plan" && confirmDatabase !== rows[0].name) {
      throw new Error(`Refusing to ${mode}: --confirm-database "${confirmDatabase ?? ""}" does not match the connected database "${rows[0].name}". Nothing was changed.`);
    }

    const result = await runMigrations(client, { migrations, mode });
    if (mode === "plan") {
      console.log(result.pending.length ? "Plan only: nothing was changed." : "Up to date.");
    } else {
      console.log(result.applied.length ? `Done: ${result.applied.length} migration(s).` : "Up to date: nothing to do.");
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
});
