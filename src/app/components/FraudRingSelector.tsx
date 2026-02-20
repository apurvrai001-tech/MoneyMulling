import React, { memo, useMemo, useCallback } from 'react';
import { Users, ChevronDown } from 'lucide-react';
import { Ring } from '../lib/types';

interface FraudRingSelectorProps {
  rings: Ring[];
  selectedRingId: string | null;
  onSelectRing: (ringId: string | null) => void;
}

export const FraudRingSelector = memo(function FraudRingSelector({
  rings,
  selectedRingId,
  onSelectRing,
}: FraudRingSelectorProps) {
  // Memoised lookup — avoids O(N) find on every render
  const selectedRing = useMemo(
    () => rings.find(r => r.id === selectedRingId) ?? null,
    [rings, selectedRingId],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => onSelectRing(e.target.value || null),
    [onSelectRing],
  );

  return (
    <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-4 h-4 text-orange-400" />
        <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Fraud Ring Analysis</h3>
      </div>

      <div className="relative mb-4">
        <select
          value={selectedRingId || ''}
          onChange={handleChange}
          className="w-full appearance-none bg-[#0f0f0f] border border-[#262626] text-white px-4 py-3 pr-10 rounded-lg text-sm font-medium cursor-pointer hover:border-[#404040] focus:outline-none focus:border-orange-700/50"
        >
          <option value="">All Rings (Overview)</option>
          {rings.map(ring => (
            <option key={ring.id} value={ring.id}>
              {ring.id} — {ring.nodes.length} entities · Risk {ring.risk_score.toFixed(0)}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      </div>

      {selectedRing ? (
        <div className="space-y-3">
          <div className="p-4 bg-gradient-to-br from-orange-950/20 to-red-950/20 border border-orange-900/30 rounded-lg">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="text-xs text-orange-400 font-semibold uppercase tracking-wider mb-1">
                  {selectedRing.id}
                </div>
                <div className="text-[10px] text-orange-500/70">Isolated for Analysis</div>
              </div>
              <div className="px-2 py-1 bg-orange-900/40 border border-orange-800/50 rounded text-xs font-bold text-orange-300">
                ACTIVE
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-2 bg-black/30 rounded border border-orange-900/20">
                <div className="text-[10px] text-orange-400/70 mb-1">Ring Size</div>
                <div className="text-lg font-bold text-white">{selectedRing.nodes.length}</div>
              </div>
              <div className="p-2 bg-black/30 rounded border border-orange-900/20">
                <div className="text-[10px] text-orange-400/70 mb-1">Risk Score</div>
                <div className="text-lg font-bold text-orange-300">{selectedRing.risk_score.toFixed(0)}</div>
              </div>
            </div>
          </div>

          <div className="p-3 bg-[#0f0f0f] border border-[#262626] rounded-lg">
            <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider mb-2">
              {selectedRing.central_hub ? 'Central Hub Account' : 'Primary Account'}
            </div>
            <div className="font-mono text-xs text-white bg-black/40 px-2 py-1.5 rounded border border-[#1f1f1f] truncate">
              {selectedRing.central_hub || selectedRing.nodes[0]}
            </div>
          </div>

          {selectedRing.patterns.length > 0 && (
            <div className="p-3 bg-[#0f0f0f] border border-[#262626] rounded-lg">
              <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider mb-2">
                Detected Patterns
              </div>
              <div className="flex flex-wrap gap-1">
                {selectedRing.patterns.map((pattern, idx) => (
                  <span key={idx} className="px-2 py-1 bg-orange-950/20 border border-orange-900/30 rounded text-[10px] text-orange-400">
                    {pattern}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="p-3 bg-gradient-to-r from-red-950/10 to-orange-950/10 border border-red-900/20 rounded-lg">
            <div className="flex justify-between items-center">
              <div className="text-xs text-red-400 font-semibold">Average Suspicion Score</div>
              <div className="text-xl font-bold text-red-300">{selectedRing.average_suspicion.toFixed(1)}</div>
            </div>
            <div className="mt-2 h-1.5 bg-black/40 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full"
                style={{ width: `${selectedRing.average_suspicion}%` }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-6 text-slate-500">
          <Users className="w-10 h-10 mx-auto mb-2 opacity-20" />
          <p className="text-xs">Select a ring to isolate and analyse</p>
        </div>
      )}
    </div>
  );
});