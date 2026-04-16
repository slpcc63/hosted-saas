import "server-only";

import { db } from "@/lib/db";

export type Workspace = {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  description: string | null;
  onboardingIntent: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type WorkspaceInput = {
  ownerId: string;
  name: string;
  description: string;
  onboardingIntent: string;
};

let workspaceTableReady: Promise<void> | null = null;

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function ensureWorkspaceTable() {
  if (!workspaceTableReady) {
    workspaceTableReady = db.query(`
      create extension if not exists pgcrypto;

      create table if not exists public.workspace_profiles (
        id uuid primary key default gen_random_uuid(),
        owner_id text not null unique,
        name text not null,
        slug text not null unique,
        description text,
        onboarding_intent text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
    `).then(() => undefined);
  }

  return workspaceTableReady;
}

function mapWorkspace(row: Record<string, unknown>): Workspace {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    name: String(row.name),
    slug: String(row.slug),
    description: row.description ? String(row.description) : null,
    onboardingIntent: row.onboarding_intent ? String(row.onboarding_intent) : null,
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at))
  };
}

export async function getWorkspaceByOwnerId(ownerId: string) {
  await ensureWorkspaceTable();

  const result = await db.query(
    `select id, owner_id, name, slug, description, onboarding_intent, created_at, updated_at
     from public.workspace_profiles
     where owner_id = $1
     limit 1`,
    [ownerId]
  );

  if (!result.rows[0]) {
    return null;
  }

  return mapWorkspace(result.rows[0]);
}

export async function upsertWorkspace(input: WorkspaceInput) {
  await ensureWorkspaceTable();

  const baseSlug = slugify(input.name) || "workspace";
  const existing = await getWorkspaceByOwnerId(input.ownerId);
  const slug = existing?.slug ?? `${baseSlug}-${input.ownerId.slice(0, 8)}`;

  const result = await db.query(
    `insert into public.workspace_profiles (
      owner_id,
      name,
      slug,
      description,
      onboarding_intent
    ) values ($1, $2, $3, $4, $5)
    on conflict (owner_id)
    do update set
      name = excluded.name,
      description = excluded.description,
      onboarding_intent = excluded.onboarding_intent,
      updated_at = now()
    returning id, owner_id, name, slug, description, onboarding_intent, created_at, updated_at`,
    [
      input.ownerId,
      input.name.trim(),
      slug,
      input.description.trim() || null,
      input.onboardingIntent.trim() || null
    ]
  );

  return mapWorkspace(result.rows[0]);
}
