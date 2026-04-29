import { betterAuth } from "better-auth";

import { db } from "@/lib/db";
import { getAppOrigin, getBetterAuthOrigin, getMarketingOrigin } from "@/lib/deployment";

const authSecret =
  process.env.BETTER_AUTH_SECRET ?? "slpcc63-local-dev-secret-change-before-prod";
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const appUrl = getAppOrigin();
const marketingUrl = getMarketingOrigin();

export const auth = betterAuth({
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "SLPCC63",
  secret: authSecret,
  baseURL: getBetterAuthOrigin(),
  trustedOrigins: [appUrl, marketingUrl],
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
