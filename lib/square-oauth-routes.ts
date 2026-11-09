import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getOrCreateCustomerProfile } from "@/lib/customers";
import { getPublicRouting } from "@/lib/request-routing";
import { upsertSquareConnection } from "@/lib/square-connections";
import type { SquarePluginId } from "@/lib/square-plugin-installations";
import {
  exchangeSquareAuthorizationCode,
  getSquareAuthorizationUrl,
  isSquareConfigured
} from "@/lib/square";

const stateCookieName = "square_oauth_state";

type OwnedSquareOAuthRoute = {
  install(customerId: string): Promise<unknown>;
  pluginId: SquarePluginId;
  redirectPath: string;
};

function parseStoredState(value: string | undefined, pluginId: SquarePluginId) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as { pluginId?: string; state?: string };
    return parsed.pluginId === pluginId && parsed.state
      ? { pluginId, state: parsed.state }
      : null;
  } catch {
    return null;
  }
}

async function getCustomer(request: NextRequest) {
  const routing = await getPublicRouting();
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return {
      response: NextResponse.redirect(new URL(routing.signInPath, request.url))
    } as const;
  }

  const customer = await getOrCreateCustomerProfile({
    userId: session.user.id,
    email: session.user.email,
    companyName: session.user.name ?? session.user.email.split("@")[0] ?? "",
    contactName: session.user.name ?? "",
    status: "active"
  });

  return { customer } as const;
}

export function createOwnedSquareOAuthRoutes(route: OwnedSquareOAuthRoute) {
  return {
    async connect(request: NextRequest) {
      if (!isSquareConfigured(route.pluginId)) {
        return NextResponse.redirect(
          new URL(`${route.redirectPath}?error=square_not_configured`, request.url)
        );
      }

      const result = await getCustomer(request);
      if ("response" in result) return result.response;

      const state = randomUUID();
      const response = NextResponse.redirect(
        getSquareAuthorizationUrl(route.pluginId, state)
      );
      response.cookies.set(stateCookieName, JSON.stringify({
        pluginId: route.pluginId,
        state
      }), {
        httpOnly: true,
        maxAge: 60 * 10,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production"
      });
      return response;
    },

    async callback(request: NextRequest) {
      const requestUrl = new URL(request.url);
      const code = requestUrl.searchParams.get("code");
      const state = requestUrl.searchParams.get("state");
      const returnedError = requestUrl.searchParams.get("error");
      const storedState = parseStoredState(
        request.cookies.get(stateCookieName)?.value,
        route.pluginId
      );

      if (returnedError) {
        return NextResponse.redirect(
          new URL(`${route.redirectPath}?error=square_authorization_failed`, request.url)
        );
      }

      if (!code || !state || !storedState || state !== storedState.state) {
        return NextResponse.redirect(
          new URL(`${route.redirectPath}?error=square_state_invalid`, request.url)
        );
      }

      const result = await getCustomer(request);
      if ("response" in result) return result.response;
      let callbackStage = "token_exchange";

      try {
        const tokenResponse = await exchangeSquareAuthorizationCode(route.pluginId, code);
        callbackStage = "connection_storage";
        await upsertSquareConnection({
          customerId: result.customer.id,
          pluginId: route.pluginId,
          merchantId: tokenResponse.merchant_id,
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          expiresAt: tokenResponse.expires_at,
          authorizedScopes: tokenResponse.scopes ?? []
        });
        callbackStage = "plugin_installation";
        await route.install(result.customer.id);

        const response = NextResponse.redirect(
          new URL(`${route.redirectPath}?saved=square_connection`, request.url)
        );
        response.cookies.delete(stateCookieName);
        return response;
      } catch (error) {
        console.error("[square-oauth] callback failed", {
          error: error instanceof Error ? error.message : String(error),
          pluginId: route.pluginId,
          stage: callbackStage
        });
        const response = NextResponse.redirect(
          new URL(`${route.redirectPath}?error=square_token_exchange_failed`, request.url)
        );
        response.cookies.delete(stateCookieName);
        return response;
      }
    }
  };
}
