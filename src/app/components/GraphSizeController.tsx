/**
 * Graph Size Controller
 * 
 * Limits initial graph rendering to prevent browser crashes
 * Allows progressive expansion on user demand
 */

import React from 'react';
import { AlertTriangle, Maximize2, Filter } from 'lucide-react';

interface GraphSizeControllerProps {
  totalNodes: number;
  displayedNodes: number;
  displayMode: 'top-risk' | 'selected-ring' | 'filtered' | 'all';
  onDisplayModeChange: (mode: 'top-risk' | 'selected-ring' | 'filtered' | 'all') => void;
  riskThreshold: number;
  selectedRingId: string | null;
}

export function GraphSizeController({
  totalNodes,
  displayedNodes,
  displayMode,
  onDisplayModeChange,
  riskThreshold,
  selectedRingId
}: GraphSizeControllerProps) {
  
  const isLargeDataset = totalNodes > 500;
  const showWarning = displayMode === 'all' && totalNodes > 1000;

  return (
    <div className="bg-[#0a0a0a] border border-[#262626] rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-slate-200">Graph Display Mode</span>
        </div>
        <div className="text-xs text-slate-400">
          {displayedNodes.toLocaleString()} / {totalNodes.toLocaleString()} nodes
        </div>
      </div>

      <div className="space-y-2">
        {/* Top Risk Mode */}
        <button
          onClick={() => onDisplayModeChange('top-risk')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-left ${
            displayMode === 'top-risk'
              ? 'bg-blue-600/20 border border-blue-500/50 text-blue-300'
              : 'bg-[#171717] border border-[#262626] text-slate-300 hover:bg-[#1f1f1f]'
          }`}
        >
          <span className="text-sm">Top Risk Nodes</span>
          <span className="text-xs text-slate-400">Recommended</span>
        </button>

        {/* Selected Ring Mode */}
        {selectedRingId && (
          <button
            onClick={() => onDisplayModeChange('selected-ring')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-left ${
              displayMode === 'selected-ring'
                ? 'bg-yellow-600/20 border border-yellow-500/50 text-yellow-300'
                : 'bg-[#171717] border border-[#262626] text-slate-300 hover:bg-[#1f1f1f]'
            }`}
          >
            <span className="text-sm">Selected Ring Only</span>
            <span className="text-xs text-slate-400">{selectedRingId}</span>
          </button>
        )}

        {/* Filtered Mode */}
        <button
          onClick={() => onDisplayModeChange('filtered')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-left ${
            displayMode === 'filtered'
              ? 'bg-orange-600/20 border border-orange-500/50 text-orange-300'
              : 'bg-[#171717] border border-[#262626] text-slate-300 hover:bg-[#1f1f1f]'
          }`}
        >
          <span className="text-sm">Above Threshold</span>
          <span className="text-xs text-slate-400">≥ {riskThreshold}</span>
        </button>

        {/* Show All Mode (with warning for large datasets) */}
        <button
          onClick={() => {
            if (isLargeDataset) {
              const confirmed = window.confirm(
                `Warning: Displaying all ${totalNodes.toLocaleString()} nodes may slow down your browser. Continue?`
              );
              if (!confirmed) return;
            }
            onDisplayModeChange('all');
          }}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-left ${
            displayMode === 'all'
              ? 'bg-red-600/20 border border-red-500/50 text-red-300'
              : 'bg-[#171717] border border-[#262626] text-slate-300 hover:bg-[#1f1f1f]'
          }`}
        >
          <div className="flex items-center gap-2">
            <Maximize2 className="w-3 h-3" />
            <span className="text-sm">Show All Nodes</span>
          </div>
          {isLargeDataset && (
            <AlertTriangle className="w-3 h-3 text-yellow-500" />
          )}
        </button>
      </div>

      {/* Warning for large datasets */}
      {showWarning && (
        <div className="mt-3 p-2 bg-yellow-900/20 border border-yellow-600/50 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-yellow-200">
              <p className="font-semibold mb-1">Performance Warning</p>
              <p className="text-yellow-300/80">
                Rendering {totalNodes.toLocaleString()} nodes may cause browser lag. 
                Consider using filtered modes for better performance.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Info text */}
      <div className="text-xs text-slate-500 pt-2 border-t border-[#262626]">
        {displayMode === 'top-risk' && 'Showing top 100 highest-risk nodes'}
        {displayMode === 'selected-ring' && 'Showing only nodes in selected fraud ring'}
        {displayMode === 'filtered' && `Showing nodes with risk score ≥ ${riskThreshold}`}
        {displayMode === 'all' && 'Showing all nodes in the network'}
      </div>
    </div>
  );
}
