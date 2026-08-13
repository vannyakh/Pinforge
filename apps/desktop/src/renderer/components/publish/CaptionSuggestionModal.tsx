import React, { useEffect, useState } from "react";
import { Button, Input } from "@arco-design/web-react";
import AionModal from "@renderer/components/base/AionModal";

type CaptionSuggestionModalProps = {
  visible: boolean;
  initialTitle?: string;
  onClose: () => void;
  onSave: (title: string) => void | Promise<void>;
};

const CaptionSuggestionModal: React.FC<CaptionSuggestionModalProps> = ({
  visible,
  initialTitle = "",
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState(initialTitle);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle(initialTitle);
  }, [visible, initialTitle]);

  const handleSave = async () => {
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onSave(trimmed);
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <div className="flex justify-end gap-10px w-full">
      <Button onClick={onClose} disabled={saving}>
        Cancel
      </Button>
      <Button type="primary" disabled={!title.trim() || saving} onClick={() => void handleSave()}>
        Save suggestion
      </Button>
    </div>
  );

  return (
    <AionModal
      variant="standard"
      visible={visible}
      onCancel={onClose}
      autoFocus={false}
      unmountOnExit
      maskClosable={!saving}
      escToExit={!saving}
      header={{
        title: "Save caption suggestion",
        subtitle: "Store a title you can reuse for carousel captions.",
        showClose: true,
      }}
      footer={{ render: () => footer, divider: true }}
      style={{ width: 480 }}
    >
      <div className="flex flex-col gap-8px">
        <label className="text-13px text-t-primary" htmlFor="caption-suggestion-title">
          Title
        </label>
        <Input.TextArea
          id="caption-suggestion-title"
          value={title}
          onChange={setTitle}
          placeholder="Enter a caption title…"
          autoSize={{ minRows: 3, maxRows: 8 }}
        />
      </div>
    </AionModal>
  );
};

export default CaptionSuggestionModal;
