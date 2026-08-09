import React, { useCallback, useEffect, useState } from "react";
import { Layout as ArcoLayout } from "@arco-design/web-react";
import classNames from "classnames";
import { Outlet } from "react-router-dom";
import Titlebar from "@renderer/components/layout/Titlebar";
import { LayoutContextProvider } from "@renderer/hooks/context/LayoutContext";
import logoUrl from "@renderer/assets/logo.png";
import "@renderer/styles/layout.css";

const DEFAULT_SIDER_WIDTH = 260;

const detectMobile = (): boolean =>
  typeof window !== "undefined" && window.innerWidth < 768;

const Layout: React.FC<{ sider: React.ReactNode }> = ({ sider }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(detectMobile);

  const toggleSider = useCallback(() => {
    setCollapsed((p) => !p);
  }, []);

  useEffect(() => {
    const onResize = () => {
      const mobile = detectMobile();
      setIsMobile(mobile);
      if (mobile) setCollapsed(true);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <LayoutContextProvider
      value={{
        isMobile,
        siderCollapsed: collapsed,
        setSiderCollapsed: setCollapsed,
        toggleSider,
      }}
    >
      <div className="app-shell flex flex-col size-full min-h-0">
        <Titlebar />

        {isMobile && !collapsed && (
          <div
            className="fixed inset-0 bg-black/30 z-90"
            onClick={() => setCollapsed(true)}
            aria-hidden="true"
          />
        )}

        <ArcoLayout className="size-full layout flex-1 min-h-0">
          <ArcoLayout.Sider
            collapsedWidth={0}
            collapsed={collapsed}
            width={DEFAULT_SIDER_WIDTH}
            className={classNames("!bg-2 layout-sider", { collapsed })}
            style={
              isMobile
                ? {
                    position: "fixed",
                    left: 0,
                    top: 42,
                    bottom: 0,
                    zIndex: 100,
                    height: "auto",
                  }
                : undefined
            }
          >
            <ArcoLayout.Header className="flex items-center justify-start pt-8px pb-8px pl-18px pr-16px gap-12px layout-sider-header">
              <img
                src={logoUrl}
                alt="Pinforge"
                className="shrink-0 size-32px rd-full object-cover"
                draggable={false}
              />
              <div className="text-16px text-t-primary collapsed-hidden font-semibold">Pinforge</div>
            </ArcoLayout.Header>

            <ArcoLayout.Content className="pt-0 px-8px pb-0 layout-sider-content">
              {React.isValidElement(sider)
                ? React.cloneElement(
                    sider as React.ReactElement<{ collapsed?: boolean; onSessionClick?: () => void }>,
                    {
                      collapsed,
                      onSessionClick: () => {
                        if (isMobile) setCollapsed(true);
                      },
                    }
                  )
                : sider}
            </ArcoLayout.Content>
          </ArcoLayout.Sider>

          <ArcoLayout.Content
            className="bg-1 layout-content flex flex-col min-h-0 flex-1 overflow-auto"
            onClick={() => {
              if (isMobile && !collapsed) setCollapsed(true);
            }}
          >
            <div className="flex-1 min-h-0 p-24px flex flex-col">
              <Outlet />
            </div>
          </ArcoLayout.Content>
        </ArcoLayout>
      </div>
    </LayoutContextProvider>
  );
};

export default Layout;
