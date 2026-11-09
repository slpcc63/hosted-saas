import { createOwnedSquareOAuthRoutes } from "@/lib/square-oauth-routes";
import { installSquareCalendarSink } from "@/lib/square-calendar-sink";

const routes = createOwnedSquareOAuthRoutes({
  pluginId: "square-calendar-sink",
  redirectPath: "/calendar-sink",
  install: installSquareCalendarSink
});

export const GET = routes.connect;
