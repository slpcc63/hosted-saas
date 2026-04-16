import { betterAuth } from "better-auth";

import { db } from "@/lib/db";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://app.localhost:3000";
const marketingUrl =
  process.env.NEXT_PUBLIC_MARKETING_SITE_URL ?? "http://localhost:3000";
const authSecret =
  process.env.BETTER_AUTH_SECRET ?? "slpcc63-local-dev-secret-change-before-prod";
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

export const auth = betterAuth({
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "SLPCC63",
  secret: authSecret,
  baseURL: process.env.BETTER_AUTH_URL ?? appUrl,
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
