import { createOwnedSquareOAuthRoutes } from "@/lib/square-oauth-routes";
import { installSquareTimeCardManager } from "@/lib/square-time-card-manager";

const routes = createOwnedSquareOAuthRoutes({
  pluginId: "square-time-card-manager",
  redirectPath: "/time-card-manager",
  install: installSquareTimeCardManager
});

export const GET = routes.callback;
