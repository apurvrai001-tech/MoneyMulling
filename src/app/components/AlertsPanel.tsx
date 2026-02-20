import React, { memo, useMemo } from 'react';
import { AlertTriangle, Info, ChevronRight } from 'lucide-react';
import { GraphAnalysisResult } from '../lib/types';

interface AlertItem {
  type: 'critical' | 'warning' | 'info';
  entity: string;
  message: string;
  explanation: string;
}

interface AlertsPanelProps {
  data: GraphAnalysisResult;
  onNodeClick?: (nodeId: string) => void;
  riskThreshold?: number;
}

export const AlertsPanel = memo(function AlertsPanel({ data, onNodeClick, riskThreshold = 0 }: AlertsPanelProps) {
  // Memoised — only recomputes when data or threshold changes
  const alerts = useMemo<AlertItem[]>(() => {
    const result: AlertItem[] = [];

    // Filter suspicious nodes by threshold before generating alerts
    const qualifyingNodes = data.suspicious_nodes
      .filter(n => n.score.total >= riskThreshold)
      .slice(0, 8);

    qualifyingNodes.forEach(node => {
      const patterns = node.score.details?.patterns || [];

      if (patterns.includes('cycle') || patterns.includes('circular_transfers')) {
        result.push({
          type: 'critical',
          entity: node.id,
          message: 'Circular transfer pattern detected',
          explanation: 'Entity participates in a money laundering cycle where funds loop back to origin',
        });
      }
      if (patterns.includes('fan_in') || patterns.includes('burst_activity')) {
        result.push({
          type: 'warning',
          entity: node.id,
          message: 'Abnormal fan-in / burst activity detected',
          explanation: 'Concentrated inflows from many unique sources in a short time window',
        });
      }
      if (patterns.includes('fan_out') || patterns.includes('star_pattern')) {
        result.push({
          type: 'warning',
          entity: node.id,
          message: 'Star-pattern fan-out detected',
          explanation: 'Central hub distributing to many endpoints — typical of money mule operations',
        });
      }
      if (patterns.includes('shell') || patterns.includes('shell_account')) {
        result.push({
          type: 'critical',
          entity: node.id,
          message: 'Shell account characteristics identified',
          explanation: 'High flow-through ratio suggests entity is being used as a pass-through vehicle',
        });
      }
      // PaySim-calibrated signals
      if (patterns.includes('balance_discrepancy')) {
        result.push({
          type: 'critical',
          entity: node.id,
          message: 'Balance anomaly detected',
          explanation: 'Transaction amounts do not match balance changes — indicates phantom money or data manipulation',
        });
      }
      if (patterns.includes('account_drain')) {
        result.push({
          type: 'warning',
          entity: node.id,
          message: 'Account draining pattern detected',
          explanation: 'Account balance reduced to zero after large transfers — common in fraud cashout schemes',
        });
      }
    });

    data.rings.forEach(ring => {
      if (ring.risk_score > 60) {
        result.push({
          type: 'critical',
          entity: ring.nodes[0],
          message: `Fraud ring detected: ${ring.nodes.length} connected entities`,
          explanation: `Network exhibits coordinated suspicious behaviour with avg risk ${ring.average_suspicion.toFixed(0)}`,
        });
      }
    });

    return result;
  }, [data, riskThreshold]);

  return (
    <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Active Alerts</h3>
        <div className="px-2 py-1 bg-red-950/20 border border-red-900/30 rounded text-xs text-red-400 font-semibold">
          {alerts.length} flagged
        </div>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar-dark">
        {alerts.length === 0 && (
          <div className="text-center py-8 text-slate-500">
            <Info className="w-8 h-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm">No active alerts</p>
          </div>
        )}
        {alerts.map((alert, idx) => (
          <AlertRow key={idx} alert={alert} onNodeClick={onNodeClick} />
        ))}
      </div>

      <style>{`
        .custom-scrollbar-dark::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar-dark::-webkit-scrollbar-track { background: #0a0a0a; }
        .custom-scrollbar-dark::-webkit-scrollbar-thumb { background: #262626; border-radius: 2px; }
        .custom-scrollbar-dark::-webkit-scrollbar-thumb:hover { background: #404040; }
      `}</style>
    </div>
  );
});

// Memoised individual row prevents list re-renders when parent state changes
const AlertRow = memo(function AlertRow({
  alert,
  onNodeClick,
}: {
  alert: AlertItem;
  onNodeClick?: (id: string) => void;
}) {
  const colours = {
    critical: {
      border: 'bg-red-950/10 border-red-900/30 hover:bg-red-950/20',
      icon: 'bg-red-900/30 text-red-400',
      title: 'text-red-300',
      body: 'text-red-400/70',
    },
    warning: {
      border: 'bg-orange-950/10 border-orange-900/30 hover:bg-orange-950/20',
      icon: 'bg-orange-900/30 text-orange-400',
      title: 'text-orange-300',
      body: 'text-orange-400/70',
    },
    info: {
      border: 'bg-blue-950/10 border-blue-900/30 hover:bg-blue-950/20',
      icon: 'bg-blue-900/30 text-blue-400',
      title: 'text-blue-300',
      body: 'text-blue-400/70',
    },
  }[alert.type];

  return (
    <div
      onClick={() => onNodeClick?.(alert.entity)}
      className={`p-3 rounded-lg border cursor-pointer group ${colours.border}`}
    >
      <div className="flex items-start gap-3">
        <div className={`p-1.5 rounded-full mt-0.5 ${colours.icon}`}>
          <AlertTriangle className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className={`text-xs font-semibold ${colours.title}`}>{alert.message}</div>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 shrink-0" />
          </div>
          <div className="font-mono text-[10px] text-slate-500 mb-2 truncate">{alert.entity}</div>
          <div className={`text-[10px] leading-relaxed ${colours.body}`}>
            <span className="font-semibold">Why flagged: </span>{alert.explanation}
          </div>
        </div>
      </div>
    </div>
  );
});