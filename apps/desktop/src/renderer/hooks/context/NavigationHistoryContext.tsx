import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { NavigationType, useLocation, useNavigate, useNavigationType } from "react-router-dom";

const MAX_HISTORY = 50;

type HistoryEntry = { path: string };

type NavigationHistoryContextValue = {
  canBack: boolean;
  canForward: boolean;
  back: () => void;
  forward: () => void;
};

const NavigationHistoryContext = createContext<NavigationHistoryContextValue | null>(null);

const buildPath = (location: { pathname: string; search: string; hash: string }) =>
  `${location.pathname}${location.search}${location.hash}`;

export const NavigationHistoryProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();

  const [stack, setStack] = useState<HistoryEntry[]>(() => [{ path: buildPath(location) }]);
  const [cursor, setCursor] = useState(0);
  const skipNextRef = useRef(false);

  useEffect(() => {
    if (skipNextRef.current) {
      skipNextRef.current = false;
      return;
    }
    const path = buildPath(location);
    setStack((prevStack) => {
      const prevEntry = prevStack[cursor];
      if (prevEntry && prevEntry.path === path) return prevStack;

      if (navigationType === NavigationType.Replace) {
        const next = prevStack.slice();
        next[cursor] = { path };
        return next;
      }

      const truncated = prevStack.slice(0, cursor + 1);
      truncated.push({ path });
      if (truncated.length > MAX_HISTORY) {
        const overflow = truncated.length - MAX_HISTORY;
        const trimmed = truncated.slice(overflow);
        setCursor(trimmed.length - 1);
        return trimmed;
      }
      setCursor(truncated.length - 1);
      return truncated;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cursor synced inside updater
  }, [location.pathname, location.search, location.hash, navigationType]);

  const back = useCallback(() => {
    const next = cursor - 1;
    if (next < 0) return;
    const target = stack[next];
    if (!target) return;
    skipNextRef.current = true;
    setCursor(next);
    void navigate(target.path, { replace: true });
  }, [cursor, stack, navigate]);

  const forward = useCallback(() => {
    const next = cursor + 1;
    if (next >= stack.length) return;
    const target = stack[next];
    if (!target) return;
    skipNextRef.current = true;
    setCursor(next);
    void navigate(target.path, { replace: true });
  }, [cursor, stack, navigate]);

  const value = useMemo(
    () => ({
      canBack: cursor > 0,
      canForward: cursor < stack.length - 1,
      back,
      forward,
    }),
    [cursor, stack.length, back, forward]
  );

  return (
    <NavigationHistoryContext.Provider value={value}>{children}</NavigationHistoryContext.Provider>
  );
};

export function useNavigationHistory(): NavigationHistoryContextValue | null {
  return useContext(NavigationHistoryContext);
}
