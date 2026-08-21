import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getOrCreateCustomerProfile } from "@/lib/customers";
import { getPublicRouting } from "@/lib/request-routing";
import { SquarePluginId, squarePluginIds } from "@/lib/square-plugin-installations";
import { getSquareAuthorizationUrl, isSquareConfigured } from "@/lib/square";

const stateCookieName = "square_oauth_state";

function isSquarePluginId(value: string | null): value is SquarePluginId {
  if (!value) {
    return false;
  }

  return squarePluginIds.includes(value as SquarePluginId);
}

export async function GET(request: NextRequest) {
  const routing = await getPublicRouting();

  if (!isSquareConfigured()) {
    return NextResponse.redirect(
      new URL(`${routing.dashboardPath}?error=square_not_configured`, request.url)
    );
  }

  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session?.user) {
    return NextResponse.redirect(new URL(routing.signInPath, request.url));
  }
  await getOrCreateCustomerProfile({
    userId: session.user.id,
    email: session.user.email,
    companyName: session.user.name ?? session.user.email.split("@")[0] ?? "",
    contactName: session.user.name ?? "",
    status: "active"
  });

  const requestedPlugin = request.nextUrl.searchParams.get("plugin");

  if (!isSquarePluginId(requestedPlugin)) {
    return NextResponse.redirect(
      new URL(`${routing.dashboardPath}?error=square_plugin_invalid`, request.url)
    );
  }

  const state = randomUUID();
  const response = NextResponse.redirect(getSquareAuthorizationUrl(state));

  response.cookies.set(stateCookieName, JSON.stringify({
    pluginId: requestedPlugin,
    state
  }), {
    httpOnly: true,
    maxAge: 60 * 10,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  return response;
}
