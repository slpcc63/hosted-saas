export function getPrivateCalendarCacheHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
    "X-Robots-Tag": "noindex"
  } as const;
}
