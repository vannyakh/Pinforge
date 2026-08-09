import React, { useCallback, useRef, useState } from "react";
import { Close } from "@icon-park/react";
import { api } from "@renderer/api";
import styles from "./guid.module.css";

type GuidHomeWorkspaceFootnoteProps = {
  workspaceDir: string;
  onSelectWorkspace: (dir: string) => void;
  onClearWorkspace?: () => void;
};

const FolderIcon = ({ size = 12 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    viewBox="0 0 24 24"
    style={{ lineHeight: 0, flexShrink: 0 }}
  >
    <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
  </svg>
);

/**
 * AionUI GuidWorkspaceFootnote — simplified for Pinforge (pick folder only).
 */
const GuidHomeWorkspaceFootnote: React.FC<GuidHomeWorkspaceFootnoteProps> = ({
  workspaceDir,
  onSelectWorkspace,
  onClearWorkspace,
}) => {
  const [picking, setPicking] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | HTMLDivElement>(null);

  const browse = useCallback(async () => {
    if (picking) return;
    setPicking(true);
    try {
      const dir = await api.pickFolder();
      if (dir) onSelectWorkspace(dir);
    } finally {
      setPicking(false);
    }
  }, [onSelectWorkspace, picking]);

  if (!workspaceDir) {
    return (
      <div className={styles.workspaceFootnote}>
        <button
          ref={triggerRef as React.RefObject<HTMLButtonElement>}
          type="button"
          className={styles.workspaceEmptyBtn}
          disabled={picking}
          onClick={() => void browse()}
        >
          <FolderIcon size={14} />
          <span>Work in a folder</span>
        </button>
      </div>
    );
  }

  const name = workspaceDir.split(/[/\\]/).filter(Boolean).pop() || workspaceDir;

  return (
    <div className={styles.workspaceFootnote}>
      <div className={styles.workspacePill}>
        <button
          ref={triggerRef as React.RefObject<HTMLButtonElement>}
          type="button"
          className={styles.workspacePillMain}
          title={workspaceDir}
          disabled={picking}
          onClick={() => void browse()}
        >
          <FolderIcon size={14} />
          <span className={styles.workspacePillName}>{name}</span>
        </button>
        {onClearWorkspace ? (
          <button
            type="button"
            className={styles.workspacePillClose}
            aria-label="Clear folder"
            onClick={onClearWorkspace}
          >
            <Close theme="outline" size={12} fill="currentColor" />
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default GuidHomeWorkspaceFootnote;
