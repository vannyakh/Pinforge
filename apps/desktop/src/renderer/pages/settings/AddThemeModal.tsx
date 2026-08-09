import React, { useMemo, useRef, useState } from "react";
import { Button, Input, Modal, Radio, Message } from "@arco-design/web-react";
import { Plus } from "@icon-park/react";
import type { ThemeAppearance } from "@/common/theme/types";

const DEFAULT_CSS = `/* Custom CSS — UI tokens & decorations
   Examples:
   :root { --primary: #e60023; }
   .home-hero__greeting { letter-spacing: -0.03em; }
*/

`;

export interface AddThemePayload {
  name: string;
  appearance: ThemeAppearance;
  css: string;
  backgroundImage?: string;
  preview?: string;
  tokens?: Record<string, string>;
}

interface AddThemeModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (payload: AddThemePayload) => Promise<void>;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const AddThemeModal: React.FC<AddThemeModalProps> = ({ visible, onClose, onSave }) => {
  const [name, setName] = useState("");
  const [appearance, setAppearance] = useState<ThemeAppearance>("light");
  const [css, setCss] = useState(DEFAULT_CSS);
  const [backgroundImage, setBackgroundImage] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setName("");
    setAppearance("light");
    setCss(DEFAULT_CSS);
    setBackgroundImage(undefined);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const previewStyle = useMemo(
    () =>
      backgroundImage
        ? {
            backgroundImage: `url(${backgroundImage})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }
        : appearance === "dark"
          ? { background: "linear-gradient(145deg, #1a1a1a, #0e0e0e)" }
          : { background: "linear-gradient(145deg, #f9fafb, #e5e6eb)" },
    [backgroundImage, appearance]
  );

  const save = async () => {
    if (!name.trim()) {
      Message.warning("Enter a theme name");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        appearance,
        css: css.trim(),
        backgroundImage,
        preview: backgroundImage,
      });
      Message.success("Theme saved");
      handleClose();
    } catch (e) {
      Message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Add Theme"
      visible={visible}
      onCancel={handleClose}
      autoFocus={false}
      focusLock
      className="aionui-modal appearance-add-modal"
      style={{ width: 560 }}
      footer={
        <div className="flex justify-end gap-10px">
          <Button onClick={handleClose}>Cancel</Button>
          <Button type="primary" loading={saving} onClick={() => void save()}>
            Save
          </Button>
        </div>
      }
    >
      <div className="flex gap-16px mb-18px">
        <div>
          <div className="text-12px text-t-tertiary mb-8px">Background Image</div>
          <button
            type="button"
            className="appearance-upload"
            style={previewStyle}
            onClick={() => fileRef.current?.click()}
          >
            {!backgroundImage && (
              <span className="flex flex-col items-center gap-6px text-t-secondary">
                <Plus theme="outline" size="20" fill="currentColor" strokeWidth={3} />
                Upload
              </span>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 4 * 1024 * 1024) {
                Message.warning("Image should be under 4MB");
                return;
              }
              try {
                setBackgroundImage(await fileToDataUrl(file));
              } catch {
                Message.error("Failed to read image");
              }
            }}
          />
          {backgroundImage && (
            <Button
              type="text"
              size="mini"
              className="mt-4px"
              onClick={() => setBackgroundImage(undefined)}
            >
              Remove
            </Button>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-14px">
          <div>
            <div className="text-12px text-t-tertiary mb-8px">
              Name <span className="text-danger">*</span>
            </div>
            <Input
              placeholder="Enter preset name"
              value={name}
              onChange={setName}
              maxLength={48}
            />
          </div>
          <div>
            <div className="text-12px text-t-tertiary mb-8px">Appearance</div>
            <Radio.Group value={appearance} onChange={(v) => setAppearance(v as ThemeAppearance)}>
              <Radio value="light">Light</Radio>
              <Radio value="dark">Dark</Radio>
            </Radio.Group>
          </div>
        </div>
      </div>

      <div>
        <div className="text-12px text-t-tertiary mb-8px">CSS Code</div>
        <Input.TextArea
          className="appearance-css-editor font-mono"
          value={css}
          onChange={setCss}
          autoSize={{ minRows: 8, maxRows: 14 }}
          placeholder="Enter custom CSS styles here to modify the interface appearance."
        />
        <div className="text-12px text-t-tertiary mt-8px leading-relaxed">
          Use UI tokens like <code>--primary</code>, <code>--bg-1</code>, <code>--text-primary</code>.
          Background image is applied automatically when uploaded.
        </div>
      </div>
    </Modal>
  );
};

export default AddThemeModal;
