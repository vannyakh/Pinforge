import React, { createContext, useContext } from "react";

interface LayoutContextValue {
  isMobile: boolean;
  siderCollapsed: boolean;
  setSiderCollapsed: (collapsed: boolean) => void;
  toggleSider: () => void;
}

const LayoutContext = createContext<LayoutContextValue | null>(null);

export const LayoutContextProvider = LayoutContext.Provider;

export function useLayoutContext(): LayoutContextValue {
  const ctx = useContext(LayoutContext);
  if (!ctx) {
    throw new Error("useLayoutContext must be used within Layout");
  }
  return ctx;
}
