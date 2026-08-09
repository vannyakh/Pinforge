import React from "react";
import classNames from "classnames";

interface ShimmerTextProps {
  children: React.ReactNode;
  className?: string;
  /** Animation duration in seconds @default 2.4 */
  duration?: number;
  /** Pause shimmer on hover @default false */
  pauseOnHover?: boolean;
}

/**
 * Swimming highlight across text — used for Processing / loading labels.
 */
const ShimmerText: React.FC<ShimmerTextProps> = ({
  children,
  className,
  duration = 2.4,
  pauseOnHover = false,
}) => (
  <span
    className={classNames("shimmer-text", pauseOnHover && "shimmer-text--pause-hover", className)}
    style={{ animationDuration: `${duration}s` }}
  >
    {children}
  </span>
);

export default ShimmerText;
