import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { upsertSquareConnection } from "@/lib/square-connections";
import { exchangeSquareAuthorizationCode } from "@/lib/square";
import { getWorkspaceByOwnerId } from "@/lib/workspaces";

const stateCookieName = "square_oauth_state";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const returnedError = requestUrl.searchParams.get("error");
  const storedState = request.cookies.get(stateCookieName)?.value;

  if (returnedError) {
    return NextResponse.redirect(
      new URL(`/dashboard?error=${encodeURIComponent("square_authorization_failed")}`, request.url)
    );
  }

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL("/dashboard?error=square_state_invalid", request.url));
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

  try {
    const tokenResponse = await exchangeSquareAuthorizationCode(code);

    await upsertSquareConnection({
      workspaceId: workspace.id,
      merchantId: tokenResponse.merchant_id,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: tokenResponse.expires_at,
      authorizedScopes: tokenResponse.scopes ?? []
    });

    const response = NextResponse.redirect(
      new URL("/dashboard?saved=square_connection", request.url)
    );

    response.cookies.delete(stateCookieName);
    return response;
  } catch {
    const response = NextResponse.redirect(
      new URL("/dashboard?error=square_token_exchange_failed", request.url)
    );

    response.cookies.delete(stateCookieName);
    return response;
  }
}
