import React from "react";
import { Empty, Tag } from "@arco-design/web-react";
import { AlarmClock } from "@icon-park/react";

const SchedulePage: React.FC = () => (
  <div className="max-w-560px mx-auto flex flex-col items-center justify-center min-h-420px text-center px-24px">
    <div className="size-64px rd-full bg-2 border border-b-base flex-center mb-20px text-t-secondary">
      <AlarmClock theme="outline" size="28" fill="currentColor" strokeWidth={3} />
    </div>
    <div className="flex items-center gap-10px mb-10px">
      <div className="text-22px font-600 text-t-primary">Schedule</div>
      <Tag color="orangered" size="small">
        Coming soon
      </Tag>
    </div>
    <div className="text-t-secondary text-14px leading-relaxed max-w-420px mb-24px">
      Timed and recurring downloads will live here — queue a URL for later, set intervals, and
      review scheduled packs. Not available in this build yet.
    </div>
    <Empty description="No scheduled jobs" />
  </div>
);

export default SchedulePage;
