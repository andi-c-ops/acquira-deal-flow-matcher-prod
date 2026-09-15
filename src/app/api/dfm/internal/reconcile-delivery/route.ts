import { NextResponse } from "next/server";
import { z } from "zod";

import { hasOperatorSession } from "@/lib/dfm/auth/operator-session";
import { reconcileClickupDeliveryJob } from "@/lib/dfm/workflows/reconcile-clickup-delivery";

export const maxDuration = 60;

const reconcileSchema = z.object({
  jobId: z.string().uuid(),
  taskId: z.string().min(1).max(100),
  confirmation: z.literal("RECONCILE_EXISTING_TASK"),
  skipNotifications: z.boolean().optional(),
});

export async function POST(request: Request) {
  if (!(await hasOperatorSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";
    const rawInput = contentType.includes("application/json")
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
    const input = reconcileSchema.parse(rawInput);
    const result = await reconcileClickupDeliveryJob(input);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof z.ZodError ? 400 : 409;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
