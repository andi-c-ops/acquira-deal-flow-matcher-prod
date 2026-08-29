import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function matchesConfiguredSecret(
  candidate: string | null | undefined,
  current: string | null | undefined,
  next: string | null | undefined,
): boolean {
  if (!candidate) return false;

  const configuredSecrets = [current, next].filter(
    (secret): secret is string => Boolean(secret),
  );
  if (configuredSecrets.length === 0) return false;

  const candidateDigest = digest(candidate);
  let matched = 0;

  for (const secret of configuredSecrets) {
    matched |= timingSafeEqual(candidateDigest, digest(secret)) ? 1 : 0;
  }

  return matched === 1;
}

export function matchesBearerSecret(
  authorization: string | null | undefined,
  current: string | null | undefined,
  next: string | null | undefined,
): boolean {
  const prefix = "Bearer ";
  if (!authorization?.startsWith(prefix)) return false;

  return matchesConfiguredSecret(authorization.slice(prefix.length), current, next);
}
