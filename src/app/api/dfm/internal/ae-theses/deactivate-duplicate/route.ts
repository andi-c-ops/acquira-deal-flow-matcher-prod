import { NextResponse } from "next/server";

import { hasOperatorSession } from "@/lib/dfm/auth/operator-session";
import { archiveAeThesis, getAeThesisById } from "@/lib/dfm/db/repositories/ae-theses";
import { cancelOpenDeliveryJobsForAeThesis } from "@/lib/dfm/db/repositories/delivery-jobs";
import { unwrapSupabaseResult } from "@/lib/dfm/utils/supabase";

export const maxDuration = 30;

function normalizeName(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

function hasClickupDestination(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function redirectWithStatus(request: Request, status: string) {
  return NextResponse.redirect(new URL(`/dfm/operator?dedupe=${status}`, request.url), {
    status: 303,
  });
}

export async function POST(request: Request) {
  if (!(await hasOperatorSession())) {
    return redirectWithStatus(request, "unauthorized");
  }

  const formData = await request.formData();
  const archiveAeThesisId = String(formData.get("archiveAeThesisId") ?? "");
  const retainAeThesisId = String(formData.get("retainAeThesisId") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (!archiveAeThesisId || !retainAeThesisId || archiveAeThesisId === retainAeThesisId || confirmation !== "ARCHIVE_DUPLICATE") {
    return redirectWithStatus(request, "invalid");
  }

  try {
    const archiveCandidate = unwrapSupabaseResult(await getAeThesisById(archiveAeThesisId)) as Record<string, unknown>;
    const retainedThesis = unwrapSupabaseResult(await getAeThesisById(retainAeThesisId)) as Record<string, unknown>;

    const safeDuplicatePair =
      archiveCandidate.status === "active" &&
      retainedThesis.status === "active" &&
      normalizeName(archiveCandidate.ae_name) === normalizeName(retainedThesis.ae_name) &&
      archiveCandidate.delivery_min_match_quality === "Moderate" &&
      !hasClickupDestination(archiveCandidate.clickup_list_id) &&
      retainedThesis.delivery_min_match_quality === "Strong" &&
      hasClickupDestination(retainedThesis.clickup_list_id);

    if (!safeDuplicatePair) {
      return redirectWithStatus(request, "not-safe");
    }

    // This only stops work that has not reached ClickUp. Existing deliveries are preserved.
    unwrapSupabaseResult(await cancelOpenDeliveryJobsForAeThesis(archiveAeThesisId));
    unwrapSupabaseResult(await archiveAeThesis(archiveAeThesisId));

    return redirectWithStatus(request, "success");
  } catch {
    return redirectWithStatus(request, "failed");
  }
}
