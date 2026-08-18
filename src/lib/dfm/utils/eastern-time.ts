function getEasternParts(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

export function isScheduledEasternTime(
  targetHour: number,
  targetMinute: number,
  now = new Date(),
  graceMinutes = 5,
) {
  const parts = getEasternParts(now);
  const currentMinuteOfDay = parts.hour * 60 + parts.minute;
  const targetMinuteOfDay = targetHour * 60 + targetMinute;
  const minutesAfterTarget = currentMinuteOfDay - targetMinuteOfDay;

  return minutesAfterTarget >= 0 && minutesAfterTarget <= graceMinutes;
}

export function describeEasternNow(now = new Date()) {
  const parts = getEasternParts(now);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")} ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")} ET`;
}
