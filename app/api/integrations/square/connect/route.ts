import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getSquareAuthorizationUrl, isSquareConfigured } from "@/lib/square";
import { getWorkspaceByOwnerId } from "@/lib/workspaces";

const stateCookieName = "square_oauth_state";

export async function GET(request: NextRequest) {
  if (!isSquareConfigured()) {
    return NextResponse.redirect(new URL("/dashboard?error=square_not_configured", request.url));
  }

  const session = await auth.api.getSession({
    headers: request.headers
  });

  if (!session?.user) {
    return NextResponse.redirect(new URL("/sign-in?next=/dashboard", request.url));
  }

  const workspace = await getWorkspaceByOwnerId(session.user.id);

  if (!workspace) {
    return NextResponse.redirect(new URL("/dashboard?error=workspace_required", request.url));
  }

  const state = randomUUID();
  const response = NextResponse.redirect(getSquareAuthorizationUrl(state));

  response.cookies.set(stateCookieName, state, {
    httpOnly: true,
    maxAge: 60 * 10,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  return response;
}
