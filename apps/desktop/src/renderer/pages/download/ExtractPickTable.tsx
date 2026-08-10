import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  Image,
  InputNumber,
  Select,
  Table,
  Tag,
  Tooltip,
} from "@arco-design/web-react";
import type { ColumnProps } from "@arco-design/web-react/es/Table/interface";
import { Download, Info, LinkOne, PreviewOpen, Refresh } from "@icon-park/react";
import type {
  AudioContainer,
  ExtractPreview,
  ExtractPreviewItem,
  FormatPreset,
  SubtitleMode,
  YoutubeQuality,
} from "@renderer/api";
import { api } from "@renderer/api";
import { coverUrlFromMediaUrl } from "./homeChatStore";

export type ExtractPickRow = ExtractPreviewItem & {
  key: string;
  cover?: string;
};

type Props = {
  messageId: string;
  extract: ExtractPreview;
  selectedUrls: string[];
  onSelectionChange: (urls: string[]) => void;
  onToggleUrl: (url: string) => void;
  format: FormatPreset;
  formats: FormatPreset[];
  onFormatChange: (v: FormatPreset) => void;
  showYoutube: boolean;
  ytQuality: YoutubeQuality;
  onYtQualityChange: (v: YoutubeQuality) => void;
  audio: AudioContainer;
  onAudioChange: (v: AudioContainer) => void;
  subs: SubtitleMode;
  onSubsChange: (v: SubtitleMode) => void;
  /** Default max for playlist / profile / board list fetch. */
  listMax: number;
  onListMaxChange?: (max: number) => void;
  onReloadList: (max: number) => void | Promise<void>;
  listLoading?: boolean;
  busy?: boolean;
  onDownloadSelected: () => void;
  onDownloadOne: (item: ExtractPreviewItem) => void;
};

function urlsEqual(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().replace(/\/+$/, "");
  return norm(a) === norm(b);
}

