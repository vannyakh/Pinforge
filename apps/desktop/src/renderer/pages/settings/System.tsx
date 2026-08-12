import React, { useCallback, useEffect, useState } from "react";
import { Button, Input, Message, Progress, Select, Switch, Tag } from "@arco-design/web-react";
import { useApp } from "@renderer/hooks/context/AppContext";
import { api, type SystemConfig } from "@renderer/api";
import { ONBOARD_PREVIEW_KEY } from "@renderer/components/setup/EnvironmentSetup";
import {
  SettingsField,
  SettingsHeader,
  SettingsPage,
  SettingsPathField,
  SettingsRow,
  SettingsSection,
} from "./components/SettingsLayout";

type FfmpegStatus = Awaited<ReturnType<typeof api.ffmpegStatus>>;
type YtdlpStatus = Awaited<ReturnType<typeof api.ytdlpStatus>>;
type PlaywrightStatus = Awaited<ReturnType<typeof api.playwrightStatus>>;

const SystemSettings: React.FC = () => {
  const { settings, updateSettings, refresh } = useApp();
  /** Tools + Environment sections are unpackaged (dev) only — not shown in production builds. */
  const [isDevBuild, setIsDevBuild] = useState(false);
  const [ffStatus, setFfStatus] = useState<FfmpegStatus | null>(null);
  const [ffProgress, setFfProgress] = useState<{
    phase: string;
    percent: number;
    message: string;
  } | null>(null);
  const [installing, setInstalling] = useState(false);
  const [ytStatus, setYtStatus] = useState<YtdlpStatus | null>(null);
  const [ytProgress, setYtProgress] = useState<{
    phase: string;
    percent: number;
    message: string;
  } | null>(null);
  const [ytInstalling, setYtInstalling] = useState(false);
  const [pwStatus, setPwStatus] = useState<PlaywrightStatus | null>(null);
  const [pwProgress, setPwProgress] = useState<{
    phase: string;
    percent: number;
    message: string;
  } | null>(null);
  const [pwInstalling, setPwInstalling] = useState(false);

  const loadFfmpeg = useCallback(async () => {
    try {
      setFfStatus(await api.ffmpegStatus());
    } catch {
      setFfStatus(null);
    }
  }, []);

  const loadYtdlp = useCallback(async () => {
    try {
      setYtStatus(await api.ytdlpStatus());
    } catch {
      setYtStatus(null);
    }
  }, []);

  const loadPlaywright = useCallback(async () => {
    try {
      setPwStatus(await api.playwrightStatus());
    } catch {
      setPwStatus(null);
    }
  }, []);

  useEffect(() => {
    void api
      .getAppInfo()
      .then((info) => setIsDevBuild(!info.isPackaged))
      .catch(() => {
        setIsDevBuild(false);
      });
  }, []);

  useEffect(() => {
    if (!isDevBuild) return;
    void loadFfmpeg();
  }, [isDevBuild, loadFfmpeg, settings?.system?.ffmpegPath, settings?.system?.ffmpegEnabled]);

  useEffect(() => {
    if (!isDevBuild) return;
    void loadYtdlp();
  }, [isDevBuild, loadYtdlp, settings?.system?.ytdlpPath, settings?.system?.ytdlpEnabled]);

  useEffect(() => {
    if (!isDevBuild) return;
    void loadPlaywright();
  }, [isDevBuild, loadPlaywright]);

  useEffect(() => {
    if (!isDevBuild) return;
    return api.onFfmpegProgress((ev) => setFfProgress(ev));
  }, [isDevBuild]);

  useEffect(() => {
    if (!isDevBuild) return;
    return api.onYtdlpProgress((ev) => setYtProgress(ev));
  }, [isDevBuild]);

  useEffect(() => {
    if (!isDevBuild) return;
    return api.onPlaywrightProgress((ev) => setPwProgress(ev));
  }, [isDevBuild]);

  if (!settings?.system) return null;

  const system = settings.system;
  const available = Boolean(ffStatus?.available);
  const canEnable = available && !installing;
  const ytAvailable = Boolean(ytStatus?.available);
  const ytCanEnable = ytAvailable && !ytInstalling;
  const pwAvailable = Boolean(pwStatus?.available);

  const patchSystem = async (partial: Partial<SystemConfig>) => {
    await updateSettings({ system: partial });
    if (partial.hardwareAcceleration !== undefined) {
      Message.info("Restart Pinforge for hardware acceleration changes to apply.");
    }
    if (isDevBuild) {
      await loadFfmpeg();
      await loadYtdlp();
      await loadPlaywright();
    }
  };

  const installFfmpegTool = async () => {
    setInstalling(true);
    setFfProgress({ phase: "download", percent: 0, message: "Starting…" });
    try {
      const status = await api.ffmpegInstall();
      setFfStatus(status);
      await refresh();
      Message.success("ffmpeg installed and enabled for tools.");
    } catch (e) {
      Message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(false);
      setFfProgress(null);
      await loadFfmpeg();
    }
  };

  return (
    <SettingsPage width="narrow">
      <SettingsHeader
        title="System"
        description="Language, startup behavior, notifications, and developer tools."
      />
      <SettingsSection title="Application">
        <SettingsRow title="Language" description="Interface language.">
          <Select
            style={{ width: 160 }}
            value={system.language}
            onChange={(v) => void patchSystem({ language: String(v) })}
          >
            <Select.Option value="en">English</Select.Option>
          </Select>
        </SettingsRow>
        <SettingsRow
          title="Start on Boot"
          description="Launch Pinforge automatically when you sign in to Windows or macOS."
        >
          <Switch
            checked={system.startOnBoot}
            onChange={(v) => void patchSystem({ startOnBoot: v })}
          />
        </SettingsRow>
        <SettingsRow
          title="Close to Tray"
          description="Hide to the system tray instead of quitting when you close the window."
        >
          <Switch
            checked={system.closeToTray}
            onChange={(v) => void patchSystem({ closeToTray: v })}
          />
        </SettingsRow>
        <SettingsRow
          title="Hardware Acceleration"
          description="Use the GPU to render the UI. Disable if the app crashes on launch or graphics flicker. Restart required."
        >
          <Switch
            checked={system.hardwareAcceleration}
            onChange={(v) => void patchSystem({ hardwareAcceleration: v })}
          />
        </SettingsRow>
        <SettingsRow title="Notifications" description="Allow desktop notifications from Pinforge.">
          <Switch
            checked={system.notifications}
            onChange={(v) => void patchSystem({ notifications: v })}
          />
        </SettingsRow>
        {system.notifications && (
          <SettingsRow
            title="Download complete"
            description="Notify when a download or board job finishes."
          >
            <Switch
              checked={system.notifyOnDownloadComplete}
              onChange={(v) => void patchSystem({ notifyOnDownloadComplete: v })}
            />
          </SettingsRow>
        )}
      </SettingsSection>

      {isDevBuild && (
        <>
          <SettingsSection title="Tools">
            <SettingsField title="ffmpeg">
              <div className="flex items-center justify-end mb-10px -mt-4px">
                <Tag color={available ? "green" : "gray"} size="small">
                  {installing ? "Installing…" : available ? "Installed" : "Not found"}
                </Tag>
              </div>
              {ffStatus?.version && (
                <div
                  className="text-12px text-t-secondary mb-10px truncate"
                  title={ffStatus.path || undefined}
                >
                  {ffStatus.version}
                  {ffStatus.path ? ` · ${ffStatus.path}` : ""}
                </div>
              )}
              {installing && ffProgress && (
                <div className="mb-12px">
                  <div className="text-12px text-t-secondary mb-6px">{ffProgress.message}</div>
                  <Progress percent={ffProgress.percent} showText />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-8px">
                {!available && (
                  <Button
                    type="primary"
                    loading={installing}
                    disabled={installing}
                    onClick={() => void installFfmpegTool()}
                  >
                    Download & install
                  </Button>
                )}
                <Button
                  disabled={installing}
                  onClick={async () => {
                    const status = await api.ffmpegPick();
                    if (status) {
                      setFfStatus(status);
                      await refresh();
                      Message.success("ffmpeg path updated.");
                    }
                  }}
                >
                  Browse binary…
                </Button>
                <Button disabled={installing} onClick={() => void loadFfmpeg()}>
                  Refresh
                </Button>
              </div>
            </SettingsField>

            <SettingsRow
              title="Enable ffmpeg tools"
              description={
                canEnable
                  ? "Use ffmpeg for merge, convert, embed, and metadata."
                  : "Install ffmpeg first. Enable unlocks after install finishes."
              }
            >
              <Switch
                checked={Boolean(system.ffmpegEnabled) && available}
                disabled={!canEnable}
                onChange={(v) => void patchSystem({ ffmpegEnabled: v })}
              />
            </SettingsRow>

            <SettingsField
              title="yt-dlp"
              description="Catch-all downloader for sites without a built-in provider."
            >
              <div className="flex items-center justify-end mb-10px -mt-4px">
                <Tag color={ytAvailable ? "green" : "gray"} size="small">
                  {ytInstalling ? "Installing…" : ytAvailable ? "Installed" : "Not found"}
                </Tag>
              </div>
              {ytStatus?.version && (
                <div
                  className="text-12px text-t-secondary mb-10px truncate"
                  title={ytStatus.path || undefined}
                >
                  {ytStatus.version}
                  {ytStatus.path ? ` · ${ytStatus.path}` : ""}
                </div>
              )}
              {ytInstalling && ytProgress && (
                <div className="mb-12px">
                  <div className="text-12px text-t-secondary mb-6px">{ytProgress.message}</div>
                  <Progress percent={ytProgress.percent} showText />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-8px">
                {!ytAvailable && (
                  <Button
                    type="primary"
                    loading={ytInstalling}
                    disabled={ytInstalling}
                    onClick={async () => {
                      setYtInstalling(true);
                      setYtProgress({ phase: "download", percent: 0, message: "Starting…" });
                      try {
                        const status = await api.ytdlpInstall();
                        setYtStatus(status);
                        await refresh();
                        Message.success("yt-dlp installed and enabled.");
                      } catch (e) {
                        Message.error(e instanceof Error ? e.message : String(e));
                      } finally {
                        setYtInstalling(false);
                        setYtProgress(null);
                      }
                    }}
                  >
                    Download & install
                  </Button>
                )}
                <Button
                  disabled={ytInstalling}
                  onClick={async () => {
                    const status = await api.ytdlpPick();
                    if (status) {
                      setYtStatus(status);
                      await refresh();
                      Message.success("yt-dlp path updated.");
                    }
                  }}
                >
                  Browse binary…
                </Button>
                <Button disabled={ytInstalling} onClick={() => void loadYtdlp()}>
                  Refresh
                </Button>
              </div>
            </SettingsField>

            <SettingsRow
              title="Enable yt-dlp provider"
              description={
                ytCanEnable
                  ? "Use yt-dlp for URLs that are not YouTube, Instagram, TikTok, Facebook, or Pinterest."
                  : "Install yt-dlp first. Enable unlocks after install finishes."
              }
            >
              <Switch
                checked={Boolean(system.ytdlpEnabled) && ytAvailable}
                disabled={!ytCanEnable}
                onChange={(v) => void patchSystem({ ytdlpEnabled: v })}
              />
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title="Environment">
            <SettingsField
              title="First-launch setup"
              description="On first launch, Pinforge automatically downloads ffmpeg, yt-dlp, and Playwright Chromium. Use Show onboarding to preview setup, or Uninstall Pinforge to open the goodbye page and optionally clear app data."
            >
              <div className="flex flex-wrap items-center gap-8px">
                <Button
                  onClick={async () => {
                    try {
                      sessionStorage.setItem(ONBOARD_PREVIEW_KEY, "1");
                    } catch {
                      /* ignore */
                    }
                    await patchSystem({ environmentSetupDone: false });
                    Message.success("Opening onboarding preview…");
                  }}
                >
                  Show onboarding
                </Button>
                <Button
                  status="danger"
                  onClick={() => {
                    void api.openUninstallWindow().then((res) => {
                      if (!res.ok) {
                        Message.error(res.message || "Could not open uninstall window");
                      }
                    });
                  }}
                >
                  Uninstall Pinforge
                </Button>
              </div>
            </SettingsField>

            <SettingsField
              title="Playwright Chromium"
              description="Browser used to scrape Instagram, TikTok, Facebook, and Pinterest when page meta is missing."
            >
              <div className="flex items-center justify-end mb-10px -mt-4px">
                <Tag color={pwAvailable ? "green" : "gray"} size="small">
                  {pwInstalling ? "Installing…" : pwAvailable ? "Installed" : "Not found"}
                </Tag>
              </div>
              {pwStatus?.version && (
                <div
                  className="text-12px text-t-secondary mb-10px truncate"
                  title={pwStatus.path || undefined}
                >
                  {`${pwStatus.version}${pwStatus.path ? ` · ${pwStatus.path}` : ""}`}
                </div>
              )}
              {pwInstalling && pwProgress && (
                <div className="mb-12px">
                  <div className="text-12px text-t-secondary mb-6px">{pwProgress.message}</div>
                  <Progress percent={pwProgress.percent} showText />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-8px">
                {!pwAvailable && (
                  <Button
                    type="primary"
                    loading={pwInstalling}
                    disabled={pwInstalling}
                    onClick={async () => {
                      setPwInstalling(true);
                      setPwProgress({ phase: "download", percent: 0, message: "Starting…" });
                      try {
                        const status = await api.playwrightInstall();
                        setPwStatus(status);
                        Message.success("Playwright Chromium installed.");
                      } catch (e) {
                        Message.error(e instanceof Error ? e.message : String(e));
                      } finally {
                        setPwInstalling(false);
                        setPwProgress(null);
                        await loadPlaywright();
                      }
                    }}
                  >
                    Download & install
                  </Button>
                )}
                {pwAvailable && (
                  <Button
                    loading={pwInstalling}
                    disabled={pwInstalling}
                    onClick={async () => {
                      setPwInstalling(true);
                      setPwProgress({ phase: "download", percent: 0, message: "Starting…" });
                      try {
                        const status = await api.playwrightInstall();
                        setPwStatus(status);
                        Message.success("Playwright Chromium reinstalled.");
                      } catch (e) {
                        Message.error(e instanceof Error ? e.message : String(e));
                      } finally {
                        setPwInstalling(false);
                        setPwProgress(null);
                        await loadPlaywright();
                      }
                    }}
                  >
                    Reinstall
                  </Button>
                )}
                <Button disabled={pwInstalling} onClick={() => void loadPlaywright()}>
                  Refresh
                </Button>
              </div>
            </SettingsField>

            <SettingsPathField
              label="Work directory"
              description="Default folder for saved media packs."
              value={settings.outDir}
              onBrowse={async () => {
                const dir = await api.pickFolderPath(settings.outDir);
                if (dir) await updateSettings({ outDir: dir });
              }}
              onOpen={() => void api.openPath(settings.outDir)}
            />
            <SettingsPathField
              label="Temp directory"
              description="Scratch space for extractors and Playwright downloads."
              value={system.tempDir}
              onBrowse={async () => {
                const dir = await api.pickFolderPath(system.tempDir);
                if (dir) await patchSystem({ tempDir: dir });
              }}
              onOpen={() => void api.openPath(system.tempDir)}
            />
            <SettingsPathField
              label="Log directory"
              description="Where app logs are written."
              value={system.logDir}
              onBrowse={async () => {
                const dir = await api.pickFolderPath(system.logDir);
                if (dir) await patchSystem({ logDir: dir });
              }}
              onOpen={() => void api.openPath(system.logDir)}
            />
            <SettingsField
              title="Extractor API (optional)"
              description="Optional Piped/Invidious API base for YouTube fallbacks. Leave empty to use the built-in extractor first."
            >
              <Input
                placeholder="https://api.piped.example.com"
                value={settings.extractorUrl}
                onChange={(v) => void updateSettings({ extractorUrl: v })}
              />
            </SettingsField>
          </SettingsSection>
        </>
      )}
    </SettingsPage>
  );
};

export default SystemSettings;
