import React from "react";
import classNames from "classnames";
import { Button, Input } from "@arco-design/web-react";
import { FolderOpen } from "@icon-park/react";

type SettingsPageWidth = "narrow" | "wide" | "appearance" | "full" | "about";

const WIDTH_CLASS: Record<SettingsPageWidth, string> = {
  narrow: "settings-page--narrow",
  wide: "settings-page--wide",
  appearance: "settings-page--appearance",
  full: "settings-page--full",
  about: "settings-page--about",
};

export const SettingsPage: React.FC<{
  width?: SettingsPageWidth;
  className?: string;
  children: React.ReactNode;
}> = ({ width = "narrow", className, children }) => (
  <div className={classNames("settings-page", WIDTH_CLASS[width], className)}>{children}</div>
);

export const SettingsHeader: React.FC<{
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}> = ({ title, description, actions, className }) => (
  <header className={classNames("settings-header", className)}>
    <div className="settings-header__main min-w-0">
      <h1 className="settings-header__title">{title}</h1>
      {description ? <p className="settings-header__desc">{description}</p> : null}
    </div>
    {actions ? <div className="settings-header__actions">{actions}</div> : null}
  </header>
);

export const SettingsSection: React.FC<{
  title?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ title, className, children }) => (
  <section className={classNames("settings-section", className)}>
    {title ? <div className="settings-section__label">{title}</div> : null}
    <div className="settings-section__card">{children}</div>
  </section>
);

export const SettingsRow: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, description, children, className }) => (
  <div className={classNames("settings-row", className)}>
    <div className="settings-row__meta">
      <div className="settings-row__title">{title}</div>
      {description ? <div className="settings-row__desc">{description}</div> : null}
    </div>
    <div className="settings-row__control">{children}</div>
  </div>
);

export const SettingsField: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, description, children, className }) => (
  <div className={classNames("settings-field", className)}>
    <div className="settings-field__meta">
      <div className="settings-field__title">{title}</div>
      {description ? <div className="settings-field__desc">{description}</div> : null}
    </div>
    <div className="settings-field__body">{children}</div>
  </div>
);

export const SettingsPathField: React.FC<{
  label: string;
  description?: string;
  value: string;
  onBrowse: () => void;
  onOpen: () => void;
}> = ({ label, description, value, onBrowse, onOpen }) => (
  <SettingsField title={label} description={description}>
    <div className="settings-path-field">
      <Input value={value} readOnly className="settings-path-field__input" />
      <Button
        icon={<FolderOpen theme="outline" size="16" fill="currentColor" strokeWidth={3} />}
        onClick={onBrowse}
      >
        Browse…
      </Button>
      <Button onClick={onOpen}>Open</Button>
    </div>
  </SettingsField>
);

export const SettingsLoading: React.FC<{ label?: string }> = ({ label = "Loading…" }) => (
  <div className="settings-loading text-t-secondary">{label}</div>
);
