import type { NextRequest } from "next/server";

import { runTimeCardManagerAutomationBatch } from "@/lib/square-time-card-manager";
import { runTimeCardConfirmationAutomationBatch } from "@/lib/time-card-email-workflow";
import { runMissingPunchAutomationBatch } from "@/lib/time-card-missing-punch-workflow";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return Response.json(
      { ok: false, error: "CRON_SECRET is not configured." },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const missingPunchWorkflowLive = process.env.TIME_CARD_MISSING_PUNCH_LIVE === "true";
  const [result, confirmations] = await Promise.all([
    runTimeCardManagerAutomationBatch(),
    missingPunchWorkflowLive
      ? runMissingPunchAutomationBatch()
      : runTimeCardConfirmationAutomationBatch()
  ]);

  return Response.json({ ok: true, result: { ...result, confirmations } });
}
