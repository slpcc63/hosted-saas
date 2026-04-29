import "server-only";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authorization";

export type AdminDashboardCounts = {
  customers: number;
  demos: number;
  leads: number;
  products: number;
  subscriptions: number;
};

type CountRow = {
  count: string;
};

async function getTableCount(tableName: string) {
  const result = await db.query<CountRow>(`select count(*)::text as count from public.${tableName}`);

  return Number(result.rows[0]?.count ?? "0");
}

export async function requireAdminUser(nextPath: string, unauthorizedRedirect = "/") {
  return requireAdmin(nextPath, unauthorizedRedirect);
}

export async function getAdminDashboardCounts() {
  const [products, demos, leads, customers, subscriptions] = await Promise.all([
    getTableCount("products"),
    getTableCount("demos"),
    getTableCount("leads"),
    getTableCount("customer_profiles"),
    getTableCount("subscriptions")
  ]);

  return {
    customers,
    demos,
    leads,
    products,
    subscriptions
  } satisfies AdminDashboardCounts;
}
