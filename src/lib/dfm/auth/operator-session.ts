import { cookies } from "next/headers";

import { getEnv } from "@/lib/dfm/config/env";
import { verifyOperatorSecret } from "@/lib/dfm/auth/verify-operator-secret";

export const OPERATOR_SESSION_COOKIE = "dfm_operator_session";

export async function hasOperatorSession() {
  const cookieStore = await cookies();
  const env = getEnv();
  return verifyOperatorSecret(cookieStore.get(OPERATOR_SESSION_COOKIE)?.value, env);
}
