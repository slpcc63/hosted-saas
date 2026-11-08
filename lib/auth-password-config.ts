import type { BetterAuthOptions } from "better-auth";

type SendResetPassword = NonNullable<
  NonNullable<BetterAuthOptions["emailAndPassword"]>["sendResetPassword"]
>;

export function getEmailAndPasswordConfig(
  sendResetPassword: SendResetPassword
) {
  return {
    enabled: true,
    autoSignIn: true,
    requireEmailVerification: false,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword
  } satisfies NonNullable<BetterAuthOptions["emailAndPassword"]>;
}
