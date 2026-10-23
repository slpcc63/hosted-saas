import { betterAuth } from "better-auth";

import { getAuthSettings } from "@/lib/auth-config";
import { db } from "@/lib/db";
import { getAppOrigin, getBetterAuthOrigin, getMarketingOrigin } from "@/lib/deployment";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const appUrl = getAppOrigin();
const marketingUrl = getMarketingOrigin();

function createAuth() {
  const settings = getAuthSettings(process.env);
  return betterAuth({
    appName: process.env.NEXT_PUBLIC_APP_NAME ?? "SLPCC63",
    secret: settings.secret,
    baseURL: getBetterAuthOrigin(),
    trustedOrigins: [appUrl, marketingUrl],
    database: db,
    emailAndPassword: {
      enabled: true,
      disableSignUp: !settings.allowSignUp,
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

}

let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  instance ??= createAuth();
  return instance;
}
