import "server-only";

import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth/server";
import { db } from "@/lib/db";

export type AdminUser = {
  userId: string;
  createdAt: Date;
};

let appAdminsTableReady: Promise<void> | null = null;

function mapAdminUser(row: Record<string, unknown>): AdminUser {
  return {
    userId: String(row.user_id),
    createdAt: new Date(String(row.created_at))
  };
}

export async function ensureAppAdminsTable() {
  if (!appAdminsTableReady) {
    appAdminsTableReady = db.query(`
      create table if not exists public.app_admins (
        user_id text primary key,
        created_at timestamptz not null default now()
      );
    `).then(() => undefined);
  }

  return appAdminsTableReady;
}

export async function getAdminByUserId(userId: string) {
  await ensureAppAdminsTable();

  const result = await db.query(
    `select user_id, created_at
     from public.app_admins
     where user_id = $1
     limit 1`,
    [userId]
  );

  if (!result.rows[0]) {
    return null;
  }

  return mapAdminUser(result.rows[0]);
}

export async function isAdmin(userId: string) {
  const admin = await getAdminByUserId(userId);

  return Boolean(admin);
}

export async function requireAdmin(nextPath: string, unauthorizedRedirect = "/") {
  const session = await requireSession(nextPath);
  const admin = await getAdminByUserId(session.user.id);

  if (!admin) {
    redirect(unauthorizedRedirect);
  }

  return {
    admin,
    session,
    userId: session.user.id
  };
}

export function assertUserOwnsRecord(ownerUserId: string, currentUserId: string) {
  if (ownerUserId !== currentUserId) {
    throw new Error("Forbidden");
  }
}
