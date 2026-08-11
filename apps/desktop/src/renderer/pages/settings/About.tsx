import React, { useEffect, useState } from "react";
import { Button, Divider, Message, Progress, Switch, Typography } from "@arco-design/web-react";
import { Github, Right } from "@icon-park/react";
import { api, type AutoUpdateStatus } from "@renderer/api";

const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.1.0";
const GITHUB_URL = "https://github.com/vannyakh/Pinforge";
const RELEASES_URL = `${GITHUB_URL}/releases`;
const ISSUES_URL = `${GITHUB_URL}/issues`;

type LinkItem = { title: string; url: string } | { title: string; onClick: () => void };

function statusHint(status: AutoUpdateStatus | null): string {
  if (!status) return "";
  switch (status.status) {
    case "checking":
      return "Checking for updates…";
    case "available":
      return status.version ? `Update available: v${status.version}` : "Update available";
    case "not-available":
      return "You're up to date";
    case "downloading":
      return `Downloading… ${Math.round(status.progress?.percent ?? 0)}%`;
    case "downloaded":
      return status.version ? `Ready to install v${status.version}` : "Ready to install";
    case "error":
      return status.error || "Update check failed";
    default:
      return "";
  }
}

const AboutSettings: React.FC = () => {
  const [includePrerelease, setIncludePrerelease] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<AutoUpdateStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setIncludePrerelease(localStorage.getItem("update.includePrerelease") === "true");
    void api
      .getUpdateStatus()
      .then(setUpdateStatus)
      .catch(() => undefined);
    return api.onUpdateStatus(setUpdateStatus);
  }, []);

  const openLink = async (url: string) => {
    try {
      await api.openExternal(url);
    } catch (e) {
      Message.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handlePrereleaseChange = (val: boolean) => {
    setIncludePrerelease(val);
    localStorage.setItem("update.includePrerelease", String(val));
  };

  const checkUpdate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const status = await api.checkForUpdates({ includePrerelease });
      setUpdateStatus(status);
      if (status.status === "not-available") {
        Message.success(`You're on v${status.currentVersion} — up to date.`);
      } else if (status.status === "available" && status.version) {
        Message.info(`v${status.version} is available.`);
      } else if (status.status === "error") {
        Message.error(status.error || "Update check failed");
      }
    } catch (e) {
      Message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const downloadUpdate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const status = await api.downloadUpdate();
      setUpdateStatus(status);
      if (status.status === "error") {
        Message.error(status.error || "Download failed");
      } else if (status.status === "downloaded") {
        Message.success("Update downloaded — restart to install.");
      }
    } catch (e) {
      Message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const quitAndInstall = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.quitAndInstallUpdate();
      if (!res.ok) {
        Message.error(res.message || "Could not install update");
        setBusy(false);
      }
    } catch (e) {
      Message.error(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const openRelease = () => {
    const url = updateStatus?.releaseUrl || RELEASES_URL;
    void openLink(url);
  };

  const primaryAction = (() => {
    const s = updateStatus?.status;
    if (s === "downloaded") {
      return {
        label: "Restart & install",
        loading: busy,
        onClick: () => void quitAndInstall(),
      };
    }
    if (s === "downloading") {
      return {
        label: "Downloading…",
        loading: true,
        onClick: () => undefined,
      };
    }
    if (s === "available") {
      if (updateStatus?.canInstall) {
        return {
          label: "Download update",
          loading: busy,
          onClick: () => void downloadUpdate(),
        };
      }
      return {
        label: "Open release page",
        loading: busy,
        onClick: openRelease,
      };
    }
    return {
      label: busy || s === "checking" ? "Checking…" : "Check for updates",
      loading: busy || s === "checking",
      onClick: () => void checkUpdate(),
    };
  })();

  const hint = statusHint(updateStatus);
  const showProgress = updateStatus?.status === "downloading" && updateStatus.progress != null;

  const linkItems: LinkItem[] = [
    {
      title: "Help Documentation",
      onClick: () => Message.info("Documentation will open here once published."),
    },
    {
      title: "Update Log",
      onClick: () => void openLink(updateStatus?.releaseUrl || RELEASES_URL),
    },
    {
      title: "Report Issue",
      url: ISSUES_URL,
    },
    {
      title: "Contact Me",
      onClick: () => Message.info("Contact link coming soon."),
    },
    {
      title: "Official Website",
      onClick: () => Message.info("Website coming soon."),
    },
  ];

  return (
    <div className="about-page flex flex-col w-full">
      <div className="flex flex-col max-w-500px mx-auto w-full">
        <div className="flex flex-col items-center pb-24px">
          <Typography.Title
            heading={3}
            className="!text-24px !font-bold !text-t-primary !mb-8px !mt-0"
          >
            Pinforge
          </Typography.Title>
          <Typography.Text className="text-14px text-t-secondary mb-12px text-center">
            Local multi-source media downloads on your desktop.
          </Typography.Text>

          <div className="flex items-center justify-center gap-8px mb-16px">
            <span className="about-version-pill">
              v{updateStatus?.currentVersion || APP_VERSION}
            </span>
            <button
              type="button"
              className="about-github-btn"
              title="GitHub"
              aria-label="GitHub"
              onClick={() => void openLink(GITHUB_URL)}
            >
              <Github theme="outline" size="20" fill="currentColor" />
            </button>
          </div>

          <div className="about-update-box flex flex-col items-center gap-12px w-full max-w-300px">
            <Button
              type="primary"
              long
              loading={primaryAction.loading}
              disabled={updateStatus?.status === "downloading"}
              onClick={primaryAction.onClick}
            >
              {primaryAction.label}
            </Button>
            {hint ? (
              <Typography.Text
                className={`text-12px text-center ${
                  updateStatus?.status === "error" ? "text-danger" : "text-t-secondary"
                }`}
              >
                {hint}
              </Typography.Text>
            ) : null}
            {showProgress ? (
              <Progress
                percent={Math.round(updateStatus!.progress!.percent)}
                showText
                style={{ width: "100%" }}
              />
            ) : null}
            {updateStatus?.status === "available" && updateStatus.canInstall === false ? (
              <Typography.Text className="text-12px text-t-secondary text-center">
                In-app install needs a packaged build. Use the release page to download.
              </Typography.Text>
            ) : null}
          </div>
        </div>

        <Divider className="!my-16px" />

        <div className="flex flex-col gap-4px pt-8px">
          {linkItems.map((item) => (
            <button
              key={item.title}
              type="button"
              className="about-link-row"
              onClick={() => {
                if ("url" in item && item.url) void openLink(item.url);
                else if ("onClick" in item) item.onClick();
              }}
            >
              <span className="text-14px text-t-primary">{item.title}</span>
              <Right theme="outline" size="16" fill="currentColor" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AboutSettings;
