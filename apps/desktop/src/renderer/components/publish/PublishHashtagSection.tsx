import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Input, Message, Tag } from "@arco-design/web-react";
import { Plus } from "@icon-park/react";
import {
  normalizeHashtagToken,
  parseHashtagLine,
} from "@renderer/components/publish/publishComposeMessage";
import { api } from "@renderer/api";
import { useMetaPublishStore } from "@renderer/pages/publish/metaPublishStore";

const PublishHashtagSection: React.FC = () => {
  const hashtags = useMetaPublishStore((s) => s.hashtags);
  const setHashtags = useMetaPublishStore((s) => s.setHashtags);
  const [storedSuggestions, setStoredSuggestions] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    void api
      .getHashtagSuggestions()
      .then((tags) => {
        if (alive) setStoredSuggestions(tags);
      })
      .catch(() => {
        if (alive) setStoredSuggestions([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const hashtagSuggestions = useMemo(() => storedSuggestions, [storedSuggestions]);

  const persistSuggestions = useCallback(async (next: string[]) => {
    const saved = await api.setHashtagSuggestions(next);
    setStoredSuggestions(saved);
    return saved;
  }, []);

  const appendHashtag = (tag: string) => {
    const normalized = normalizeHashtagToken(tag);
    if (!normalized) return;
    const existing = parseHashtagLine(hashtags);
    if (existing.includes(normalized)) return;
    setHashtags([...existing, normalized].join(" "));
  };

  const saveCurrentHashtags = async () => {
    const parsed = parseHashtagLine(hashtags);
    if (!parsed.length) {
      Message.info("Add hashtags first.");
      return;
    }
    const merged = [...storedSuggestions];
    let added = 0;
    for (const tag of parsed) {
      if (!merged.includes(tag)) {
        merged.push(tag);
        added += 1;
      }
    }
    if (!added) {
      Message.info("These hashtags are already saved.");
      return;
    }
    await persistSuggestions(merged);
    Message.success("Hashtags saved.");
  };

  const removeHashtagSuggestion = async (tag: string) => {
    await persistSuggestions(storedSuggestions.filter((item) => item !== tag));
  };

  return (
    <section className="post-builder__section">
      <div className="post-builder__section-head">
        <div className="post-builder__label mb-0">Hashtags</div>
        <button
          type="button"
          className="post-builder__caption-suggest-add"
          title="Save hashtags"
          aria-label="Save hashtags"
          onClick={() => void saveCurrentHashtags()}
        >
          <Plus theme="outline" size="16" fill="currentColor" />
        </button>
      </div>
      <Input.TextArea
        value={hashtags}
        onChange={setHashtags}
        placeholder="#pinforge #facebook #video"
        autoSize={{ minRows: 2, maxRows: 4 }}
      />
      {hashtagSuggestions.length > 0 ? (
        <div className="post-builder__caption-suggestions">
          {hashtagSuggestions.map((tag) => (
            <Tag
              key={tag}
              size="small"
              className="post-builder__caption-tag shrink-0"
              color="arcoblue"
              closable
              onClose={() => {
                void removeHashtagSuggestion(tag);
              }}
              onClick={() => appendHashtag(tag)}
            >
              {tag}
            </Tag>
          ))}
        </div>
      ) : null}
    </section>
  );
};

export default PublishHashtagSection;
