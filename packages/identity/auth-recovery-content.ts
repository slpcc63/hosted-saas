export type PasswordResetEmailContent = {
  html: string;
  subject: string;
  text: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    };

    return entities[character] ?? character;
  });
}

export function createPasswordResetEmailContent(input: {
  displayName?: string | null;
  resetUrl: string;
}): PasswordResetEmailContent {
  const greeting = input.displayName?.trim()
    ? `Hi ${input.displayName.trim()},`
    : "Hello,";
  const safeGreeting = escapeHtml(greeting);
  const safeResetUrl = escapeHtml(input.resetUrl);

  return {
    subject: "Reset your SLPCC63 password",
    text: `${greeting}\n\nUse this link to choose a new password:\n${input.resetUrl}\n\nThis link expires in one hour and can only be used once. If you did not request a password reset, you can ignore this email.`,
    html: `<p>${safeGreeting}</p><p>Use the button below to choose a new password.</p><p><a href="${safeResetUrl}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#1f6f5b;color:#ffffff;text-decoration:none;font-weight:700">Reset password</a></p><p>This link expires in one hour and can only be used once. If you did not request a password reset, you can ignore this email.</p>`
  };
}
