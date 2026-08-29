import { getEnv } from "@/lib/dfm/config/env";
import { matchesBearerSecret } from "@/lib/dfm/auth/secret-rollover";

export function verifyInternalRequest(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  const env = getEnv();
  return matchesBearerSecret(
    authHeader,
    env.DFM_INTERNAL_SECRET,
    env.DFM_INTERNAL_SECRET_NEXT,
  );
}
