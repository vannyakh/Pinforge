import React, { useState } from "react";
import { Tabs } from "@arco-design/web-react";
import facebookLogo from "@renderer/assets/provider-logos/facebook.svg";
import youtubeLogo from "@renderer/assets/provider-logos/youtube.svg";
import MetaPublishSettings from "./MetaPublishSettings";
import YouTubePublishSettings from "./YouTubePublishSettings";
import { SettingsHeader, SettingsPage } from "./components/SettingsLayout";

const PublishingSettings: React.FC = () => {
  const [tab, setTab] = useState("facebook");

  return (
    <SettingsPage width="wide" className="publishing-page">
      <SettingsHeader
        title="Publishing"
        description="Connect Facebook and YouTube accounts to publish from Pinforge."
      />

      <Tabs activeTab={tab} onChange={setTab} type="line" className="settings-remote-tabs">
        <Tabs.TabPane
          key="facebook"
          title={
            <span
              className={`remote-tab-label inline-flex items-center gap-6px ${
                tab === "facebook" ? "text-t-primary font-600" : "text-t-secondary"
              }`}
            >
              <img
                className="remote-tab-logo"
                src={facebookLogo}
                alt=""
                width={15}
                height={15}
                draggable={false}
              />
              <span>Facebook</span>
            </span>
          }
        >
          <MetaPublishSettings />
        </Tabs.TabPane>

        <Tabs.TabPane
          key="youtube"
          title={
            <span
              className={`remote-tab-label inline-flex items-center gap-6px ${
                tab === "youtube" ? "text-t-primary font-600" : "text-t-secondary"
              }`}
            >
              <img
                className="remote-tab-logo"
                src={youtubeLogo}
                alt=""
                width={15}
                height={15}
                draggable={false}
              />
              <span>YouTube</span>
            </span>
          }
        >
          <YouTubePublishSettings />
        </Tabs.TabPane>
      </Tabs>
    </SettingsPage>
  );
};

export default PublishingSettings;
