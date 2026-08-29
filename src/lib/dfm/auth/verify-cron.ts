import { getEnv } from "@/lib/dfm/config/env";
import { matchesBearerSecret } from "@/lib/dfm/auth/secret-rollover";

export function verifyCronRequest(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  const env = getEnv();
  return matchesBearerSecret(authHeader, env.CRON_SECRET, env.CRON_SECRET_NEXT);
}
