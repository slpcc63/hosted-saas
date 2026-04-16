import { NextRequest, NextResponse } from "next/server";

const appSubdomain = process.env.APP_SUBDOMAIN ?? "app";
const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "slpcc63.com";

function getHostname(request: NextRequest) {
  return request.headers.get("host")?.split(":")[0] ?? "";
}

function isAppHostname(hostname: string) {
  if (hostname === `${appSubdomain}.${rootDomain}`) {
    return true;
  }

  return hostname === `${appSubdomain}.localhost`;
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

  if (!isAppHostname(hostname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/app")) {
    return NextResponse.next();
  }

  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = pathname === "/" ? "/app" : `/app${pathname}`;

  return NextResponse.rewrite(rewriteUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
