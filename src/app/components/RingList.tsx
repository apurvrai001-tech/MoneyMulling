import React, { memo } from 'react';
import { Ring } from '../lib/types';
import { ChevronRight, Hash, ShieldAlert } from 'lucide-react';
import { cn } from './ui/utils';

interface RingListProps {
  rings: Ring[];
  selectedRingId: string | null;
  onSelectRing: (id: string) => void;
}

// Cap visible rings to avoid DOM bloat for large datasets
const MAX_VISIBLE_RINGS = 100;

export const RingList = memo(function RingList({ rings, selectedRingId, onSelectRing }: RingListProps) {
  const visibleRings = rings.length > MAX_VISIBLE_RINGS ? rings.slice(0, MAX_VISIBLE_RINGS) : rings;

  return (
    <div className="bg-[#0d1117] rounded-xl shadow-sm border border-[#21262d] overflow-hidden flex flex-col max-h-[calc(100vh-120px)]">
      <div className="p-4 border-b border-[#21262d] shrink-0">
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-semibold text-slate-200 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-400" />
            Detected Fraud Rings
          </h3>
          <span className="text-xs font-medium px-2 py-1 bg-[#161b22] rounded-full text-slate-300">
            {rings.length}
          </span>
        </div>
        <p className="text-[10px] text-slate-500">
          Accounts may appear in multiple rings.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
        {visibleRings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8 text-center">
            <ShieldAlert className="w-12 h-12 mb-2 opacity-20" />
            <p className="text-sm">No fraud rings detected yet.</p>
          </div>
        ) : (
          <>
            {visibleRings.map(ring => (
              <RingRow
                key={ring.id}
                ring={ring}
                isSelected={selectedRingId === ring.id}
                onSelect={onSelectRing}
              />
            ))}
            {rings.length > MAX_VISIBLE_RINGS && (
              <p className="text-center text-xs text-slate-500 py-2">
                Showing top {MAX_VISIBLE_RINGS} of {rings.length} rings
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
});

// Each row is memoised — only re-renders if its own ring data or selection changes
const RingRow = memo(function RingRow({
  ring,
  isSelected,
  onSelect,
}: {
  ring: Ring;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      onClick={() => onSelect(ring.id)}
      className={cn(
        'p-3 rounded-lg cursor-pointer border text-left group transition-all duration-150',
        isSelected
          ? 'bg-blue-950/20 border-blue-800 shadow-sm shadow-blue-900/20'
          : 'bg-[#161b22] border-[#21262d] hover:border-[#30363d] hover:bg-[#1c2128]',
      )}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono font-bold text-slate-400 bg-[#1f1f1f] px-1.5 py-0.5 rounded">
            {ring.id}
          </span>
          <span className={cn(
            'text-xs font-bold px-2 py-0.5 rounded-full',
            ring.risk_score > 80 ? 'bg-red-900/30 text-red-400'
              : ring.risk_score > 50 ? 'bg-amber-900/30 text-amber-400'
                : 'bg-yellow-900/30 text-yellow-400',
          )}>
            Risk: {ring.risk_score.toFixed(0)}
          </span>
        </div>
        <ChevronRight className={cn(
          'w-4 h-4 text-slate-500 transition-transform duration-150 shrink-0',
          isSelected && 'rotate-90 text-blue-400',
        )} />
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Hash className="w-3 h-3" />
          <span>{ring.nodes.length} Accounts Involved</span>
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {ring.patterns.slice(0, 3).map((p, i) => (
            <span key={i} className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-[#1f1f1f] text-slate-400 rounded border border-[#262626]">
              {p.replace(/_/g, ' ')}
            </span>
          ))}
          {ring.patterns.length > 3 && (
            <span className="text-[10px] text-slate-500 px-1">+{ring.patterns.length - 3}</span>
          )}
        </div>
      </div>
    </div>
  );
});
