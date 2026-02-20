import React, { memo, useState, useCallback } from 'react';
import { FileCheck, Flag, Download, Check, Loader2 } from 'lucide-react';

interface EvidenceActionsProps {
  selectedNodeId: string | null;
  onMarkInvestigated: () => void;
  onFlagCompliance: () => void;
  onExportEvidence: () => void;
}

export const EvidenceActions = memo(function EvidenceActions({
  selectedNodeId,
  onMarkInvestigated,
  onFlagCompliance,
  onExportEvidence,
}: EvidenceActionsProps) {
  const [investigatedIds, setInvestigatedIds] = useState<Set<string>>(new Set());
  const [flaggedIds,      setFlaggedIds]      = useState<Set<string>>(new Set());
  const [exporting,       setExporting]       = useState(false);

  const handleMarkInvestigated = useCallback(() => {
    if (!selectedNodeId) return;
    setInvestigatedIds(prev => new Set(prev).add(selectedNodeId));
    onMarkInvestigated();
  }, [selectedNodeId, onMarkInvestigated]);

  const handleFlagCompliance = useCallback(() => {
    if (!selectedNodeId) return;
    setFlaggedIds(prev => new Set(prev).add(selectedNodeId));
    onFlagCompliance();
  }, [selectedNodeId, onFlagCompliance]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setTimeout(() => { onExportEvidence(); setExporting(false); }, 1_200);
  }, [onExportEvidence]);

  const isInvestigated = selectedNodeId ? investigatedIds.has(selectedNodeId) : false;
  const isFlagged      = selectedNodeId ? flaggedIds.has(selectedNodeId)      : false;

  return (
    <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-xl p-5">
      <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-4">Case Actions</h3>

      <div className="space-y-3">
        {/* Mark investigated */}
        <button
          onClick={handleMarkInvestigated}
          disabled={!selectedNodeId || isInvestigated}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border font-medium ${
            isInvestigated
              ? 'bg-green-950/20 border-green-900/40 text-green-400 cursor-default'
              : selectedNodeId
              ? 'bg-[#0f0f0f] border-[#262626] text-slate-300 hover:border-blue-700/50 hover:bg-blue-950/20'
              : 'bg-[#0f0f0f] border-[#262626] text-slate-600 cursor-not-allowed'
          }`}
        >
          {isInvestigated ? <Check className="w-4 h-4" /> : <FileCheck className="w-4 h-4" />}
          <span className="text-sm">{isInvestigated ? 'Marked as Investigated' : 'Mark as Investigated'}</span>
        </button>

        {/* Flag compliance */}
        <button
          onClick={handleFlagCompliance}
          disabled={!selectedNodeId || isFlagged}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border font-medium ${
            isFlagged
              ? 'bg-orange-950/20 border-orange-900/40 text-orange-400 cursor-default'
              : selectedNodeId
              ? 'bg-[#0f0f0f] border-[#262626] text-slate-300 hover:border-orange-700/50 hover:bg-orange-950/20'
              : 'bg-[#0f0f0f] border-[#262626] text-slate-600 cursor-not-allowed'
          }`}
        >
          {isFlagged ? <Check className="w-4 h-4" /> : <Flag className="w-4 h-4" />}
          <span className="text-sm">{isFlagged ? 'Flagged for Compliance' : 'Flag for Compliance'}</span>
        </button>

        {/* Export */}
        <div className="pt-2 border-t border-[#1f1f1f]">
          <button
            onClick={handleExport}
            disabled={!selectedNodeId || exporting}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border font-medium ${
              selectedNodeId && !exporting
                ? 'bg-gradient-to-r from-blue-950/30 to-purple-950/30 border-blue-700/50 text-blue-300 hover:from-blue-950/40 hover:to-purple-950/40'
                : 'bg-[#0f0f0f] border-[#262626] text-slate-600 cursor-not-allowed'
            }`}
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="text-sm">{exporting ? 'Preparing Evidence Bundle…' : 'Export Evidence Bundle'}</span>
          </button>

          {selectedNodeId && (
            <div className="mt-3 p-3 bg-[#0f0f0f] rounded-lg border border-[#262626]">
              <div className="text-[10px] text-slate-500 mb-2 uppercase font-semibold tracking-wider">Bundle Contains:</div>
              <ul className="space-y-1 text-xs text-slate-400">
                {[
                  ['bg-blue-500',   'Transaction history (CSV)'],
                  ['bg-purple-500', 'Network graph snapshot (PNG)'],
                  ['bg-green-500',  'Risk analysis report (JSON)'],
                  ['bg-orange-500', 'Audit trail documentation'],
                ].map(([dot, text]) => (
                  <li key={text} className="flex items-center gap-2">
                    <div className={`w-1 h-1 rounded-full ${dot}`} />
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
