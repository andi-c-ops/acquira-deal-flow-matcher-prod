import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { getEnv } from "@/lib/dfm/config/env";
import { OPERATOR_SESSION_COOKIE } from "@/lib/dfm/auth/operator-session";

export const maxDuration = 60;

export async function POST(request: Request) {
  const formData = await request.formData();
  const action = String(formData.get("action") ?? "");
  const cookieStore = await cookies();

  if (action === "logout") {
    cookieStore.delete(OPERATOR_SESSION_COOKIE);
    return NextResponse.redirect(new URL("/dfm/operator", request.url), { status: 303 });
  }

  const secret = String(formData.get("secret") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/dfm/operator");

  if (secret !== getEnv().DFM_INTERNAL_SECRET) {
    return NextResponse.redirect(new URL(`${returnTo}?error=unauthorized`, request.url), {
      status: 303,
    });
  }

  cookieStore.set(OPERATOR_SESSION_COOKIE, secret, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  return NextResponse.redirect(new URL(returnTo, request.url), { status: 303 });
}
