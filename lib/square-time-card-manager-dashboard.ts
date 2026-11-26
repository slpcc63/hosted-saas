import "server-only";

import type { DashboardContext } from "@/packages/runtime-kit/dashboard";
import { getTimeCardManagerOverview } from "@/lib/square-time-card-manager";
import { buildTimeCardManagerDashboardSummary } from "@/lib/square-time-card-manager-dashboard-summary";

export async function getTimeCardManagerDashboardSummary(context: DashboardContext) {
  return buildTimeCardManagerDashboardSummary(
    await getTimeCardManagerOverview(context.customerId),
    context
  );
}
