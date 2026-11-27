// Database migration runner: plain SQL files, applied in filename order, each recorded once.
// Used by scripts/migrate.mjs (command line) and the "Run database migrations" GitHub workflow.
//
// Rules:
// - Files live in db/migrations and are named NNNN_description.sql (e.g. 0001_baseline.sql).
// - Each applied file is recorded in public.schema_migrations with a checksum. Editing a file after it
//   was applied is an error: write a new migration instead.
// - Each file runs inside a transaction together with its record, so a failure leaves nothing half done.
//   A file whose first lines contain "-- migrate:no-transaction" runs without one (needed for
//   CREATE INDEX CONCURRENTLY); keep such files to a single statement.
// - A file containing "-- migrate:baseline" describes tables that already exist in older databases.
//   On such a database it can be recorded as applied without running ("baseline" mode).
// - Only one run at a time: a database advisory lock is held for the whole run.

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export const migrationNamePattern = /^\d{4}_[a-z0-9_]+\.sql$/;
// Arbitrary constant shared by every run of this runner (pg_advisory_lock key).
export const migrationLockKey = 5_206_311_637;

export function checksum(sql) {
  return createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
}

export function parseMigration(name, sql) {
  if (!migrationNamePattern.test(name)) {
    throw new Error(`Migration file name "${name}" must look like 0001_description.sql`);
  }
  const header = sql.split("\n").slice(0, 10).join("\n");
  const transactional = !/^--\s*migrate:no-transaction\s*$/m.test(header);
  if (transactional && /^\s*(begin|commit|rollback)\s*;/im.test(sql)) {
    throw new Error(`${name} contains BEGIN/COMMIT. The runner wraps each file in a transaction; remove them.`);
  }
  return {
    name,
    sql,
    checksum: checksum(sql),
    transactional,
    baseline: /^--\s*migrate:baseline\s*$/m.test(header)
  };
}

export async function loadMigrations(directory) {
  let entries;
  try {
    entries = await readdir(directory);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const names = entries.filter((name) => name.endsWith(".sql")).sort();
  const migrations = [];
  for (const name of names) {
    migrations.push(parseMigration(name, await readFile(path.join(directory, name), "utf8")));
  }
  const numbers = new Set();
  for (const migration of migrations) {
    const number = migration.name.slice(0, 4);
    if (numbers.has(number)) throw new Error(`Two migrations share the number ${number}.`);
    numbers.add(number);
  }
  return migrations;
}

// Compare files with what the database has recorded. Pure: easy to test.
export function planMigrations(migrations, appliedRows) {
  const applied = new Map(appliedRows.map((row) => [row.name, row]));
  const problems = [];
  for (const migration of migrations) {
    const row = applied.get(migration.name);
    if (row && row.checksum !== migration.checksum) {
      problems.push(`${migration.name} was changed after it was applied (checksum differs). Write a new migration instead.`);
    }
  }
  const known = new Set(migrations.map((migration) => migration.name));
  for (const row of appliedRows) {
    if (!known.has(row.name)) {
      problems.push(`${row.name} is recorded in the database but its file is missing.`);
    }
  }
  const pending = migrations.filter((migration) => !applied.has(migration.name));
  const lastApplied = migrations.filter((migration) => applied.has(migration.name)).at(-1);
  if (lastApplied) {
    for (const migration of pending) {
      if (migration.name < lastApplied.name) {
        problems.push(`${migration.name} is older than the already-applied ${lastApplied.name}. Renumber it after the latest migration.`);
      }
    }
  }
  return { pending, problems };
}

const recordTableSql = `
  create table if not exists public.schema_migrations (
    name text primary key,
    checksum text not null,
    applied_at timestamptz not null default now(),
    applied_how text not null default 'run' check (applied_how in ('run', 'baseline'))
  )`;

// mode: "plan" (report only), "apply" (run pending), "baseline" (record baseline files as applied
// without running them; refuses any other pending file).
export async function runMigrations(client, { migrations, mode, log = console.log }) {
  if (!["plan", "apply", "baseline"].includes(mode)) throw new Error(`Unknown mode "${mode}".`);

  await client.query("select pg_advisory_lock($1)", [migrationLockKey]);
  try {
    const existing = await client.query("select to_regclass('public.schema_migrations') as relation");
    const tableExists = Boolean(existing.rows[0]?.relation);
    const appliedRows = tableExists
      ? (await client.query("select name, checksum from public.schema_migrations order by name")).rows
      : [];
    const { pending, problems } = planMigrations(migrations, appliedRows);

    log(`Applied: ${appliedRows.length}. Pending: ${pending.length}.`);
    for (const migration of pending) {
      log(`  pending: ${migration.name}${migration.baseline ? " (baseline)" : ""}${migration.transactional ? "" : " (no transaction)"}`);
    }
    if (problems.length) {
      for (const problem of problems) log(`  PROBLEM: ${problem}`);
      throw new Error(`Stopped: ${problems.length} problem(s). Nothing was changed.`);
    }
    if (mode === "plan" || pending.length === 0) {
      return { applied: [], pending: pending.map((migration) => migration.name) };
    }
    if (mode === "baseline") {
      const notBaseline = pending.filter((migration) => !migration.baseline);
      if (notBaseline.length) {
        throw new Error(`Baseline mode only records baseline files; also pending: ${notBaseline.map((m) => m.name).join(", ")}. Nothing was changed.`);
      }
    }

    await client.query(recordTableSql);
    const done = [];
    for (const migration of pending) {
      const how = mode === "baseline" ? "baseline" : "run";
      const record = ["insert into public.schema_migrations (name, checksum, applied_how) values ($1, $2, $3)", [migration.name, migration.checksum, how]];
      if (how === "baseline") {
        await client.query(...record);
        log(`  recorded without running (baseline): ${migration.name}`);
      } else if (migration.transactional) {
        await client.query("begin");
        try {
          await client.query(migration.sql);
          await client.query(...record);
          await client.query("commit");
        } catch (error) {
          await client.query("rollback");
          throw new Error(`${migration.name} failed and was rolled back: ${error.message}`);
        }
        log(`  applied: ${migration.name}`);
      } else {
        await client.query(migration.sql);
        await client.query(...record);
        log(`  applied (no transaction): ${migration.name}`);
      }
      done.push(migration.name);
    }
    return { applied: done, pending: [] };
  } finally {
    await client.query("select pg_advisory_unlock($1)", [migrationLockKey]);
  }
}
