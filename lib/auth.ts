import { betterAuth } from "better-auth";

import { db } from "@/lib/db";
import { getAppOrigin, getBetterAuthOrigin, getMarketingOrigin } from "@/lib/deployment";

const authSecret =
  process.env.BETTER_AUTH_SECRET ?? "slpcc63-local-dev-secret-change-before-prod";
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const appUrl = getAppOrigin();
const marketingUrl = getMarketingOrigin();

function buildTrustedOrigins() {
  const origins = new Set<string>([appUrl, marketingUrl]);
  const vercelProductionUrl = "https://hosted-saas.vercel.app";
  const legacyCustomAppUrl = "https://app.slpcc63.com";

  origins.add(vercelProductionUrl);
  origins.add(legacyCustomAppUrl);

  return [...origins];
}

export const auth = betterAuth({
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "SLPCC63",
  secret: authSecret,
  baseURL: getBetterAuthOrigin(),
  trustedOrigins: buildTrustedOrigins(),
  database: db,
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    requireEmailVerification: false
  },
  socialProviders:
    googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
            prompt: "select_account"
          }
        }
      : {}
});
