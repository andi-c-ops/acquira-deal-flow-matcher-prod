import { NextResponse } from "next/server";

import { verifyCronRequest } from "@/lib/dfm/auth/verify-cron";
import { newAeCheckSchema } from "@/lib/dfm/domain/schemas";
import { describeEasternNow, isScheduledEasternTime } from "@/lib/dfm/utils/eastern-time";
import { runNewAeCheckWorkflow } from "@/lib/dfm/workflows/run-new-ae-check";

// The new-AE sweep can cascade into thesis backfills across the stored deal
// inventory, so it needs the same longer execution window as the daily run.
export const maxDuration = 300;

async function handleRequest(request: Request, fallbackBody: Record<string, unknown>, isCronGet: boolean) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => fallbackBody);
  const input = newAeCheckSchema.parse(json);

  if (isCronGet && !input.force && !isScheduledEasternTime(7, 0)) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "outside_new_ae_daily_schedule_window",
      easternNow: describeEasternNow(),
    });
  }

  const result = await runNewAeCheckWorkflow(input);
  return NextResponse.json(result);
}

export async function GET(request: Request) {
  return handleRequest(request, {}, true);
}

export async function POST(request: Request) {
  return handleRequest(request, {}, false);
}
