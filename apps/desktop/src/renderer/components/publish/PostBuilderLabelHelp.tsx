import React from "react";
import { Tooltip } from "@arco-design/web-react";
import { Info } from "@icon-park/react";

type PostBuilderLabelHelpProps = {
  label: string;
  hint?: React.ReactNode;
  className?: string;
};

const PostBuilderLabelHelp: React.FC<PostBuilderLabelHelpProps> = ({
  label,
  hint,
  className = "post-builder__label",
}) => (
  <div className={className}>
    <span className="inline-flex items-center gap-6px">
      {label}
      {hint ? (
        <Tooltip content={hint}>
          <span className="remote-label-help" tabIndex={0} aria-label="Help">
            <Info theme="outline" size="14" fill="currentColor" />
          </span>
        </Tooltip>
      ) : null}
    </span>
  </div>
);

export default PostBuilderLabelHelp;
