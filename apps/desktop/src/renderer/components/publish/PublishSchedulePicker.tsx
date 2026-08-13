import React from "react";
import classNames from "classnames";
import { DatePicker, Switch } from "@arco-design/web-react";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import {
  formatScheduleLabel,
  isScheduleTimeValid,
  scheduleDayjsToUnixSec,
  type PublishScheduleMode,
} from "./publishSchedule";

export type PublishSchedulePickerProps = {
  mode: PublishScheduleMode;
  onModeChange: (mode: PublishScheduleMode) => void;
  scheduleValue: Dayjs | undefined;
  onScheduleChange: (value: Dayjs | undefined) => void;
  minLeadMs: number;
  className?: string;
  toggleLabel?: string;
  disabled?: boolean;
};

export default function PublishSchedulePicker({
  mode,
  onModeChange,
  scheduleValue,
  onScheduleChange,
  minLeadMs,
  className,
  toggleLabel = "Enable schedule",
  disabled = false,
}: PublishSchedulePickerProps): React.ReactElement {
  const unixSec = scheduleDayjsToUnixSec(scheduleValue);
  const scheduleReady = mode !== "schedule" || isScheduleTimeValid(unixSec, minLeadMs);
  const minLeadMinutes = Math.ceil(minLeadMs / 60_000);
  const scheduleEnabled = mode === "schedule";

  return (
    <div className={classNames("publish-timing flex flex-col gap-10px", className)}>
      <div className="publish-timing__toggle flex items-center justify-between gap-12px">
        <span className="text-13px text-t-primary">{toggleLabel}</span>
        <Switch
          checked={scheduleEnabled}
          disabled={disabled}
          onChange={(checked) => onModeChange(checked ? "schedule" : "now")}
        />
      </div>
      {scheduleEnabled ? (
        <div className="flex flex-col gap-6px">
          <DatePicker
            showTime={{
              defaultValue: dayjs().add(minLeadMs + 60_000, "millisecond"),
            }}
            allowClear={false}
            disabled={disabled}
            format="YYYY-MM-DD HH:mm"
            className="publish-schedule-picker"
            style={{ width: "100%" }}
            value={scheduleValue}
            onChange={(_valueString, date) => onScheduleChange(date)}
            disabledDate={(current) => current.isBefore(dayjs().startOf("day"))}
          />
          {unixSec ? (
            <div className="text-12px text-t-tertiary">
              {scheduleReady
                ? `Scheduled for ${formatScheduleLabel(unixSec)}`
                : `Choose a time at least ${minLeadMinutes} minutes from now.`}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
