import React, { memo, useState, useEffect, useCallback, useRef } from 'react';
import { AlertTriangle, Shield } from 'lucide-react';

interface RiskThresholdControlProps {
  threshold: number;
  onThresholdChange: (value: number) => void;
  flaggedCount: number;
}

/**
 * Maintains LOCAL slider state so dragging only re-renders this component.
 * The parent receives the committed value only on mouseup / touchend,
 * preventing the entire App tree from re-rendering 60× per second.
 */
export const RiskThresholdControl = memo(function RiskThresholdControl({
  threshold,
  onThresholdChange,
  flaggedCount,
}: RiskThresholdControlProps) {
  const [localValue, setLocalValue] = useState(threshold);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync if parent changes the value programmatically
  useEffect(() => { setLocalValue(threshold); }, [threshold]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setLocalValue(val);
    // Debounced propagation during drag for live feedback (300ms)
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onThresholdChange(val);
    }, 300);
  }, [onThresholdChange]);

  // Immediate propagation on release
  const handleCommit = useCallback((e: React.SyntheticEvent<HTMLInputElement>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onThresholdChange(Number((e.target as HTMLInputElement).value));
  }, [onThresholdChange]);

  const label =
    localValue >= 75 ? { text: 'Critical Risk Filter',  sub: 'Showing only high-severity threats',   colour: 'red',    pulse: true }
    : localValue >= 50 ? { text: 'Elevated Risk Filter',  sub: 'Moderate to high risk entities',       colour: 'orange', pulse: false }
    : localValue >= 25 ? { text: 'Standard Filter',       sub: 'All suspicious activity',              colour: 'yellow', pulse: false }
    :                    { text: 'All Entities',           sub: 'Including low-risk accounts',          colour: 'green',  pulse: false };

  const iconClass =
    label.colour === 'red'    ? 'bg-red-900/20 text-red-400'
    : label.colour === 'orange' ? 'bg-orange-900/20 text-orange-400'
    : label.colour === 'yellow' ? 'bg-yellow-900/20 text-yellow-400'
    :                              'bg-green-900/20 text-green-400';

  const textClass =
    label.colour === 'red'    ? 'text-red-400'
    : label.colour === 'orange' ? 'text-orange-400'
    : label.colour === 'yellow' ? 'text-yellow-400'
    :                              'text-green-400';

  const subClass =
    label.colour === 'red'    ? 'text-red-500/70'
    : label.colour === 'orange' ? 'text-orange-500/70'
    : label.colour === 'yellow' ? 'text-yellow-500/70'
    :                              'text-green-500/70';

  return (
    <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Risk Threshold</h3>
          {flaggedCount > 0 && (
            <div className="px-2 py-0.5 bg-red-950/30 border border-red-900/40 rounded-full text-xs text-red-400 font-semibold animate-pulse">
              {flaggedCount}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-slate-500">Minimum:</div>
          {/* Show localValue for instant visual feedback */}
          <div className="font-mono text-2xl font-bold text-white">{localValue}</div>
        </div>
      </div>

      <div className="mb-3 p-2 bg-[#0f0f0f] border border-[#262626] rounded-lg">
        <div className="text-[10px] text-slate-400 leading-relaxed">
          <span className="font-semibold text-slate-300">Entities with score ≥ {threshold}:</span>{' '}
          <span className="text-slate-500">{flaggedCount} qualifying</span>
        </div>
      </div>

      <div className="mb-4">
        <input
          type="range"
          min="0"
          max="100"
          value={localValue}
          onChange={handleChange}
          onMouseUp={handleCommit}
          onTouchEnd={handleCommit}
          className="w-full h-2 bg-[#1f1f1f] rounded-lg appearance-none cursor-pointer risk-slider"
          style={{
            background: `linear-gradient(to right, #22c55e 0%, #eab308 33%, #f59e0b 66%, #ef4444 100%)`,
          }}
        />
        <div className="flex justify-between text-[10px] text-slate-600 mt-2 px-1">
          <span>Low</span><span>Medium</span><span>High</span><span>Critical</span>
        </div>
      </div>

      <div className="flex items-center gap-3 p-3 rounded-lg border border-[#262626] bg-[#0f0f0f]">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${iconClass} ${label.pulse ? 'animate-pulse' : ''}`}>
          {label.colour === 'green' ? (
            <Shield className="w-5 h-5" />
          ) : (
            <AlertTriangle className="w-5 h-5" />
          )}
        </div>
        <div>
          <div className={`text-xs font-semibold ${textClass}`}>{label.text}</div>
          <div className={`text-[10px] ${subClass}`}>{label.sub}</div>
        </div>
      </div>

      <style>{`
        .risk-slider::-webkit-slider-thumb {
          appearance: none; width: 20px; height: 20px; border-radius: 50%;
          background: white; cursor: pointer; border: 3px solid #0a0a0a;
          box-shadow: 0 0 0 1px #404040, 0 4px 12px rgba(0,0,0,.5);
        }
        .risk-slider::-moz-range-thumb {
          width: 20px; height: 20px; border-radius: 50%;
          background: white; cursor: pointer; border: 3px solid #0a0a0a;
          box-shadow: 0 0 0 1px #404040, 0 4px 12px rgba(0,0,0,.5);
        }
        .risk-slider::-webkit-slider-thumb:hover {
          box-shadow: 0 0 0 1px #404040, 0 6px 16px rgba(0,0,0,.6), 0 0 20px rgba(59,130,246,.3);
        }
      `}</style>
    </div>
  );
});