import "server-only";

import { db } from "@/lib/db";
import { ensureCustomerProfilesTable } from "@/lib/customers";

export const squarePluginIds = [
  "square-calendar-sink",
  "square-time-card-manager"
] as const;

export type SquarePluginId = (typeof squarePluginIds)[number];

export type SquarePluginInstallation = {
  config: Record<string, unknown>;
  customerId: string;
  id: string;
  installedAt: Date;
  pluginId: SquarePluginId;
  updatedAt: Date;
};

let squarePluginInstallationsTableReady: Promise<void> | null = null;

function isSquarePluginId(value: string): value is SquarePluginId {
  return squarePluginIds.includes(value as SquarePluginId);
}

function parseConfig(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function mapSquarePluginInstallation(
  row: Record<string, unknown>
): SquarePluginInstallation {
  const pluginId = String(row.plugin_id);

  if (!isSquarePluginId(pluginId)) {
    throw new Error(`Unknown Square plugin installation: ${pluginId}`);
  }

  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    pluginId,
    config: parseConfig(row.config),
    installedAt: new Date(String(row.installed_at)),
    updatedAt: new Date(String(row.updated_at))
  };
}

export async function ensureSquarePluginInstallationsTable() {
  await ensureCustomerProfilesTable();

  if (!squarePluginInstallationsTableReady) {
    squarePluginInstallationsTableReady = db.query(`
      create extension if not exists pgcrypto;

      create table if not exists public.square_plugin_installations (
        id uuid primary key default gen_random_uuid(),
        customer_id uuid not null references public.customer_profiles(id) on delete cascade,
        plugin_id text not null check (
          plugin_id in ('square-calendar-sink', 'square-time-card-manager')
        ),
        config jsonb not null default '{}'::jsonb,
        installed_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (customer_id, plugin_id)
      );

      alter table public.square_plugin_installations
        add column if not exists customer_id uuid references public.customer_profiles(id) on delete cascade;

      do $$
      begin
        if exists (
          select 1
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'square_plugin_installations'
            and column_name = 'workspace_id'
        ) then
          execute 'alter table public.square_plugin_installations alter column workspace_id drop not null';
        end if;
      end
      $$;

      create unique index if not exists square_plugin_installations_customer_id_idx
        on public.square_plugin_installations(customer_id, plugin_id)
        where customer_id is not null;
    `).then(() => undefined);
  }

  return squarePluginInstallationsTableReady;
}

export async function getSquarePluginInstallationsByCustomerId(customerId: string) {
  await ensureSquarePluginInstallationsTable();

  const result = await db.query(
    `select id, customer_id, plugin_id, config, installed_at, updated_at
     from public.square_plugin_installations
     where customer_id = $1
     order by installed_at asc`,
    [customerId]
  );

  return result.rows.map((row) => mapSquarePluginInstallation(row));
}

export async function getSquarePluginInstallation(input: {
  customerId: string;
  pluginId: SquarePluginId;
}) {
  await ensureSquarePluginInstallationsTable();

  const result = await db.query(
    `select id, customer_id, plugin_id, config, installed_at, updated_at
     from public.square_plugin_installations
     where customer_id = $1 and plugin_id = $2
     limit 1`,
    [input.customerId, input.pluginId]
  );

  if (!result.rows[0]) {
    return null;
  }

  return mapSquarePluginInstallation(result.rows[0]);
}

export async function upsertSquarePluginInstallation(input: {
  config: Record<string, unknown>;
  customerId: string;
  pluginId: SquarePluginId;
}) {
  await ensureSquarePluginInstallationsTable();

  const result = await db.query(
    `insert into public.square_plugin_installations (
      customer_id,
      plugin_id,
      config
    ) values ($1, $2, $3::jsonb)
    on conflict (customer_id, plugin_id)
    do update set
      config = excluded.config,
      updated_at = now()
    returning id, customer_id, plugin_id, config, installed_at, updated_at`,
    [input.customerId, input.pluginId, JSON.stringify(input.config)]
  );

  return mapSquarePluginInstallation(result.rows[0]);
}

export async function removeSquarePluginInstallation(input: {
  customerId: string;
  pluginId: SquarePluginId;
}) {
  await ensureSquarePluginInstallationsTable();

  const result = await db.query(
    `delete from public.square_plugin_installations
     where customer_id = $1 and plugin_id = $2
     returning id, customer_id, plugin_id, config, installed_at, updated_at`,
    [input.customerId, input.pluginId]
  );

  if (!result.rows[0]) {
    return null;
  }

  return mapSquarePluginInstallation(result.rows[0]);
}

export async function removeAllSquarePluginInstallations(customerId: string) {
  await ensureSquarePluginInstallationsTable();

  await db.query(
    `delete from public.square_plugin_installations
     where customer_id = $1`,
    [customerId]
  );
}
