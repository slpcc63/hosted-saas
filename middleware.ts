import { NextRequest, NextResponse } from "next/server";

import { getApplicationRewritePath, isApplicationHostname } from "@/lib/product-host";
const publicAppPaths = new Set([
  "/privacy",
  "/terms",
  "/time-card-manager/sms-consent"
]);

function getHostname(request: NextRequest) {
  return request.headers.get("host")?.split(":")[0] ?? "";
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = getHostname(request);

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  if (!isApplicationHostname(hostname)) {
    return NextResponse.next();
  }

  if (publicAppPaths.has(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/app")) {
    return NextResponse.next();
  }

  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = getApplicationRewritePath(pathname, hostname);

  return NextResponse.rewrite(rewriteUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
