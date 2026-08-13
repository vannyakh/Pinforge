import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Checkbox, Message, Radio, Spin } from "@arco-design/web-react";
import { useNavigate } from "react-router-dom";
import AionModal from "@renderer/components/base/AionModal";
import MetaPublishComposeFields from "@renderer/components/publish/MetaPublishComposeFields";
import {
  api,
  type MetaPageSummary,
  type MetaPostResult,
  type MetaPublishPublic,
  type MetaPublishTiming,
  type MetaPublishTimingMode,
} from "@renderer/api";
import facebookLogo from "@renderer/assets/provider-logos/facebook.svg";
import {
  META_POST_TYPE_LABELS,
  carouselSlidesForPublish,
  isPublishDraftReady,
  useMetaPublishStore,
} from "@renderer/pages/publish/metaPublishStore";

const MIN_SCHEDULE_LEAD_MS = 10 * 60 * 1000;

function defaultScheduleLocalValue(): string {
  const date = new Date(Date.now() + MIN_SCHEDULE_LEAD_MS + 5 * 60 * 1000);
  date.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatScheduleLabel(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const MetaPublishModal: React.FC = () => {
  const navigate = useNavigate();
  const modalOpen = useMetaPublishStore((s) => s.modalOpen);
  const modalMode = useMetaPublishStore((s) => s.modalMode);
  const postType = useMetaPublishStore((s) => s.postType);
  const message = useMetaPublishStore((s) => s.message);
  const filePath = useMetaPublishStore((s) => s.filePath);
  const carouselSlides = useMetaPublishStore((s) => s.carouselSlides);
  const link = useMetaPublishStore((s) => s.link);
  const sourceLabel = useMetaPublishStore((s) => s.sourceLabel);
  const hidePostTypePicker = useMetaPublishStore((s) => s.hidePostTypePicker);
  const closePublish = useMetaPublishStore((s) => s.closePublish);

  const [config, setConfig] = useState<MetaPublishPublic | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [pages, setPages] = useState<MetaPageSummary[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [publishProgress, setPublishProgress] = useState<string | null>(null);
  const [publishMode, setPublishMode] = useState<MetaPublishTimingMode>("now");
  const [scheduleLocal, setScheduleLocal] = useState(defaultScheduleLocalValue);

  const isCarousel = postType === "video_carousel";
  const needsFile = postType === "photo" || postType === "video";

  const contentReady = useMemo(
    () => isPublishDraftReady({ postType, message, filePath, carouselSlides }),
    [postType, message, filePath, carouselSlides]
  );

  const refreshConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      setConfig(await api.getMetaPublish());
    } catch {
      setConfig(null);
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  const loadPages = useCallback(async () => {
    setLoadingPages(true);
    try {
      setPages(await api.listMetaPages());
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
      setPages([]);
    } finally {
      setLoadingPages(false);
    }
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    void refreshConfig();
  }, [modalOpen, refreshConfig]);

  useEffect(() => {
    if (!modalOpen || modalMode !== "pages") return;
    void loadPages();
  }, [modalOpen, modalMode, loadPages]);

  useEffect(() => {
    if (!modalOpen || modalMode !== "pages") return;
    setSelectedPageIds(config?.pageId ? [config.pageId] : []);
    setPublishMode("now");
    setScheduleLocal(defaultScheduleLocalValue());
  }, [modalOpen, modalMode, config?.pageId]);

  const selectablePageIds = useMemo(() => pages.map((p) => p.id), [pages]);
  const allPagesSelected =
    selectablePageIds.length > 0 && selectablePageIds.every((id) => selectedPageIds.includes(id));
  const somePagesSelected =
    !allPagesSelected && selectablePageIds.some((id) => selectedPageIds.includes(id));

  const togglePage = (pageId: string, checked: boolean) => {
    setSelectedPageIds((prev) => {
      if (checked) return prev.includes(pageId) ? prev : [...prev, pageId];
      return prev.filter((id) => id !== pageId);
    });
  };

  const publishTiming = useMemo((): MetaPublishTiming | undefined => {
    if (publishMode !== "schedule") return { mode: "now" };
    if (!scheduleLocal.trim()) return undefined;
    const ms = new Date(scheduleLocal).getTime();
    if (!Number.isFinite(ms)) return undefined;
    return { mode: "schedule", scheduledPublishTime: Math.floor(ms / 1000) };
  }, [publishMode, scheduleLocal]);

  const scheduleReady = useMemo(() => {
    if (publishMode !== "schedule") return true;
    if (!publishTiming?.scheduledPublishTime) return false;
    return publishTiming.scheduledPublishTime * 1000 >= Date.now() + MIN_SCHEDULE_LEAD_MS;
  }, [publishMode, publishTiming]);

  const publishPayload = useMemo(
    () => ({
      message,
      filePath: needsFile ? filePath.trim() : undefined,
      postType,
      link: isCarousel ? link.trim() : undefined,
      carouselSlides: isCarousel ? carouselSlidesForPublish(carouselSlides) : undefined,
      timing: publishTiming,
    }),
    [message, needsFile, filePath, postType, isCarousel, link, carouselSlides, publishTiming]
  );

  const publishToSinglePage = async (): Promise<MetaPostResult> => {
    if (!config?.hasPageToken) {
      return { ok: false, message: "Select a Facebook Page before posting." };
    }
    return api.postToMetaPage(publishPayload);
  };

  const publishCompose = async () => {
    if (!contentReady) {
      Message.warning("Complete the post content before publishing.");
      return;
    }
    if (!scheduleReady) {
      Message.warning("Choose a schedule time at least 10 minutes from now.");
      return;
    }
    setPublishing(true);
    try {
      const result = await publishToSinglePage();
      if (!result.ok) {
        Message.error(result.message);
        return;
      }
      Message.success(result.postId ? `${result.message} (ID: ${result.postId})` : result.message);
      closePublish();
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  };

  const publishToSelectedPages = async () => {
    if (selectedPageIds.length === 0) {
      Message.warning("Select at least one Facebook Page.");
      return;
    }
    if (!contentReady) {
      Message.warning("Complete the post content before publishing.");
      return;
    }
    if (!scheduleReady) {
      Message.warning("Choose a schedule time at least 10 minutes from now.");
      return;
    }

    const originalPageId = config?.pageId;
    const originalPageName = config?.pageName;
    setPublishing(true);
    const results: Array<{ pageName: string; ok: boolean; message: string }> = [];

    try {
      for (let i = 0; i < selectedPageIds.length; i++) {
        const pageId = selectedPageIds[i]!;
        const page = pages.find((p) => p.id === pageId);
        setPublishProgress(
          `${publishMode === "schedule" ? "Scheduling" : "Publishing"} to ${page?.name ?? "Page"} (${i + 1}/${selectedPageIds.length})…`
        );
        await api.selectMetaPage({ pageId, pageName: page?.name });
        const result = await api.postToMetaPage(publishPayload);
        results.push({
          pageName: page?.name ?? pageId,
          ok: result.ok,
          message: result.message,
        });
      }

      if (originalPageId) {
        await api.selectMetaPage({ pageId: originalPageId, pageName: originalPageName });
      }

      const okCount = results.filter((r) => r.ok).length;
      if (okCount === results.length) {
        const verb = publishMode === "schedule" ? "Scheduled" : "Published";
        Message.success(
          `${verb} on ${okCount} Page${okCount === 1 ? "" : "s"}: ${results.map((r) => r.pageName).join(", ")}`
        );
        closePublish();
      } else if (okCount > 0) {
        const verb = publishMode === "schedule" ? "Scheduled" : "Published";
        const failed = results.filter((r) => !r.ok).map((r) => `${r.pageName}: ${r.message}`);
        Message.warning(`${verb} on ${okCount}/${results.length}. Failed: ${failed.join("; ")}`);
      } else {
        Message.error(results[0]?.message ?? "Could not publish to the selected Pages.");
      }
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
      setPublishProgress(null);
    }
  };

  const openSettings = () => {
    closePublish();
    void navigate("/settings/publishing");
  };

  const publishTimingFields = (
    <div className="publish-timing flex flex-col gap-10px">
      <div className="text-12px font-600 uppercase tracking-wide text-t-secondary">When to publish</div>
      <Radio.Group
        value={publishMode}
        onChange={(v) => setPublishMode(v as MetaPublishTimingMode)}
      >
        <Radio value="now">Publish now</Radio>
        <Radio value="schedule">Schedule</Radio>
      </Radio.Group>
      {publishMode === "schedule" ? (
        <div className="flex flex-col gap-6px">
          <input
            type="datetime-local"
            className="publish-timing__input"
            value={scheduleLocal}
            onChange={(e) => setScheduleLocal(e.target.value)}
          />
          {publishTiming?.scheduledPublishTime ? (
            <div className="text-12px text-t-tertiary">
              {scheduleReady
                ? `Scheduled for ${formatScheduleLabel(publishTiming.scheduledPublishTime)}`
                : "Choose a time at least 10 minutes from now."}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const primaryActionLabel =
    publishMode === "schedule"
      ? selectedPageIds.length > 0
        ? `Schedule on ${selectedPageIds.length} Page${selectedPageIds.length === 1 ? "" : "s"}`
        : "Schedule"
      : selectedPageIds.length > 0
        ? `Publish to ${selectedPageIds.length} Page${selectedPageIds.length === 1 ? "" : "s"}`
        : "Publish now";

  const pagePickerFooter = (
    <>
      <Button onClick={closePublish} disabled={publishing}>
        Cancel
      </Button>
      <Button
        type="primary"
        loading={publishing}
        disabled={selectedPageIds.length === 0 || !contentReady || !scheduleReady}
        onClick={() => void publishToSelectedPages()}
      >
        {primaryActionLabel}
      </Button>
    </>
  );

  const composeFooter = (
    <>
      <Button onClick={closePublish}>Cancel</Button>
      <Button
        type="primary"
        loading={publishing}
        disabled={!contentReady || !config?.hasPageToken || !scheduleReady}
        onClick={() => void publishCompose()}
      >
        {publishMode === "schedule" ? "Schedule post" : "Publish now"}
      </Button>
    </>
  );

  return (
    <AionModal
      variant="standard"
      visible={modalOpen}
      header={{
        title: (
          <span className="inline-flex items-center gap-8px">
            <img src={facebookLogo} alt="" className="remote-channel-logo" draggable={false} />
            {modalMode === "pages" ? "Select Pages to publish" : "Publish to Facebook Page"}
          </span>
        ),
        showClose: true,
      }}
      onCancel={closePublish}
      autoFocus={false}
      focusLock
      unmountOnExit
      footer={modalMode === "pages" ? pagePickerFooter : composeFooter}
      style={{ width: modalMode === "pages" ? 520 : isCarousel ? 720 : 520 }}
    >
      {loadingConfig ? (
        <div className="text-13px text-t-secondary py-12px">Loading…</div>
      ) : !config?.connected ? (
        <div className="flex flex-col gap-12px py-4px">
          <p className="text-13px text-t-secondary m-0">
            Connect your Meta Developer App and Facebook account in Publishing settings before
            posting.
          </p>
          <Button type="primary" onClick={openSettings}>
            Open Publishing settings
          </Button>
        </div>
      ) : modalMode === "pages" ? (
        <div className="flex flex-col gap-14px">
          <div className="text-12px text-t-tertiary">
            Post type · <span className="text-t-primary font-500">{META_POST_TYPE_LABELS[postType]}</span>
            {message.trim() ? (
              <>
                {" "}
                · <span className="text-t-secondary">{message.trim().slice(0, 80)}{message.length > 80 ? "…" : ""}</span>
              </>
            ) : null}
            {sourceLabel ? (
              <>
                {" "}
                · from <span className="text-t-secondary">{sourceLabel}</span>
              </>
            ) : null}
          </div>

          {publishProgress ? (
            <div className="text-13px text-t-secondary inline-flex items-center gap-8px">
              <Spin size={14} />
              {publishProgress}
            </div>
          ) : null}

          {publishTimingFields}

          {loadingPages ? (
            <div className="text-13px text-t-secondary py-8px">Loading Pages…</div>
          ) : pages.length === 0 ? (
            <div className="flex flex-col gap-8px">
              <p className="text-13px text-t-secondary m-0">No Facebook Pages found for this account.</p>
              <Button size="small" onClick={() => void loadPages()}>
                Refresh Pages
              </Button>
            </div>
          ) : (
            <div className="publish-page-picker border border-b-base rd-12px overflow-hidden">
              <div className="publish-page-picker__head flex items-center justify-between gap-12px px-14px py-10px border-b border-b-base bg-3">
                <span className="text-12px font-600 uppercase tracking-wide text-t-secondary">Facebook Pages</span>
                <Checkbox
                  checked={allPagesSelected}
                  indeterminate={somePagesSelected}
                  onChange={(checked) => setSelectedPageIds(checked ? [...selectablePageIds] : [])}
                >
                  Select all
                </Checkbox>
              </div>
              <ul className="publish-page-picker__list m-0 p-0 list-none">
                {pages.map((page) => (
                  <li key={page.id} className="publish-page-picker__item">
                    <label className="publish-page-picker__row">
                      <Checkbox
                        checked={selectedPageIds.includes(page.id)}
                        onChange={(checked) => togglePage(page.id, checked)}
                      />
                      <span className="publish-page-picker__body min-w-0">
                        <span className="publish-page-picker__name text-14px font-500 text-t-primary">
                          {page.name}
                        </span>
                        {page.category ? (
                          <span className="publish-page-picker__meta text-12px text-t-secondary">{page.category}</span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-12px text-t-tertiary m-0">
            {publishMode === "schedule"
              ? "Posts schedule on each selected Page one by one using the same content."
              : "Posts publish to each selected Page one by one using the same content."}
          </p>
        </div>
      ) : !config.hasPageToken ? (
        <div className="flex flex-col gap-12px py-4px">
          <p className="text-13px text-t-secondary m-0">
            Select a Facebook Page in Publishing settings before posting.
          </p>
          <Button type="primary" onClick={openSettings}>
            Open Publishing settings
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-14px">
          <div className="text-12px text-t-tertiary">
            Posting as <span className="text-t-primary font-500">{config.pageName ?? "Page"}</span>
            {sourceLabel ? (
              <>
                {" "}
                · from <span className="text-t-secondary">{sourceLabel}</span>
              </>
            ) : null}
          </div>
          {publishTimingFields}
          <MetaPublishComposeFields showPostTypePicker={!hidePostTypePicker} pageId={config.pageId} />
        </div>
      )}
    </AionModal>
  );
};

export default MetaPublishModal;
