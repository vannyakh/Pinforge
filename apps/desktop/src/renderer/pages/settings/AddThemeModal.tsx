import React, { useMemo, useRef, useState } from "react";
import { Button, Input, Radio, Message } from "@arco-design/web-react";
import { Plus } from "@icon-park/react";
import type { ThemeAppearance } from "@/common/theme/types";
import AionModal from "@renderer/components/base/AionModal";
import CodeEditor from "@renderer/components/base/CodeEditor";
import { useThemeContext } from "@renderer/hooks/context/ThemeContext";
import { injectBackgroundCssBlock } from "./AppearanceSettings/backgroundUtils";

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
  cover?: string;
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
  const { theme: colorTheme } = useThemeContext();
  const [name, setName] = useState("");
  const [appearance, setAppearance] = useState<ThemeAppearance>("light");
  const [css, setCss] = useState(DEFAULT_CSS);
  const [cover, setCover] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setName("");
    setAppearance("light");
    setCss(DEFAULT_CSS);
    setCover(undefined);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const previewStyle = useMemo(
    () =>
      cover
        ? {
            backgroundImage: `url(${cover})`,
            backgroundSize: "cover" as const,
            backgroundPosition: "center" as const,
          }
        : appearance === "dark"
          ? { background: "linear-gradient(145deg, #1a1a1a, #0e0e0e)" }
          : { background: "linear-gradient(145deg, #f9fafb, #e5e6eb)" },
    [cover, appearance]
  );

  const applyCover = async (file: File) => {
    if (file.size > 4 * 1024 * 1024) {
      Message.warning("Image should be under 4MB");
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setCover(dataUrl);
      setCss((prev) => injectBackgroundCssBlock(prev, dataUrl));
    } catch {
      Message.error("Failed to read image");
    }
  };

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
        cover,
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
    <AionModal
      variant="standard"
      header={{ title: "Add Theme", showClose: true }}
      visible={visible}
      onCancel={handleClose}
      autoFocus={false}
      focusLock
      className="appearance-add-modal"
      style={{ width: 600 }}
      unmountOnExit
      footer={
        <div className="flex justify-end gap-10px">
          <Button onClick={handleClose} className="px-20px min-w-80px" style={{ borderRadius: 8 }}>
            Cancel
          </Button>
          <Button
            type="primary"
            loading={saving}
            disabled={!name.trim()}
            onClick={() => void save()}
            className="px-20px min-w-80px"
            style={{ borderRadius: 8 }}
          >
            Save
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-20px">
        <div className="flex gap-16px p-16px rd-12px" style={{ background: "var(--color-fill-1)" }}>
          <div className="shrink-0">
            <div className="text-13px text-t-secondary mb-8px">Cover / Background</div>
            <button
              type="button"
              className="appearance-upload"
              style={previewStyle}
              onClick={() => fileRef.current?.click()}
            >
              {!cover && (
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
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void applyCover(file);
              }}
            />
            {cover && (
              <Button
                type="text"
                size="mini"
                className="mt-4px"
                onClick={() => setCover(undefined)}
              >
                Remove
              </Button>
            )}
          </div>

          <div className="flex-1 min-w-0 flex flex-col gap-12px">
            <div>
              <div className="text-13px text-t-secondary mb-8px">
                <span className="text-danger">*</span> Name
              </div>
              <Input
                placeholder="Enter preset name"
                value={name}
                onChange={setName}
                maxLength={48}
              />
            </div>
            <div>
              <div className="text-13px text-t-secondary mb-8px">Appearance</div>
              <Radio.Group value={appearance} onChange={(v) => setAppearance(v as ThemeAppearance)}>
                <Radio value="light">Light</Radio>
                <Radio value="dark">Dark</Radio>
              </Radio.Group>
            </div>
          </div>
        </div>

        <div>
          <div className="text-13px text-t-secondary mb-8px">CSS Code</div>
          <CodeEditor
            language="css"
            value={css}
            theme={colorTheme}
            onChange={setCss}
            placeholder="/* Enter custom CSS styles here */"
            height="200px"
            style={{ minHeight: 200 }}
          />
          <div className="text-12px text-t-tertiary mt-8px leading-relaxed">
            Use UI tokens like <code>--primary</code>, <code>--bg-1</code>,{" "}
            <code>--text-primary</code>. Cover image is applied as wallpaper when uploaded.
          </div>
        </div>
      </div>
    </AionModal>
  );
};

export default AddThemeModal;
