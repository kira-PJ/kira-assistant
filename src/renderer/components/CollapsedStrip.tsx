import React from 'react';

interface CollapsedStripProps {
  isCapturing: boolean;
  onExpand: () => void;
}

const CollapsedStrip: React.FC<CollapsedStripProps> = ({ isCapturing, onExpand }) => {
  return (
    <div className="draggable flex items-center justify-between h-10 px-3 bg-ghost-surface border border-ghost-border rounded-lg cursor-pointer">
      <div className="flex items-center gap-2">
        <span className="text-ghost-accent text-sm">✦</span>
        {isCapturing && (
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        )}
      </div>
      <button
        onClick={onExpand}
        className="no-drag text-ghost-text-dim hover:text-ghost-text text-xs px-2 py-0.5"
        title="Expand (Ctrl+Shift+M)"
      >
        ▲ Expand
      </button>
    </div>
  );
};

export default CollapsedStrip;
