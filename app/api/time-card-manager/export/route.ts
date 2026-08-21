import { headers } from "next/headers";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { getCustomerByUserId } from "@/lib/customers";
import { getTimeCardConfirmationRequests } from "@/lib/time-card-email-workflow";
import {
  buildTimeCardReportCsv,
  filterTimeCardConfirmationRequests
} from "@/lib/time-card-report";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const customer = await getCustomerByUserId(session.user.id);

  if (!customer) {
    return Response.json({ ok: false, error: "Customer not found" }, { status: 404 });
  }

  const requests = await getTimeCardConfirmationRequests(customer.id, 250);
  const filtered = filterTimeCardConfirmationRequests(requests, {
    employee: request.nextUrl.searchParams.get("employee") ?? undefined,
    periodEnd: request.nextUrl.searchParams.get("periodEnd") ?? undefined,
    periodStart: request.nextUrl.searchParams.get("periodStart") ?? undefined,
    status: request.nextUrl.searchParams.get("status") ?? undefined
  });
  const date = new Date().toISOString().slice(0, 10);

  return new Response(buildTimeCardReportCsv(filtered), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="time-card-confirmations-${date}.csv"`,
      "Content-Type": "text/csv; charset=utf-8"
    }
  });
}
