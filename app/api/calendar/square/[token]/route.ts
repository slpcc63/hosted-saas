import { buildSquareShiftCalendar } from "@/lib/icalendar";
import { getSquareCalendarSinkFeed } from "@/lib/square-calendar-sink";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const feed = await getSquareCalendarSinkFeed(token);

    if (!feed) {
      return new Response("Calendar not found", {
        status: 404,
        headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" }
      });
    }

    const calendar = buildSquareShiftCalendar({
      calendarName: feed.settings.calendarName,
      coworkerShifts: feed.coworkerShifts,
      jobs: feed.jobs,
      locations: feed.locations,
      shifts: feed.shifts,
      teamMembers: feed.teamMembers
    });

    if (request.headers.get("if-none-match") === calendar.etag) {
      return new Response(null, { status: 304, headers: { ETag: calendar.etag } });
    }

    return new Response(calendar.body, {
      headers: {
        "Cache-Control": "private, max-age=300, stale-while-revalidate=3600",
        "Content-Disposition": `inline; filename="${encodeURIComponent(feed.settings.calendarName)}.ics"`,
        "Content-Type": "text/calendar; charset=utf-8",
        ETag: calendar.etag,
        "X-Robots-Tag": "noindex"
      }
    });
  } catch (error) {
    console.error("Square Calendar Sync feed failed", error);
    return new Response("Calendar temporarily unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "60", "X-Robots-Tag": "noindex" }
    });
  }
}
