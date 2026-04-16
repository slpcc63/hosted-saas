import "server-only";

import { headers } from "next/headers";

import { getMarketingOrigin, isPreviewDeployment } from "@/lib/deployment";

const appSubdomain = process.env.APP_SUBDOMAIN ?? "app";
const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "slpcc63.com";

function isAppHostname(hostname: string) {
  if (hostname === `${appSubdomain}.${rootDomain}`) {
    return true;
  }

  return hostname === `${appSubdomain}.localhost`;
}

export async function getPublicRouting() {
  const requestHeaders = await headers();
  const hostname = requestHeaders.get("host")?.split(":")[0] ?? "";
  const appHost = isAppHostname(hostname);
  const preview = isPreviewDeployment() && hostname.endsWith(".vercel.app");

  const appHomePath = appHost ? "/" : "/app";
  const dashboardPath = appHost ? "/dashboard" : "/app/dashboard";
  const signInPath = `/sign-in?next=${encodeURIComponent(appHomePath)}`;
  const launchProductHref = preview
    ? `/sign-in?next=${encodeURIComponent("/app")}`
    : `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.slpcc63.com"}/sign-in?next=/`;
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
