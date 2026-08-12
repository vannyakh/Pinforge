import React, { useCallback, useEffect, useState } from "react";
import { Button, Input, Message, Progress, Select, Switch, Tag } from "@arco-design/web-react";
import { FolderOpen } from "@icon-park/react";
import { useApp } from "@renderer/hooks/context/AppContext";
import { api, type SystemConfig } from "@renderer/api";
import { ONBOARD_PREVIEW_KEY } from "@renderer/components/setup/EnvironmentSetup";

const Row: React.FC<{
  title: string;
  description?: string;
  children: React.ReactNode;
}> = ({ title, description, children }) => (
  <div className="flex items-start justify-between gap-24px py-14px border-b border-b-base last:border-b-0">
    <div className="min-w-0 flex-1">
      <div className="text-14px text-t-primary">{title}</div>
      {description && (
        <div className="text-12px text-t-tertiary mt-4px leading-relaxed">{description}</div>
      )}
    </div>
    <div className="shrink-0 flex items-center">{children}</div>
  </div>
);

const PathField: React.FC<{
  label: string;
  description?: string;
  value: string;
  onBrowse: () => void;
  onOpen: () => void;
}> = ({ label, description, value, onBrowse, onOpen }) => (
  <div className="py-14px border-b border-b-base last:border-b-0">
    <div className="text-14px text-t-primary mb-4px">{label}</div>
    {description && <div className="text-12px text-t-tertiary mb-8px">{description}</div>}
    <div className="flex gap-8px">
      <Input value={value} readOnly className="flex-1" />
      <Button
        icon={<FolderOpen theme="outline" size="16" fill="currentColor" strokeWidth={3} />}
        onClick={onBrowse}
      >
        Browse…
      </Button>
      <Button onClick={onOpen}>Open</Button>
    </div>
  </div>
);

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
    <div className="max-w-640px w-full">
      <div className="text-22px font-600 text-t-primary mb-6px">System</div>
      <div className="text-12px font-500 text-t-tertiary tracking-wide uppercase mb-8px">
        Application
      </div>
      <div className="bg-2 rd-12px border border-b-base px-18px mb-28px">
        <Row title="Language" description="Interface language.">
          <Select
            style={{ width: 160 }}
            value={system.language}
            onChange={(v) => void patchSystem({ language: String(v) })}
          >
            <Select.Option value="en">English</Select.Option>
          </Select>
        </Row>
        <Row
          title="Start on Boot"
          description="Launch Pinforge automatically when you sign in to Windows or macOS."
        >
          <Switch
            checked={system.startOnBoot}
            onChange={(v) => void patchSystem({ startOnBoot: v })}
          />
        </Row>
        <Row
          title="Close to Tray"
          description="Hide to the system tray instead of quitting when you close the window."
        >
          <Switch
            checked={system.closeToTray}
            onChange={(v) => void patchSystem({ closeToTray: v })}
          />
        </Row>
        <Row
          title="Hardware Acceleration"
          description="Use the GPU to render the UI. Disable if the app crashes on launch or graphics flicker. Restart required."
        >
          <Switch
            checked={system.hardwareAcceleration}
            onChange={(v) => void patchSystem({ hardwareAcceleration: v })}
          />
        </Row>
        <Row title="Notifications" description="Allow desktop notifications from Pinforge.">
          <Switch
            checked={system.notifications}
            onChange={(v) => void patchSystem({ notifications: v })}
          />
        </Row>
        {system.notifications && (
          <Row
            title="Download complete"
            description="Notify when a download or board job finishes."
          >
            <Switch
              checked={system.notifyOnDownloadComplete}
              onChange={(v) => void patchSystem({ notifyOnDownloadComplete: v })}
            />
          </Row>
        )}
      </div>

      {isDevBuild && (
        <>
          <div className="text-12px font-500 text-t-tertiary tracking-wide uppercase mb-8px">
            Tools
          </div>
          <div className="bg-2 rd-12px border border-b-base px-18px mb-28px">
            <div className="py-14px border-b border-b-base">
              <div className="flex items-start justify-between gap-16px mb-10px">
                <div className="min-w-0">
                  <div className="text-14px text-t-primary">ffmpeg</div>
                </div>
                <Tag color={available ? "green" : "gray"} size="small" className="shrink-0">
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
            </div>

            <Row
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
            </Row>

            <div className="py-14px border-b border-b-base">
              <div className="flex items-start justify-between gap-16px mb-10px">
                <div className="min-w-0">
                  <div className="text-14px text-t-primary">yt-dlp</div>
                  <div className="text-12px text-t-tertiary mt-4px leading-relaxed">
                    Catch-all downloader for sites without a built-in provider.
                  </div>
                </div>
                <Tag color={ytAvailable ? "green" : "gray"} size="small" className="shrink-0">
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
            </div>

            <Row
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
            </Row>
          </div>

          <div className="text-12px font-500 text-t-tertiary tracking-wide uppercase mb-8px">
            Environment
          </div>
          <div className="bg-2 rd-12px border border-b-base px-18px mb-16px">
            <div className="py-14px border-b border-b-base">
              <div className="text-14px text-t-primary mb-4px">First-launch setup</div>
              <div className="text-12px text-t-tertiary leading-relaxed mb-12px">
                On first launch, Pinforge automatically downloads ffmpeg, yt-dlp, and Playwright
                Chromium. Use Show onboarding to preview setup, or Uninstall Pinforge to open the
                goodbye page and optionally clear app data.
              </div>
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
            </div>
            <div className="py-14px border-b border-b-base">
              <div className="flex items-start justify-between gap-16px mb-10px">
                <div className="min-w-0">
                  <div className="text-14px text-t-primary">Playwright Chromium</div>
                  <div className="text-12px text-t-tertiary mt-4px leading-relaxed">
                    Browser used to scrape Instagram, TikTok, Facebook, and Pinterest when page meta
                    is missing.
                  </div>
                </div>
                <Tag color={pwAvailable ? "green" : "gray"} size="small" className="shrink-0">
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
            </div>

            <PathField
              label="Work directory"
              description="Default folder for saved media packs."
              value={settings.outDir}
              onBrowse={async () => {
                const dir = await api.pickFolderPath(settings.outDir);
                if (dir) await updateSettings({ outDir: dir });
              }}
              onOpen={() => void api.openPath(settings.outDir)}
            />
            <PathField
              label="Temp directory"
              description="Scratch space for extractors and Playwright downloads."
              value={system.tempDir}
              onBrowse={async () => {
                const dir = await api.pickFolderPath(system.tempDir);
                if (dir) await patchSystem({ tempDir: dir });
              }}
              onOpen={() => void api.openPath(system.tempDir)}
            />
            <PathField
              label="Log directory"
              description="Where app logs are written."
              value={system.logDir}
              onBrowse={async () => {
                const dir = await api.pickFolderPath(system.logDir);
                if (dir) await patchSystem({ logDir: dir });
              }}
              onOpen={() => void api.openPath(system.logDir)}
            />
            <div className="py-14px">
              <div className="text-14px text-t-primary mb-4px">Extractor API (optional)</div>
              <div className="text-12px text-t-tertiary mb-8px">
                Optional Piped/Invidious API base for YouTube fallbacks. Leave empty to use the
                built-in extractor first.
              </div>
              <Input
                placeholder="https://api.piped.example.com"
                value={settings.extractorUrl}
                onChange={(v) => void updateSettings({ extractorUrl: v })}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SystemSettings;
