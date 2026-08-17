import { cookies } from "next/headers";

import { getEnv } from "@/lib/dfm/config/env";

export const OPERATOR_SESSION_COOKIE = "dfm_operator_session";

export async function hasOperatorSession() {
  const cookieStore = await cookies();
  return cookieStore.get(OPERATOR_SESSION_COOKIE)?.value === getEnv().DFM_INTERNAL_SECRET;
}
