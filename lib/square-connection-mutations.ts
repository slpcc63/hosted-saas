import {
  legacySquareConnectionOwner,
  type SquareConnectedProductSlug
} from "./extension-registry.ts";

// Product ids that may own a Square connection row (extension registry).
type SquareConnectionOwner = SquareConnectedProductSlug;

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
       and (plugin_id = $2 or (plugin_id is null and $2 = $4))
       and id = $3
     returning id`,
    // $4: the product that owns the pre-split row stored with no product id (registry), or null.
    [input.customerId, input.pluginId, input.connectionId, legacySquareConnectionOwner]
  );
}
