import "server-only";

import type { DashboardProvider } from "@/packages/runtime-kit/dashboard";
import { getTimeCardManagerDashboardSummary } from "@/lib/square-time-card-manager-dashboard";

// The only place the hub dashboard connects to extensions: one summary provider per extension.
// The dashboard page itself imports no extension code. Cadence, Trace and Lens add theirs here.
export const dashboardProviders: readonly DashboardProvider[] = [
  getTimeCardManagerDashboardSummary
];
