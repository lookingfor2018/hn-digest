import { DEFAULT_TIMEZONE, SCHEDULED_SLOTS } from "./constants.js";
import type { RunMode, RunSlot, ScheduledSlot } from "./types.js";

function getChinaParts(date: Date): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
}

function mapParts(parts: Intl.DateTimeFormatPart[]): Record<string, string> {
  return parts.reduce<Record<string, string>>((accumulator, part) => {
    if (part.type !== "literal") {
      accumulator[part.type] = part.value;
    }
    return accumulator;
  }, {});
}

export function formatBatchId(date: Date): string {
  const parts = mapParts(getChinaParts(date));
  return `${parts.year}-${parts.month}-${parts.day}-${parts.hour}${parts.minute}`;
}

export function formatChinaDisplay(date: Date): string {
  const parts = mapParts(getChinaParts(date));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function resolveSlot(mode: RunMode, providedSlot?: RunSlot, now: Date = new Date()): RunSlot {
  if (mode === "manual") {
    return "manual";
  }

  if (providedSlot && providedSlot !== "manual") {
    return providedSlot;
  }

  const hourMinute = formatChinaDisplay(now).slice(-5) as ScheduledSlot;
  const matched = SCHEDULED_SLOTS.find((slot) => slot === hourMinute);
  return matched ?? "08:00";
}
