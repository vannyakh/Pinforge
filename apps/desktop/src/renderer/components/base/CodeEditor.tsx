import React, { useMemo } from "react";
import type { CSSProperties } from "react";
import CodeMirror, { type ReactCodeMirrorProps } from "@uiw/react-codemirror";
import { css as cssLang } from "@codemirror/lang-css";
import { useThemeContext } from "@renderer/hooks/context/ThemeContext";

export type CodeEditorLanguage = "css" | "plain";

const DEFAULT_BASIC_SETUP = {
  lineNumbers: true,
  foldGutter: true,
  dropCursor: false,
  allowMultipleSelections: false,
} as const;

const DEFAULT_STYLE: CSSProperties = {
  fontSize: "13px",
  border: "1px solid var(--color-border-2)",
  borderRadius: "6px",
  overflow: "hidden",
};

function languageExtensions(
  lang: CodeEditorLanguage
): NonNullable<ReactCodeMirrorProps["extensions"]> {
  if (lang === "css") return [cssLang()];
  return [];
}

export interface CodeEditorProps extends Omit<
  ReactCodeMirrorProps,
  "theme" | "extensions" | "basicSetup"
> {
  language?: CodeEditorLanguage;
  extensions?: ReactCodeMirrorProps["extensions"];
  basicSetup?: ReactCodeMirrorProps["basicSetup"];
  /** Override app light/dark theme for the editor */
  theme?: "light" | "dark";
}

/**
 * Shared CodeMirror editor (@uiw/react-codemirror + @codemirror/lang-*).
 * Theme follows ThemeContext by default.
 */
const CodeEditor: React.FC<CodeEditorProps> = ({
  language = "plain",
  extensions,
  basicSetup,
  theme: themeProp,
  style,
  className,
  height = "200px",
  ...rest
}) => {
  const { theme: appTheme } = useThemeContext();
  const theme = themeProp ?? appTheme;

  const mergedExtensions = useMemo(() => {
    const base = languageExtensions(language);
    if (!extensions) return base;
    return [...base, ...(Array.isArray(extensions) ? extensions : [extensions])];
  }, [language, extensions]);

  return (
    <CodeMirror
      theme={theme}
      extensions={mergedExtensions}
      basicSetup={basicSetup ?? DEFAULT_BASIC_SETUP}
      height={height}
      style={{ ...DEFAULT_STYLE, ...style }}
      className={["pinforge-code-editor", "[&_.cm-editor]:rounded-[6px]", className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
};

export default CodeEditor;
