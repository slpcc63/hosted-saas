import "server-only";

import { db } from "@/lib/db";
import { ensureCustomerProfilesTable } from "@/lib/customers";
import {
  getSquareEnvironmentLabel,
  refreshSquareAuthorization,
  retrieveSquareTokenStatus
} from "@/lib/square";
import {
  decryptSquareToken,
  encryptSquareConnectionTokens
} from "@/lib/square-token-crypto";
import {
  SquarePluginId,
  squarePluginIds
} from "@/lib/square-plugin-installations";
import { deleteOwnedSquareConnection } from "@/lib/square-connection-mutations";

export type SquareConnection = {
  accessToken: string;
  authorizedScopes: string[];
  customerId: string;
  connectedAt: Date;
  expiresAt: Date | null;
  id: string;
  merchantId: string;
  pluginId: SquarePluginId;
  refreshToken: string;
  squareEnvironment: string;
  updatedAt: Date;
};

let squareConnectionsTableReady: Promise<void> | null = null;

function parseScopes(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry));
  }

  return [];
}

function parsePluginId(value: unknown): SquarePluginId {
  const pluginId = String(value);

  if (!squarePluginIds.includes(pluginId as SquarePluginId)) {
    throw new Error(`Unknown Square connection plugin: ${pluginId}`);
  }

  return pluginId as SquarePluginId;
}

function decodeSquareConnection(row: Record<string, unknown>) {
  const customerId = String(row.customer_id);
  const accessToken = decryptSquareToken({
    customerId,
    storedToken: String(row.access_token),
    tokenKind: "access"
  });
  const refreshToken = decryptSquareToken({
    customerId,
    storedToken: String(row.refresh_token),
    tokenKind: "refresh"
  });

  return {
    connection: {
      id: String(row.id),
      customerId,
      pluginId: parsePluginId(row.plugin_id),
      merchantId: String(row.merchant_id),
      accessToken: accessToken.token,
      refreshToken: refreshToken.token,
      expiresAt: row.expires_at ? new Date(String(row.expires_at)) : null,
      squareEnvironment: String(row.square_environment),
      authorizedScopes: parseScopes(row.authorized_scopes),
      connectedAt: new Date(String(row.connected_at)),
      updatedAt: new Date(String(row.updated_at))
    } satisfies SquareConnection,
    needsRewrite: accessToken.needsRewrite || refreshToken.needsRewrite
  };
}

async function mapAndRewriteSquareConnection(row: Record<string, unknown>) {
  const decoded = decodeSquareConnection(row);

  if (!decoded.needsRewrite) {
    return decoded.connection;
  }

  const encrypted = encryptSquareConnectionTokens({
    accessToken: decoded.connection.accessToken,
    customerId: decoded.connection.customerId,
    refreshToken: decoded.connection.refreshToken
  });
  const result = await db.query(
    `update public.square_connections
     set access_token = $2,
         refresh_token = $3,
         updated_at = now()
     where id = $1
       and access_token = $4
       and refresh_token = $5
     returning updated_at`,
    [
      decoded.connection.id,
      encrypted.accessToken,
      encrypted.refreshToken,
      String(row.access_token),
      String(row.refresh_token)
    ]
  );

  return {
    ...decoded.connection,
    updatedAt: result.rows[0]
      ? new Date(String(result.rows[0].updated_at))
      : decoded.connection.updatedAt
  };
}

export async function ensureSquareConnectionsTable() {
  await ensureCustomerProfilesTable();

  if (!squareConnectionsTableReady) {
    squareConnectionsTableReady = db.query(`
      create extension if not exists pgcrypto;

      create table if not exists public.square_connections (
        id uuid primary key default gen_random_uuid(),
        customer_id uuid not null references public.customer_profiles(id) on delete cascade,
        plugin_id text,
        merchant_id text not null,
        access_token text not null,
        refresh_token text not null,
        expires_at timestamptz,
        square_environment text not null,
        authorized_scopes text[] not null default '{}',
        connected_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      alter table public.square_connections
        add column if not exists customer_id uuid references public.customer_profiles(id) on delete cascade;

      alter table public.square_connections
        add column if not exists plugin_id text;

      do $$
      begin
        if exists (
          select 1
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'square_connections'
            and column_name = 'workspace_id'
        ) then
          execute 'alter table public.square_connections alter column workspace_id drop not null';
        end if;
      end
      $$;

      do $$
      begin
        if not exists (
          select 1
          from pg_constraint
          where conname = 'square_connections_plugin_id_check'
            and conrelid = 'public.square_connections'::regclass
        ) then
          alter table public.square_connections
            add constraint square_connections_plugin_id_check
            check (
              plugin_id is null or plugin_id in (
                'square-calendar-sink',
                'square-time-card-manager'
              )
            );
        end if;
      end
      $$;

      drop index if exists public.square_connections_customer_id_idx;

      create unique index if not exists square_connections_customer_plugin_idx
        on public.square_connections(customer_id, plugin_id)
        where customer_id is not null and plugin_id is not null;

      create unique index if not exists square_connections_legacy_customer_idx
        on public.square_connections(customer_id)
        where customer_id is not null and plugin_id is null;
    `).then(() => undefined);
  }

  return squareConnectionsTableReady;
}

