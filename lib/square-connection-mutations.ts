type SquareConnectionOwner = "square-calendar-sink" | "square-time-card-manager";

type QueryResult = { rows: Array<Record<string, unknown>> };
type Query = (statement: string, values: unknown[]) => Promise<QueryResult>;

export async function deleteOwnedSquareConnection(
  query: Query,
  input: {
    connectionId: string;
    customerId: string;
    pluginId: SquareConnectionOwner;
  }
) {
  return query(
    `delete from public.square_connections
     where customer_id = $1
       and (plugin_id = $2 or (plugin_id is null and $2 = 'square-calendar-sink'))
       and id = $3
     returning id`,
    [input.customerId, input.pluginId, input.connectionId]
  );
}
