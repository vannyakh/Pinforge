import dayjs, { type Dayjs } from "dayjs";

export type PublishScheduleMode = "now" | "schedule";

export const META_MIN_SCHEDULE_LEAD_MS = 10 * 60 * 1000;
export const YOUTUBE_MIN_SCHEDULE_LEAD_MS = 15 * 60 * 1000;

export function defaultScheduleDayjs(minLeadMs: number, bufferMs = 5 * 60 * 1000): Dayjs {
  const date = new Date(Date.now() + minLeadMs + bufferMs);
  date.setSeconds(0, 0);
  return dayjs(date);
}

export function formatScheduleLabel(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function scheduleDayjsToUnixSec(value: Dayjs | undefined): number | undefined {
  if (!value) return undefined;
  const ms = value.toDate().getTime();
  if (!Number.isFinite(ms)) return undefined;
  return Math.floor(ms / 1000);
}

export function isScheduleTimeValid(unixSec: number | undefined, minLeadMs: number): boolean {
  if (!unixSec) return false;
  return unixSec * 1000 >= Date.now() + minLeadMs;
}

export function buildPublishTiming(
  mode: PublishScheduleMode,
  scheduleValue: Dayjs | undefined
): { mode: "now" } | { mode: "schedule"; scheduledPublishTime?: number } {
  if (mode !== "schedule") return { mode: "now" };
  return {
    mode: "schedule",
    scheduledPublishTime: scheduleDayjsToUnixSec(scheduleValue),
  };
}
