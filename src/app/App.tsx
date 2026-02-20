/**
 * MULESHIELD - FINANCIAL FORENSICS ENGINE
 * 
 * SEMANTIC CORRECTNESS GUARANTEES:
 * 
 * 1. RISK SCORES ARE NUMERIC (0-100):
 *    - All risk values are numeric scores
 *    - Risk levels (Low/Medium/High) are DERIVED labels
 *    - Single source of truth: forensics-semantics.ts
 * 
 * 2. RINGS ARE FIRST-CLASS IMMUTABLE OBJECTS:
 *    - Created ONCE during detection as explicit Ring objects
 *    - NEVER re-derived, filtered, created, or destroyed by UI logic
 *    - All ring metrics, lists, isolation, and exports read from rings[] exclusively
 *    - Ring isolation = rings[selectedRing].members (no heuristics)
 *    - Pattern filters NEVER modify the rings array
 * 
 * 3. RING RISK USES PATTERN-SPECIFIC FORMULAS:
 *    - Each pattern type (cycle, fan-in, fan-out, shell) has its own formula
 *    - Combines member scores + pattern bonuses + logarithmic scaling
 *    - Computed ONCE during detection using each ring's member set
 *    - NEVER recomputed on selection/filtering
 * 
 * 4. ACCOUNT IDENTITY vs INFERENCE:
 *    - Account IDs are immutable identifiers
 *    - Roles (mule, hub, etc.) are inferred classifications
 *    - Always displayed separately
 * 
 * 5. PATTERN TOGGLES ARE REAL VISIBILITY FILTERS:
 *    - Filter nodes/edges based on precomputed pattern flags
 *    - Do NOT trigger recomputation or alter scores
 *    - Use AND logic when multiple patterns selected
 *    - Synchronize across graph and alerts
 *    - NEVER create or destroy rings
 * 
 * 6. THRESHOLD SLIDER FILTERS ENTITIES:
 *    - Does NOT modify scores
 *    - Same count across thresholds is valid behavior
 * 
 * 7. LARGE-DATA SAFETY:
 *    - Chunked ingestion (2K tx/chunk)
 *    - Limited rendering (1.5K nodes max)
 *    - Per-node transaction cap (50 tx for display)
 * 
 * 8. CONSISTENCY ENFORCEMENT:
 *    - Single source of truth for all risk data
 *    - No duplicated logic
 *    - Validated by forensics-semantics.ts
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { FileUpload } from './components/FileUpload';
import { GraphView } from './components/GraphView';
import { StatsPanel } from './components/StatsPanel';
import { RingList } from './components/RingList';
import { LoginModal } from './components/LoginModal';
import { HistoryView } from './components/HistoryView';
import { PricingView } from './components/PricingView';
import { SettingsView } from './components/SettingsView';
import { TransactionIntelligence } from './components/TransactionIntelligence';
import { AlertsPanel } from './components/AlertsPanel';
import { GraphControls } from './components/GraphControls';
import { RiskThresholdControl } from './components/RiskThresholdControl';
import { PatternFilters } from './components/PatternFilters';
import { EvidenceActions } from './components/EvidenceActions';
import { FraudRingSelector } from './components/FraudRingSelector';
import { AnalysisProgress, ProgressState } from './components/AnalysisProgress';
import { GraphAnalysisResult, Transaction } from './lib/types';
import { uploadAndAnalyze } from './lib/chunked-uploader';
import { getCurrentUser, logout, CurrentUser } from './lib/local-auth';
import { addHistoryEntry, migrateLegacyHistory } from './lib/local-history';
import { GroundTruthPanel } from './components/GroundTruthPanel';
import { UserSettings } from './components/SettingsView';
import {
  Download,
  Activity,
  ArrowLeft,
  Shield,
  Menu,
  X,
  LayoutDashboard,
  History,
  CreditCard,
  Settings,
  LogOut,
  Clock,
  Cpu,
  User as UserIcon,
  Filter,
  Scale
} from 'lucide-react';

// ── Footer legal modal state type ──
type LegalModal = 'privacy' | 'terms' | null;

function App() {
  const [status, setStatus] = useState<'IDLE' | 'PROCESSING' | 'ANALYZED'>('IDLE');
  const [view, setView] = useState<'DASHBOARD' | 'HISTORY' | 'PRICING' | 'SETTINGS'>('DASHBOARD');
  const [data, setData] = useState<GraphAnalysisResult | null>(null);
  const [executionTime, setExecutionTime] = useState<number>(0);
  const [selectedRingId, setSelectedRingId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [currentFilename, setCurrentFilename] = useState<string>('');
  const [legalModal, setLegalModal] = useState<LegalModal>(null);

  // Load saved settings from localStorage
  const loadSavedSettings = (): UserSettings | null => {
    try {
      const stored = localStorage.getItem('muleguard_settings');
      if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    return null;
  };

  const savedSettings = loadSavedSettings();

  // New investigation controls state — initialized from saved settings
  const [riskThreshold, setRiskThreshold] = useState(savedSettings?.defaultRiskThreshold ?? 50);
  const [timeWindow, setTimeWindow] = useState<'24h' | '7d' | '30d' | 'custom'>(savedSettings?.defaultTimeWindow ?? '7d');
  const [enabledPatterns, setEnabledPatterns] = useState(
    savedSettings?.patternVisibility ?? {
      circular: false,
      fanPattern: false,
      rapidPassThrough: false,
    }
  );
  const [showLabels, setShowLabels] = useState(true);
  const [showDirectionArrows, setShowDirectionArrows] = useState(true);
  const [highlightMoneyFlow, setHighlightMoneyFlow] = useState(false);
  const [isIntelligencePanelOpen, setIsIntelligencePanelOpen] = useState(false);

  // Chunked processing state
  const [progressState, setProgressState] = useState<ProgressState | null>(null);
  const [graphDisplayMode, setGraphDisplayMode] = useState<'top-risk' | 'selected-ring' | 'filtered' | 'all'>('top-risk');

  // No cyRef needed — GraphView manages its own Cytoscape instance internally

  // Theme state
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('theme');
      if (stored) return stored === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  // Auth State - Load from localStorage on mount
  useEffect(() => {
    const currentUser = getCurrentUser();
    setUser(currentUser);
    // Migrate any oversized legacy history keys left from the old storage format
    if (currentUser) {
      try { migrateLegacyHistory(currentUser.id); } catch { /* non-fatal */ }
    }
  }, []);

  const saveAnalysisToHistory = useCallback((result: GraphAnalysisResult, filename: string) => {
    if (!user) return;
    try {
      addHistoryEntry(user.id, filename, result);
    } catch (err) {
      // History save failure is non-fatal — analysis results are still shown
      console.warn('History save skipped (storage full or unavailable):', err);
    }
  }, [user]);

  const handleDataLoaded = useCallback(async (transactions: Transaction[], filename?: string) => {
    setStatus('PROCESSING');
    setView('DASHBOARD');
    setCurrentFilename(filename || 'unknown-file.csv');

    // Initialize progress tracking
    setProgressState({
      status: 'uploading',
      percent: 0,
      message: 'Preparing to upload...'
    });

    setTimeout(async () => {
      try {
        const startTime = performance.now();

        // Use chunked uploader with progress tracking
        const result = await uploadAndAnalyze(transactions, (progress) => {
          setProgressState(progress);
        });

        const endTime = performance.now();
        const time = endTime - startTime;

        setExecutionTime(time);
        setData(result);
        setStatus('ANALYZED');

        // Auto-save if logged in — use the local filename parameter (not stale state)
        if (user && filename) {
          saveAnalysisToHistory(result, filename);
        }
      } catch (error: any) {
        console.error("Processing failed", error);
        setProgressState({
          status: 'failed',
          percent: 0,
          message: error.message || "Processing failed. Please try again."
        });

        // Allow user to retry
        setTimeout(() => {
          setStatus('IDLE');
          setProgressState(null);
        }, 5000);
      }
    }, 100);
  }, [user]);

  const handleHistorySelect = useCallback((historyData: GraphAnalysisResult, filename: string) => {
    setData(historyData);
    setCurrentFilename(filename);
    setExecutionTime(0);
    setStatus('ANALYZED');
    setView('DASHBOARD');
    setIsSidebarOpen(false);
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    setUser(null);
    setView('DASHBOARD');
    setData(null);
    setStatus('IDLE');
    setCurrentFilename('');
    setIsSidebarOpen(false);
  }, []);

  const handleDownloadJSON = useCallback(() => {
    if (!data) return;
    const output = {
      metadata: {
        timestamp: new Date().toISOString(),
        execution_time_ms: executionTime,
        total_transactions: data.metadata.total_transactions,
        total_volume: data.metadata.total_volume,
        algorithm_version: '1.0.0',
      },
      suspicious_entities: data.suspicious_nodes.sort((a, b) => b.score.total - a.score.total).map(n => ({
        account_id: n.id,
        suspicion_score: parseFloat(n.score.total.toFixed(2)),
        score_breakdown: { structural: n.score.structural, behavioral: n.score.behavioral, network: n.score.network },
        risk_factors: n.score.details?.risk_factors || [],
        patterns: n.score.details?.patterns || [],
      })),
      fraud_rings: data.rings.map(r => ({
        ring_id: r.id,
        risk_score: parseFloat(r.risk_score.toFixed(2)),
        member_count: r.nodes.length,
        members: r.nodes,
        patterns: r.patterns,
      })),
    };
    const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(currentFilename || 'analysis').replace(/\.[^/.]+$/, '')}-results-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [data, executionTime, currentFilename]);

  const handleNodeSelect = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
    setIsIntelligencePanelOpen(!!nodeId);
    if (nodeId && data) {
      const ring = data.rings.find(r => r.nodes.includes(nodeId));
      setSelectedRingId(ring ? ring.id : null);
    }
  }, [data]);

  const handlePatternToggle = useCallback((pattern: 'circular' | 'fanPattern' | 'rapidPassThrough') => {
    setEnabledPatterns(prev => ({ ...prev, [pattern]: !prev[pattern] }));
  }, []);

  // GraphView manages its own zoom internally; these are no-ops kept for API compat
  const handleZoomIn = useCallback(() => { }, []);
  const handleZoomOut = useCallback(() => { }, []);
  const handleResetView = useCallback(() => { }, []);

  const handleToggleLabels = useCallback(() => setShowLabels(v => !v), []);
  const handleToggleDirectionArrows = useCallback(() => setShowDirectionArrows(v => !v), []);
  const handleToggleMoneyFlow = useCallback(() => setHighlightMoneyFlow(v => !v), []);

  // Stable callback for AlertsPanel node clicks
  const handleAlertNodeClick = useCallback((nodeId: string) => {
    handleNodeSelect(nodeId);
    setIsIntelligencePanelOpen(true);
  }, [handleNodeSelect]);

  const handleMarkInvestigated = useCallback(() => {
    console.log('Marked as investigated:', selectedNodeId);
  }, [selectedNodeId]);

  const handleFlagCompliance = useCallback(() => {
    console.log('Flagged for compliance:', selectedNodeId);
  }, [selectedNodeId]);

  const handleExportEvidence = useCallback(() => {
    if (!data || !selectedNodeId) return;
    const node = data.nodes.get(selectedNodeId);
    const susp = data.suspicious_nodes.find(n => n.id === selectedNodeId);
    const evidenceBundle = {
      metadata: { timestamp: new Date().toISOString(), entity_id: selectedNodeId, analyst: user?.email || 'Unknown', case_id: `CASE_${Date.now()}` },
      entity_profile: node ? {
        id: node.id,
        total_inbound: node.transactions_in.reduce((s, t) => s + t.amount, 0),
        total_outbound: node.transactions_out.reduce((s, t) => s + t.amount, 0),
        velocity: node.velocity,
        active_days: node.active_days,
      } : null,
      risk_assessment: susp ? {
        total_score: susp.score.total, structural: susp.score.structural,
        behavioral: susp.score.behavioral, network: susp.score.network,
        patterns: susp.score.details?.patterns || [], risk_factors: susp.score.details?.risk_factors || [],
      } : null,
      transactions: node ? [...node.transactions_in, ...node.transactions_out] : [],
    };
    const blob = new Blob([JSON.stringify(evidenceBundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evidence-bundle-${selectedNodeId}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [data, selectedNodeId, user]);

  // ────────────────────────────────────────────────────────────────────────────
  // PATTERN FILTERING LOGIC (Source of Truth)
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Applies pattern filters to suspicious nodes ONLY.
   * Returns only nodes matching ALL enabled patterns (AND logic).
   * If no patterns enabled, returns all nodes.
   * 
   * INVARIANT: rings[] is NEVER filtered, created, or destroyed here.
   * Rings are first-class immutable objects created once during detection.
   * Pattern filters affect nodes, edges, and alert visibility — never rings.
   */
  const filteredData = useMemo(() => {
    if (!data) return null;

    // Filter suspicious nodes based on pattern membership AND riskThreshold
    const filteredSuspiciousNodes = data.suspicious_nodes.filter(suspNode => {
      const node = data.nodes.get(suspNode.id);
      if (!node) return false;

      // Filter by riskThreshold
      if (suspNode.score.total < riskThreshold) {
        return false;
      }

      // Filter by patterns if any are enabled
      const hasActivePatterns = enabledPatterns.circular || enabledPatterns.fanPattern || enabledPatterns.rapidPassThrough;
      if (hasActivePatterns) {
        const patterns = suspNode.score.details?.patterns || [];

        let matches = true;

        if (enabledPatterns.circular) {
          matches = matches && patterns.includes('cycle');
        }

        if (enabledPatterns.fanPattern) {
          matches = matches && (patterns.includes('fan_in') || patterns.includes('fan_out'));
        }

        if (enabledPatterns.rapidPassThrough) {
          matches = matches && patterns.includes('shell');
        }

        if (!matches) return false;
      }

      return true;
    });

    // Create set of visible node IDs
    const visibleNodeIds = new Set(filteredSuspiciousNodes.map(n => n.id));

    // ❌ REMOVED: Ring filtering — rings are immutable first-class objects
    // Rings are NEVER created or destroyed by pattern filters.
    // data.rings is the single source of truth, passed through unchanged.

    // Filter edges: only edges where both source and target are visible
    const filteredEdges = data.edges.filter(edge =>
      visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
    );

    // Return filtered data — rings are ALWAYS the original immutable array
    return {
      ...data,
      suspicious_nodes: filteredSuspiciousNodes,
      rings: data.rings, // IMMUTABLE: always the detection-phase rings
      edges: filteredEdges,
    };
  }, [data, enabledPatterns, riskThreshold]);

  // O(N) filter — memoised so it only re-runs when filtered data actually changes
  const flaggedCount = useMemo(
    () => filteredData ? filteredData.suspicious_nodes.length : 0,
    [filteredData],
  );

  // Rings are immutable first-class objects — they are NEVER invalidated by pattern filters.
  // The selectedRingId is only cleared when the user explicitly deselects or when data changes.
  // ❌ REMOVED: useEffect that cleared ring selection when pattern filters changed.
  // Since rings are never filtered, this effect is unnecessary and was violating immutability.

  const handleRingSelect = useCallback((ringId: string) => {
    setSelectedRingId(ringId);
  }, []);

  return (
    <div className="min-h-screen bg-[#09090b] font-sans text-white transition-colors duration-300 flex flex-col relative overflow-hidden">

      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={(u) => setUser(u)}
      />

      {/* Transaction Intelligence Panel */}
      {isIntelligencePanelOpen && data && selectedNodeId && (
        <TransactionIntelligence
          selectedNodeId={selectedNodeId}
          data={data}
          onClose={() => {
            setIsIntelligencePanelOpen(false);
            setSelectedNodeId(null);
          }}
        />
      )}

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 transition-opacity backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Drawer */}
      <div className={`fixed inset-y-0 left-0 z-[60] w-[280px] bg-[#111] border-r border-[#262626] transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} flex flex-col`}>
        <div className="h-[65px] flex items-center justify-between px-6 border-b border-[#262626]">
          <span className="font-semibold text-lg text-white">Menu</span>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="p-2 hover:bg-[#262626] rounded-lg transition-colors text-[#a1a1a1]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Profile Section */}
        {user && (
          <div className="px-4 py-3 border-b border-[#262626]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-900 text-blue-200 flex items-center justify-center text-sm font-semibold">
                {user.email?.[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white truncate">{user.name}</div>
                <div className="text-xs text-slate-400 truncate">{user.email}</div>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
          <button
            onClick={() => { setView('DASHBOARD'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${view === 'DASHBOARD' ? 'bg-[#1e40af]/20 text-[#60a5fa]' : 'text-[#a1a1a1] hover:bg-[#171717]'}`}
          >
            <LayoutDashboard className="w-5 h-5" />
            Dashboard
          </button>
          <button
            onClick={() => {
              if (!user) {
                setIsLoginModalOpen(true);
              } else {
                setView('HISTORY');
                setIsSidebarOpen(false);
              }
            }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${view === 'HISTORY' ? 'bg-[#1e40af]/20 text-[#60a5fa]' : 'text-[#a1a1a1] hover:bg-[#171717]'}`}
          >
            <History className="w-5 h-5" />
            History
          </button>
          <button
            onClick={() => { setView('PRICING'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${view === 'PRICING' ? 'bg-[#1e40af]/20 text-[#60a5fa]' : 'text-[#a1a1a1] hover:bg-[#171717]'}`}
          >
            <CreditCard className="w-5 h-5" />
            Pricing
          </button>
          <button
            onClick={() => { setView('SETTINGS'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${view === 'SETTINGS' ? 'bg-[#1e40af]/20 text-[#60a5fa]' : 'text-[#a1a1a1] hover:bg-[#171717]'}`}
          >
            <Settings className="w-5 h-5" />
            Settings
          </button>
        </div>

        <div className="p-4 border-t border-[#262626]">
          {user ? (
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-900/10 rounded-lg font-medium transition-colors"
            >
              <LogOut className="w-5 h-5" />
              Log out
            </button>
          ) : (
            <button
              onClick={() => { setIsLoginModalOpen(true); setIsSidebarOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-blue-400 hover:bg-blue-900/10 rounded-lg font-medium transition-colors"
            >
              <UserIcon className="w-5 h-5" />
              Log In
            </button>
          )}
        </div>
      </div>

      {/* Header */}
      <header className="bg-[#0a0a0a] border-b border-[#1f1f1f] sticky top-0 z-40 h-[65px] transition-colors duration-300">
        <div className="max-w-[1400px] mx-auto h-full px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 -ml-2 rounded-lg hover:bg-[#171717] text-[#a1a1a1] transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="w-[40px] h-[40px] bg-[#1e40af] rounded-[10px] flex items-center justify-center text-white shrink-0">
              <Shield className="w-6 h-6" />
            </div>
            <span className="font-semibold text-[20px] tracking-[-0.45px] text-white">MuleGuard</span>
          </div>

          <div className="flex items-center gap-4">

            {status === 'ANALYZED' && view === 'DASHBOARD' ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setStatus('IDLE'); setData(null); }}
                  className="hidden md:flex items-center gap-2 px-4 py-2 text-[#d4d4d4] border border-[#262626] rounded-[10px] hover:bg-[#171717] text-[16px] transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>New Scan</span>
                </button>
                <button
                  onClick={handleDownloadJSON}
                  className="flex items-center gap-2 px-4 py-2 bg-[#6b7fd7] text-white rounded-[10px] hover:bg-[#5a6ec0] text-[16px] font-medium transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden md:inline">Export</span>
                </button>
              </div>
            ) : (
              !user && (
                <button
                  onClick={() => setIsLoginModalOpen(true)}
                  className="hidden md:block px-4 py-2 border border-[#262626] rounded-[10px] text-[#d4d4d4] hover:bg-[#171717] transition-colors"
                >
                  Log in
                </button>
              )
            )}

            {user && (
              <div className="flex items-center gap-2">
                <span className="hidden md:inline text-sm text-slate-300">{user.name}</span>
                <div className="w-8 h-8 rounded-full bg-blue-900 text-blue-200 flex items-center justify-center text-sm font-semibold" title={user.email}>
                  {user.email?.[0].toUpperCase()}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1400px] mx-auto px-6 py-10 flex-1 w-full">

        {view === 'PRICING' ? (
          <PricingView />
        ) : view === 'SETTINGS' ? (
          <SettingsView
            onSettingsChange={(settings) => {
              // Apply saved settings to live state when user changes them
              setRiskThreshold(settings.defaultRiskThreshold);
              setTimeWindow(settings.defaultTimeWindow);
              setEnabledPatterns(settings.patternVisibility);
            }}
            user={user}
          />
        ) : view === 'HISTORY' ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-white mb-2">Scan History</h1>
              <p className="text-slate-400">View and manage your past transaction analyses.</p>
            </div>
            <HistoryView user={user} onSelectHistory={handleHistorySelect} />
          </div>
        ) : (
          <>
            {status === 'IDLE' && (
              <div className="max-w-[896px] mx-auto pt-16 pb-8 flex flex-col gap-10">
                {/* Hero text */}
                <div className="text-center space-y-4">
                  <h1 className="text-[48px] font-bold text-white leading-[1.15] tracking-[-0.8px]">
                    Detect Money Laundering
                  </h1>
                  <p className="text-[18px] text-slate-400 leading-[1.5] max-w-xl mx-auto">
                    Upload your transaction logs. Our graph algorithms detect smurfing, circular routing, and mule rings in seconds.
                  </p>
                </div>

                {/* Upload Card — dark themed with subtle blue glow */}
                <div className="bg-[#0d1117] rounded-2xl p-6 border border-[#21262d] shadow-[0_0_40px_rgba(59,130,246,0.06)]">
                  <FileUpload onDataLoaded={handleDataLoaded} />
                </div>

                {/* Feature Pills — dark with colored left accents */}
                <div className="flex flex-wrap justify-center gap-3">
                  <div className="bg-[#161b22] px-4 py-2.5 rounded-full text-slate-300 text-sm font-medium border border-[#21262d] flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    Identify Smurfing Patterns
                  </div>
                  <div className="bg-[#161b22] px-4 py-2.5 rounded-full text-slate-300 text-sm font-medium border border-[#21262d] flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    Detect Circular Routing
                  </div>
                  <div className="bg-[#161b22] px-4 py-2.5 rounded-full text-slate-300 text-sm font-medium border border-[#21262d] flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Analyze Risk Scores
                  </div>
                  <div className="bg-[#161b22] px-4 py-2.5 rounded-full text-slate-300 text-sm font-medium border border-[#21262d] flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    PaySim-Calibrated Detection
                  </div>
                </div>
              </div>
            )}

            {status === 'PROCESSING' && progressState && (
              <AnalysisProgress progress={progressState} />
            )}

            {status === 'ANALYZED' && data && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                {/* ── Compact Stats Strip ── */}
                <div className="mb-4">
                  {/* CRITICAL: StatsPanel MUST receive full data, NOT filteredData */}
                  <StatsPanel data={data} />
                </div>

                {/* ── Controls Row: Risk Threshold + Pattern Filters side by side ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                  <RiskThresholdControl
                    threshold={riskThreshold}
                    onThresholdChange={setRiskThreshold}
                    flaggedCount={flaggedCount}
                  />
                  <PatternFilters
                    timeWindow={timeWindow}
                    onTimeWindowChange={setTimeWindow}
                    enabledPatterns={enabledPatterns}
                    onPatternToggle={handlePatternToggle}
                    matchingCount={filteredData ? filteredData.suspicious_nodes.length : data.suspicious_nodes.length}
                    totalCount={data.suspicious_nodes.length}
                  />
                </div>

                {/* Small inline warning when no matches */}
                {filteredData && filteredData.suspicious_nodes.length === 0 && (enabledPatterns.circular || enabledPatterns.fanPattern || enabledPatterns.rapidPassThrough) && (
                  <div className="mb-4 bg-amber-950/30 border border-amber-800/40 rounded-lg px-4 py-2.5 flex items-center gap-3">
                    <Filter className="w-4 h-4 text-amber-400 shrink-0" />
                    <p className="text-sm text-amber-300">
                      No entities match the current filter combination.
                      <span className="text-amber-400/60 ml-1">Try disabling some pattern filters.</span>
                    </p>
                  </div>
                )}

                {/* Warning: Detection found no suspicious entities */}
                {data.suspicious_nodes.length === 0 && data.metadata.total_transactions > 0 && (
                  <div className="mb-4 bg-blue-950/30 border border-blue-800/30 rounded-lg px-4 py-2.5 flex items-center gap-3">
                    <Activity className="w-4 h-4 text-blue-400 shrink-0" />
                    <p className="text-sm text-blue-300">
                      Clean dataset — {data.metadata.total_transactions.toLocaleString()} transactions analyzed, no suspicious patterns found.
                    </p>
                  </div>
                )}

                {/* ══════════ MAIN 3-COLUMN DASHBOARD ══════════ */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  {/* ─ Left Column: Ring Selector + Actions (2 cols) ─ */}
                  <div className="lg:col-span-2 space-y-4">
                    <FraudRingSelector
                      rings={data.rings}
                      selectedRingId={selectedRingId}
                      onSelectRing={setSelectedRingId}
                    />
                    <EvidenceActions
                      selectedNodeId={selectedNodeId}
                      onMarkInvestigated={handleMarkInvestigated}
                      onFlagCompliance={handleFlagCompliance}
                      onExportEvidence={handleExportEvidence}
                    />
                  </div>

                  {/* ─ Center Column: Graph + Alerts (7 cols) ─ */}
                  <div className="lg:col-span-7 space-y-4">
                    <div className="bg-[#0d1117] border border-[#21262d] rounded-xl shadow-lg p-5">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-base font-semibold text-slate-100">Network Visualization</h3>
                        <div className="flex items-center gap-2 text-xs text-slate-400 bg-[#161b22] px-3 py-1 rounded-full border border-[#30363d]">
                          <Activity className="w-3.5 h-3.5" />
                          {data.nodes.size} Nodes • {data.edges.length} Edges
                        </div>
                      </div>
                      <div className="rounded-lg overflow-hidden border border-[#21262d] bg-[#010409] relative">
                        <GraphControls
                          onZoomIn={handleZoomIn}
                          onZoomOut={handleZoomOut}
                          onResetView={handleResetView}
                          showLabels={showLabels}
                          onToggleLabels={handleToggleLabels}
                          showDirectionArrows={showDirectionArrows}
                          onToggleDirectionArrows={handleToggleDirectionArrows}
                          highlightMoneyFlow={highlightMoneyFlow}
                          onToggleMoneyFlow={handleToggleMoneyFlow}
                        />
                        <GraphView
                          data={filteredData || data}
                          onNodeSelect={handleNodeSelect}
                          selectedRingId={selectedRingId}
                          isDarkMode={true}
                          riskThreshold={riskThreshold}
                          showLabels={showLabels}
                          showDirectionArrows={showDirectionArrows}
                          highlightMoneyFlow={highlightMoneyFlow}
                          onZoomIn={handleZoomIn}
                          onZoomOut={handleZoomOut}
                          onResetView={handleResetView}
                          timeWindow={timeWindow}
                          allSuspiciousNodes={data.suspicious_nodes}
                        />
                      </div>
                    </div>

                    <AlertsPanel
                      data={filteredData || data}
                      onNodeClick={handleAlertNodeClick}
                      riskThreshold={riskThreshold}
                    />

                    {data.ground_truth && data.ground_truth.available && (
                      <GroundTruthPanel groundTruth={data.ground_truth} />
                    )}

                    {/* Analysis Performance — compact */}
                    <div className="bg-[#0d1117] rounded-xl border border-[#21262d] p-5">
                      <h3 className="text-base font-semibold text-slate-100 mb-3 flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-blue-400" />
                        Analysis Performance
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                          <div className="flex items-center gap-3 mb-3 p-2.5 bg-[#161b22] rounded-lg border border-[#21262d]">
                            <div className="p-1.5 bg-blue-900/30 rounded-full text-blue-400">
                              <Clock className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="text-xs text-slate-400">Processing Time</div>
                              <div className="font-mono text-lg font-bold text-white">{executionTime.toFixed(2)} ms</div>
                            </div>
                          </div>
                          <h4 className="font-medium text-slate-300 mb-1.5 text-xs uppercase tracking-wider">Algorithms</h4>
                          <ul className="space-y-1 text-xs text-slate-400">
                            <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-green-500" /><span><strong className="text-slate-300">Cycle:</strong> Tarjan&apos;s DFS</span></li>
                            <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-green-500" /><span><strong className="text-slate-300">Smurfing:</strong> Burst Analysis</span></li>
                            <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-green-500" /><span><strong className="text-slate-300">Shell:</strong> Flow-Through Ratio</span></li>
                            {data.ground_truth?.available && (<>
                              <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-cyan-500" /><span><strong className="text-slate-300">Balance:</strong> PaySim anomaly</span></li>
                              <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-cyan-500" /><span><strong className="text-slate-300">Draining:</strong> Zero-balance flag</span></li>
                            </>)}
                          </ul>
                        </div>
                        <div className="border-t md:border-t-0 md:border-l border-[#21262d] pt-3 md:pt-0 md:pl-5">
                          <h4 className="font-medium text-slate-300 mb-2.5 text-xs uppercase tracking-wider">Risk Scoring</h4>
                          <div className="space-y-3">
                            <div>
                              <div className="flex justify-between text-[11px] mb-1"><span className="text-slate-400">Structural (50)</span><span className="text-slate-500">Topology</span></div>
                              <div className="h-1.5 w-full bg-[#21262d] rounded-full overflow-hidden"><div className="h-full bg-blue-500 w-[50%] rounded-full" /></div>
                            </div>
                            <div>
                              <div className="flex justify-between text-[11px] mb-1"><span className="text-slate-400">Behavioral (30)</span><span className="text-slate-500">Velocity</span></div>
                              <div className="h-1.5 w-full bg-[#21262d] rounded-full overflow-hidden"><div className="h-full bg-purple-500 w-[30%] rounded-full" /></div>
                            </div>
                            <div>
                              <div className="flex justify-between text-[11px] mb-1"><span className="text-slate-400">Network (20)</span><span className="text-slate-500">Rings</span></div>
                              <div className="h-1.5 w-full bg-[#21262d] rounded-full overflow-hidden"><div className="h-full bg-orange-500 w-[20%] rounded-full" /></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ─ Right Column: Detected Fraud Rings (3 cols) ─ */}
                  <div className="lg:col-span-3">
                    <div className="lg:sticky lg:top-[85px]">
                      {/* IMMUTABLE: RingList always receives data.rings */}
                      <RingList
                        rings={data.rings}
                        selectedRingId={selectedRingId}
                        onSelectRing={handleRingSelect}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer - Figma Style */}
      <footer className="bg-[#0d1117] border-t border-[#21262d] py-6 mt-8">
        <div className="max-w-[1400px] mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#1e40af] rounded-[8px] flex items-center justify-center text-white">
              <Shield className="w-4 h-4" />
            </div>
            <span className="font-semibold text-white">MuleGuard</span>
          </div>

          <div className="flex items-center gap-8 text-sm text-slate-400">
            <button onClick={() => setLegalModal('privacy')} className="hover:text-blue-400 transition-colors">Privacy Policy</button>
            <button onClick={() => setLegalModal('terms')} className="hover:text-blue-400 transition-colors">Terms of Service</button>
            <button onClick={() => { setView('SETTINGS'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="hover:text-blue-400 transition-colors">Settings</button>
          </div>

          <div className="text-sm text-slate-500">
            © 2026 MuleGuard. All rights reserved.
          </div>
        </div>
      </footer>

      {/* Legal Modal (Privacy Policy / Terms of Service) */}
      {legalModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setLegalModal(null)}>
          <div className="bg-white dark:bg-[#171717] rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] border border-slate-200 dark:border-[#262626] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-[#262626] shrink-0">
              <div className="flex items-center gap-3">
                {legalModal === 'privacy' ? <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" /> : <Scale className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                  {legalModal === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}
                </h2>
              </div>
              <button onClick={() => setLegalModal(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-[#262626] rounded-lg transition-colors text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 text-sm text-slate-600 dark:text-slate-300 space-y-4 leading-relaxed">
              {legalModal === 'privacy' ? (<>
                <p className="text-xs text-slate-400 dark:text-slate-500">Last updated: February 20, 2026</p>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">1. Data Collection & Processing</h3>
                <p>MuleGuard processes transaction data entirely within your browser. No transaction data is transmitted to external servers. All analysis, pattern detection, and risk scoring is performed client-side using our ChunkedGraphEngine.</p>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">2. Local Storage</h3>
                <p>We use browser localStorage to persist user accounts, scan history summaries, and application preferences. No cookies or tracking pixels are deployed. You may clear all stored data at any time via your browser settings.</p>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">3. Authentication</h3>
                <p>Authentication is handled locally via localStorage-backed accounts. Passwords are hashed client-side before storage. This is a demo-grade authentication system not intended for production use with real financial data.</p>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">4. Third-Party Services</h3>
                <p>MuleGuard does not share, sell, or transmit your data to any third-party service. The application operates fully offline after initial page load.</p>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">5. Data Retention</h3>
                <p>Scan history is retained in localStorage for the duration configured in Settings (default: 90 days). Uploaded files are processed in-memory and are not persisted beyond the active browser session.</p>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">6. Contact</h3>
                <p>For privacy inquiries, contact our team at privacy@muleguard.io.</p>
              </>) : (<>
                <p className="text-xs text-slate-400 dark:text-slate-500">Last updated: February 20, 2026</p>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">1. Acceptance of Terms</h3>
                <p>By using MuleGuard, you agree to these Terms of Service. MuleGuard is a fraud detection analysis tool provided for educational, research, and compliance-assistance purposes.</p>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">2. Intended Use</h3>
                <p>MuleGuard is designed to assist financial crime investigators and compliance analysts in identifying potential money laundering patterns. It is not a substitute for professional legal or regulatory advice.</p>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">3. No Warranty</h3>
                <p>MuleGuard is provided "as is" without warranty of any kind. Detection results are probabilistic and should be verified by qualified analysts before taking regulatory action.</p>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">4. Limitation of Liability</h3>
                <p>MuleGuard shall not be liable for any direct, indirect, incidental, or consequential damages arising from use of this tool, including false positives, missed fraud, or regulatory actions taken based on results.</p>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">5. Data Responsibility</h3>
                <p>Users are solely responsible for ensuring they have proper authorization to analyze any transaction data uploaded to MuleGuard.</p>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">6. Modifications</h3>
                <p>We reserve the right to modify these terms at any time. Continued use of MuleGuard constitutes acceptance of updated terms.</p>
              </>)}
            </div>
            <div className="p-4 border-t border-slate-100 dark:border-[#262626] shrink-0">
              <button onClick={() => setLegalModal(null)} className="w-full py-2.5 bg-[#1e40af] hover:bg-[#1e3a8a] text-white rounded-lg font-medium transition-colors">
                I Understand
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;