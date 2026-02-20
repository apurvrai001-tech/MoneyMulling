import { useEffect, useRef, useState, useMemo, memo } from 'react';
import cytoscape from 'cytoscape';
import { GraphAnalysisResult } from '../lib/types';
import { getRiskLevel, getRiskColor } from '../lib/risk-utils';
import { ZoomIn, ZoomOut, Maximize, RefreshCw, AlertTriangle, Clock, AlertCircle } from 'lucide-react';
import { cn } from './ui/utils';

// ── Rendering limits ──────────────────────────────────────────────────────────
// Cytoscape.js handles ~1 000–2 000 nodes smoothly in a browser sandbox.
// We always include the full suspicious set first, then pad with low-risk nodes.
const MAX_RENDER_NODES = 1_500;
const MAX_RENDER_EDGES = 8_000;

interface GraphViewProps {
  data: GraphAnalysisResult | null;
  onNodeSelect: (nodeId: string | null) => void;
  selectedRingId: string | null;
  isDarkMode: boolean;
  riskThreshold?: number;
  showLabels?: boolean;
  showDirectionArrows?: boolean;
  highlightMoneyFlow?: boolean;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetView?: () => void;
  timeWindow?: '24h' | '7d' | '30d' | 'custom'; // NEW: time window filter
  /** Unfiltered suspicious nodes — always the full detection set so tooltip/colors are accurate regardless of pattern filters */
  allSuspiciousNodes?: { id: string; score: { total: number; structural: number; behavioral: number; network: number; details: { patterns: string[]; risk_factors: string[] } } }[];
}