export async function getSquareConnection(input: {
  customerId: string;
  pluginId: SquarePluginId;
}) {
  await ensureSquareConnectionsTable();

  const result = await db.query(
    `select id, customer_id, plugin_id, merchant_id, access_token, refresh_token, expires_at,
            square_environment, authorized_scopes, connected_at, updated_at
     from public.square_connections
     where customer_id = $1 and plugin_id = $2
     limit 1`,
    [input.customerId, input.pluginId]
  );

  if (result.rows[0]) {
    return mapAndRewriteSquareConnection(result.rows[0]);
  }

  if (input.pluginId !== "square-calendar-sink") {
    return null;
  }

  // The pre-split row is retained as Calendar Sync's legacy connection. TCM
  // deliberately never falls back to it and requires its own authorization.
  const legacyResult = await db.query(
    `select id, customer_id, merchant_id, access_token, refresh_token, expires_at,
            square_environment, authorized_scopes, connected_at, updated_at
     from public.square_connections
     where customer_id = $1 and plugin_id is null
     limit 1`,
    [input.customerId]
  );

  if (!legacyResult.rows[0]) {
    return null;
  }

  return mapAndRewriteSquareConnection({
    ...legacyResult.rows[0],
    plugin_id: input.pluginId
  });
}

export async function getValidSquareConnection(input: {
  customerId: string;
  pluginId: SquarePluginId;
}) {
  let connection = await getSquareConnection(input);

  if (!connection) {
    return null;
  }

  if (connection.authorizedScopes.length === 0) {
    const tokenStatus = await retrieveSquareTokenStatus(
      connection.pluginId,
      connection.accessToken
    );
    connection = await upsertSquareConnection({
      customerId: input.customerId,
      pluginId: input.pluginId,
      merchantId: tokenStatus.merchant_id || connection.merchantId,
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken,
      expiresAt: tokenStatus.expires_at ?? connection.expiresAt?.toISOString(),
      authorizedScopes: tokenStatus.scopes ?? []
    });
  }

  const refreshThreshold = Date.now() + 5 * 60 * 1000;

  if (!connection.expiresAt || connection.expiresAt.getTime() > refreshThreshold) {
    return connection;
  }

  const refreshed = await refreshSquareAuthorization(
    connection.pluginId,
    connection.refreshToken
  );

  return upsertSquareConnection({
    customerId: input.customerId,
    pluginId: input.pluginId,
    merchantId: refreshed.merchant_id || connection.merchantId,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    expiresAt: refreshed.expires_at,
    authorizedScopes: refreshed.scopes ?? connection.authorizedScopes
  });
}

export async function upsertSquareConnection(input: {
  accessToken: string;
  authorizedScopes: string[];
  customerId: string;
  expiresAt?: string;
  merchantId: string;
  pluginId: SquarePluginId;
  refreshToken: string;
}) {
  await ensureSquareConnectionsTable();
  const encrypted = encryptSquareConnectionTokens({
    accessToken: input.accessToken,
    customerId: input.customerId,
    refreshToken: input.refreshToken
  });

  const result = await db.query(
    `insert into public.square_connections (
      customer_id,
      plugin_id,
      merchant_id,
      access_token,
      refresh_token,
      expires_at,
      square_environment,
      authorized_scopes
    ) values ($1, $2, $3, $4, $5, $6, $7, $8)
    on conflict (customer_id, plugin_id)
      where customer_id is not null and plugin_id is not null
    do update set
      merchant_id = excluded.merchant_id,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at,
      square_environment = excluded.square_environment,
      authorized_scopes = excluded.authorized_scopes,
      updated_at = now()
    returning id, customer_id, plugin_id, merchant_id, access_token, refresh_token, expires_at,
              square_environment, authorized_scopes, connected_at, updated_at`,
    [
      input.customerId,
      input.pluginId,
      input.merchantId,
      encrypted.accessToken,
      encrypted.refreshToken,
      input.expiresAt ?? null,
      getSquareEnvironmentLabel(input.pluginId),
      input.authorizedScopes
    ]
  );

  return mapAndRewriteSquareConnection(result.rows[0]);
}

export async function removeSquareConnection(input: {
  customerId: string;
  pluginId: SquarePluginId;
}) {
  const connection = await getSquareConnection(input);

  if (!connection) {
    return null;
  }

  const result = await deleteOwnedSquareConnection(
    (statement, values) => db.query(statement, values),
    { ...input, connectionId: connection.id }
  );

  if (!result.rows[0]) {
    return null;
  }

  return connection;
}
