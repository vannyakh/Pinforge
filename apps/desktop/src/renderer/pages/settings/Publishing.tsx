import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Input,
  Message,
  Select,
  Tag,
  Tooltip,
  Typography,
} from "@arco-design/web-react";
import { Info, LinkCloud, Share } from "@icon-park/react";
import {
  api,
  type MetaPageSummary,
  type MetaPublishPublic,
} from "@renderer/api";
import facebookLogo from "@renderer/assets/provider-logos/facebook.svg";
import { DEFAULT_META_REDIRECT_URI } from "@common/publish/types";
import {
  SettingsField,
  SettingsHeader,
  SettingsLoading,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from "./components/SettingsLayout";

const LabelWithHelp: React.FC<{
  label: string;
  hint: React.ReactNode;
}> = ({ label, hint }) => (
  <span className="inline-flex items-center gap-6px">
    {label}
    <Tooltip content={hint}>
      <span className="remote-label-help" tabIndex={0} aria-label="Help">
        <Info theme="outline" size="14" fill="currentColor" />
      </span>
    </Tooltip>
  </span>
);

function formatExpiry(ts?: number): string | null {
  if (!ts) return null;
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

const MetaPublishSettings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [publicConfig, setPublicConfig] = useState<MetaPublishPublic | null>(null);
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState(DEFAULT_META_REDIRECT_URI);
  const [pages, setPages] = useState<MetaPageSummary[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>("");
  const [postMessage, setPostMessage] = useState("");
  const [postFilePath, setPostFilePath] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const cfg = await api.getMetaPublish();
    setPublicConfig(cfg);
    setAppId(cfg.appId);
    setRedirectUri(cfg.redirectUri || DEFAULT_META_REDIRECT_URI);
    setSelectedPageId(cfg.pageId ?? "");
    setAppSecret("");
    if (cfg.connected) {
      try {
        const list = await api.listMetaPages();
        setPages(list);
      } catch {
        /* pages load optional on refresh */
      }
    } else {
      setPages([]);
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  const pageOptions = useMemo(
    () => pages.map((p) => ({ label: p.name, value: p.id, extra: p.category })),
    [pages]
  );

  const saveApp = async () => {
    setBusy("save-app");
    try {
      const next = await api.setMetaApp({ appId, appSecret, redirectUri });
      setPublicConfig(next);
      setAppSecret("");
      Message.success("Meta Developer App saved.");
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const connect = async () => {
    setBusy("connect");
    try {
      const result = await api.startMetaConnect();
      if (!result.ok) {
        Message.error(result.message);
        return;
      }
      Message.success(result.message);
      await refresh();
      await loadPages();
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    try {
      const next = await api.disconnectMetaPublish();
      setPublicConfig(next);
      setPages([]);
      setSelectedPageId("");
      Message.info("Facebook account disconnected.");
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const loadPages = async () => {
    setBusy("pages");
    try {
      const list = await api.listMetaPages();
      setPages(list);
      if (list.length === 0) {
        Message.warning("No Facebook Pages found for this account.");
      }
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const selectPage = async (pageId: string) => {
    setSelectedPageId(pageId);
    if (!pageId) return;
    setBusy("select-page");
    try {
      const page = pages.find((p) => p.id === pageId);
      const next = await api.selectMetaPage({ pageId, pageName: page?.name });
      setPublicConfig(next);
      Message.success(`Posting as ${next.pageName ?? "Page"}.`);
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const pickMedia = async () => {
    const path = await api.pickMediaFile();
    if (path) setPostFilePath(path);
  };

  const testPost = async () => {
    setBusy("post");
    try {
      const result = await api.postToMetaPage({
        message: postMessage,
        filePath: postFilePath.trim() || undefined,
      });
      if (!result.ok) {
        Message.error(result.message);
        return;
      }
      Message.success(result.postId ? `${result.message} (ID: ${result.postId})` : result.message);
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const openMetaDev = () => {
    void api.openExternal("https://developers.facebook.com/apps/");
  };

  if (loading || !publicConfig) {
    return (
      <SettingsPage width="wide">
        <SettingsLoading />
      </SettingsPage>
    );
  }

  const tokenExpiry = formatExpiry(publicConfig.tokenExpiresAt);

  return (
    <SettingsPage width="wide">
      <SettingsHeader
        title="Publishing"
        description={
          <>
            Connect a Meta Developer App and Facebook Page to publish public posts via the Graph
            API.
          </>
        }
        actions={
          <Button type="text" icon={<LinkCloud theme="outline" size="16" />} onClick={openMetaDev}>
            Meta Developer
          </Button>
        }
      />

      <SettingsSection title="Developer App">
        <SettingsField
          title={
            <LabelWithHelp
              label="App ID"
              hint="From your app dashboard at developers.facebook.com — Settings → Basic."
            />
          }
        >
          <Input value={appId} onChange={setAppId} placeholder="1234567890123456" allowClear />
        </SettingsField>

        <SettingsField
          title={
            <LabelWithHelp
              label="App Secret"
              hint={
                publicConfig.hasAppSecret
                  ? "Leave blank to keep the saved secret. Enter a new value to replace it."
                  : "From Settings → Basic. Stored locally on this device."
              }
            />
          }
        >
          <Input.Password
            value={appSecret}
            onChange={setAppSecret}
            placeholder={publicConfig.hasAppSecret ? "••••••••••••••••" : "App secret"}
          />
        </SettingsField>

        <SettingsField
          title={
            <LabelWithHelp
              label="OAuth redirect URI"
              hint={
                <>
                  Add this exact URI under Facebook Login → Settings → Valid OAuth Redirect URIs.
                  Default uses a local loopback server on port 8765.
                </>
              }
            />
          }
        >
          <Input
            value={redirectUri}
            onChange={setRedirectUri}
            placeholder={DEFAULT_META_REDIRECT_URI}
          />
        </SettingsField>

        <div className="settings-section__footer flex justify-end pt-8px">
          <Button type="primary" loading={busy === "save-app"} onClick={() => void saveApp()}>
            Save app config
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title="Facebook account">
        <SettingsRow
          title={
            <span className="inline-flex items-center gap-8px">
              <img src={facebookLogo} alt="" className="remote-channel-logo" draggable={false} />
              Connection
            </span>
          }
          description={
            publicConfig.connected
              ? `Signed in${publicConfig.userName ? ` as ${publicConfig.userName}` : ""}.${tokenExpiry ? ` Token expires ${tokenExpiry}.` : ""}`
              : "Authorize Pinforge to list Pages and publish on your behalf."
          }
        >
          <div className="flex items-center gap-8px flex-wrap justify-end">
            {publicConfig.connected ? (
              <>
                <Tag color="green">Connected</Tag>
                <Button loading={busy === "disconnect"} onClick={() => void disconnect()}>
                  Disconnect
                </Button>
              </>
            ) : (
              <Button
                type="primary"
                loading={busy === "connect"}
                disabled={!publicConfig.appId || !publicConfig.hasAppSecret}
                onClick={() => void connect()}
              >
                Connect Facebook
              </Button>
            )}
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Facebook Page">
        <SettingsRow
          title="Page for public posts"
          description={
            publicConfig.hasPageToken && publicConfig.pageName
              ? `Currently selected: ${publicConfig.pageName}`
              : "Choose a Page you manage. Posts publish to the public Page feed."
          }
        >
          <div className="flex flex-col gap-8px items-stretch min-w-240px">
            <Select
              placeholder={publicConfig.connected ? "Select a Page" : "Connect Facebook first"}
              value={selectedPageId || undefined}
              options={pageOptions}
              disabled={!publicConfig.connected || pages.length === 0}
              loading={busy === "select-page"}
              onChange={(v) => void selectPage(String(v))}
              allowClear
              onClear={() => setSelectedPageId("")}
            />
            <Button
              size="small"
              loading={busy === "pages"}
              disabled={!publicConfig.connected}
              onClick={() => void loadPages()}
            >
              Refresh Pages
            </Button>
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Test post">
        <SettingsField
          title="Caption / message"
          description="Optional when uploading a photo or video; required for text-only posts."
        >
          <Input.TextArea
            value={postMessage}
            onChange={setPostMessage}
            placeholder="Write something for your Page audience…"
            autoSize={{ minRows: 3, maxRows: 6 }}
          />
        </SettingsField>

        <SettingsField title="Media file" description="Optional image or video from your computer.">
          <div className="flex gap-8px">
            <Input
              value={postFilePath}
              onChange={setPostFilePath}
              placeholder="Path to image or video"
              className="flex-1"
            />
            <Button onClick={() => void pickMedia()}>Browse</Button>
          </div>
        </SettingsField>

        <div className="settings-section__footer flex justify-end pt-8px">
          <Button
            type="primary"
            icon={<Share theme="outline" size="16" />}
            loading={busy === "post"}
            disabled={!publicConfig.hasPageToken}
            onClick={() => void testPost()}
          >
            Publish test post
          </Button>
        </div>

        {!publicConfig.hasPageToken ? (
          <Typography.Text type="secondary" className="text-12px mt-8px block">
            Select a Page above before posting.
          </Typography.Text>
        ) : null}
      </SettingsSection>
    </SettingsPage>
  );
};

export default MetaPublishSettings;
