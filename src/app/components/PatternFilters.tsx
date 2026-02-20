import React, { memo, useCallback } from 'react';
import { Filter, Check } from 'lucide-react';

interface PatternFiltersProps {
  timeWindow: '24h' | '7d' | '30d' | 'custom';
  onTimeWindowChange: (window: '24h' | '7d' | '30d' | 'custom') => void;
  enabledPatterns: {
    circular: boolean;
    fanPattern: boolean;
    rapidPassThrough: boolean;
  };
  onPatternToggle: (pattern: 'circular' | 'fanPattern' | 'rapidPassThrough') => void;
  matchingCount?: number;
  totalCount?: number;
}

export const PatternFilters = memo(function PatternFilters({
  timeWindow,
  onTimeWindowChange,
  enabledPatterns,
  onPatternToggle,
  matchingCount,
  totalCount
}: PatternFiltersProps) {
  const hasActiveFilters = enabledPatterns.circular || enabledPatterns.fanPattern || enabledPatterns.rapidPassThrough;
  const showFilterCount = hasActiveFilters && matchingCount !== undefined && totalCount !== undefined;

  return (
    <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Pattern Filters</h3>
        </div>
        {showFilterCount && (
          <div className={`text-xs font-mono px-2 py-1 rounded ${
            matchingCount === 0 
              ? 'bg-red-900/20 text-red-400 border border-red-900/30'
              : 'bg-blue-900/20 text-blue-400 border border-blue-900/30'
          }`}>
            {matchingCount} / {totalCount}
          </div>
        )}
      </div>

      {/* Time Window */}
      <div className="mb-4">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">
          Time Window
        </label>
        <div className="flex gap-2">
          {(['24h', '7d', '30d', 'custom'] as const).map((window) => (
            <button
              key={window}
              onClick={() => onTimeWindowChange(window)}
              className={`flex-1 px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${
                timeWindow === window
                  ? 'bg-blue-900/30 border-blue-700/50 text-blue-300'
                  : 'bg-[#0f0f0f] border-[#262626] text-slate-400 hover:border-[#404040] hover:text-slate-200'
              }`}
            >
              {window === 'custom' ? 'Custom' : window.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Pattern Checkboxes */}
      <div>
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 block">
          Detection Patterns
        </label>
        <div className="space-y-2">
          <label className="flex items-center gap-3 p-3 rounded-lg border border-[#1f1f1f] hover:border-[#404040] cursor-pointer transition-all group bg-[#0f0f0f]">
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
              enabledPatterns.circular
                ? 'bg-blue-900/30 border-blue-600'
                : 'border-[#404040] group-hover:border-[#505050]'
            }`}>
              {enabledPatterns.circular && <Check className="w-3.5 h-3.5 text-blue-400" />}
            </div>
            <input
              type="checkbox"
              checked={enabledPatterns.circular}
              onChange={() => onPatternToggle('circular')}
              className="sr-only"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-white">Circular Transfers</div>
              <div className="text-[10px] text-slate-500">Money loops back to origin</div>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 rounded-lg border border-[#1f1f1f] hover:border-[#404040] cursor-pointer transition-all group bg-[#0f0f0f]">
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
              enabledPatterns.fanPattern
                ? 'bg-purple-900/30 border-purple-600'
                : 'border-[#404040] group-hover:border-[#505050]'
            }`}>
              {enabledPatterns.fanPattern && <Check className="w-3.5 h-3.5 text-purple-400" />}
            </div>
            <input
              type="checkbox"
              checked={enabledPatterns.fanPattern}
              onChange={() => onPatternToggle('fanPattern')}
              className="sr-only"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-white">Fan-in / Fan-out Patterns</div>
              <div className="text-[10px] text-slate-500">Star topology distribution</div>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 rounded-lg border border-[#1f1f1f] hover:border-[#404040] cursor-pointer transition-all group bg-[#0f0f0f]">
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
              enabledPatterns.rapidPassThrough
                ? 'bg-orange-900/30 border-orange-600'
                : 'border-[#404040] group-hover:border-[#505050]'
            }`}>
              {enabledPatterns.rapidPassThrough && <Check className="w-3.5 h-3.5 text-orange-400" />}
            </div>
            <input
              type="checkbox"
              checked={enabledPatterns.rapidPassThrough}
              onChange={() => onPatternToggle('rapidPassThrough')}
              className="sr-only"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-white">Rapid Pass-through</div>
              <div className="text-[10px] text-slate-500">High flow-through ratio</div>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
});