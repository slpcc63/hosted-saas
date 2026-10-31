type CopyTextOptions = {
  legacyCopy?: (value: string) => boolean;
  writeText?: (value: string) => Promise<void>;
};

function legacyCopyText(value: string) {
  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  textarea.setSelectionRange(0, value.length);

  try {
    return document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

export async function copyTextToClipboard(value: string, options: CopyTextOptions = {}) {
  const writeText = options.writeText ?? (
    typeof navigator !== "undefined" && navigator.clipboard?.writeText
      ? navigator.clipboard.writeText.bind(navigator.clipboard)
      : null
  );

  if (writeText) {
    try {
      await writeText(value);
      return;
    } catch {
      // Some browsers deny Clipboard API access even during a user gesture.
    }
  }

  const copied = (options.legacyCopy ?? legacyCopyText)(value);
  if (!copied) throw new Error("Clipboard access is unavailable.");
}
