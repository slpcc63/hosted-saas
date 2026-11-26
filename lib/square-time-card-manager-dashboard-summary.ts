import type { DashboardContext, DashboardSummary } from "../packages/runtime-kit/dashboard.ts";
import type { TimeCardManagerOverview } from "./square-time-card-manager.ts";

// Sentinel's dashboard card. Wording and figures are exactly what the dashboard page showed before
// PLAN 2.8 (pinned by tests/dashboard-registry.test.mts).
export function buildTimeCardManagerDashboardSummary(
  overview: TimeCardManagerOverview,
  context: Pick<DashboardContext, "appPath">
): DashboardSummary {
  const subscriptionsPath = context.appPath("/subscriptions");
  const timeCardPath = context.appPath("/time-card-manager");
  const entitlement = overview.entitlement;

  const nextRun = overview.nextRunLabel
    ? overview.automationLive
      ? overview.nextRunLabel
      : `${overview.nextRunLabel} (cron setup needed)`
    : overview.automationLive
      ? "Automation off"
      : "Cron setup needed";

  return {
    extensionId: "time-card-manager",
    alert: overview.alertMessage
      ? {
          title: "Time card texting paused",
          message: overview.alertMessage,
          action: { label: "Manage subscription", href: subscriptionsPath }
        }
      : undefined,
    headlineStats: [
      { label: "Subscriptions", value: entitlement ? entitlement.packageName : "No time card plan yet" },
      {
        label: "Billing",
        value: overview.currentUsage
          ? `${overview.currentUsage.textsSentCount}/${entitlement?.monthlyTextLimit ?? 0} texts used`
          : "No text usage yet"
      }
    ],
    card: {
      title: "Square Time Card Manager",
      description: entitlement
        ? `Configured mode: ${overview.settings.notificationMode.replaceAll("_", " ")}`
        : "Subscribe first to unlock time card notification controls.",
      statusLabel: overview.textingLive
        ? overview.delivery.effectiveMode.replaceAll("_", " ")
        : "email live",
      stats: entitlement
        ? [
            { label: "Package", value: entitlement.packageName },
            { label: "Texts left", value: String(overview.delivery.textsRemaining) },
            { label: "Next run", value: nextRun },
            { label: "Email sender", value: overview.senderProfile.fromEmail }
          ]
        : [],
      actions: entitlement
        ? [
            { label: "Manage time card settings", href: timeCardPath, primary: true },
            { label: "Manage subscription", href: subscriptionsPath }
          ]
        : [{ label: "Subscribe to Time Card Manager", href: subscriptionsPath, primary: true }]
    }
  };
}
