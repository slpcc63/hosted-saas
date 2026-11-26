// What an extension gives the customer dashboard. The dashboard draws these as-is and never imports
// an extension's own code. Plain data only, so a future separate app could return it over HTTP.
// This file must stay product-neutral.

export type DashboardStat = { readonly label: string; readonly value: string };

export type DashboardAction = {
  readonly label: string;
  readonly href: string;
  readonly primary?: boolean;
};

export type DashboardAlert = {
  readonly title: string;
  readonly message: string;
  readonly action?: DashboardAction;
};

export type DashboardCard = {
  readonly title: string;
  readonly description: string;
  readonly statusLabel?: string;
  readonly stats: readonly DashboardStat[];
  readonly actions: readonly DashboardAction[];
};

export type DashboardSummary = {
  readonly extensionId: string;
  readonly card: DashboardCard;
  // Shown in the dashboard's top figures row, after the account.
  readonly headlineStats?: readonly DashboardStat[];
  readonly alert?: DashboardAlert;
};

export type DashboardContext = {
  readonly customerId: string;
  // Turns an app path ("/subscriptions") into the right link for this host.
  appPath(path: string): string;
};

export type DashboardProvider = (context: DashboardContext) => Promise<DashboardSummary>;
