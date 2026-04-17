import "server-only";

import { db } from "@/lib/db";

export type WorkItemStatus = "backlog" | "active" | "done";

export type WorkItem = {
  id: string;
  workspaceId: string;
  title: string;
  details: string | null;
  status: WorkItemStatus;
  createdAt: Date;
  updatedAt: Date;
};

type CreateWorkItemInput = {
  details: string;
  title: string;
  workspaceId: string;
};

let workItemsTableReady: Promise<void> | null = null;

function mapWorkItem(row: Record<string, unknown>): WorkItem {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    title: String(row.title),
    details: row.details ? String(row.details) : null,
    status: String(row.status) as WorkItemStatus,
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at))
  };
}

export async function ensureWorkItemsTable() {
  if (!workItemsTableReady) {
    workItemsTableReady = db.query(`
      create extension if not exists pgcrypto;

      create table if not exists public.work_items (
        id uuid primary key default gen_random_uuid(),
        workspace_id uuid not null references public.workspace_profiles(id) on delete cascade,
        title text not null,
        details text,
        status text not null default 'backlog' check (status in ('backlog', 'active', 'done')),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create index if not exists work_items_workspace_id_idx
        on public.work_items(workspace_id, status, created_at desc);
    `).then(() => undefined);
  }

  return workItemsTableReady;
}

export async function getWorkItemsForWorkspace(workspaceId: string) {
  await ensureWorkItemsTable();

  const result = await db.query(
    `select id, workspace_id, title, details, status, created_at, updated_at
     from public.work_items
     where workspace_id = $1
     order by
       case status
         when 'active' then 1
         when 'backlog' then 2
         when 'done' then 3
       end,
       created_at desc`,
    [workspaceId]
  );

  return result.rows.map((row) => mapWorkItem(row));
}

export async function createWorkItem(input: CreateWorkItemInput) {
  await ensureWorkItemsTable();

  const result = await db.query(
    `insert into public.work_items (
      workspace_id,
      title,
      details
    ) values ($1, $2, $3)
    returning id, workspace_id, title, details, status, created_at, updated_at`,
    [input.workspaceId, input.title.trim(), input.details.trim() || null]
  );

  return mapWorkItem(result.rows[0]);
}

export async function updateWorkItemStatus(input: {
  status: WorkItemStatus;
  workItemId: string;
  workspaceId: string;
}) {
  await ensureWorkItemsTable();

  await db.query(
    `update public.work_items
     set status = $1, updated_at = now()
     where id = $2 and workspace_id = $3`,
    [input.status, input.workItemId, input.workspaceId]
  );
}
