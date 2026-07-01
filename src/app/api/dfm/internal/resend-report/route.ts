import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyCronRequest } from "@/lib/dfm/auth/verify-cron";
import { getMatchRunById } from "@/lib/dfm/db/repositories/match-runs";
import { sendSummaryNotification } from "@/lib/dfm/providers/notification-client";
import { unwrapSupabaseResult } from "@/lib/dfm/utils/supabase";

export const maxDuration = 60;

const resendReportSchema = z.object({
  runId: z.string().uuid(),
});

function asSummary(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Run does not have a valid summary_json payload");
  }

  return value as Record<string, unknown>;
}

export async function POST(request: Request) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const input = resendReportSchema.parse(await request.json());
  const run = unwrapSupabaseResult(await getMatchRunById(input.runId));

  if (run.run_type !== "daily") {
    return NextResponse.json(
      { ok: false, error: "Only daily run reports can be resent" },
      { status: 400 },
    );
  }

  if (run.status !== "succeeded") {
    return NextResponse.json(
      { ok: false, error: "Only succeeded daily run reports can be resent" },
      { status: 409 },
    );
  }

  await sendSummaryNotification({
    summary: asSummary(run.summary_json),
  });

  return NextResponse.json({
    ok: true,
    runId: input.runId,
    resent: true,
  });
}
