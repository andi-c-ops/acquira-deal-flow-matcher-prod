import { NextResponse } from "next/server";

import { verifyCronRequest } from "@/lib/dfm/auth/verify-cron";
import { clickupWorkerSchema } from "@/lib/dfm/domain/schemas";
import { processClickupJobsWorkflow } from "@/lib/dfm/workflows/process-clickup-jobs";

export const maxDuration = 60;

const DEFAULT_MAX_JOBS = 10;

async function handleRequest(request: Request, fallbackBody: Record<string, unknown>) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => fallbackBody);
  const input = clickupWorkerSchema.parse(json);

  const result = await processClickupJobsWorkflow({
    workerId: "vercel-cron-clickup",
    dryRun: input.dryRun ?? false,
    maxJobs: input.maxJobs ?? DEFAULT_MAX_JOBS,
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
