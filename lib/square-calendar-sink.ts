import "server-only";

import {
  SquarePluginId,
  upsertSquarePluginInstallation,
  removeSquarePluginInstallation
} from "@/lib/square-plugin-installations";

const pluginId: SquarePluginId = "square-calendar-sink";

function getDefaultCalendarSinkConfig() {
  return {
    status: "backlog"
  };
}

export async function installSquareCalendarSink(customerId: string) {
  return upsertSquarePluginInstallation({
    customerId,
    pluginId,
    config: getDefaultCalendarSinkConfig()
  });
}

export async function uninstallSquareCalendarSink(customerId: string) {
  return removeSquarePluginInstallation({
    customerId,
    pluginId
  });
}
