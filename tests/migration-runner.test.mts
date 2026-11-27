import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { checksum, loadMigrations, parseMigration, planMigrations } from "../scripts/migrate-lib.mjs";

test("migration files must be numbered and named NNNN_description.sql", () => {
  assert.doesNotThrow(() => parseMigration("0001_baseline.sql", "select 1;"));
  for (const bad of ["1_x.sql", "0001-x.sql", "0001_X.sql", "0001_x.txt", "x.sql"]) {
    assert.throws(() => parseMigration(bad, "select 1;"), /must look like/, bad);
  }
});

test("markers: no-transaction and baseline are read from the first lines only", () => {
  const plain = parseMigration("0001_a.sql", "create table t ();");
  assert.equal(plain.transactional, true);
  assert.equal(plain.baseline, false);
  const marked = parseMigration("0002_b.sql", "-- migrate:baseline\n-- migrate:no-transaction\ncreate index concurrently i on t (x);");
  assert.equal(marked.transactional, false);
  assert.equal(marked.baseline, true);
  const late = parseMigration("0003_c.sql", "select 1;\n".repeat(20) + "-- migrate:baseline\n");
  assert.equal(late.baseline, false);
});

test("a transactional file may not contain its own BEGIN/COMMIT", () => {
  assert.throws(() => parseMigration("0001_a.sql", "begin;\ncreate table t ();\ncommit;"), /BEGIN\/COMMIT/);
});

test("checksum ignores Windows line endings but nothing else", () => {
  assert.equal(checksum("a\r\nb"), checksum("a\nb"));
  assert.notEqual(checksum("a\nb"), checksum("a\nb "));
});

test("loadMigrations sorts files and rejects duplicate numbers", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "migrations-"));
  await writeFile(path.join(dir, "0002_second.sql"), "select 2;");
  await writeFile(path.join(dir, "0001_first.sql"), "select 1;");
  await writeFile(path.join(dir, "README.md"), "ignored");
  assert.deepEqual((await loadMigrations(dir)).map((m) => m.name), ["0001_first.sql", "0002_second.sql"]);
  await writeFile(path.join(dir, "0002_clash.sql"), "select 3;");
  await assert.rejects(loadMigrations(dir), /share the number 0002/);
  assert.deepEqual(await loadMigrations(path.join(dir, "missing")), []);
});

test("plan: pending files, edited files, missing files and out-of-order files", () => {
  const a = parseMigration("0001_a.sql", "select 1;");
  const b = parseMigration("0002_b.sql", "select 2;");
  const c = parseMigration("0003_c.sql", "select 3;");

  assert.deepEqual(planMigrations([a, b], []).pending.map((m) => m.name), ["0001_a.sql", "0002_b.sql"]);
  assert.deepEqual(planMigrations([a, b], [{ name: a.name, checksum: a.checksum }]), { pending: [b], problems: [] });

  const edited = planMigrations([a], [{ name: a.name, checksum: "other" }]);
  assert.match(edited.problems[0], /changed after it was applied/);

  const missing = planMigrations([a], [{ name: a.name, checksum: a.checksum }, { name: "0002_gone.sql", checksum: "x" }]);
  assert.match(missing.problems[0], /file is missing/);

  const outOfOrder = planMigrations([a, b, c], [{ name: a.name, checksum: a.checksum }, { name: c.name, checksum: c.checksum }]);
  assert.match(outOfOrder.problems[0], /0002_b.sql is older than the already-applied 0003_c.sql/);
});
