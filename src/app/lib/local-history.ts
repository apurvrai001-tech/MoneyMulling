/**
 * LOCAL HISTORY STORAGE — quota-safe implementation
 *
 * The full GraphAnalysisResult (nodes Map + edges) is far too large for
 * localStorage (~5 MB limit). We store a SLIM summary instead:
 *   - metadata
 *   - rings  (no per-transaction data — just IDs + scores)
 *   - top-100 suspicious nodes  (score object only, no transaction arrays)
 *
 * Storage layout (one key per entry + a separate index):
 *   analysisHistory_{userId}_index   → string[]  (ordered newest-first, max 10)
 *   analysisHistory_{userId}_{id}    → SlimEntry JSON
 *
 * When an entry is loaded from history the nodes Map is reconstructed from
 * the ring + suspicious-node IDs so the dashboard can render stats & rings.
 * The graph canvas will show 0 edges (no edge data is stored) — re-uploading
 * the original file is required for a full interactive graph.
 */

import { GraphAnalysisResult, Ring } from './types';

// ── Public types ─────────────────────────────────────────────────────────────

export interface AnalysisHistoryEntry {
  id: string;
  userId: string;
  timestamp: string;
  filename: string;
  stats: {
    totalTransactions: number;
    totalVolume: number;
    suspiciousNodes: number;
    fraudRings: number;
  };
  /** Slim result — nodes Map is NOT stored; it is rebuilt on restore. */
  result: SlimAnalysisResult;
}

// ── Internal types ────────────────────────────────────────────────────────────

interface SlimSuspiciousNode {
  id: string;
  score: {
    total: number;
    structural: number;
    behavioral: number;
    network: number;
    details?: { patterns?: string[]; risk_factors?: string[] };
  };
}

