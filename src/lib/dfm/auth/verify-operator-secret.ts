import type { DfmEnv } from "@/lib/dfm/config/env";
import { matchesConfiguredSecret } from "@/lib/dfm/auth/secret-rollover";

type OperatorSecretEnv = Pick<
  DfmEnv,
  "DFM_INTERNAL_SECRET" | "DFM_INTERNAL_SECRET_NEXT"
>;

export function verifyOperatorSecret(
  candidate: string | null | undefined,
  env: OperatorSecretEnv,
): boolean {
  return matchesConfiguredSecret(
    candidate,
    env.DFM_INTERNAL_SECRET,
    env.DFM_INTERNAL_SECRET_NEXT,
  );
}
