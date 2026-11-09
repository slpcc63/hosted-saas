import assert from "node:assert/strict";
import test from "node:test";

import pg from "pg";

import { deleteOwnedSquareConnection } from "../lib/square-connection-mutations.ts";

const databaseUrl = process.env.SPLIT_ISOLATION_DATABASE_URL;
const confirmation = process.env.SPLIT_ISOLATION_CONFIRM_DATABASE;

test("Calendar connection deletion cannot mutate Sentinel's same-customer row", {
  skip: databaseUrl ? false : "SPLIT_ISOLATION_DATABASE_URL is not configured"
}, async () => {
  const parsedUrl = new URL(databaseUrl!);
  const databaseName = parsedUrl.pathname.slice(1);
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(parsedUrl.hostname));
  assert.equal(confirmation, databaseName, "explicit synthetic database confirmation must match URL");
  assert.match(databaseName, /^(cadence|sentinel)_build$/);

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  const customerId = "11111111-1111-4111-8111-111111111111";
  const calendarId = "22222222-2222-4222-8222-222222222222";
  const sentinelId = "33333333-3333-4333-8333-333333333333";

  let transactionStarted = false;
  try {
    await client.query("begin");
    transactionStarted = true;
    const existing = await client.query(
      "select to_regclass('public.square_connections') as relation"
    );
    assert.equal(existing.rows[0]?.relation, null, "synthetic database must not contain square_connections");
    await client.query(`
      create table public.square_connections (
        id uuid primary key,
        customer_id uuid not null,
        plugin_id text
      )
    `);
    await client.query(
      `insert into public.square_connections (id, customer_id, plugin_id)
       values ($1, $3, 'square-calendar-sink'), ($2, $3, 'square-time-card-manager')`,
      [calendarId, sentinelId, customerId]
    );

    const deleted = await deleteOwnedSquareConnection(
      (statement, values) => client.query(statement, values),
      { connectionId: calendarId, customerId, pluginId: "square-calendar-sink" }
    );
    assert.equal(deleted.rows.length, 1);

    const remaining = await client.query(
      `select id, plugin_id from public.square_connections order by plugin_id`
    );
    assert.deepEqual(remaining.rows, [{
      id: sentinelId,
      plugin_id: "square-time-card-manager"
    }]);
  } finally {
    if (transactionStarted) await client.query("rollback");
    client.release();
    await pool.end();
  }
});
