import { getPrivateCalendarCacheHeaders } from "@/lib/calendar-sink-cache";
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
        headers: getPrivateCalendarCacheHeaders()
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
      return new Response(null, {
        status: 304,
        headers: {
          ETag: calendar.etag,
          ...getPrivateCalendarCacheHeaders()
        }
      });
    }

    return new Response(calendar.body, {
      headers: {
        "Content-Disposition": `inline; filename="${encodeURIComponent(feed.settings.calendarName)}.ics"`,
        "Content-Type": "text/calendar; charset=utf-8",
        ETag: calendar.etag,
        ...getPrivateCalendarCacheHeaders()
      }
    });
  } catch (error) {
    console.error("Square Calendar Sync feed failed", {
      error: error instanceof Error ? error.message : "Unknown feed error"
    });
    return new Response("Calendar temporarily unavailable", {
      status: 503,
      headers: { ...getPrivateCalendarCacheHeaders(), "Retry-After": "60" }
    });
  }
}
