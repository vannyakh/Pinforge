import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Input, Message, Tag } from "@arco-design/web-react";
import { Plus } from "@icon-park/react";
import CaptionSuggestionModal from "@renderer/components/publish/CaptionSuggestionModal";
import { api } from "@renderer/api";
import { useMetaPublishStore } from "@renderer/pages/publish/metaPublishStore";

type PublishCaptionSectionProps = {
  placeholder?: string;
};

const PublishCaptionSection: React.FC<PublishCaptionSectionProps> = ({
  placeholder = "Write your caption…",
}) => {
  const message = useMetaPublishStore((s) => s.message);
  const setMessage = useMetaPublishStore((s) => s.setMessage);
  const [storedSuggestions, setStoredSuggestions] = useState<string[]>([]);
  const [captionModalOpen, setCaptionModalOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void api
      .getCaptionTitleSuggestions()
      .then((titles) => {
        if (alive) setStoredSuggestions(titles);
      })
      .catch(() => {
        if (alive) setStoredSuggestions([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const captionSuggestions = useMemo(() => storedSuggestions, [storedSuggestions]);

  const persistSuggestions = useCallback(async (next: string[]) => {
    const saved = await api.setCaptionTitleSuggestions(next);
    setStoredSuggestions(saved);
    return saved;
  }, []);

  const saveCaptionSuggestion = async (title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    if (captionSuggestions.includes(trimmed)) {
      Message.info("This caption is already saved.");
      return;
    }
    await persistSuggestions([...storedSuggestions, trimmed]);
    setCaptionModalOpen(false);
    Message.success("Caption saved.");
  };

  const removeCaptionSuggestion = async (title: string) => {
    await persistSuggestions(storedSuggestions.filter((item) => item !== title));
  };

  return (
    <section className="post-builder__section">
      <div className="post-builder__section-head">
        <div className="post-builder__label mb-0">Caption</div>
        <button
          type="button"
          className="post-builder__caption-suggest-add"
          title="Save caption"
          aria-label="Save caption"
          onClick={() => setCaptionModalOpen(true)}
        >
          <Plus theme="outline" size="16" fill="currentColor" />
        </button>
      </div>
      <Input.TextArea
        value={message}
        onChange={setMessage}
        placeholder={placeholder}
        autoSize={{ minRows: 3, maxRows: 8 }}
      />
      {captionSuggestions.length > 0 ? (
        <div className="post-builder__caption-suggestions">
          {captionSuggestions.map((title) => {
            const active = message.trim() === title;
            return (
              <Tag
                key={title}
                size="small"
                className="post-builder__caption-tag shrink-0"
                color={active ? "arcoblue" : "gray"}
                closable
                onClose={() => {
                  void removeCaptionSuggestion(title);
                }}
                onClick={() => setMessage(title)}
              >
                {title}
              </Tag>
            );
          })}
        </div>
      ) : null}

      <CaptionSuggestionModal
        visible={captionModalOpen}
        initialTitle={message}
        onClose={() => setCaptionModalOpen(false)}
        onSave={saveCaptionSuggestion}
      />
    </section>
  );
};

export default PublishCaptionSection;
