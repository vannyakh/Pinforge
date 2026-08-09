import React from "react";
import { Tag } from "@arco-design/web-react";
import { useApp } from "@renderer/hooks/context/AppContext";

const ProvidersSettings: React.FC = () => {
  const { settings } = useApp();
  if (!settings) return null;

  const live = settings.providers.filter((p) => p.status === "live").length;
  const stub = settings.providers.length - live;

  return (
    <div className="max-w-640px">
      <div className="flex items-start justify-between gap-16px mb-20px">
        <div>
          <div className="text-22px font-600 text-t-primary mb-6px">Providers</div>
          <div className="text-t-secondary text-14px">
            Built-in extractors — fetch + Playwright meta scrape for SPA pages. No yt-dlp binary.
          </div>
        </div>
        <div className="flex gap-8px shrink-0">
          <Tag color="green">{live} live</Tag>
          <Tag color="gray">{stub} soon</Tag>
        </div>
      </div>

      <div className="flex flex-col gap-10px">
        {settings.providers.map((item) => (
          <div
            key={item.id}
            className="bg-2 border border-b-base rd-12px px-16px py-14px flex items-center justify-between gap-12px"
          >
            <div>
              <div className="text-14px font-500 text-t-primary">{item.label}</div>
              <div className="text-12px text-t-tertiary mt-2px">{item.id}</div>
            </div>
            <Tag color={item.status === "live" ? "green" : "orangered"} size="small">
              {item.status === "live" ? "Available" : "Coming soon"}
            </Tag>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProvidersSettings;
