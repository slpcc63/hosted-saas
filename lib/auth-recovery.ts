import "server-only";

import type { User } from "better-auth";

import { createPasswordResetEmailContent } from "@/lib/auth-recovery-content";
import { sendTransactionalEmail } from "@/lib/email";

export async function sendPasswordResetEmail(input: {
  user: User;
  url: string;
}) {
  const content = createPasswordResetEmailContent({
    displayName: input.user.name,
    resetUrl: input.url
  });

  await sendTransactionalEmail({
    fromName: "SLPCC63 Security",
    html: content.html,
    subject: content.subject,
    text: content.text,
    to: input.user.email
  });
}
