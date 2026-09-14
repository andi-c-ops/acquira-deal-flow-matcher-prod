import { NextResponse } from "next/server";

import { verifyInternalRequest } from "@/lib/dfm/auth/verify-internal-request";
import { probeAirtableCredential } from "@/lib/dfm/providers/airtable-client";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function redactedJson(body: Record<string, unknown>, status: number) {
  const response = NextResponse.json(body, { status });
  response.headers.set("cache-control", "no-store");
  response.headers.set("x-robots-tag", "noindex, nofollow");
  return response;
}

export async function GET(request: Request) {
  if (!verifyInternalRequest(request)) {
    return redactedJson({ ok: false, error: "unauthorized" }, 401);
  }

  try {
    const result = await probeAirtableCredential();
    return redactedJson(result, result.ok ? 200 : 502);
  } catch {
    return redactedJson(
      {
        ok: false,
        provider: "airtable",
        status: "configuration_error",
        checkedAt: new Date().toISOString(),
      },
      500,
    );
  }
}
