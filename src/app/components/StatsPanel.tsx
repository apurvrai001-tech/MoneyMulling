import React, { memo, useMemo } from 'react';
import { GraphAnalysisResult } from '../lib/types';
import { Activity, Users, AlertTriangle, Gauge, Target } from 'lucide-react';

interface StatsPanelProps {
  data: GraphAnalysisResult | null;
}

export const StatsPanel = memo(function StatsPanel({ data }: StatsPanelProps) {
  const stats = useMemo(() => {
    if (!data) return null;
    const totalSuspicious = data.suspicious_nodes.length;
    const totalRings = data.rings.length;
    const avgRisk = totalRings > 0
      ? data.rings.reduce((sum, r) => sum + r.risk_score, 0) / totalRings
      : 0;
    return { totalSuspicious, totalRings, avgRisk };
  }, [data]);

  if (!stats) return null;

  const hasGroundTruth = data?.ground_truth?.available;

  return (
    <div className={`grid grid-cols-1 ${hasGroundTruth ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-4 mb-6`}>
      <StatCard
        icon={<Activity className="w-6 h-6" />}
        iconBg="bg-blue-900/20"
        iconColor="text-blue-400"
        label="Total Transactions"
        value={data!.metadata.total_transactions.toLocaleString()}
      />
      <StatCard
        icon={<AlertTriangle className="w-6 h-6" />}
        iconBg="bg-red-900/20"
        iconColor="text-red-400"
        label="Suspicious Entities"
        value={stats.totalSuspicious.toLocaleString()}
      />
      <StatCard
        icon={<Users className="w-6 h-6" />}
        iconBg="bg-amber-900/20"
        iconColor="text-amber-400"
        label="Fraud Rings Detected"
        value={stats.totalRings.toLocaleString()}
      />
      <StatCard
        icon={<Gauge className="w-6 h-6" />}
        iconBg="bg-purple-900/20"
        iconColor="text-purple-400"
        label="Avg Ring Risk"
        value={`${stats.avgRisk.toFixed(1)}/100`}
      />
      {hasGroundTruth && (
        <StatCard
          icon={<Target className="w-6 h-6" />}
          iconBg="bg-emerald-900/20"
          iconColor="text-emerald-400"
          label="Detection F1"
          value={`${(data!.ground_truth!.f1Score * 100).toFixed(1)}%`}
        />
      )}
    </div>
  );
});

// Sub-component memoised to prevent individual card re-renders
const StatCard = memo(function StatCard({
  icon, iconBg, iconColor, label, value,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-[#0d1117] p-4 rounded-xl shadow-sm border border-[#21262d] flex items-center gap-4">
      <div className={`p-3 ${iconBg} rounded-lg ${iconColor}`}>{icon}</div>
      <div>
        <p className="text-sm text-slate-400 font-medium">{label}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
      </div>
    </div>
  );
});