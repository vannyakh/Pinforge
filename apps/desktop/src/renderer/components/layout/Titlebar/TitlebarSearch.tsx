import React, { useMemo, useState } from "react";
import { Empty, Input, Popover } from "@arco-design/web-react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@renderer/hooks/context/AppContext";

const PAGES = [
  { path: "/", label: "Home", hint: "Download composer" },
  { path: "/tasks", label: "Tasks", hint: "Active & recent jobs" },
  { path: "/gallery", label: "Gallery", hint: "Saved packs" },
  { path: "/schedule", label: "Schedule", hint: "Coming soon" },
  { path: "/settings/system", label: "Settings", hint: "System & environment" },
] as const;

type TitlebarSearchProps = {
  renderTrigger: (opts: { onClick: () => void }) => React.ReactNode;
};

const TitlebarSearch: React.FC<TitlebarSearchProps> = ({ renderTrigger }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { packs } = useApp();

  const q = query.trim().toLowerCase();

  const pageHits = useMemo(
    () =>
      PAGES.filter(
        (p) => !q || p.label.toLowerCase().includes(q) || p.hint.toLowerCase().includes(q)
      ),
    [q]
  );

  const packHits = useMemo(() => {
    if (!q) return packs.slice(0, 6);
    return packs
      .filter(
        (p) =>
          p.url.toLowerCase().includes(q) ||
          (p.title ?? "").toLowerCase().includes(q) ||
          (p.provider ?? "").toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [packs, q]);

  const go = (path: string) => {
    setOpen(false);
    setQuery("");
    void navigate(path);
  };

  return (
    <Popover
      trigger="click"
      position="bl"
      popupVisible={open}
      onVisibleChange={(v) => {
        setOpen(v);
        if (!v) setQuery("");
      }}
      content={
        <div className="titlebar-search-panel w-320px max-h-360px overflow-hidden flex flex-col">
          <Input
            allowClear
            autoFocus
            value={query}
            onChange={setQuery}
            placeholder="Search pages or downloads…"
            className="mb-10px"
          />
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-10px">
            {pageHits.length > 0 && (
              <div>
                <div className="text-11px text-t-tertiary uppercase tracking-wide mb-4px px-2px">
                  Pages
                </div>
                {pageHits.map((p) => (
                  <button
                    key={p.path}
                    type="button"
                    className="titlebar-search-item"
                    onClick={() => go(p.path)}
                  >
                    <span className="text-13px text-t-primary font-500">{p.label}</span>
                    <span className="text-12px text-t-tertiary">{p.hint}</span>
                  </button>
                ))}
              </div>
            )}

            {packHits.length > 0 && (
              <div>
                <div className="text-11px text-t-tertiary uppercase tracking-wide mb-4px px-2px">
                  Downloads
                </div>
                {packHits.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="titlebar-search-item"
                    onClick={() => go("/gallery")}
                    title={p.url}
                  >
                    <span className="text-13px text-t-primary font-500 truncate">
                      {p.title || p.provider || "Pack"}
                    </span>
                    <span className="text-12px text-t-tertiary truncate">{p.url}</span>
                  </button>
                ))}
              </div>
            )}

            {pageHits.length === 0 && packHits.length === 0 && (
              <Empty className="py-12px" description="No matches" />
            )}
          </div>
        </div>
      }
    >
      {renderTrigger({ onClick: () => setOpen((v) => !v) })}
    </Popover>
  );
};

export default TitlebarSearch;
