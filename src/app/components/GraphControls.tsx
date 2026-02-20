import React, { memo } from 'react';
import { Tag, GitBranch, TrendingUp } from 'lucide-react';

interface GraphControlsProps {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetView?: () => void;
  showLabels: boolean;
  onToggleLabels: () => void;
  showDirectionArrows: boolean;
  onToggleDirectionArrows: () => void;
  highlightMoneyFlow: boolean;
  onToggleMoneyFlow: () => void;
}

export const GraphControls = memo(function GraphControls({
  showLabels,
  onToggleLabels,
  showDirectionArrows,
  onToggleDirectionArrows,
  highlightMoneyFlow,
  onToggleMoneyFlow,
}: GraphControlsProps) {
  return (
    <div className="absolute top-4 right-4 z-30 flex flex-col gap-2">
      <div className="bg-[#0a0a0a]/90 backdrop-blur-sm border border-[#262626] rounded-lg shadow-xl overflow-hidden">
        <CtrlBtn
          onClick={onToggleLabels}
          title={showLabels ? 'Hide Labels' : 'Show Labels'}
          border
          active={showLabels}
          activeClass="bg-blue-900/30 text-blue-400 hover:bg-blue-900/40"
        >
          <Tag className="w-4 h-4" />
        </CtrlBtn>
        <CtrlBtn
          onClick={onToggleDirectionArrows}
          title={showDirectionArrows ? 'Hide Arrows' : 'Show Arrows'}
          border
          active={showDirectionArrows}
          activeClass="bg-purple-900/30 text-purple-400 hover:bg-purple-900/40"
        >
          <GitBranch className="w-4 h-4" />
        </CtrlBtn>
        <CtrlBtn
          onClick={onToggleMoneyFlow}
          title={highlightMoneyFlow ? 'Disable Flow Highlight' : 'Highlight Money Flow'}
          active={highlightMoneyFlow}
          activeClass="bg-green-900/30 text-green-400 hover:bg-green-900/40"
        >
          <TrendingUp className="w-4 h-4" />
        </CtrlBtn>
      </div>
    </div>
  );
});

const CtrlBtn = memo(function CtrlBtn({
  onClick, title, border, active, activeClass, children,
}: {
  onClick: () => void;
  title: string;
  border?: boolean;
  active?: boolean;
  activeClass?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-10 h-10 flex items-center justify-center ${border ? 'border-b border-[#262626]' : ''} ${
        active && activeClass
          ? activeClass
          : 'text-slate-400 hover:text-white hover:bg-[#1f1f1f]'
      }`}
    >
      {children}
    </button>
  );
});