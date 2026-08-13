import React, { useEffect, useMemo, useState } from "react";
import { Button, Checkbox, Input, Message, Table, Tag } from "@arco-design/web-react";
import type { ColumnProps } from "@arco-design/web-react/es/Table/interface";
import AionModal from "@renderer/components/base/AionModal";
import {
  api,
  type MetaPagePostSummary,
  type MetaPageSummary,
  type MetaSharePostsResult,
} from "@renderer/api";

interface SharePostsModalProps {
  open: boolean;
  posts: MetaPagePostSummary[];
  pages: MetaPageSummary[];
  sourcePageId?: string;
  onClose: () => void;
  onComplete?: (result: MetaSharePostsResult) => void;
}

const SharePostsModal: React.FC<SharePostsModalProps> = ({
  open,
  posts,
  pages,
  sourcePageId,
  onClose,
  onComplete,
}) => {
  const [targetPageIds, setTargetPageIds] = useState<string[]>([]);
  const [shareMessage, setShareMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<MetaSharePostsResult | null>(null);

  const targetPages = useMemo(
    () => pages.filter((p) => p.id !== sourcePageId),
    [pages, sourcePageId]
  );

  useEffect(() => {
    if (!open) return;
    setTargetPageIds([]);
    setShareMessage("");
    setLastResult(null);
  }, [open, posts]);

  const togglePage = (pageId: string, checked: boolean) => {
    setTargetPageIds((prev) => {
      if (checked) return prev.includes(pageId) ? prev : [...prev, pageId];
      return prev.filter((id) => id !== pageId);
    });
  };

  const allSelected =
    targetPages.length > 0 && targetPages.every((p) => targetPageIds.includes(p.id));
  const someSelected =
    !allSelected && targetPages.some((p) => targetPageIds.includes(p.id));

  const submit = async () => {
    if (posts.length === 0) return;
    if (targetPageIds.length === 0) {
      Message.warning("Select at least one target Page.");
      return;
    }
    setBusy(true);
    try {
      const result = await api.shareMetaPostsToPages({
        postIds: posts.map((p) => p.id),
        targetPageIds,
        posts: posts.map((p) => ({
          id: p.id,
          message: p.message,
          permalinkUrl: p.permalinkUrl,
        })),
        shareMessage: shareMessage.trim() || undefined,
      });
      setLastResult(result);
      if (result.ok) Message.success(result.message);
      else Message.warning(result.message);
      onComplete?.(result);
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const resultColumns = useMemo<ColumnProps<MetaSharePostsResult["results"][number]>[]>(
    () => [
      {
        title: "Page",
        dataIndex: "pageName",
        width: 160,
        render: (name: string | undefined, row) => name ?? row.pageId,
      },
      {
        title: "Post",
        dataIndex: "postId",
        width: 180,
        ellipsis: true,
      },
      {
        title: "Status",
        dataIndex: "ok",
        width: 100,
        render: (ok: boolean) =>
          ok ? (
            <Tag size="small" color="green">
              OK
            </Tag>
          ) : (
            <Tag size="small" color="orangered">
              Failed
            </Tag>
          ),
      },
      {
        title: "Message",
        dataIndex: "message",
        ellipsis: true,
      },
    ],
    []
  );

  return (
    <AionModal
      visible={open}
      size="large"
      onCancel={onClose}
      header={{
        title: "Share posts to Pages",
        subtitle: `${posts.length} post${posts.length === 1 ? "" : "s"} selected`,
      }}
      footer={{
        divider: true,
        render: () => (
          <div className="flex items-center justify-end gap-8px w-full">
            <Button onClick={onClose}>Close</Button>
            <Button type="primary" loading={busy} disabled={posts.length === 0} onClick={() => void submit()}>
              Share to {targetPageIds.length || 0} Page{targetPageIds.length === 1 ? "" : "s"}
            </Button>
          </div>
        ),
      }}
    >
      <div className="flex flex-col gap-16px">
        <div>
          <div className="text-13px font-600 text-t-primary mb-8px">Target Pages</div>
          {targetPages.length === 0 ? (
            <div className="text-13px text-t-secondary">No other Pages available on this account.</div>
          ) : (
            <div className="posts-share-pages flex flex-col gap-6px max-h-180px overflow-y-auto rd-8px border border-b-base p-10px bg-2">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onChange={(checked) => {
                  setTargetPageIds(checked ? targetPages.map((p) => p.id) : []);
                }}
              >
                Select all
              </Checkbox>
              {targetPages.map((page) => (
                <Checkbox
                  key={page.id}
                  checked={targetPageIds.includes(page.id)}
                  onChange={(checked) => togglePage(page.id, checked)}
                >
                  <span className="text-13px">{page.name}</span>
                  {page.category ? (
                    <span className="text-12px text-t-tertiary ml-6px">{page.category}</span>
                  ) : null}
                </Checkbox>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="text-13px font-600 text-t-primary mb-8px">Optional caption override</div>
          <Input.TextArea
            placeholder="Leave empty to reuse each post caption when sharing its link."
            value={shareMessage}
            onChange={setShareMessage}
            autoSize={{ minRows: 2, maxRows: 4 }}
          />
        </div>

        {lastResult ? (
          <div>
            <div className="text-13px font-600 text-t-primary mb-8px">Results</div>
            <Table
              rowKey={(row) => `${row.postId}-${row.pageId}`}
              columns={resultColumns}
              data={lastResult.results}
              pagination={false}
              size="small"
              border={false}
              scroll={{ y: 200 }}
            />
          </div>
        ) : null}
      </div>
    </AionModal>
  );
};

export default SharePostsModal;