export const GraphView = memo(function GraphView({
  data,
  onNodeSelect,
  selectedRingId,
  isDarkMode,
  riskThreshold = 0,
  showLabels = true,
  showDirectionArrows = true,
  highlightMoneyFlow = false,
  onZoomIn: externalZoomIn,
  onZoomOut: externalZoomOut,
  onResetView: externalResetView,
  timeWindow = '7d', // NEW: default to 7 days
  allSuspiciousNodes,
}: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [loading, setLoading] = useState(false);
  const [tooltip, setTooltip] = useState<{
    visible: boolean; x: number; y: number;
    nodeId: string; score: number; riskLevel: string;
    patterns: string[]; ringId?: string;
  } | null>(null);

  // Calculate time window cutoff
  const timeWindowCutoff = useMemo(() => {
    if (!data) return 0;

    // Find the latest timestamp in the dataset
    const allTimestamps = data.edges.map(e => e.timestamp);
    if (allTimestamps.length === 0) return 0;

    const latestTimestamp = Math.max(...allTimestamps);

    // Calculate cutoff based on time window
    let hoursBack = 0;
    switch (timeWindow) {
      case '24h':
        hoursBack = 24;
        break;
      case '7d':
        hoursBack = 24 * 7;
        break;
      case '30d':
        hoursBack = 24 * 30;
        break;
      case 'custom':
        hoursBack = 24 * 7; // default to 7d for custom
        break;
    }

    return latestTimestamp - (hoursBack * 60 * 60 * 1000);
  }, [data, timeWindow]);

  // Derive the capped node/edge sets before building the Cytoscape instance
  const { displayNodeIds, displayEdges, isTruncated, hiddenCount, visibleTxCount, totalTxCount, isRingIsolated } = useMemo(() => {
    if (!data) return {
      displayNodeIds: new Set<string>(),
      displayEdges: [],
      isTruncated: false,
      hiddenCount: 0,
      visibleTxCount: 0,
      totalTxCount: 0,
      isRingIsolated: false,
    };

    // ── RING ISOLATION (Rule §4): When a ring is selected, show ONLY its members ──
    // Ring isolation = rings[selectedRing].members — no heuristics, no DFS, no recomputation.
    if (selectedRingId) {
      const ring = data.rings.find(r => r.id === selectedRingId);
      if (ring && ring.nodes.length > 0) {
        const ringMemberSet = new Set(ring.nodes);

        // ── FAIL-FAST (Rule §6): Ring isolation MUST reduce visible nodes ──
        if (data.rings.length > 0 && ringMemberSet.size >= data.nodes.size && data.nodes.size > ring.nodes.length) {
          console.error(
            `🚨 RING ISOLATION FAILED: Ring ${selectedRingId} has ${ringMemberSet.size} members ` +
            `but graph has ${data.nodes.size} nodes. Ring isolation did not reduce visible nodes. ` +
            `Rings may not be materialized correctly.`
          );
        }

        // Edges between ring members only, within time window
        const totalTxCount = data.metadata.total_transactions;
        const timeFilteredEdges = data.edges.filter(e => e.timestamp >= timeWindowCutoff);
        const ringEdges = timeFilteredEdges.filter(
          e => ringMemberSet.has(e.source) && ringMemberSet.has(e.target)
        ).slice(0, MAX_RENDER_EDGES);

        return {
          displayNodeIds: ringMemberSet,
          displayEdges: ringEdges,
          isTruncated: false,
          hiddenCount: 0,
          visibleTxCount: ringEdges.length,
          totalTxCount,
          isRingIsolated: true,
        };
      }
    }

    // ── DEFAULT: No ring selected — show top-risk nodes ──
    // Build a suspicion-score map for sorting
    const scoreMap = new Map((allSuspiciousNodes || data.suspicious_nodes).map(n => [n.id, n.score.total]));

    // Sort all node IDs: highest-risk first
    const sorted = Array.from(data.nodes.keys()).sort(
      (a, b) => (scoreMap.get(b) || 0) - (scoreMap.get(a) || 0)
    );

    // Apply risk threshold filter: only include nodes >= threshold
    const aboveThreshold = sorted.filter(id => (scoreMap.get(id) || 0) >= riskThreshold);
    // Include some below threshold points to give graph context
    const belowThreshold = sorted.filter(id => (scoreMap.get(id) || 0) < riskThreshold);
    const combined = [...aboveThreshold, ...belowThreshold];

    const displayNodeIds = new Set(combined.slice(0, MAX_RENDER_NODES));
    const totalNodes = combined.length;
    const isTruncated = totalNodes > MAX_RENDER_NODES;
    const hiddenCount = Math.max(0, totalNodes - MAX_RENDER_NODES);

    // Filter edges by time window AND node inclusion
    // NOTE: data.edges is capped at 10K for rendering, but detection ran on ALL transactions
    const totalTxCount = data.metadata.total_transactions; // Use actual total, not capped edges
    const timeFilteredEdges = data.edges.filter(e => e.timestamp >= timeWindowCutoff);
    const visibleTxCount = timeFilteredEdges.length;

    // Only edges where BOTH endpoints are in the display set AND within time window
    const displayEdges = timeFilteredEdges.filter(
      e => displayNodeIds.has(e.source) && displayNodeIds.has(e.target)
    ).slice(0, MAX_RENDER_EDGES);

    return { displayNodeIds, displayEdges, isTruncated, hiddenCount, visibleTxCount, totalTxCount, isRingIsolated: false };
  }, [data, timeWindowCutoff, selectedRingId, riskThreshold, allSuspiciousNodes]);

  // Ring highlighting — only needed when NOT in ring isolation mode (highlight among many nodes)
  useEffect(() => {
    if (!cyRef.current || !selectedRingId || isRingIsolated) return;
    cyRef.current.elements().removeClass('highlight-ring');
    const ring = data?.rings.find(r => r.id === selectedRingId);
    if (!ring) return;
    ring.nodes.forEach(nodeId => {
      const node = cyRef.current?.getElementById(nodeId);
      if (node) { node.addClass('highlight-ring'); node.connectedEdges().addClass('highlight-ring'); }
    });
  }, [selectedRingId, data, isRingIsolated]);

  // Dark-mode style refresh (no full rebuild)
  useEffect(() => {
    if (!cyRef.current) return;
    const nodeColor = isDarkMode ? '#e5e5e5' : '#1e293b';
    const edgeColor = isDarkMode ? '#525252' : '#cbd5e1';
    const outlineColor = isDarkMode ? '#000000' : '#f8fafc';
    cyRef.current.style(buildStylesheet(nodeColor, edgeColor, outlineColor, showLabels, showDirectionArrows, highlightMoneyFlow));
  }, [isDarkMode, showLabels, showDirectionArrows, highlightMoneyFlow]);

  // Main Cytoscape build — runs when data changes
  useEffect(() => {
    if (!containerRef.current || !data) return;
    setLoading(true);

    try {
      cyRef.current?.destroy();

      const elements: cytoscape.ElementDefinition[] = [];

      // Nodes (capped)
      displayNodeIds.forEach(nodeId => {
        const node = data.nodes.get(nodeId);
        if (!node) return;
        const suspNode = (allSuspiciousNodes || data.suspicious_nodes).find(n => n.id === nodeId);
        const ring = data.rings.find(r => r.nodes.includes(nodeId));
        // Sometimes the dashboard node hasn't formally mapped its SuspicionScore explicitly in suspicious_nodes correctly because it might only exist in a Ring object directly!
        const suspicionScore = suspNode?.score.total || ring?.average_suspicion || 0;

        elements.push({
          data: {
            id: nodeId,
            label: nodeId.substring(0, 8) + '…',
            suspicionScore,  // CANONICAL RISK FIELD
            ringId: ring?.id,
            degree: node.total_degree,
            patterns: suspNode?.score.details.patterns || [],
            mappedColor: getRiskColor(getRiskLevel(suspicionScore)),
            mappedSize: Math.max(20, Math.min(60, 20 + (node.total_degree || 0) * 2)),
          },
        });
      });

      // Edges (capped, only between displayed nodes)
      displayEdges.forEach(edge => {
        elements.push({
          data: {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            amount: edge.amount,
            timestamp: edge.timestamp,
          },
        });
      });

      const nodeColor = isDarkMode ? '#e5e5e5' : '#1e293b';
      const edgeColor = isDarkMode ? '#525252' : '#cbd5e1';
      const outlineColor = isDarkMode ? '#000000' : '#f8fafc';

      const cy = cytoscape({
        container: containerRef.current,
        elements,
        style: buildStylesheet(nodeColor, edgeColor, outlineColor, showLabels, showDirectionArrows, highlightMoneyFlow),
        layout: {
          name: 'cose',
          animate: false,
          nodeDimensionsIncludeLabels: true,
          padding: 50,
        },
      });

      cy.on('tap', 'node', evt => {
        onNodeSelect(evt.target.id());
      });
      cy.on('tap', evt => {
        if (evt.target === cy) onNodeSelect(null);
      });

      cy.on('mouseover', 'node', evt => {
        evt.target.addClass('hovered');
        const pos = evt.target.renderedPosition();
        const nodeData = evt.target.data();
        const suspicionScore = nodeData.suspicionScore || 0;
        const riskLevel = getRiskLevel(suspicionScore);

        setTooltip({
          visible: true,
          x: pos.x,
          y: pos.y,
          nodeId: nodeData.id,
          score: suspicionScore,
          riskLevel,
          patterns: nodeData.patterns || [],
          ringId: nodeData.ringId,
        });
      });
      cy.on('mouseout', 'node', evt => {
        evt.target.removeClass('hovered');
        setTooltip(null);
      });

      cyRef.current = cy;

      // ✅ VALIDATION GUARD: Check for graph color mismatch
      if (data.suspicious_nodes.length > 0) {
        const allNodesGreen = cy.nodes().every(node => {
          const suspicionScore = node.data('suspicionScore') || 0;
          return suspicionScore < 40; // All nodes are low-risk (green)
        });

        if (allNodesGreen) {
          console.error(
            '🚨 GRAPH COLOR MISMATCH: Risk scores not bound correctly!\n' +
            `Found ${data.suspicious_nodes.length} suspicious entities, but ALL graph nodes are green.\n` +
            'This indicates suspicionScore is not being populated from detection results.'
          );
        }
      }
    } catch (err) {
      console.error('Cytoscape error:', err);
    } finally {
      setLoading(false);
    }

    return () => { cyRef.current?.destroy(); cyRef.current = null; };
  }, [data, onNodeSelect, displayNodeIds, displayEdges, isDarkMode, showLabels, showDirectionArrows, highlightMoneyFlow]);

  const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.2);
  const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() * 0.8);
  const handleFit = () => cyRef.current?.fit();

  return (
    <div className="relative w-full h-[600px] bg-black rounded-xl border border-[#1f1f1f] overflow-hidden shadow-sm transition-colors duration-300">
      <div ref={containerRef} className="w-full h-full" />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2" />
            <span className="text-sm text-slate-400">Rendering Graph…</span>
          </div>
        </div>
      )}

      {/* Truncation badge */}
      {isTruncated && !loading && (
        <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 bg-amber-900/80 text-amber-200 text-[11px] px-3 py-1.5 rounded-full border border-amber-700 backdrop-blur-sm">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          Showing top {MAX_RENDER_NODES.toLocaleString()} of {(data?.nodes.size || 0).toLocaleString()} nodes
        </div>
      )}

      {/* Time Window Filter Badge */}
      {!loading && data && (
        <div className="absolute bottom-4 left-4 z-20 bg-[#0a0a0a]/90 backdrop-blur-sm border border-[#262626] rounded-lg px-3 py-2 text-[11px] text-slate-300 flex items-start gap-2">
          <Clock className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-blue-400 mb-0.5">
              Time Window: {timeWindow.toUpperCase()}
            </div>
            <div className="text-slate-400">
              Transactions in View: <span className={cn(
                "font-medium",
                visibleTxCount === 0 && totalTxCount > 0 ? "text-orange-400" : "text-white"
              )}>{visibleTxCount.toLocaleString()}</span>
              {visibleTxCount < totalTxCount && (
                <span className="text-slate-500"> of {totalTxCount.toLocaleString()}</span>
              )}
            </div>
            {visibleTxCount === 0 && totalTxCount > 0 && data.suspicious_nodes.length > 0 && (
              <div className="text-[10px] text-orange-400 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                <span>Detection succeeded. Expand time window to view graph.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-30 pointer-events-none"
          style={{ left: `${tooltip.x + 15}px`, top: `${tooltip.y - 10}px` }}
        >
          <div className={`p-3 rounded-lg shadow-2xl border-2 min-w-[200px] ${tooltip.riskLevel === 'high'
            ? 'bg-red-950/95 border-red-600'
            : tooltip.riskLevel === 'medium'
              ? 'bg-orange-950/95 border-orange-600'
              : 'bg-green-950/95 border-green-600'
            }`}>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Account ID</div>
            <div className="font-mono text-xs text-white mb-3 break-all">{tooltip.nodeId}</div>

            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-slate-400 uppercase">Risk Score</span>
              <span className={`font-bold text-sm ${tooltip.riskLevel === 'high' ? 'text-red-400' :
                tooltip.riskLevel === 'medium' ? 'text-orange-400' : 'text-green-400'
                }`}>{tooltip.score.toFixed(0)}</span>
            </div>

            <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">
              Risk Level:{' '}
              <span className={`font-semibold ${tooltip.riskLevel === 'high' ? 'text-red-400' :
                tooltip.riskLevel === 'medium' ? 'text-orange-400' : 'text-green-400'
                }`}>{tooltip.riskLevel.toUpperCase()}</span>
            </div>

            {tooltip.patterns.length > 0 && (
              <>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-2 mb-1">Patterns</div>
                <div className="flex flex-wrap gap-1">
                  {tooltip.patterns.slice(0, 3).map((p, idx) => (
                    <span key={idx} className={`px-1.5 py-0.5 rounded text-[9px] ${tooltip.riskLevel === 'high' ? 'bg-red-900/50 text-red-300' :
                      tooltip.riskLevel === 'medium' ? 'bg-orange-900/50 text-orange-300' :
                        'bg-green-900/50 text-green-300'
                      }`}>{p}</span>
                  ))}
                </div>
              </>
            )}

            {tooltip.ringId && (
              <div className="mt-2 pt-2 border-t border-slate-700">
                <div className="text-[10px] text-yellow-400 uppercase tracking-wider flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                  {tooltip.ringId}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 bg-[#0a0a0a]/95 backdrop-blur-sm p-1.5 rounded-lg shadow-xl border border-[#262626] z-20">
        <button onClick={handleZoomIn} className="p-2 hover:bg-[#1f1f1f] rounded transition-colors" title="Zoom In">
          <ZoomIn className="w-4 h-4 text-slate-300" />
        </button>
        <button onClick={handleZoomOut} className="p-2 hover:bg-[#1f1f1f] rounded transition-colors" title="Zoom Out">
          <ZoomOut className="w-4 h-4 text-slate-300" />
        </button>
        <button onClick={handleFit} className="p-2 hover:bg-[#1f1f1f] rounded transition-colors" title="Fit to Screen">
          <Maximize className="w-4 h-4 text-slate-300" />
        </button>
        <button
          onClick={() => cyRef.current?.layout({ name: 'cose', animate: true } as any).run()}
          className="p-2 hover:bg-[#1f1f1f] rounded transition-colors"
          title="Relayout"
        >
          <RefreshCw className="w-4 h-4 text-slate-300" />
        </button>
      </div>

      {/* Legend */}
      <div className="absolute top-4 left-4 bg-[#0a0a0a]/95 backdrop-blur-sm p-4 rounded-lg shadow-xl border border-[#262626] z-20 text-xs space-y-2.5 transition-colors">
        <div className="font-semibold text-slate-200 mb-2 uppercase tracking-wider text-[10px]">Risk Legend</div>
        <div className="space-y-2 pb-2 border-b border-[#262626]">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-green-500 shadow-sm" /><span className="text-slate-300">Low Risk</span>
            <span className="text-slate-500 text-[10px] ml-auto">&lt; 40</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-orange-500 shadow-sm" /><span className="text-slate-300">Medium Risk</span>
            <span className="text-slate-500 text-[10px] ml-auto">40–69</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-500 shadow-sm" /><span className="text-slate-300">High Risk</span>
            <span className="text-slate-500 text-[10px] ml-auto">≥ 70</span>
          </div>
        </div>
        <div className="pt-1">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-slate-600 border-2 border-double border-yellow-500" />
            <span className="text-slate-300">Fraud Ring</span>
          </div>
        </div>
      </div>
    </div>
  );
});

// ── Stylesheet factory ────────────────────────────────────────────────────────
function buildStylesheet(nodeColor: string, edgeColor: string, outlineColor: string, showLabels: boolean, showDirectionArrows: boolean, highlightMoneyFlow: boolean): cytoscape.StylesheetStyle[] {
  return [
    {
      selector: 'node',
      style: {
        label: showLabels ? 'data(label)' : '',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': '10px',
        color: nodeColor,
        'background-color': 'data(mappedColor)' as any,
        width: 'data(mappedSize)' as any,
        height: 'data(mappedSize)' as any,
        'text-outline-width': 2,
        'text-outline-color': outlineColor,
      } as any,
    },
    {
      selector: 'edge',
      style: {
        width: highlightMoneyFlow ? 2 : 1,
        'line-color': highlightMoneyFlow ? '#3b82f6' : edgeColor,
        'target-arrow-color': highlightMoneyFlow ? '#3b82f6' : edgeColor,
        'target-arrow-shape': showDirectionArrows ? 'triangle' : 'none',
        'curve-style': 'bezier',
        'arrow-scale': 0.8,
      },
    },
    {
      selector: 'node[?ringId]',
      style: { 'border-width': 5, 'border-style': 'double', 'border-color': '#eab308' } as any,
    },
    {
      selector: '.highlight-ring',
      style: { 'border-width': 4, 'border-color': '#eab308', 'line-color': '#eab308', 'target-arrow-color': '#eab308', width: 3 } as any,
    },
    {
      selector: '.hovered',
      style: { 'overlay-opacity': 0.2, 'overlay-color': '#ffffff', 'overlay-padding': 4 } as any,
    },
  ];
}