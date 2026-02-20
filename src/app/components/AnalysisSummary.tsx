import React from 'react';
import { GraphAnalysisResult } from '../lib/types';
import { CheckCircle, AlertTriangle, ShieldAlert, ArrowRight } from 'lucide-react';

interface AnalysisSummaryProps {
  data: GraphAnalysisResult | null;
}

export function AnalysisSummary({ data }: AnalysisSummaryProps) {
  if (!data) return null;

  const totalSuspicious = data.suspicious_nodes.length;
  const totalRings = data.rings.length;
  const riskLevel = totalRings > 0 ? 'High' : totalSuspicious > 0 ? 'Medium' : 'Low';
  
  // Calculate total volume involved in rings
  const ringVolume = data.rings.reduce((sum, ring) => {
      // Very rough approximation: sum of all edges between ring members
      // A more accurate way would be to traverse the graph, but this is a summary
      return sum + (ring.risk_score * 1000); // Placeholder calculation logic for now as we don't have easy access to edge sums here without processing
  }, 0);

  // Determine the primary pattern
  const patterns = new Set<string>();
  data.rings.forEach(r => r.patterns.forEach(p => patterns.add(p)));
  const patternList = Array.from(patterns).map(p => p.replace(/_/g, ' '));

  return (
    <div className="bg-white dark:bg-[#171717] rounded-2xl shadow-sm border border-slate-200 dark:border-[#262626] p-6 mb-8 transition-colors">
      <div className="flex flex-col md:flex-row gap-8 items-start">
        
        {/* Main Status */}
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
             {riskLevel === 'High' ? (
                 <div className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-2 rounded-lg">
                     <ShieldAlert className="w-6 h-6" />
                 </div>
             ) : riskLevel === 'Medium' ? (
                 <div className="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 p-2 rounded-lg">
                     <AlertTriangle className="w-6 h-6" />
                 </div>
             ) : (
                 <div className="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 p-2 rounded-lg">
                     <CheckCircle className="w-6 h-6" />
                 </div>
             )}
             <div>
                 <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                     {riskLevel === 'High' ? "Money Laundering Detected" : 
                      riskLevel === 'Medium' ? "Suspicious Activity Found" : 
                      "No Threats Detected"}
                 </h2>
                 <p className="text-slate-500 dark:text-neutral-400 text-sm">
                     Analysis of {data.metadata.total_transactions.toLocaleString()} transactions completed
                 </p>
             </div>
          </div>
          
          <div className="mt-4 prose prose-sm dark:prose-invert text-slate-600 dark:text-neutral-300">
             <p>
                 {riskLevel === 'High' 
                    ? `We identified ${totalRings} organized fraud rings involving ${totalSuspicious} accounts. The primary behaviors detected are ${patternList.join(', ')}.`
                    : riskLevel === 'Medium'
                    ? `While no organized rings were found, we detected ${totalSuspicious} accounts with highly suspicious transaction velocities or structuring patterns.`
                    : "Traffic appears normal. No circular routing or smurfing patterns were identified in this dataset."
                 }
             </p>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="flex gap-4 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
            <div className="min-w-[140px] p-4 bg-slate-50 dark:bg-black/40 rounded-xl border border-slate-100 dark:border-[#262626]">
                <div className="text-slate-500 dark:text-neutral-500 text-xs font-semibold uppercase tracking-wider mb-1">Risk Score</div>
                <div className="text-3xl font-bold text-slate-900 dark:text-white">
                    {totalRings > 0 ? "92" : totalSuspicious > 0 ? "65" : "12"}
                    <span className="text-sm font-normal text-slate-400 ml-1">/100</span>
                </div>
            </div>
            
            <div className="min-w-[140px] p-4 bg-slate-50 dark:bg-black/40 rounded-xl border border-slate-100 dark:border-[#262626]">
                <div className="text-slate-500 dark:text-neutral-500 text-xs font-semibold uppercase tracking-wider mb-1">Rings Found</div>
                <div className="text-3xl font-bold text-slate-900 dark:text-white">
                    {totalRings}
                </div>
            </div>

            <div className="min-w-[140px] p-4 bg-slate-50 dark:bg-black/40 rounded-xl border border-slate-100 dark:border-[#262626]">
                <div className="text-slate-500 dark:text-neutral-500 text-xs font-semibold uppercase tracking-wider mb-1">Suspects</div>
                <div className="text-3xl font-bold text-slate-900 dark:text-white">
                    {totalSuspicious}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
