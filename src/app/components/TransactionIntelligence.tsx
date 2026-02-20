import React from 'react';
import { X, TrendingUp, TrendingDown, Users, Clock, AlertTriangle, Shield, Tag } from 'lucide-react';
import { NodeData, GraphAnalysisResult } from '../lib/types';
import { getRiskInfo } from '../lib/risk-utils';
import { classifyAccountRole, getRoleBadgeColor } from '../lib/role-classifier';

interface TransactionIntelligenceProps {
  selectedNodeId: string | null;
  data: GraphAnalysisResult;
  onClose: () => void;
}

export function TransactionIntelligence({ selectedNodeId, data, onClose }: TransactionIntelligenceProps) {
  if (!selectedNodeId) return null;

  const node = data.nodes.get(selectedNodeId);
  const susp = data.suspicious_nodes.find(n => n.id === selectedNodeId);
  const rings = data.rings.filter(r => r.nodes.includes(selectedNodeId)); // Get ALL rings this node belongs to

  if (!node) return null;

  // Calculate risk info from score - SINGLE SOURCE OF TRUTH
  const riskInfo = susp ? getRiskInfo(susp.score.total) : null;
  
  // Get role classification from patterns (INFERRED, not account ID)
  const roleClassification = susp ? classifyAccountRole(susp.score.details?.patterns || []) : null;
  const roleBadgeColor = roleClassification ? getRoleBadgeColor(roleClassification.primary) : null;

  const totalInbound  = node.transactions_in.reduce((s, t) => s + t.amount, 0);
  const totalOutbound = node.transactions_out.reduce((s, t) => s + t.amount, 0);
  const totalVolume   = totalInbound + totalOutbound;
  // Whether these totals represent a capped sample (50 tx per node for large datasets)
  const inSampleCapped  = node.in_degree  > node.transactions_in.length;
  const outSampleCapped = node.out_degree > node.transactions_out.length;
  const isSampled = inSampleCapped || outSampleCapped;

  return (
    <div className="fixed right-0 top-[65px] bottom-0 w-[400px] bg-[#0a0a0a] border-l border-[#1f1f1f] z-50 flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="p-6 border-b border-[#1f1f1f] bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a]">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-1">Entity Intelligence</h3>
            {/* CRITICAL: This is the IMMUTABLE account identifier */}
            <div className="font-mono text-xs text-slate-500 bg-black/40 px-2 py-1 rounded border border-[#262626] inline-block">
              {selectedNodeId}
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-[#1f1f1f] rounded transition-colors text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Role Classification Badge (INFERRED, separate from ID) */}
        {roleClassification && roleClassification.primary !== 'unknown' && roleBadgeColor && (
          <div className={`mb-3 p-2.5 rounded-lg border ${roleBadgeColor.bg} ${roleBadgeColor.border}`}>
            <div className="flex items-center gap-2 mb-1">
              <Tag className={`w-3.5 h-3.5 ${roleBadgeColor.text}`} />
              <span className={`text-xs font-semibold ${roleBadgeColor.text}`}>
                Detected Role: {roleClassification.label}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 ml-5">
              {roleClassification.description}
            </div>
            <div className="text-[9px] text-slate-600 ml-5 mt-1">
              ⚠️ Inferred classification · Confidence: {roleClassification.confidence}
            </div>
          </div>
        )}

        {/* Risk Score Badge */}
        {susp && riskInfo && (
          <div className={`flex items-center gap-3 p-3 rounded-lg ${
            riskInfo.level === 'high' 
              ? 'bg-red-950/20 border border-red-900/30' 
              : riskInfo.level === 'medium'
              ? 'bg-orange-950/20 border border-orange-900/30'
              : 'bg-green-950/20 border border-green-900/30'
          }`}>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              riskInfo.level === 'high'
                ? 'bg-red-900/30'
                : riskInfo.level === 'medium'
                ? 'bg-orange-900/30'
                : 'bg-green-900/30'
            }`}>
              <span className={`text-lg font-bold ${
                riskInfo.level === 'high'
                  ? 'text-red-400'
                  : riskInfo.level === 'medium'
                  ? 'text-orange-400'
                  : 'text-green-400'
              }`}>{susp.score.total.toFixed(0)}</span>
            </div>
            <div>
              <div className={`text-xs font-semibold uppercase tracking-wider ${
                riskInfo.level === 'high'
                  ? 'text-red-400'
                  : riskInfo.level === 'medium'
                  ? 'text-orange-400'
                  : 'text-green-400'
              }`}>{riskInfo.label}</div>
              <div className={`text-[10px] ${
                riskInfo.level === 'high'
                  ? 'text-red-500/70'
                  : riskInfo.level === 'medium'
                  ? 'text-orange-500/70'
                  : 'text-green-500/70'
              }`}>
                {riskInfo.level === 'high' ? 'Flagged for Investigation' : 
                 riskInfo.level === 'medium' ? 'Requires Review' : 
                 'Monitored'}
              </div>
            </div>
          </div>
        )}

        {!susp && (
          <div className="flex items-center gap-3 p-3 bg-green-950/10 border border-green-900/20 rounded-lg">
            <div className="w-10 h-10 rounded-full bg-green-900/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <div className="text-xs text-green-400 font-semibold">Low Risk</div>
              <div className="text-[10px] text-green-500/50">Normal Activity</div>
            </div>
          </div>
        )}
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {/* Volume Metrics */}
        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Transaction Volume</h4>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-[#0f0f0f] rounded-lg border border-[#1f1f1f]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-green-900/20 flex items-center justify-center">
                  <TrendingDown className="w-4 h-4 text-green-500" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Inbound</div>
                  <div className="text-sm font-semibold text-white">${totalInbound.toLocaleString()}</div>
                </div>
              </div>
              <div className="text-xs text-slate-500">{node.transactions_in.length} tx</div>
            </div>

            <div className="flex items-center justify-between p-3 bg-[#0f0f0f] rounded-lg border border-[#1f1f1f]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-900/20 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Outbound</div>
                  <div className="text-sm font-semibold text-white">${totalOutbound.toLocaleString()}</div>
                </div>
              </div>
              <div className="text-xs text-slate-500">{node.transactions_out.length} tx</div>
            </div>

            <div className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-950/10 to-blue-950/10 rounded-lg border border-purple-900/20">
              <div>
                <div className="text-[10px] text-purple-400 uppercase font-semibold">Total Volume</div>
                <div className="text-lg font-bold text-white">${totalVolume.toLocaleString()}</div>
              </div>
              <div className="text-xs text-slate-500">{node.transactions_in.length + node.transactions_out.length} total</div>
            </div>
          </div>
        </div>

        {/* Behavioral Metrics */}
        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Behavioral Analysis</h4>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 bg-[#0f0f0f] rounded-lg border border-[#1f1f1f]">
              <div className="text-[10px] text-slate-500 mb-1">Velocity</div>
              <div className="text-sm font-semibold text-white">{node.velocity.toFixed(2)} tx/hr</div>
            </div>
            <div className="p-3 bg-[#0f0f0f] rounded-lg border border-[#1f1f1f]">
              <div className="text-[10px] text-slate-500 mb-1">Active Days</div>
              <div className="text-sm font-semibold text-white">{node.active_days.toFixed(1)}</div>
            </div>
            <div className="p-3 bg-[#0f0f0f] rounded-lg border border-[#1f1f1f]">
              <div className="text-[10px] text-slate-500 mb-1">Counterparties</div>
              <div className="text-sm font-semibold text-white">{node.unique_counterparties}</div>
            </div>
            <div className="p-3 bg-[#0f0f0f] rounded-lg border border-[#1f1f1f]">
              <div className="text-[10px] text-slate-500 mb-1">Flow-Through</div>
              <div className="text-sm font-semibold text-white">{(node.flow_through * 100).toFixed(0)}%</div>
            </div>
          </div>
        </div>

        {/* Ring Membership */}
        {rings.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Network Association {rings.length > 1 && <span className="text-orange-400">({rings.length} rings)</span>}
            </h4>
            <div className="space-y-2">
              {rings.map((ring, idx) => (
                <div key={ring.id} className="p-4 bg-orange-950/10 border border-orange-900/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-orange-400" />
                    <span className="text-xs font-semibold text-orange-400">{ring.id}</span>
                  </div>
                  <div className="text-[10px] text-orange-500/70 mb-2">
                    {ring.patterns.map(p => p.replace(/_/g, ' ')).join(', ')}
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <div>
                      <span className="text-slate-500">Size: </span>
                      <span className="text-white font-medium">{ring.nodes.length} entities</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Risk: </span>
                      <span className="text-orange-400 font-medium">{ring.risk_score.toFixed(0)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transaction Timeline Preview */}
        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Transaction Timeline</h4>
          <div className="space-y-1 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
            {[...node.transactions_in.slice(-5).reverse(), ...node.transactions_out.slice(-5).reverse()]
              .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
              .slice(0, 10)
              .map((tx, idx) => {
                const isInbound = node.transactions_in.includes(tx);
                return (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-[#0f0f0f] rounded border border-[#1f1f1f] text-xs">
                    <div className={`w-1.5 h-1.5 rounded-full ${isInbound ? 'bg-green-500' : 'bg-blue-500'}`}></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-semibold ${isInbound ? 'text-green-400' : 'text-blue-400'}`}>
                          {isInbound ? 'IN' : 'OUT'}
                        </span>
                        <span className="text-slate-400 truncate flex-1 font-mono text-[10px]">
                          {isInbound ? tx.sender.slice(0, 12) : tx.receiver.slice(0, 12)}...
                        </span>
                      </div>
                    </div>
                    <div className="text-white font-semibold text-xs">${tx.amount.toLocaleString()}</div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Risk Factors */}
        {susp && susp.score.details?.patterns && susp.score.details.patterns.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Detected Patterns</h4>
            <div className="space-y-2">
              {susp.score.details.patterns.map((pattern, idx) => (
                <div key={idx} className="flex items-start gap-2 p-2 bg-red-950/10 border border-red-900/20 rounded text-xs">
                  <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                  <span className="text-red-300">{pattern}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #0a0a0a;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #262626;
          border-radius: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #404040;
        }
      `}</style>
    </div>
  );
}