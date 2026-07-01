export function toIsoString(value: Date): string {
  return value.toISOString();
}

export function hoursAgo(hours: number, base = new Date()): Date {
  return new Date(base.getTime() - hours * 60 * 60 * 1000);
}

export function parseTimestampToIso(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}
