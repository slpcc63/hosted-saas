const fallbackCalendarSinkReplyToEmail = "support@slpcc63.com";

export function getCalendarSinkReplyToEmail(env: NodeJS.ProcessEnv = process.env) {
  return (
    env.CALENDAR_SINK_REPLY_TO_EMAIL?.trim() ||
    env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() ||
    fallbackCalendarSinkReplyToEmail
  ).toLowerCase();
}
