import { NextResponse } from "next/server";

import { verifyCronRequest } from "@/lib/dfm/auth/verify-cron";
import { backlogRecoverySchema } from "@/lib/dfm/domain/schemas";
import { runBacklogRecoveryWorkflow } from "@/lib/dfm/workflows/run-backlog-recovery";

// Recovery runs should have enough time to finalize stale runs and safely
// drain a bounded recovery chunk without being cut off mid-cleanup.
export const maxDuration = 300;

async function handleRequest(request: Request, fallbackBody: Record<string, unknown>) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => fallbackBody);
  const input = backlogRecoverySchema.parse(json);
  const result = await runBacklogRecoveryWorkflow({
    skipNotifications: true,
    ...input,
  });

  return NextResponse.json(result);
}

export async function GET(request: Request) {
  return handleRequest(request, {});
}

export async function POST(request: Request) {
  return handleRequest(request, {});
}
