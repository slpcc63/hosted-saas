import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getOrCreateCustomerProfile } from "@/lib/customers";
import { upsertSquareConnection } from "@/lib/square-connections";
import { installSquareCalendarSink } from "@/lib/square-calendar-sink";
import { SquarePluginId, squarePluginIds } from "@/lib/square-plugin-installations";
import { exchangeSquareAuthorizationCode } from "@/lib/square";
import { installSquareTimeCardManager } from "@/lib/square-time-card-manager";

const stateCookieName = "square_oauth_state";

function parseStoredState(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as {
      pluginId?: string;
      state?: string;
    };

    if (!parsed.state || !parsed.pluginId) {
      return null;
    }

    if (!squarePluginIds.includes(parsed.pluginId as SquarePluginId)) {
      return null;
    }

    return {
      pluginId: parsed.pluginId as SquarePluginId,
      state: parsed.state
    };
  } catch {
    return null;
  }
}

async function installSquarePlugin(pluginId: SquarePluginId, customerId: string) {
  if (pluginId === "square-calendar-sink") {
    return installSquareCalendarSink(customerId);
  }

  return installSquareTimeCardManager(customerId);
}

function getPluginRedirectPath(pluginId: SquarePluginId) {
  if (pluginId === "square-time-card-manager") {
    return "/app/time-card-manager";
  }

  return "/dashboard";
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const returnedError = requestUrl.searchParams.get("error");
  const storedState = parseStoredState(request.cookies.get(stateCookieName)?.value);

  if (returnedError) {
    return NextResponse.redirect(
      new URL(
        `${getPluginRedirectPath(storedState?.pluginId ?? "square-time-card-manager")}?error=${encodeURIComponent("square_authorization_failed")}`,
        request.url
      )
    );
  }

  if (!code || !state || !storedState || state !== storedState.state) {
    return NextResponse.redirect(
      new URL(
        `${getPluginRedirectPath(storedState?.pluginId ?? "square-time-card-manager")}?error=square_state_invalid`,
        request.url
      )
    );
  }

  const session = await auth.api.getSession({
    headers: request.headers
  });

  if (!session?.user) {
    return NextResponse.redirect(new URL("/sign-in?next=/dashboard", request.url));
  }
  const customer = await getOrCreateCustomerProfile({
    userId: session.user.id,
    email: session.user.email,
    companyName: session.user.name ?? session.user.email.split("@")[0] ?? "",
    contactName: session.user.name ?? "",
    status: "active"
  });

  try {
    const tokenResponse = await exchangeSquareAuthorizationCode(code);

    await upsertSquareConnection({
      customerId: customer.id,
      merchantId: tokenResponse.merchant_id,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: tokenResponse.expires_at,
      authorizedScopes: tokenResponse.scopes ?? []
    });

    await installSquarePlugin(storedState.pluginId, customer.id);

    const response = NextResponse.redirect(
      new URL(
        `${getPluginRedirectPath(storedState.pluginId)}?saved=${encodeURIComponent("square_connection")}`,
        request.url
      )
    );

    response.cookies.delete(stateCookieName);
    return response;
  } catch {
    const response = NextResponse.redirect(
      new URL(
        `${getPluginRedirectPath(storedState.pluginId)}?error=square_token_exchange_failed`,
        request.url
      )
    );

    response.cookies.delete(stateCookieName);
    return response;
  }
}
