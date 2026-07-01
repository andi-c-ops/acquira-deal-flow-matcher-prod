import { NextResponse } from "next/server";

import { verifyCronRequest } from "@/lib/dfm/auth/verify-cron";
import { dailyRunSchema } from "@/lib/dfm/domain/schemas";
import { describeEasternNow, isScheduledEasternTime } from "@/lib/dfm/utils/eastern-time";
import { runDailyWorkflow } from "@/lib/dfm/workflows/run-daily";

export const maxDuration = 60;

async function handleRequest(request: Request, fallbackBody: Record<string, unknown>, isCronGet: boolean) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => fallbackBody);
  const parsed = dailyRunSchema.parse(json);
  const input = {
    deferDelivery: true,
    ...parsed,
  };

  if (isCronGet && !input.force && !isScheduledEasternTime(9, 30)) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "outside_daily_schedule_window",
      easternNow: describeEasternNow(),
    });
  }

  const result = await runDailyWorkflow(input);

  return NextResponse.json(result);
}

export async function GET(request: Request) {
  return handleRequest(request, {}, true);
}

export async function POST(request: Request) {
  return handleRequest(request, {}, false);
}
