"use client";

import { useState } from "react";

export function CopyFeedButton({
  feedUrl,
  label = "Copy address for Google Calendar"
}: {
  feedUrl: string;
  label?: string;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");

  async function copyFeedUrl() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 2000);
    } catch {
      setCopyStatus("error");
    }
  }

  return (
    <button className="pill pill-button" type="button" onClick={copyFeedUrl}>
      {copyStatus === "copied"
        ? "Copied"
        : copyStatus === "error"
          ? "Copy failed—use the address under Other calendar apps"
          : label}
    </button>
  );
}
