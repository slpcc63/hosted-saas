import assert from "node:assert/strict";
import test from "node:test";

import pg from "pg";

import { parseMigration, runMigrations } from "../scripts/migrate-lib.mjs";

// Runs only against a disposable local database named migrate_test (never a real one).
const url = process.env.MIGRATION_TEST_DATABASE_URL;

test("runner applies, records, refuses edits, rolls back failures and baselines", {
  skip: url ? false : "MIGRATION_TEST_DATABASE_URL is not configured"
}, async () => {
  const parsed = new URL(url!);
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(parsed.hostname), "local database only");
  assert.equal(parsed.pathname.slice(1), "migrate_test", "database must be named migrate_test");

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const quiet = () => {};
  const tables = async () => (await client.query(
    "select table_name from information_schema.tables where table_schema = 'public' order by 1"
  )).rows.map((row) => row.table_name);
  try {
    await client.query("drop schema public cascade; create schema public;");

    const one = parseMigration("0001_one.sql", "create table public.one (id int primary key);");
    const two = parseMigration("0002_two.sql", "create table public.two (id int primary key);");

    // plan changes nothing, not even the record table
    assert.deepEqual((await runMigrations(client, { migrations: [one], mode: "plan", log: quiet })).pending, ["0001_one.sql"]);
    assert.deepEqual(await tables(), []);

    // apply runs and records; a second apply is a no-op
    assert.deepEqual((await runMigrations(client, { migrations: [one], mode: "apply", log: quiet })).applied, ["0001_one.sql"]);
    assert.deepEqual((await runMigrations(client, { migrations: [one], mode: "apply", log: quiet })).applied, []);
    assert.deepEqual(await tables(), ["one", "schema_migrations"]);

    // editing an applied file is refused before anything runs
    const edited = parseMigration("0001_one.sql", "create table public.one (id int primary key, x int);");
    await assert.rejects(runMigrations(client, { migrations: [edited, two], mode: "apply", log: quiet }), /problem/);
    assert.deepEqual(await tables(), ["one", "schema_migrations"]);

    // a failing file rolls back completely, including its partial work, and is not recorded
    const broken = parseMigration("0002_broken.sql", "create table public.half (id int);\nselect * from public.does_not_exist;");
    await assert.rejects(runMigrations(client, { migrations: [one, broken], mode: "apply", log: quiet }), /rolled back/);
    assert.deepEqual(await tables(), ["one", "schema_migrations"]);

    // baseline records without running, and only for baseline files
    const base = parseMigration("0002_base.sql", "-- migrate:baseline\ncreate table public.base (id int);");
    await assert.rejects(runMigrations(client, { migrations: [one, base, two.name === "0002_two.sql" ? parseMigration("0003_two.sql", two.sql) : two], mode: "baseline", log: quiet }), /only records baseline files/);
    assert.deepEqual((await runMigrations(client, { migrations: [one, base], mode: "baseline", log: quiet })).applied, ["0002_base.sql"]);
    assert.deepEqual(await tables(), ["one", "schema_migrations"]);
    const recorded = (await client.query("select name, applied_how from public.schema_migrations order by name")).rows;
    assert.deepEqual(recorded, [{ name: "0001_one.sql", applied_how: "run" }, { name: "0002_base.sql", applied_how: "baseline" }]);

    // the advisory lock is released after a run
    const lock = await client.query("select count(*)::int as n from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()");
    assert.equal(lock.rows[0].n, 0);
  } finally {
    await client.query("drop schema public cascade; create schema public;").catch(() => {});
    await client.end();
  }
});
