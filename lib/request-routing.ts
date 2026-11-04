import "server-only";

import { headers } from "next/headers";

import { getMarketingOrigin, isPreviewDeployment } from "@/lib/deployment";
import { isApplicationHostname, isTimeCardManagerQaHostname } from "@/lib/product-host";

export async function getPublicRouting() {
  const requestHeaders = await headers();
  const hostname = requestHeaders.get("host")?.split(":")[0] ?? "";
  const appHost = isApplicationHostname(hostname);
  const timeCardManagerQaHost = isTimeCardManagerQaHostname(hostname);
  const preview = isPreviewDeployment() && hostname.endsWith(".vercel.app");

  const appHomePath = appHost ? "/" : "/app";
  const dashboardPath = timeCardManagerQaHost
    ? "/time-card-manager"
    : appHost ? "/dashboard" : "/app/dashboard";
  const signInPath = `/sign-in?next=${encodeURIComponent(dashboardPath)}`;
  const launchProductHref = timeCardManagerQaHost
    ? signInPath
    : preview
    ? `/sign-in?next=${encodeURIComponent("/app/dashboard")}`
    : `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.slpcc63.com"}/sign-in?next=/dashboard`;
  const marketingHref = preview || !appHost ? "/" : getMarketingOrigin();

  return {
    appHomePath,
    appHost,
    dashboardPath,
    launchProductHref,
    marketingHref,
    signInPath
  };
}
