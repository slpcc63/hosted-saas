import "server-only";

import { db } from "@/lib/db";
import { getSquareEnvironmentLabel } from "@/lib/square";

export type SquareConnection = {
  accessToken: string;
  authorizedScopes: string[];
  connectedAt: Date;
  expiresAt: Date | null;
  id: string;
  merchantId: string;
  refreshToken: string;
  squareEnvironment: string;
  updatedAt: Date;
  workspaceId: string;
};

let squareConnectionsTableReady: Promise<void> | null = null;

function parseScopes(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry));
  }

  return [];
}

function mapSquareConnection(row: Record<string, unknown>): SquareConnection {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    merchantId: String(row.merchant_id),
    accessToken: String(row.access_token),
    refreshToken: String(row.refresh_token),
    expiresAt: row.expires_at ? new Date(String(row.expires_at)) : null,
    squareEnvironment: String(row.square_environment),
    authorizedScopes: parseScopes(row.authorized_scopes),
    connectedAt: new Date(String(row.connected_at)),
    updatedAt: new Date(String(row.updated_at))
  };
}

export async function ensureSquareConnectionsTable() {
  if (!squareConnectionsTableReady) {
    squareConnectionsTableReady = db.query(`
      create extension if not exists pgcrypto;

      create table if not exists public.square_connections (
        id uuid primary key default gen_random_uuid(),
        workspace_id uuid not null unique references public.workspace_profiles(id) on delete cascade,
        merchant_id text not null,
        access_token text not null,
        refresh_token text not null,
        expires_at timestamptz,
        square_environment text not null,
        authorized_scopes text[] not null default '{}',
        connected_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
    `).then(() => undefined);
  }

  return squareConnectionsTableReady;
}

export async function getSquareConnectionByWorkspaceId(workspaceId: string) {
  await ensureSquareConnectionsTable();

  const result = await db.query(
    `select id, workspace_id, merchant_id, access_token, refresh_token, expires_at,
            square_environment, authorized_scopes, connected_at, updated_at
     from public.square_connections
     where workspace_id = $1
     limit 1`,
    [workspaceId]
  );

  if (!result.rows[0]) {
    return null;
  }

  return mapSquareConnection(result.rows[0]);
}

export async function upsertSquareConnection(input: {
  accessToken: string;
  authorizedScopes: string[];
  expiresAt?: string;
  merchantId: string;
  refreshToken: string;
  workspaceId: string;
}) {
  await ensureSquareConnectionsTable();

  const result = await db.query(
    `insert into public.square_connections (
      workspace_id,
      merchant_id,
      access_token,
      refresh_token,
      expires_at,
      square_environment,
      authorized_scopes
    ) values ($1, $2, $3, $4, $5, $6, $7)
    on conflict (workspace_id)
    do update set
      merchant_id = excluded.merchant_id,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at,
      square_environment = excluded.square_environment,
      authorized_scopes = excluded.authorized_scopes,
      updated_at = now()
    returning id, workspace_id, merchant_id, access_token, refresh_token, expires_at,
              square_environment, authorized_scopes, connected_at, updated_at`,
    [
      input.workspaceId,
      input.merchantId,
      input.accessToken,
      input.refreshToken,
      input.expiresAt ?? null,
      getSquareEnvironmentLabel(),
      input.authorizedScopes
    ]
  );

  return mapSquareConnection(result.rows[0]);
}

export async function removeSquareConnection(workspaceId: string) {
  await ensureSquareConnectionsTable();

  const result = await db.query(
    `delete from public.square_connections
     where workspace_id = $1
     returning id, workspace_id, merchant_id, access_token, refresh_token, expires_at,
              square_environment, authorized_scopes, connected_at, updated_at`,
    [workspaceId]
  );

  if (!result.rows[0]) {
    return null;
  }

  return mapSquareConnection(result.rows[0]);
}
