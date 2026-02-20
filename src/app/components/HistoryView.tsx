import React, { useEffect, useState } from 'react';
import { Calendar, FileText, ChevronRight, Trash2, AlertTriangle, Activity } from 'lucide-react';
import { GraphAnalysisResult } from '../lib/types';
import { getUserHistory, deleteHistoryEntry, rehydrateAnalysisResult, AnalysisHistoryEntry } from '../lib/local-history';
import { CurrentUser } from '../lib/local-auth';

interface HistoryViewProps {
  onSelectHistory: (data: GraphAnalysisResult, filename: string) => void;
  user: CurrentUser | null;
}

export function HistoryView({ onSelectHistory, user }: HistoryViewProps) {
  const [history, setHistory] = useState<AnalysisHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = () => {
    if (!user) {
      setHistory([]);
      setLoading(false);
      return;
    }

    try {
      const userHistory = getUserHistory(user.id);
      setHistory(userHistory);
    } catch (err) {
      console.error('Failed to load history', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [user]);

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this analysis?')) return;

    if (!user) return;

    try {
      deleteHistoryEntry(user.id, id);
      setHistory(prev => prev.filter(h => h.id !== id));
    } catch (err) {
      console.error('Failed to delete entry', err);
      alert('Failed to delete entry');
    }
  };

  const handleSelect = (entry: AnalysisHistoryEntry) => {
    try {
      const rehydratedResult = rehydrateAnalysisResult(entry);
      onSelectHistory(rehydratedResult, entry.filename);
    } catch (err) {
      console.error('Failed to load analysis', err);
      alert('Failed to load analysis data');
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500 dark:text-neutral-400">
        <AlertTriangle className="w-12 h-12 mb-4 opacity-20" />
        <p className="text-lg font-semibold mb-2">Sign in required</p>
        <p className="text-sm">Please sign in to view your analysis history.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500">
        <Activity className="w-8 h-8 animate-pulse mb-2" />
        <p>Loading history...</p>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500 dark:text-neutral-400">
        <FileText className="w-12 h-12 mb-4 opacity-20" />
        <p className="text-lg font-semibold mb-2">No analyses yet</p>
        <p className="text-sm">Upload a CSV file to perform your first analysis.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {history.map((item) => (
        <div 
          key={item.id}
          onClick={() => handleSelect(item)}
          className="group relative bg-white dark:bg-[#171717] p-5 rounded-xl border border-slate-200 dark:border-[#262626] hover:border-blue-500 dark:hover:border-blue-500 transition-all cursor-pointer shadow-sm hover:shadow-md"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-2 text-slate-500 dark:text-neutral-400 text-xs">
              <Calendar className="w-3 h-3" />
              {new Date(item.timestamp).toLocaleDateString()} at {new Date(item.timestamp).toLocaleTimeString()}
            </div>
            <button 
              onClick={(e) => handleDelete(e, item.id)}
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors opacity-0 group-hover:opacity-100"
              title="Delete Analysis"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div className="mb-4">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-1 truncate" title={item.filename}>
              {item.filename}
            </h3>
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-neutral-400">
              <span className="font-mono bg-slate-100 dark:bg-black px-1.5 py-0.5 rounded text-xs">
                {item.stats.totalTransactions.toLocaleString()} txns
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-[#262626]">
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 dark:text-neutral-500 uppercase font-bold tracking-wider">Volume</span>
                <span className="text-sm font-medium text-slate-900 dark:text-white">
                  ${item.stats.totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0, notation: 'compact' })}
                </span>
              </div>
              <div className="w-px h-8 bg-slate-100 dark:bg-[#262626]"></div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 dark:text-neutral-500 uppercase font-bold tracking-wider">Risks</span>
                <span className={`text-sm font-medium ${item.stats.suspiciousNodes > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                  {item.stats.suspiciousNodes}
                </span>
              </div>
              <div className="w-px h-8 bg-slate-100 dark:bg-[#262626]"></div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 dark:text-neutral-500 uppercase font-bold tracking-wider">Rings</span>
                <span className={`text-sm font-medium ${item.stats.fraudRings > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-slate-600 dark:text-slate-400'}`}>
                  {item.stats.fraudRings}
                </span>
              </div>
            </div>
            
            <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-[#262626] flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
