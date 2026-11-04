import "server-only";

import { db } from "@/lib/db";

const calendarPluginId = "square-calendar-sink";
const expectedEmail = "tcm-demo-manager@example.invalid";
const timeCardPluginId = "square-time-card-manager";

type ConnectionCheckpoint = {
  calendarConnectionId: string;
  merchantId: string;
  timeCardConnectionId: string;
};

function requireQaEnvironment(input: {
  customerEmail: string;
  hostname: string;
}) {
  const configuredHost = process.env.TCM_QA_HOST?.trim().toLowerCase();

  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
    !configuredHost ||
    input.hostname.toLowerCase() !== configuredHost ||
    input.customerEmail.toLowerCase() !== expectedEmail
  ) {
    throw new Error("QA Calendar disconnect isolation probe is unavailable.");
  }
}

function getConnectionCheckpoint(rows: Record<string, unknown>[]): ConnectionCheckpoint {
  const calendarRows = rows.filter(
    (row) => row.plugin_id === null || row.plugin_id === calendarPluginId
  );
  const timeCardRows = rows.filter((row) => row.plugin_id === timeCardPluginId);

  if (calendarRows.length !== 1 || timeCardRows.length !== 1) {
    throw new Error("Expected exactly one Calendar and one TCM Sandbox connection.");
  }

  const calendar = calendarRows[0];
  const timeCard = timeCardRows[0];

  if (
    calendar.square_environment !== "Sandbox" ||
    timeCard.square_environment !== "Sandbox" ||
    calendar.merchant_id !== timeCard.merchant_id
  ) {
    throw new Error("Synthetic connection preconditions failed.");
  }

  return {
    calendarConnectionId: String(calendar.id),
    merchantId: String(calendar.merchant_id),
    timeCardConnectionId: String(timeCard.id)
  };
}

export type CalendarDisconnectIsolationResult = {
  calendarDeletedInsideTransaction: true;
  calendarRestoredAfterRollback: true;
  enabledFeedCountRestored: boolean;
  enabledFeedCountTested: number;
  merchantIdMatched: true;
  timeCardPreservedAfterRollback: true;
  timeCardPreservedInsideTransaction: true;
};

export async function runCalendarDisconnectIsolationProbe(input: {
  customerEmail: string;
  customerId: string;
  hostname: string;
}): Promise<CalendarDisconnectIsolationResult> {
  requireQaEnvironment(input);
  const client = await db.connect();
  let checkpoint: ConnectionCheckpoint | null = null;
  let enabledFeedCount = 0;
  let transactionOpen = false;

  try {
    await client.query("begin isolation level serializable");
    transactionOpen = true;

    const connectionsBefore = await client.query(
      `select connections.id::text, connections.plugin_id, connections.merchant_id,
              connections.square_environment
       from public.customer_profiles customers
       join public.square_connections connections
         on connections.customer_id = customers.id
       where customers.id = $1
         and customers.email = $2
       order by connections.plugin_id nulls first
       for update of connections`,
      [input.customerId, expectedEmail]
    );
    checkpoint = getConnectionCheckpoint(connectionsBefore.rows);

    const feedsBefore = await client.query(
      `select count(*)::int as enabled_count
       from public.square_calendar_sink_feeds
       where customer_id = $1 and enabled = true`,
      [input.customerId]
    );
    enabledFeedCount = Number(feedsBefore.rows[0]?.enabled_count ?? 0);

    await client.query(
      `update public.square_calendar_sink_feeds
       set enabled = false, updated_at = now()
       where customer_id = $1 and enabled = true`,
      [input.customerId]
    );
    await client.query(
      `update public.square_calendar_sink_settings
       set enabled = false, updated_at = now()
       where customer_id = $1 and enabled = true`,
      [input.customerId]
    );
    const deleted = await client.query(
      `delete from public.square_connections
       where customer_id = $1
         and (plugin_id = $2 or (plugin_id is null and $2 = 'square-calendar-sink'))
         and id = $3`,
      [input.customerId, calendarPluginId, checkpoint.calendarConnectionId]
    );

    if (deleted.rowCount !== 1) {
      throw new Error("Calendar-only delete did not affect exactly one row.");
    }

    const inside = await client.query(
      `select id::text, plugin_id, merchant_id
       from public.square_connections
       where customer_id = $1
       order by plugin_id nulls first`,
      [input.customerId]
    );
    const calendarInside = inside.rows.find(
      (row) => row.plugin_id === null || row.plugin_id === calendarPluginId
    );
    const timeCardInside = inside.rows.find(
      (row) => row.plugin_id === timeCardPluginId
    );
    const feedsInside = await client.query(
      `select count(*)::int as enabled_count
       from public.square_calendar_sink_feeds
       where customer_id = $1 and enabled = true`,
      [input.customerId]
    );

    if (
      calendarInside ||
      !timeCardInside ||
      String(timeCardInside.id) !== checkpoint.timeCardConnectionId ||
      String(timeCardInside.merchant_id) !== checkpoint.merchantId ||
      Number(feedsInside.rows[0]?.enabled_count ?? -1) !== 0
    ) {
      throw new Error("Isolation assertion failed inside rollback transaction.");
    }

    await client.query("rollback");
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) {
      await client.query("rollback");
    }
    throw error;
  } finally {
    client.release();
  }

  if (!checkpoint) {
    throw new Error("Isolation checkpoint was not created.");
  }

  const [connectionsAfter, feedsAfter] = await Promise.all([
    db.query(
      `select id::text, plugin_id, merchant_id, square_environment
       from public.square_connections
       where customer_id = $1
       order by plugin_id nulls first`,
      [input.customerId]
    ),
    db.query(
      `select count(*)::int as enabled_count
       from public.square_calendar_sink_feeds
       where customer_id = $1 and enabled = true`,
      [input.customerId]
    )
  ]);
  const restored = getConnectionCheckpoint(connectionsAfter.rows);
  const enabledFeedCountAfter = Number(feedsAfter.rows[0]?.enabled_count ?? 0);

  if (
    restored.calendarConnectionId !== checkpoint.calendarConnectionId ||
    restored.timeCardConnectionId !== checkpoint.timeCardConnectionId ||
    restored.merchantId !== checkpoint.merchantId
  ) {
    throw new Error("Connection rollback verification failed.");
  }

  return {
    calendarDeletedInsideTransaction: true,
    calendarRestoredAfterRollback: true,
    enabledFeedCountRestored: enabledFeedCountAfter === enabledFeedCount,
    enabledFeedCountTested: enabledFeedCount,
    merchantIdMatched: true,
    timeCardPreservedAfterRollback: true,
    timeCardPreservedInsideTransaction: true
  };
}
