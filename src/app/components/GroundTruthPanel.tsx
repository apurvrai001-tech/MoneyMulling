import React, { memo, useMemo } from 'react';
import { GroundTruthMetrics } from '../lib/types';
import { Target, TrendingUp, AlertTriangle, CheckCircle, XCircle, BarChart3, Crosshair } from 'lucide-react';

interface GroundTruthPanelProps {
  groundTruth: GroundTruthMetrics;
}

export const GroundTruthPanel = memo(function GroundTruthPanel({ groundTruth }: GroundTruthPanelProps) {
  const {
    totalFraudTx, totalLegitTx,
    truePositives, falsePositives, trueNegatives, falseNegatives,
    precision, recall, f1Score, accuracy,
    fraudByType, avgScoreFraudNodes, avgScoreLegitNodes,
  } = groundTruth;

  // Sorted fraud-by-type entries for the breakdown table
  const typeBreakdown = useMemo(() => {
    return Object.entries(fraudByType)
      .sort(([, a], [, b]) => b.fraud - a.fraud)
      .map(([type, stats]) => ({
        type,
        total: stats.total,
        fraud: stats.fraud,
        rate: stats.total > 0 ? (stats.fraud / stats.total * 100) : 0,
      }));
  }, [fraudByType]);

  const totalNodes = truePositives + falsePositives + trueNegatives + falseNegatives;

  // Score separation quality
  const scoreSeparation = avgScoreFraudNodes - avgScoreLegitNodes;

  return (
    <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-xl shadow-sm p-6 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-emerald-400" />
          <h3 className="text-lg font-semibold text-slate-200">Ground Truth Validation</h3>
        </div>
        <div className="px-2.5 py-1 bg-emerald-950/30 border border-emerald-900/40 rounded text-xs text-emerald-400 font-semibold">
          PaySim Labels
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <MetricCard
          label="Precision"
          value={`${(precision * 100).toFixed(1)}%`}
          sublabel="Flagged & actually fraud"
          color="text-blue-400"
          bgColor="bg-blue-950/20"
          borderColor="border-blue-900/30"
        />
        <MetricCard
          label="Recall"
          value={`${(recall * 100).toFixed(1)}%`}
          sublabel="Fraud actually caught"
          color="text-amber-400"
          bgColor="bg-amber-950/20"
          borderColor="border-amber-900/30"
        />
        <MetricCard
          label="F1 Score"
          value={`${(f1Score * 100).toFixed(1)}%`}
          sublabel="Harmonic mean P/R"
          color="text-emerald-400"
          bgColor="bg-emerald-950/20"
          borderColor="border-emerald-900/30"
        />
        <MetricCard
          label="Accuracy"
          value={`${(accuracy * 100).toFixed(1)}%`}
          sublabel={`${totalNodes.toLocaleString()} total nodes`}
          color="text-purple-400"
          bgColor="bg-purple-950/20"
          borderColor="border-purple-900/30"
        />
      </div>

      {/* Confusion Matrix */}
      <div className="mb-5">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Confusion Matrix (Node-Level)</h4>
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 rounded-lg bg-emerald-950/15 border border-emerald-900/30">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] font-semibold text-emerald-400 uppercase">True Positive</span>
            </div>
            <div className="text-xl font-bold text-emerald-300 font-mono">{truePositives.toLocaleString()}</div>
            <div className="text-[10px] text-slate-500">Correctly flagged as fraud</div>
          </div>
          <div className="p-3 rounded-lg bg-red-950/15 border border-red-900/30">
            <div className="flex items-center gap-1.5 mb-1">
              <XCircle className="w-3.5 h-3.5 text-red-400" />
              <span className="text-[10px] font-semibold text-red-400 uppercase">False Positive</span>
            </div>
            <div className="text-xl font-bold text-red-300 font-mono">{falsePositives.toLocaleString()}</div>
            <div className="text-[10px] text-slate-500">Wrongly flagged as fraud</div>
          </div>
          <div className="p-3 rounded-lg bg-orange-950/15 border border-orange-900/30">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-[10px] font-semibold text-orange-400 uppercase">False Negative</span>
            </div>
            <div className="text-xl font-bold text-orange-300 font-mono">{falseNegatives.toLocaleString()}</div>
            <div className="text-[10px] text-slate-500">Missed fraud</div>
          </div>
          <div className="p-3 rounded-lg bg-slate-950/30 border border-slate-800/40">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[10px] font-semibold text-slate-400 uppercase">True Negative</span>
            </div>
            <div className="text-xl font-bold text-slate-300 font-mono">{trueNegatives.toLocaleString()}</div>
            <div className="text-[10px] text-slate-500">Correctly cleared</div>
          </div>
        </div>
      </div>

      {/* Score Separation */}
      <div className="mb-5 p-3 rounded-lg bg-[#0f0f0f] border border-[#1f1f1f]">
        <div className="flex items-center gap-2 mb-2">
          <Crosshair className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-semibold text-slate-400 uppercase">Score Separation Quality</span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-[10px] text-slate-500 mb-0.5">Avg Score (Fraud)</div>
            <div className="text-lg font-bold text-red-400 font-mono">{avgScoreFraudNodes}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 mb-0.5">Avg Score (Legit)</div>
            <div className="text-lg font-bold text-green-400 font-mono">{avgScoreLegitNodes}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 mb-0.5">Separation</div>
            <div className={`text-lg font-bold font-mono ${scoreSeparation > 15 ? 'text-emerald-400' : scoreSeparation > 5 ? 'text-amber-400' : 'text-red-400'}`}>
              +{scoreSeparation.toFixed(1)}
            </div>
          </div>
        </div>
        <div className="mt-2 h-2 bg-[#1a1a1a] rounded-full overflow-hidden relative">
          {/* Legit score bar */}
          <div
            className="absolute h-full bg-green-600/60 rounded-full"
            style={{ left: 0, width: `${Math.min(100, avgScoreLegitNodes)}%` }}
          />
          {/* Fraud score bar */}
          <div
            className="absolute h-full bg-red-500/80 rounded-full"
            style={{ left: 0, width: `${Math.min(100, avgScoreFraudNodes)}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-slate-600">0</span>
          <span className="text-[9px] text-slate-600">100</span>
        </div>
      </div>

      {/* Dataset Summary */}
      <div className="mb-5 p-3 rounded-lg bg-[#0f0f0f] border border-[#1f1f1f]">
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-semibold text-slate-400 uppercase">Transaction-Level Summary</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] text-slate-500">Fraud Transactions</div>
            <div className="text-base font-bold text-red-400 font-mono">{totalFraudTx.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500">Legitimate Transactions</div>
            <div className="text-base font-bold text-green-400 font-mono">{totalLegitTx.toLocaleString()}</div>
          </div>
        </div>
        <div className="mt-2 h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden flex">
          <div
            className="h-full bg-red-500/80 rounded-l-full"
            style={{ width: `${(totalFraudTx + totalLegitTx) > 0 ? (totalFraudTx / (totalFraudTx + totalLegitTx) * 100) : 0}%` }}
          />
          <div
            className="h-full bg-green-600/60 flex-1 rounded-r-full"
          />
        </div>
        <div className="text-[9px] text-slate-500 mt-1">
          Fraud rate: {((totalFraudTx + totalLegitTx) > 0 ? ((totalFraudTx / (totalFraudTx + totalLegitTx)) * 100).toFixed(3) : '0.000')}%
        </div>
      </div>

      {/* Fraud by Transaction Type */}
      {typeBreakdown.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold text-slate-400 uppercase">Fraud by Transaction Type</span>
          </div>
          <div className="space-y-2">
            {typeBreakdown.map(({ type, total, fraud, rate }) => (
              <div key={type} className="flex items-center gap-3">
                <div className="w-24 text-xs font-mono text-slate-400 truncate">{type}</div>
                <div className="flex-1">
                  <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${rate > 1 ? 'bg-red-500' : rate > 0 ? 'bg-amber-500' : 'bg-green-500/40'}`}
                      style={{ width: `${Math.max(rate > 0 ? 2 : 0, rate)}%` }}
                    />
                  </div>
                </div>
                <div className="flex gap-3 text-[10px]">
                  <span className="text-red-400 font-mono w-12 text-right">{fraud.toLocaleString()}</span>
                  <span className="text-slate-500">/</span>
                  <span className="text-slate-400 font-mono w-16 text-right">{total.toLocaleString()}</span>
                  <span className={`w-14 text-right font-semibold ${rate > 1 ? 'text-red-400' : rate > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                    {rate.toFixed(2)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

// Sub-component for metric cards
const MetricCard = memo(function MetricCard({
  label, value, sublabel, color, bgColor, borderColor,
}: {
  label: string; value: string; sublabel: string;
  color: string; bgColor: string; borderColor: string;
}) {
  return (
    <div className={`p-3 rounded-lg ${bgColor} border ${borderColor}`}>
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
      <div className="text-[10px] text-slate-500 mt-0.5">{sublabel}</div>
    </div>
  );
});