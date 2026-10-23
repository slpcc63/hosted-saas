"use client";

import { useState, type FormEvent, type ReactNode } from "react";

export function CopyPrivateSetupLinkButton({ setupUrl }: { setupUrl: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  async function copySetupUrl() {
    try {
      await navigator.clipboard.writeText(setupUrl);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }

  return (
    <button className="pill pill-button" type="button" onClick={copySetupUrl}>
      {status === "copied"
        ? "Private setup link copied"
        : status === "error"
          ? "Copy failed—select the link above"
          : "Copy private setup link"}
    </button>
  );
}

export function ConfirmBulkInvitationForm({
  action,
  calendarCount,
  children,
  emailRecipientCount,
  missingEmailCount
}: {
  action: (formData: FormData) => Promise<void> | void;
  calendarCount: number;
  children: ReactNode;
  emailRecipientCount: number;
  missingEmailCount: number;
}) {
  function confirmBulkEmail(event: FormEvent<HTMLFormElement>) {
    if (new FormData(event.currentTarget).get("distributionMode") !== "email") return;

    const manualNote = missingEmailCount
      ? ` ${missingEmailCount} ${missingEmailCount === 1 ? "employee has" : "employees have"} no email in Square and will need the copied private link instead.`
      : "";
    const confirmed = window.confirm(
      `Create ${calendarCount} employee ${calendarCount === 1 ? "calendar" : "calendars"} and send ${emailRecipientCount} private setup ${emailRecipientCount === 1 ? "email" : "emails"}?${manualNote}`
    );

    if (!confirmed) event.preventDefault();
  }

  return (
    <form action={action} className="auth-form calendar-settings-form" onSubmit={confirmBulkEmail}>
      {children}
    </form>
  );
}
