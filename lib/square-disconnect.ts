export type SquareRevocationResult = "already_inactive" | "revoked";

export function classifySquareRevocationResponse(input: {
  errorCodes?: string[];
  ok: boolean;
  status: number;
  success?: boolean;
}): SquareRevocationResult | null {
  if (input.ok && input.success !== false) {
    return "revoked";
  }

  const inactiveCodes = new Set([
    "ACCESS_TOKEN_EXPIRED",
    "ACCESS_TOKEN_REVOKED",
    "UNAUTHORIZED"
  ]);

  if (
    input.status === 401 ||
    input.status === 404 ||
    input.errorCodes?.some((code) => inactiveCodes.has(code))
  ) {
    return "already_inactive";
  }

  return null;
}

export async function disconnectSquareAuthorization(input: {
  finalizeLocalDisconnect: (connectionId: string | null) => Promise<void>;
  getConnection: () => Promise<{ accessToken: string; id: string } | null>;
  revokeAccess: (accessToken: string) => Promise<SquareRevocationResult>;
}) {
  const connection = await input.getConnection();

  if (!connection) {
    await input.finalizeLocalDisconnect(null);
    return "already_disconnected" as const;
  }

  const revocation = await input.revokeAccess(connection.accessToken);
  await input.finalizeLocalDisconnect(connection.id);

  return revocation === "revoked" ? "disconnected" as const : "already_disconnected" as const;
}
