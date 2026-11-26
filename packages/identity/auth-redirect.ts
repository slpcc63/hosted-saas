export function getSafeLocalRedirect(
  candidate: string | undefined,
  fallback: string
) {
  const localOrigin = "https://auth.local";

  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(candidate) ||
    /%(?:0[0-9a-f]|1[0-9a-f]|7f|2f|5c)/i.test(candidate)
  ) {
    return fallback;
  }

  try {
    const resolved = new URL(candidate, localOrigin);

    if (resolved.origin !== localOrigin) {
      return fallback;
    }

    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}
