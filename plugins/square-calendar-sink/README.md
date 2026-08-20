# Square Calendar Sync v0.1

This plugin owns the Square calendar sink workflow. It reads one selected team
member's published scheduled shifts through Square's Labor API and exposes them
as a private iCalendar subscription. Apple Calendar remains read-only and Square
remains the source of truth.

The feed works with Apple Calendar, Google Calendar, and other clients that can
subscribe to an ICS URL. Each event has a stable Square-derived UID and includes
the employee, role, and an overlapping coworker when Square provides that data.

The private feed token is a bearer secret. A customer can rotate it from the
Calendar Sync page if it is ever disclosed, or disable the feed without deleting
their saved setup.
