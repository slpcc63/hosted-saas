import { betterAuth } from "better-auth";

import { db } from "@/lib/db";
import { getEmailAndPasswordConfig } from "@/lib/auth-password-config";
import { getBetterAuthOrigin, getBetterAuthTrustedOrigins } from "@/lib/deployment";
import { getGoogleProviderConfig } from "@/lib/auth-provider-config";
import { sendPasswordResetEmail } from "@/lib/auth-recovery";

const authSecret =
  process.env.BETTER_AUTH_SECRET ?? "slpcc63-local-dev-secret-change-before-prod";
export const auth = betterAuth({
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "SLPCC63",
  secret: authSecret,
  baseURL: getBetterAuthOrigin(),
  trustedOrigins: getBetterAuthTrustedOrigins(),
  database: db,
  emailAndPassword: getEmailAndPasswordConfig(
    async ({ user, url }) => {
      await sendPasswordResetEmail({ user, url });
    }
  ),
  socialProviders: getGoogleProviderConfig({
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET
  })
});