interface SlimAnalysisResult {
  metadata: GraphAnalysisResult['metadata'];
  /** Full ring objects (they contain only IDs + scores, no transaction arrays). */
  rings: Ring[];
  /** Top-100 suspicious nodes, score only — no transaction arrays. */
  suspicious_nodes: SlimSuspiciousNode[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PREFIX       = 'analysisHistory_';
const MAX_ENTRIES  = 10;
const MAX_SUS_NODES = 100;

// ── Key helpers ───────────────────────────────────────────────────────────────

function indexKey(userId: string) {
  return `${PREFIX}${userId}_index`;
}
function entryKey(userId: string, id: string) {
  return `${PREFIX}${userId}_${id}`;
}

// ── Read helpers ──────────────────────────────────────────────────────────────

function readIndex(userId: string): string[] {
  try {
    const raw = localStorage.getItem(indexKey(userId));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(userId: string, ids: string[]) {
  localStorage.setItem(indexKey(userId), JSON.stringify(ids));
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns history entries for a user, newest first. */
export function getUserHistory(userId: string): AnalysisHistoryEntry[] {
  const ids = readIndex(userId);
  const entries: AnalysisHistoryEntry[] = [];
  for (const id of ids) {
    try {
      const raw = localStorage.getItem(entryKey(userId, id));
      if (raw) entries.push(JSON.parse(raw) as AnalysisHistoryEntry);
    } catch (err) {
      console.warn(`Skipping corrupt history entry ${id}:`, err);
    }
  }
  return entries;
}

/** Saves a slim summary. Evicts the oldest entry if the 10-entry cap is hit. */
export function addHistoryEntry(
  userId: string,
  filename: string,
  result: GraphAnalysisResult,
): AnalysisHistoryEntry {
  // Build slim result — never store the nodes Map or edge array
  const slimResult: SlimAnalysisResult = {
    metadata: result.metadata,
    rings:    result.rings,
    suspicious_nodes: result.suspicious_nodes
      .slice(0, MAX_SUS_NODES)
      .map(n => ({
        id: n.id,
        score: {
          total:      n.score.total,
          structural: n.score.structural,
          behavioral: n.score.behavioral,
          network:    n.score.network,
          details:    n.score.details
            ? {
                patterns:     (n.score.details.patterns     || []).slice(0, 20),
                risk_factors: (n.score.details.risk_factors || []).slice(0, 20),
              }
            : undefined,
        },
      })),
  };

  const id    = `analysis_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const entry: AnalysisHistoryEntry = {
    id,
    userId,
    timestamp: new Date().toISOString(),
    filename,
    stats: {
      totalTransactions: result.metadata.total_transactions,
      totalVolume:       result.metadata.total_volume,
      suspiciousNodes:   result.suspicious_nodes.length,
      fraudRings:        result.rings.length,
    },
    result: slimResult,
  };

  // Persist the entry itself
  try {
    localStorage.setItem(entryKey(userId, id), JSON.stringify(entry));
  } catch (err) {
    // Even the slim entry is too large — extremely unlikely but handle gracefully
    console.error('Failed to save slim history entry:', err);
    throw new Error('Failed to save analysis to history');
  }

  // Update index; evict oldest entries that overflow the cap
  const ids = [id, ...readIndex(userId)];
  const evicted = ids.splice(MAX_ENTRIES); // keep first MAX_ENTRIES
  evicted.forEach(oldId => {
    try { localStorage.removeItem(entryKey(userId, oldId)); } catch { /* ignore */ }
  });

  try {
    writeIndex(userId, ids);
  } catch (err) {
    // Index write failed (shouldn't happen since it's tiny) — clean up entry
    console.error('Failed to update history index:', err);
    try { localStorage.removeItem(entryKey(userId, id)); } catch { /* ignore */ }
    throw new Error('Failed to save analysis to history');
  }

  return entry;
}

/** Deletes a single history entry and removes it from the index. */
export function deleteHistoryEntry(userId: string, entryId: string): void {
  try {
    localStorage.removeItem(entryKey(userId, entryId));
    writeIndex(userId, readIndex(userId).filter(id => id !== entryId));
  } catch (err) {
    console.error('Failed to delete history entry', err);
    throw new Error('Failed to delete entry');
  }
}

/** Returns a single history entry by ID, or null if not found. */
export function getHistoryEntry(userId: string, entryId: string): AnalysisHistoryEntry | null {
  try {
    const raw = localStorage.getItem(entryKey(userId, entryId));
    return raw ? (JSON.parse(raw) as AnalysisHistoryEntry) : null;
  } catch (err) {
    console.error('Failed to get history entry', err);
    return null;
  }
}

/** Removes all history entries and the index for a user. */
export function clearUserHistory(userId: string): void {
  const ids = readIndex(userId);
  ids.forEach(id => {
    try { localStorage.removeItem(entryKey(userId, id)); } catch { /* ignore */ }
  });
  try { localStorage.removeItem(indexKey(userId)); } catch { /* ignore */ }
}

/**
 * Reconstructs a renderable GraphAnalysisResult from a slim history entry.
 *
 * Because transaction arrays are not stored, the reconstructed nodes Map
 * contains stub entries (empty transaction lists). The graph canvas will show
 * no edges, but the stats panel, ring list, alerts panel, and suspicion scores
 * are all fully functional.
 */
export function rehydrateAnalysisResult(entry: AnalysisHistoryEntry): GraphAnalysisResult {
  const slim = entry.result as SlimAnalysisResult;

  // Collect every known node ID from rings + suspicious nodes
  const nodeIds = new Set<string>();
  slim.suspicious_nodes.forEach(n => nodeIds.add(n.id));
  slim.rings.forEach(r => r.nodes.forEach(id => nodeIds.add(id)));

  // Build stub node map so the dashboard doesn't crash
  const nodes = new Map<string, any>();
  nodeIds.forEach(id => {
    nodes.set(id, {
      id,
      transactions_in:  [],
      transactions_out: [],
      velocity:         0,
      active_days:      0,
    });
  });

  // Attach slim score data back onto stub suspicious nodes
  const suspiciousNodes = slim.suspicious_nodes.map(n => ({
    id: n.id,
    score: {
      total:      n.score.total,
      structural: n.score.structural,
      behavioral: n.score.behavioral,
      network:    n.score.network,
      details:    n.score.details ? {
        patterns: n.score.details.patterns || [],
        risk_factors: n.score.details.risk_factors || [],
      } : { patterns: [], risk_factors: [] },
    },
  }));

  return {
    metadata:        slim.metadata,
    rings:           slim.rings,
    suspicious_nodes: suspiciousNodes,
    nodes,
    edges: [], // not stored — re-upload file for full graph
  };
}

// ── Migration helper ──────────────────────────────────────────────────────────
/**
 * One-time migration: removes any legacy monolithic history keys
 * (old format stored all entries in one giant key).
 */
export function migrateLegacyHistory(userId: string): void {
  const legacyKey = `${PREFIX}${userId}`;
  if (!localStorage.getItem(legacyKey)) return;
  try {
    const raw = localStorage.getItem(legacyKey);
    if (!raw) return;
    const legacyEntries: any[] = JSON.parse(raw);
    console.info(`Migrating ${legacyEntries.length} legacy history entries for user ${userId}`);
    // Remove the oversized legacy key first to free quota
    localStorage.removeItem(legacyKey);
    // Re-save only the metadata (no full result — it was too large anyway)
    legacyEntries.slice(0, MAX_ENTRIES).forEach(e => {
      try {
        const slimEntry: AnalysisHistoryEntry = {
          id:        e.id,
          userId:    e.userId,
          timestamp: e.timestamp,
          filename:  e.filename,
          stats:     e.stats,
          result: {
            metadata: e.result?.metadata ?? {
              total_transactions: e.stats.totalTransactions,
              total_volume:       e.stats.totalVolume,
            },
            rings:            (e.result?.rings ?? []).slice(0, 200),
            suspicious_nodes: (e.result?.suspicious_nodes ?? [])
              .slice(0, MAX_SUS_NODES)
              .map((n: any) => ({
                id:    n.id,
                score: {
                  total:      n.score?.total      ?? 0,
                  structural: n.score?.structural ?? 0,
                  behavioral: n.score?.behavioral ?? 0,
                  network:    n.score?.network    ?? 0,
                },
              })),
          },
        };
        localStorage.setItem(entryKey(userId, slimEntry.id), JSON.stringify(slimEntry));
        const ids = readIndex(userId);
        if (!ids.includes(slimEntry.id)) writeIndex(userId, [...ids, slimEntry.id]);
      } catch (err) {
        console.warn('Skipping legacy entry during migration:', err);
      }
    });
  } catch (err) {
    console.warn('Legacy migration failed — clearing old key:', err);
    localStorage.removeItem(legacyKey);
  }
}