function shortHostPath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname}${u.search}`.slice(0, 64);
  } catch {
    return url.slice(0, 64);
  }
}

function formatDuration(item: ExtractPreviewItem): string {
  if (item.durationText) return item.durationText;
  if (typeof item.durationSec === "number" && item.durationSec > 0) {
    const s = Math.round(item.durationSec);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }
  return "—";
}

function isHttpUrl(url?: string): url is string {
  return Boolean(url && /^https?:\/\//i.test(url));
}

/** Prefer mid-size pinimg URLs in the renderer (originals often fail to load). */
function previewCoverUrl(url?: string): string | undefined {
  if (!isHttpUrl(url)) return undefined;
  return url
    .replace(/\/originals\//i, "/474x/")
    .replace(/\/1200x\//i, "/474x/")
    .replace(/\/75x75(?:_RS)?\//i, "/474x/");
}

const ExtractCover: React.FC<{
  src?: string;
  className?: string;
  width?: number | string;
  height?: number | string;
}> = ({ src, className, width, height }) => {
  const resolved = previewCoverUrl(src);
  if (!resolved) {
    return (
      <span
        className={`${className || ""} home-extract-pick__cover--empty`.trim()}
        aria-hidden
      />
    );
  }
  return (
    <Image
      className={className}
      src={resolved}
      alt=""
      width={width}
      height={height}
      preview={false}
      lazyload
      referrerPolicy="no-referrer"
      loader={false}
    />
  );
};

const GridAction: React.FC<{
  tip: string;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}> = ({ tip, onClick, children }) => (
  <Tooltip content={tip}>
    <button
      type="button"
      className="home-extract-pick__pin-action"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(e);
      }}
    >
      {children}
    </button>
  </Tooltip>
);

const ExtractPickTable: React.FC<Props> = ({
  extract,
  selectedUrls,
  onSelectionChange,
  onToggleUrl,
  format,
  formats,
  onFormatChange,
  showYoutube,
  ytQuality,
  onYtQualityChange,
  audio,
  onAudioChange,
  subs,
  onSubsChange,
  listMax,
  onListMaxChange,
  onReloadList,
  listLoading,
  busy,
  onDownloadSelected,
  onDownloadOne,
}) => {
  const [maxDraft, setMaxDraft] = useState(listMax);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [previewSrc, setPreviewSrc] = useState<string | undefined>();
  const cardRef = useRef<HTMLDivElement>(null);
  const tableScrollHideRef = useRef<number | null>(null);

  useEffect(() => {
    setMaxDraft(listMax);
  }, [listMax]);

  const isPinterest =
    extract.provider.id === "pinterest" ||
    /pinterest/i.test(extract.provider.label || "");
  const isTikTok =
    extract.provider.id === "tiktok" || /tiktok/i.test(extract.provider.label || "");

  useEffect(() => {
    if (
      (isPinterest && (extract.mode === "board" || extract.mode === "profile")) ||
      (isTikTok && extract.mode === "profile")
    ) {
      setViewMode("grid");
    }
  }, [isPinterest, isTikTok, extract.mode, extract.sourceUrl]);

  const showMaxControl =
    (showYoutube && (extract.mode === "playlist" || extract.mode === "profile")) ||
    (isPinterest && (extract.mode === "board" || extract.mode === "profile")) ||
    (isTikTok && extract.mode === "profile");

  const rows: ExtractPickRow[] = useMemo(
    () =>
      extract.items.map((item) => ({
        ...item,
        key: `${item.index}-${item.url}`,
        cover: previewCoverUrl(item.coverUrl || coverUrlFromMediaUrl(item.url)),
      })),
    [extract.items]
  );

  useEffect(() => {
    const root = cardRef.current;
    if (!root || viewMode !== "list") return;
    const body = root.querySelector(".arco-table-body") as HTMLElement | null;
    if (!body) return;

    const onScroll = () => {
      body.classList.add("is-scrolling");
      if (tableScrollHideRef.current != null) {
        window.clearTimeout(tableScrollHideRef.current);
      }
      tableScrollHideRef.current = window.setTimeout(() => {
        body.classList.remove("is-scrolling");
        tableScrollHideRef.current = null;
      }, 900);
    };

    body.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      body.removeEventListener("scroll", onScroll);
      if (tableScrollHideRef.current != null) {
        window.clearTimeout(tableScrollHideRef.current);
      }
    };
  }, [rows.length, listLoading, viewMode]);

  const selectedCount = selectedUrls.length;
  const allSelected = rows.length > 0 && selectedCount === rows.length;
  const someSelected = selectedCount > 0 && selectedCount < rows.length;

  const columns: ColumnProps<ExtractPickRow>[] = [
    {
      title: (
        <Checkbox
          checked={allSelected}
          indeterminate={someSelected}
          disabled={rows.length === 0}
          onChange={(checked) =>
            onSelectionChange(checked ? rows.map((r) => r.url) : [])
          }
        />
      ),
      width: 40,
      align: "center",
      className: "tasks-table__col-check",
      headerCellStyle: { padding: "10px 4px" },
      bodyCellStyle: { padding: "10px 4px" },
      render: (_col, row) => (
        <Checkbox
          checked={selectedUrls.some((u) => urlsEqual(u, row.url))}
          onChange={(checked) => {
            if (checked) {
              if (!selectedUrls.some((u) => urlsEqual(u, row.url))) {
                onSelectionChange([...selectedUrls, row.url]);
              }
            } else {
              onSelectionChange(selectedUrls.filter((u) => !urlsEqual(u, row.url)));
            }
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    },
    {
      title: "Task",
      dataIndex: "title",
      ellipsis: true,
      className: "tasks-table__col-task",
      headerCellStyle: { padding: "10px 10px" },
      bodyCellStyle: { padding: "10px 10px" },
      render: (_col, row) => (
        <div className="tasks-table__task">
          <div className="tasks-table__task-main home-extract-pick__task">
            <ExtractCover
              src={row.cover}
              className="home-extract-pick__cover"
              width={44}
              height={44}
            />
            <div className="tasks-table__task-body min-w-0">
              <Tooltip content={row.title || row.url}>
                <div className="tasks-table__task-line">
                  <span className="tasks-table__task-title text-13px font-500 text-t-primary">
                    {row.title?.trim() || `Item ${row.index}`}
                  </span>
                </div>
              </Tooltip>
              <div className="tasks-table__task-msg text-12px text-t-tertiary">
                {shortHostPath(row.url)}
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Source",
      width: 100,
      render: () => (
        <Tag size="small" color="gray" className="tasks-table__source">
          {extract.provider.label || "—"}
        </Tag>
      ),
    },
    {
      title: "Duration",
      width: 88,
      align: "right",
      render: (_col, row) => (
        <div className="tasks-table__size leading-tight text-right">
          <div className="text-12px text-t-primary tabular-nums font-500">
            {formatDuration(row)}
          </div>
          <div className="text-11px text-t-tertiary">length</div>
        </div>
      ),
    },
    {
      title: "Format",
      width: 88,
      render: () => (
        <span className="text-12px text-t-secondary truncate block">{format}</span>
      ),
    },
    {
      title: "Actions",
      width: 84,
      align: "right",
      render: (_col, row) => (
        <div className="tasks-table__actions home-extract-pick__actions flex items-center justify-end gap-2px">
          <Tooltip content="Open URL">
            <Button
              type="text"
              size="mini"
              icon={<LinkOne theme="outline" size="14" />}
              onClick={(e) => {
                e.stopPropagation();
                void api.openExternal(row.url);
              }}
            />
          </Tooltip>
          <Tooltip content="Download this item">
            <Button
              type="text"
              size="mini"
              disabled={busy}
              icon={<Download theme="outline" size="14" />}
              onClick={(e) => {
                e.stopPropagation();
                onDownloadOne(row);
              }}
            />
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <div className="home-extract home-extract--pick">
      <div className="home-extract__section">
        <div className="home-extract__label">Source</div>
        <div className="home-extract__source">
          {extract.title && <div className="home-extract__title">{extract.title}</div>}
          <a
            className="home-extract__url"
            href={extract.sourceUrl}
            onClick={(e) => {
              e.preventDefault();
              void api.openExternal(extract.sourceUrl);
            }}
          >
            {extract.sourceUrl}
          </a>
          <div className="home-extract__stats">
            <span>
              {extract.itemCount} item{extract.itemCount === 1 ? "" : "s"}
            </span>
            <span>·</span>
            <span>{extract.mode}</span>
            {extract.truncated ? (
              <>
                <span>·</span>
                <span>truncated</span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="home-extract__section">
        <div className="home-extract-pick__config">
          <div className="home-extract-pick__config-title">Download options</div>
          <div className="home-extract-pick__config-row">
            <div className="home-extract-pick__fields">
              <div className="home-extract-pick__field">
                <span className="home-extract-pick__field-label">Format</span>
                <Select
                  size="small"
                  style={{ width: 120 }}
                  value={format}
                  onChange={(v) => onFormatChange(v as FormatPreset)}
                >
                  {(formats.length ? formats : (["best", "mp4", "audio-only"] as FormatPreset[])).map(
                    (f) => (
                      <Select.Option key={f} value={f}>
                        {f}
                      </Select.Option>
                    )
                  )}
                </Select>
              </div>
              {showYoutube && format !== "audio-only" && (
                <div className="home-extract-pick__field">
                  <span className="home-extract-pick__field-label">Quality</span>
                  <Select
                    size="small"
                    style={{ width: 110 }}
                    value={ytQuality}
                    onChange={(v) => onYtQualityChange(v as YoutubeQuality)}
                  >
                    {(
                      ["best", "2160", "1440", "1080", "720", "480", "360"] as YoutubeQuality[]
                    ).map((q) => (
                      <Select.Option key={q} value={q}>
                        {q === "best" ? "Best" : `${q}p`}
                      </Select.Option>
                    ))}
                  </Select>
                </div>
              )}
              {showYoutube && format === "audio-only" && (
                <div className="home-extract-pick__field">
                  <span className="home-extract-pick__field-label">Audio</span>
                  <Select
                    size="small"
                    style={{ width: 100 }}
                    value={audio}
                    onChange={(v) => onAudioChange(v as AudioContainer)}
                  >
                    {(["m4a", "mp3", "flac"] as AudioContainer[]).map((a) => (
                      <Select.Option key={a} value={a}>
                        {a.toUpperCase()}
                      </Select.Option>
                    ))}
                  </Select>
                </div>
              )}
              {showYoutube && (
                <div className="home-extract-pick__field">
                  <span className="home-extract-pick__field-label">Subtitles</span>
                  <Select
                    size="small"
                    style={{ width: 130 }}
                    value={subs}
                    onChange={(v) => onSubsChange(v as SubtitleMode)}
                  >
                    <Select.Option value="none">None</Select.Option>
                    <Select.Option value="separate">Separate</Select.Option>
                    <Select.Option value="embed">Embed</Select.Option>
                  </Select>
                </div>
              )}
              {showMaxControl && (
                <div className="home-extract-pick__field">
                  <span className="home-extract-pick__field-label">Max</span>
                  <div className="home-extract-pick__max-row">
                    <InputNumber
                      size="small"
                      style={{ width: 88 }}
                      min={1}
                      max={isPinterest ? 2000 : 500}
                      step={isPinterest ? 25 : 10}
                      value={maxDraft}
                      disabled={Boolean(listLoading || busy)}
                      onChange={(v) => {
                        const cap = isPinterest ? 2000 : 500;
                        const next = Math.max(1, Math.min(cap, Number(v) || listMax));
                        setMaxDraft(next);
                        onListMaxChange?.(next);
                      }}
                    />
                    <Button
                      size="small"
                      type="secondary"
                      loading={listLoading}
                      disabled={busy}
                      icon={<Refresh theme="outline" size="14" />}
                      onClick={() => void onReloadList(maxDraft)}
                    >
                      Get list
                    </Button>
                  </div>
                </div>
              )}
              <div className="home-extract-pick__field">
                <span className="home-extract-pick__field-label">View</span>
                <Select
                  size="small"
                  style={{ width: 100 }}
                  value={viewMode}
                  onChange={(v) => setViewMode(v as "list" | "grid")}
                >
                  <Select.Option value="list">List</Select.Option>
                  <Select.Option value="grid">Grid</Select.Option>
                </Select>
              </div>
            </div>
            <div className="home-extract-pick__config-actions">
              <span className="home-extract__sel-count">
                {selectedCount} selected
                {extract.truncated ? " · truncated" : ""}
              </span>
              <div className="home-extract-pick__config-action-btns">
                <Button
                  size="mini"
                  onClick={() => onSelectionChange(rows.map((r) => r.url))}
                  disabled={rows.length === 0}
                >
                  All
                </Button>
                <Button size="mini" onClick={() => onSelectionChange([])}>
                  None
                </Button>
                <Button
                  type="primary"
                  size="small"
                  loading={busy}
                  disabled={selectedCount === 0}
                  onClick={onDownloadSelected}
                >
                  Download {selectedCount}
                </Button>
              </div>
            </div>
          </div>
          {showMaxControl && (
            <div className="home-extract-pick__hint">
              Set Max, then Get list. Use checkboxes to pick items to download.
            </div>
          )}
        </div>

        {viewMode === "grid" ? (
          <div className="home-extract-pick__masonry" role="list">
            {rows.map((row) => {
              const selected = selectedUrls.some((u) => urlsEqual(u, row.url));
              const title = row.title?.trim() || `Pin ${row.index}`;
              const cover = row.cover;
              return (
                <div
                  key={row.key}
                  role="listitem"
                  className={`home-extract-pick__pin${selected ? " is-selected" : ""}`}
                  onClick={() => onToggleUrl(row.url)}
                >
                  <span
                    className="home-extract-pick__pin-check"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={selected}
                      onChange={() => onToggleUrl(row.url)}
                    />
                  </span>
                  {cover ? (
                    <Image
                      className="home-extract-pick__pin-img"
                      src={cover}
                      alt=""
                      width="100%"
                      title={title}
                      description={extract.provider.label || undefined}
                      footerPosition="inner"
                      simple
                      lazyload
                      referrerPolicy="no-referrer"
                      loader={false}
                      preview={false}
                      actions={[
                        <GridAction
                          key="preview"
                          tip="Preview"
                          onClick={() => setPreviewSrc(cover)}
                        >
                          <PreviewOpen theme="outline" size="14" fill="#fff" />
                        </GridAction>,
                        <GridAction
                          key="download"
                          tip="Download"
                          onClick={() => {
                            if (!busy) onDownloadOne(row);
                          }}
                        >
                          <Download theme="outline" size="14" fill="#fff" />
                        </GridAction>,
                        <GridAction
                          key="info"
                          tip="Open on site"
                          onClick={() => void api.openExternal(row.url)}
                        >
                          <Info theme="outline" size="14" fill="#fff" />
                        </GridAction>,
                      ]}
                    />
                  ) : (
                    <div className="home-extract-pick__pin-empty" aria-hidden />
                  )}
                </div>
              );
            })}
            <Image.Preview
              src={previewSrc || ""}
              visible={Boolean(previewSrc)}
              onVisibleChange={(visible) => {
                if (!visible) setPreviewSrc(undefined);
              }}
              imgAttributes={{ referrerPolicy: "no-referrer" }}
            />
          </div>
        ) : (
          <div ref={cardRef} className="tasks-table-card home-extract-pick__card">
            <Table
              className="tasks-table home-extract-pick__table"
              rowKey="key"
              columns={columns}
              data={rows}
              pagination={false}
              border={false}
              hover
              tableLayoutFixed
              scroll={{ y: 360 }}
              onRow={(record) => ({
                className: selectedUrls.some((u) => urlsEqual(u, record.url))
                  ? "tasks-row-selected"
                  : undefined,
                onClick: (e) => {
                  const target = e.target as HTMLElement;
                  if (
                    target.closest(
                      "button, a, input, .arco-checkbox, .arco-select, .arco-image, .home-extract-pick__actions"
                    )
                  ) {
                    return;
                  }
                  onToggleUrl(record.url);
                },
              })}
            />
          </div>
        )}
        {extract.itemCount > 100 && viewMode === "list" && (
          <div className="home-extract__more">
            Showing first 100 of {extract.itemCount} items
          </div>
        )}
      </div>
    </div>
  );
};

export default ExtractPickTable;
