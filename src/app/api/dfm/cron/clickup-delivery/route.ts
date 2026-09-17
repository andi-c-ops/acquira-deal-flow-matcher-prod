import { NextResponse } from "next/server";

import { verifyCronRequest } from "@/lib/dfm/auth/verify-cron";
import { clickupWorkerSchema } from "@/lib/dfm/domain/schemas";
import { processClickupJobsWorkflow } from "@/lib/dfm/workflows/process-clickup-jobs";

export const maxDuration = 60;

// Keep the sequential worker inside the Vercel runtime budget even when
// ClickUp is slow. The queue remains durable, so the next minute invocation
// continues with the next bounded batch.
const DEFAULT_MAX_JOBS = 2;
const MAX_JOBS_PER_INVOCATION = 2;

async function handleRequest(request: Request, fallbackBody: Record<string, unknown>) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => fallbackBody);
  const input = clickupWorkerSchema.parse(json);

  const result = await processClickupJobsWorkflow({
    workerId: "vercel-cron-clickup",
    dryRun: input.dryRun ?? false,
    maxJobs: Math.min(input.maxJobs ?? DEFAULT_MAX_JOBS, MAX_JOBS_PER_INVOCATION),
    strictFailure: false,
    skipNotifications: input.skipNotifications,
  });

  return NextResponse.json(result);
}

export async function GET(request: Request) {
  return handleRequest(request, {});
}

export async function POST(request: Request) {
  return handleRequest(request, {});
}
