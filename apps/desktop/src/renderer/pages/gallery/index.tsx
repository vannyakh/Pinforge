import React, { useMemo, useState } from "react";
import { Button, Empty, Space, Tag, Typography, Image } from "@arco-design/web-react";
import { useApp } from "@renderer/hooks/context/AppContext";
import { api, type DownloadPack, type HistoryItem, type PackStatus } from "@renderer/api";

function toMediaUrl(p: string): string {
  return `pinmedia://${p.replace(/\\/g, "/")}`;
}

function isImagePath(p: string): boolean {
  return /\.(png|jpe?g|webp|gif)$/i.test(p);
}

function statusColor(status: PackStatus): string {
  switch (status) {
    case "done":
      return "green";
    case "partial":
      return "orange";
    case "failed":
      return "red";
    case "running":
      return "arcoblue";
    default:
      return "gray";
  }
}

const GalleryPage: React.FC = () => {
  const { packs, history, clearHistory, itemsForPack } = useApp();
  const [openId, setOpenId] = useState<string | null>(null);

  const visiblePacks = useMemo(
    () => packs.filter((p) => p.status !== "running" || p.itemIds.length > 0),
    [packs]
  );

  if (visiblePacks.length === 0 && history.length === 0) {
    return (
      <div>
        <div className="text-20px font-600 text-t-primary mb-8px">Gallery</div>
        <Empty description="Download packs (grouped by URL) will show up here." />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <div className="text-20px font-600 text-t-primary">Gallery</div>
          <Typography.Text type="secondary">
            {visiblePacks.length} pack{visiblePacks.length === 1 ? "" : "s"} · history by URL
          </Typography.Text>
        </div>
        <Button type="secondary" onClick={() => clearHistory()}>
          Clear history
        </Button>
      </div>

      <div className="flex flex-col gap-12px">
        {visiblePacks.map((pack) => (
          <PackCard
            key={pack.id}
            pack={pack}
            items={itemsForPack(pack.id)}
            open={openId === pack.id}
            onToggle={() => setOpenId((id) => (id === pack.id ? null : pack.id))}
          />
        ))}
      </div>
    </div>
  );
};

const PackCard: React.FC<{
  pack: DownloadPack;
  items: HistoryItem[];
  open: boolean;
  onToggle: () => void;
}> = ({ pack, items, open, onToggle }) => {
  const preview = items.find((i) => isImagePath(i.outPath)) ?? items[0];

  return (
    <div className="bg-2 border border-b-base rd-12px overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-14px px-16px py-14px text-left border-none bg-transparent cursor-pointer hover:bg-hover"
        onClick={onToggle}
      >
        <div className="size-56px rd-8px bg-3 shrink-0 overflow-hidden flex-center text-11px text-t-tertiary">
          {preview && isImagePath(preview.outPath) ? (
            <Image
              src={toMediaUrl(preview.outPath)}
              alt=""
              width={56}
              height={56}
              style={{ objectFit: "cover" }}
              preview={false}
            />
          ) : (
            pack.provider ?? "pack"
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-14px font-500 text-t-primary truncate">
            {pack.title || pack.url}
          </div>
          <div className="text-12px text-t-tertiary truncate mt-2px">{pack.url}</div>
          <div className="flex gap-6px flex-wrap mt-6px items-center">
            <Tag size="small" color={statusColor(pack.status)}>
              {pack.status}
            </Tag>
            {pack.provider && (
              <Tag size="small" color="arcoblue">
                {pack.provider}
              </Tag>
            )}
            <span className="text-12px text-t-tertiary">
              {pack.itemIds.length} file{pack.itemIds.length === 1 ? "" : "s"}
              {pack.errorCount ? ` · ${pack.errorCount} failed` : ""}
            </span>
          </div>
        </div>
        <span className="text-12px text-t-tertiary shrink-0">
          {new Date(pack.updatedAt).toLocaleString()}
        </span>
      </button>

      {open && (
        <div className="px-16px pb-16px pt-4px border-t border-b-base flex flex-col gap-12px">
          {items.length === 0 ? (
            <Empty description="No files in this pack yet." />
          ) : (
            items.map((item) => (
              <div key={item.id} className="flex gap-12px items-start">
                <div className="size-72px rd-8px bg-3 shrink-0 overflow-hidden flex-center text-11px text-t-tertiary">
                  {isImagePath(item.outPath) ? (
                    <Image
                      src={toMediaUrl(item.outPath)}
                      alt=""
                      width={72}
                      height={72}
                      style={{ objectFit: "cover" }}
                      preview
                    />
                  ) : (
                    item.kind ?? "file"
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-13px font-500 text-t-primary truncate">
                    {item.title || item.outPath.split(/[/\\]/).pop()}
                  </div>
                  <div className="text-12px text-t-tertiary mt-2px">
                    {item.kind ?? "media"} · {item.preset}
                  </div>
                  <Space className="mt-6px">
                    <Button type="text" size="mini" onClick={() => api.openPath(item.outPath)}>
                      Open
                    </Button>
                    <Button
                      type="text"
                      size="mini"
                      onClick={() => api.showItemInFolder(item.outPath)}
                    >
                      Show in folder
                    </Button>
                  </Space>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default GalleryPage;
