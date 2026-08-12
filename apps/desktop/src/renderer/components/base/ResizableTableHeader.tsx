import React, { useCallback, useMemo, useRef, useState } from "react";
import type { ColumnProps } from "@arco-design/web-react/es/Table/interface";
import type { ComponentsProps } from "@arco-design/web-react/es/Table/interface";

/** Props passed from Arco `onHeaderCell` into custom `components.header.th`. */
export type ResizableHeaderCellProps = React.ThHTMLAttributes<HTMLTableCellElement> & {
  width?: number;
  onResize?: (
    e: React.SyntheticEvent | MouseEvent,
    data: { size: { width: number; height: number } }
  ) => void;
};

/**
 * Arco Table `components.header.th` — renders a real `<th>` so fixed/sticky columns keep working.
 * Resize handle is absolutely positioned inside the cell (no wrapper div in `<tr>`).
 */
export const ResizableTableTh: React.FC<ResizableHeaderCellProps> = ({
  onResize,
  width,
  children,
  ...rest
}) => {
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const onHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!onResize || !width) return;

      dragRef.current = { startX: e.clientX, startWidth: width };
      document.body.classList.add("tasks-col-resizing");

      const onMouseMove = (ev: MouseEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        onResize(ev, {
          size: { width: drag.startWidth + (ev.clientX - drag.startX), height: 0 },
        });
      };

      const onMouseUp = () => {
        dragRef.current = null;
        document.body.classList.remove("tasks-col-resizing");
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [onResize, width]
  );

  if (!width || !onResize) {
    return <th {...rest}>{children}</th>;
  }

  return (
    <th {...rest}>
      {children}
      <span
        className="react-resizable-handle react-resizable-handle-e tasks-table-col-resize-handle"
        onMouseDown={onHandleMouseDown}
        onClick={(e) => e.stopPropagation()}
      />
    </th>
  );
};

/** Typed Arco `components` for resizable header cells. */
export const resizableTableComponents: ComponentsProps = {
  header: { th: ResizableTableTh },
};

export function makeColumnResizeHandler(
  setWidth: (next: number) => void,
  minWidth: number
): (
  e: React.SyntheticEvent | MouseEvent,
  data: { size: { width: number; height: number } }
) => void {
  return (_e, { size }) => {
    setWidth(Math.max(minWidth, Math.round(size.width)));
  };
}

type WidthMap = Record<string, number>;

/**
 * Arco-style resizable columns: fixed widths in state + `onHeaderCell` → custom `th`.
 * @see https://arco.design/react/components/table
 */
export function useResizableColumnWidths<T>(
  defaultWidths: WidthMap,
  minWidths: WidthMap
): {
  widths: WidthMap;
  scrollX: number;
  bindColumn: (key: string) => Pick<ColumnProps<T>, "width" | "onHeaderCell">;
  components: ComponentsProps;
} {
  const [widths, setWidths] = useState<WidthMap>(() => ({ ...defaultWidths }));

  const handlers = useMemo(() => {
    const next: Record<
      string,
      (
        e: React.SyntheticEvent | MouseEvent,
        data: { size: { width: number; height: number } }
      ) => void
    > = {};
    for (const key of Object.keys(defaultWidths)) {
      const min = minWidths[key] ?? 48;
      next[key] = makeColumnResizeHandler(
        (width) => setWidths((prev) => (prev[key] === width ? prev : { ...prev, [key]: width })),
        min
      );
    }
    return next;
  }, [defaultWidths, minWidths]);

  const scrollX = useMemo(() => Object.values(widths).reduce((sum, w) => sum + w, 0), [widths]);

  const bindColumn = useCallback(
    (key: string): Pick<ColumnProps<T>, "width" | "onHeaderCell"> => ({
      width: widths[key],
      onHeaderCell: (col) => ({
        width: col.width ?? widths[key],
        onResize: handlers[key],
      }),
    }),
    [widths, handlers]
  );

  return {
    widths,
    scrollX,
    bindColumn,
    components: resizableTableComponents,
  };
}
