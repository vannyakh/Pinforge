import React, { useEffect, useState } from "react";
import { Button, Divider, Message, Switch, Typography } from "@arco-design/web-react";
import { Github, Right } from "@icon-park/react";
import { api } from "@renderer/api";

const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.1.0";
const GITHUB_URL = "https://github.com/search?q=pinforge";

type LinkItem =
  | { title: string; url: string }
  | { title: string; onClick: () => void };

const AboutSettings: React.FC = () => {
  const [includePrerelease, setIncludePrerelease] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setIncludePrerelease(localStorage.getItem("update.includePrerelease") === "true");
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
    if (checking) return;
    setChecking(true);
    try {
      await new Promise((r) => setTimeout(r, 600));
      Message.info(
        includePrerelease
          ? `You're on v${APP_VERSION}. Prerelease checks will use GitHub releases when publishing is set up.`
          : `You're on v${APP_VERSION} — latest local build.`
      );
    } finally {
      setChecking(false);
    }
  };

  const linkItems: LinkItem[] = [
    {
      title: "Help Documentation",
      onClick: () => Message.info("Documentation will open here once published."),
    },
    {
      title: "Update Log",
      onClick: () => Message.info("Release notes will open here once published."),
    },
    {
      title: "Report Issue",
      onClick: () => Message.info("Issue reporting will open here once the repo is public."),
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
          <Typography.Title heading={3} className="!text-24px !font-bold !text-t-primary !mb-8px !mt-0">
            Pinforge
          </Typography.Title>
          <Typography.Text className="text-14px text-t-secondary mb-12px text-center">
            Local multi-source media downloads on your desktop.
          </Typography.Text>

          <div className="flex items-center justify-center gap-8px mb-16px">
            <span className="about-version-pill">v{APP_VERSION}</span>
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
            <Button type="primary" long loading={checking} onClick={() => void checkUpdate()}>
              {checking ? "Checking…" : "Check for updates"}
            </Button>
            <div className="flex items-center justify-between w-full gap-12px">
              <Typography.Text className="text-12px text-t-secondary">
                Include prerelease/dev builds
              </Typography.Text>
              <Switch size="small" checked={includePrerelease} onChange={handlePrereleaseChange} />
            </div>
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
