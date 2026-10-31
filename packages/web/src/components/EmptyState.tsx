import React from "react";
import { SearchX } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export function EmptyState({ title, description, actionLabel, onAction, icon }: EmptyStateProps) {
  return (
    <div className="emptyStatePanel" role="status">
      <span className="emptyStateIcon" aria-hidden="true">{icon ?? <SearchX size={22} />}</span>
      <p className="emptyStateTitle">{title}</p>
      {description ? <p className="emptyStateText">{description}</p> : null}
      {actionLabel && onAction ? (
        <button type="button" className="nbButton nbButton--primary" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
