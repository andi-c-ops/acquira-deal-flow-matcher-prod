import { getEnv } from "@/lib/dfm/config/env";

export function verifyCronRequest(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${getEnv().CRON_SECRET}`;
}
