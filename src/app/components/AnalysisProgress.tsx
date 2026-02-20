/**
 * Analysis Progress Component
 * 
 * Displays real-time progress for chunked transaction processing
 */

import React from 'react';
import { Loader2, CheckCircle2, AlertCircle, Activity } from 'lucide-react';

export interface ProgressState {
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  percent: number;
  message: string;
  chunksProcessed?: number;
  totalChunks?: number;
}

interface AnalysisProgressProps {
  progress: ProgressState;
}

export function AnalysisProgress({ progress }: AnalysisProgressProps) {
  const { status, percent, message, chunksProcessed, totalChunks } = progress;

  const getStatusColor = () => {
    switch (status) {
      case 'uploading':
        return 'text-blue-400';
      case 'processing':
        return 'text-yellow-400';
      case 'completed':
        return 'text-green-400';
      case 'failed':
        return 'text-red-400';
      default:
        return 'text-slate-400';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'uploading':
        return <Loader2 className="w-6 h-6 animate-spin" />;
      case 'processing':
        return <Activity className="w-6 h-6 animate-pulse" />;
      case 'completed':
        return <CheckCircle2 className="w-6 h-6" />;
      case 'failed':
        return <AlertCircle className="w-6 h-6" />;
      default:
        return <Loader2 className="w-6 h-6 animate-spin" />;
    }
  };

  const getProgressBarColor = () => {
    switch (status) {
      case 'uploading':
        return 'bg-blue-500';
      case 'processing':
        return 'bg-yellow-500';
      case 'completed':
        return 'bg-green-500';
      case 'failed':
        return 'bg-red-500';
      default:
        return 'bg-slate-500';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-[50vh] max-w-xl mx-auto px-4">
      {/* Icon */}
      <div className={`mb-6 ${getStatusColor()}`}>
        {getStatusIcon()}
      </div>

      {/* Title */}
      <h2 className="text-2xl font-bold text-[#101828] dark:text-white mb-2 text-center">
        {status === 'uploading' && 'Uploading Transactions...'}
        {status === 'processing' && 'Analyzing Network Graph...'}
        {status === 'completed' && 'Analysis Complete!'}
        {status === 'failed' && 'Analysis Failed'}
      </h2>

      {/* Message */}
      <p className="text-[#4a5565] dark:text-[#a1a1a1] mb-6 text-center">
        {message}
      </p>

      {/* Progress Bar */}
      <div className="w-full bg-[#e5e7eb] dark:bg-[#262626] rounded-full h-3 overflow-hidden mb-4">
        <div
          className={`h-full transition-all duration-500 ${getProgressBarColor()}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Percentage */}
      <div className="flex items-center justify-between w-full mb-6">
        <span className="text-sm text-[#4a5565] dark:text-[#a1a1a1]">
          {percent.toFixed(0)}% complete
        </span>
        {chunksProcessed !== undefined && totalChunks !== undefined && (
          <span className="text-sm text-[#4a5565] dark:text-[#a1a1a1]">
            Chunk {chunksProcessed} / {totalChunks}
          </span>
        )}
      </div>

      {/* Status Details */}
      {status === 'processing' && (
        <div className="bg-[#f8fafc] dark:bg-[#171717] rounded-lg p-4 border border-[#e5e7eb] dark:border-[#262626] w-full">
          <div className="space-y-2 text-sm text-[#4a5565] dark:text-[#a1a1a1]">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span>Building graph nodes and edges…</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
              <span>Detecting cycles and fraud patterns…</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span>Calculating risk scores and forming rings…</span>
            </div>
            <div className="flex items-center gap-2 mt-1 pt-2 border-t border-[#e5e7eb] dark:border-[#262626]">
              <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
              <span className="text-xs text-[#6b7280] dark:text-[#6b7280]">Large datasets may take 30–90 s — the page is still working</span>
            </div>
          </div>
        </div>
      )}

      {/* Error Details */}
      {status === 'failed' && (
        <div className="bg-red-50 dark:bg-red-900/10 rounded-lg p-4 border border-red-200 dark:border-red-800 w-full">
          <p className="text-sm text-red-600 dark:text-red-400">
            The analysis could not be completed. This may be due to:
          </p>
          <ul className="mt-2 text-sm text-red-600 dark:text-red-400 list-disc list-inside space-y-1">
            <li>Dataset too large — try uploading a smaller CSV (under 300 k rows)</li>
            <li>Invalid transaction data format</li>
            <li>Browser memory limit exceeded</li>
          </ul>
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">
            Please try again with a smaller dataset, or use the <strong>Load Demo Dataset</strong> option.
          </p>
        </div>
      )}
    </div>
  );
}