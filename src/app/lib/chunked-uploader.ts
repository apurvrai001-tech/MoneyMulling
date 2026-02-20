/**
 * Chunked Uploader / Graph Engine — PaySim-Calibrated Build
 *
 * Key capabilities:
 *  1. Memory-optimised chunked ingestion (graphology removed; edges capped).
 *  2. PaySim-specific scoring signals:
 *     - Balance anomaly detection (originator & destination discrepancies)
 *     - Transaction-type weighting (TRANSFER / CASH_OUT → higher risk)
 *     - Account draining detection (balance → 0 after large transfer)
 *     - Zero-balance destination detection (new/shell account pattern)
 *  3. Ground truth validation when isFraud labels are present:
 *     - Confusion matrix (TP / FP / TN / FN)
 *     - Precision, Recall, F1, Accuracy
 *     - Fraud breakdown by transaction type
 */

import { Transaction, NodeData, EdgeData, SuspicionScore, Ring, GraphAnalysisResult, GroundTruthMetrics } from './types';
import { mean, standardDeviation } from 'simple-statistics';

export interface UploadProgress {
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  percent: number;
  message: string;
  chunksProcessed?: number;
  totalChunks?: number;
}

// ── Scoring constants ────────────────────────────────────────────────────────
const SCORES = {
  STRUCTURAL: {
    CYCLE:   40,
    SMURFING: 25,
    SHELL:   20,
    FAN_IN:  30,
    FAN_OUT: 30,
    MAX:    100,
  },
  BEHAVIORAL: {
    HIGH_VELOCITY: 10,
    HIGH_DIVERSITY: 10,
    BURST: 10,
    // PaySim-specific behavioural signals (INCREASED for better recall)
    BALANCE_ANOMALY:  20,   // balance doesn't add up (was 15)
    ACCOUNT_DRAINING: 18,   // originator balance → 0 (was 12)
    ZERO_DEST_BALANCE: 12,   // sending to empty accounts (was 8)
    HIGH_RISK_TX_TYPE: 8,   // majority TRANSFER / CASH_OUT (was 6)
    // Universal anomaly signals (work on ANY dataset)
    AMOUNT_OUTLIER:   15,   // Amount is statistical outlier (Z-score ≥ 2)
    ROUND_AMOUNT:     8,    // Suspiciously round amounts (structuring)
    TEMPORAL_BURST:   12,   // Multiple tx in short time window
    SINGLETON_ACCOUNT: 10,  // Very low transaction count (1-2 lifetime)
    AMOUNT_CLUSTERING: 10,  // Multiple similar amounts (±5%)
    MAX:   40,  // Increased from 30 to accommodate stronger signals
  },
  NETWORK: {
    RING_SIZE_FACTOR:  5,
    AVG_RING_SUSPICION: 10,
    MULTI_PATTERN:     5,
    HIGH_DEGREE:       12,
    MAX:              35,
  },
};

const THRESHOLDS = {
  WINDOW_HOURS:            72,
  FAN_THRESHOLD:           10,
  SHELL_CHAIN_MIN_LENGTH:   3,
  SHELL_TX_MIN:             2,
  SHELL_TX_MAX:             3,
  CYCLE_MIN_LEN:            3,
  CYCLE_MAX_LEN:            5,
  CYCLE_DEPTH_LIMIT:        6,
  HIGH_VELOCITY_TX_PER_HOUR: 5,
  ACTIVE_DAYS_LEGIT:        7,
  // PaySim-specific thresholds
  BALANCE_ANOMALY_EPSILON:  1.0,  // tolerance for float rounding
  BALANCE_ANOMALY_RATIO:    0.3,  // 30%+ anomalous tx → flag
  HIGH_RISK_TX_RATIO:       0.6,  // 60%+ TRANSFER/CASH_OUT → flag
  ACCOUNT_DRAIN_RATIO:      0.2,  // 20%+ draining tx → flag
  ZERO_DEST_RATIO:          0.3,  // 30%+ to empty accounts → flag
  // Universal anomaly thresholds
  AMOUNT_ZSCORE_THRESHOLD:  2.0,  // 2σ from mean = outlier
  ROUND_AMOUNT_THRESHOLD:   100,  // Round to nearest $100+
  TEMPORAL_BURST_MINUTES:   30,   // Multiple tx within 30 minutes
  SINGLETON_TX_MAX:         2,    // ≤2 lifetime transactions
  AMOUNT_SIMILARITY_PCT:    0.05, // ±5% = similar amounts
  AMOUNT_CLUSTER_MIN:       3,    // Need 3+ similar amounts to flag
};

// Maximum edges stored for Cytoscape rendering (analysis is unaffected)
const MAX_STORED_EDGES = 10_000;
// Maximum Transaction objects kept per node for UI display purposes
const MAX_DISPLAY_TX_PER_NODE = 50;

// ── Compact peer-reference (for fan detection & unique-counterparty counting) ─
interface PeerRef { peer: string; ts: number; }

class ChunkedGraphEngine {
  private nodeMap: Map<string, NodeData> = new Map();
  private edges:   EdgeData[]            = [];
  private transactionCount = 0;
  private totalVolume      = 0;
  private edgeIdCounter    = 0;

  // Compact incoming / outgoing peer lists
  private incomingPeers:  Map<string, PeerRef[]> = new Map();
  private outgoingPeers:  Map<string, PeerRef[]> = new Map();
  // Running amount totals
  private totalAmountIn:  Map<string, number> = new Map();
  private totalAmountOut: Map<string, number> = new Map();

  // ── PaySim-specific counters (per-node, accurate across ALL tx) ────────
  private hasPaySimData = false;
  private balanceAnomalyCount: Map<string, number> = new Map();
  private accountDrainCount:   Map<string, number> = new Map();
  private zeroDestBalCount:    Map<string, number> = new Map();
  private highRiskTxCount:     Map<string, number> = new Map();
  private totalTxCountPerNode: Map<string, number> = new Map();

  // ── Universal anomaly counters (work on ANY dataset) ────────────────────
  private allTransactions: Transaction[] = [];  // Store all tx for global stats
  private roundAmountCount:    Map<string, number> = new Map();
  private temporalBurstCount:  Map<string, number> = new Map();
  private amountsByNode:       Map<string, number[]> = new Map(); // For clustering detection

  // Ground truth tracking
  private hasGroundTruth = false;
  private fraudulentNodes: Set<string> = new Set();  // nodes involved in any fraud tx
  private totalFraudTx  = 0;
  private totalLegitTx  = 0;
  private fraudByType:  Map<string, { total: number; fraud: number }> = new Map();

  // Pattern instance tracking (one ring per pattern instance)
  private cycleInstances: { nodes: string[]; length: number }[] = [];
  private fanInInstances: { hub: string; sources: string[] }[] = [];
  private fanOutInstances: { hub: string; destinations: string[] }[] = [];
  private shellChainInstances: { nodes: string[] }[] = [];

  // ── Ingestion ──────────────────────────────────────────────────────────────

  public addChunk(transactions: Transaction[]): void {
    for (const tx of transactions) this.addTransaction(tx);
  }

  private addTransaction(tx: Transaction): void {
    if (!this.nodeMap.has(tx.sender))   this.createNode(tx.sender);
    if (!this.nodeMap.has(tx.receiver)) this.createNode(tx.receiver);

    const senderNode   = this.nodeMap.get(tx.sender)!;
    const receiverNode = this.nodeMap.get(tx.receiver)!;
    const txTime = new Date(tx.timestamp).getTime();

    // Degree counters (always accurate)
    senderNode.out_degree++;
    senderNode.total_degree++;
    receiverNode.in_degree++;
    receiverNode.total_degree++;

    // Display-capped transaction arrays (for UI only)
    if (senderNode.transactions_out.length < MAX_DISPLAY_TX_PER_NODE)
      senderNode.transactions_out.push(tx);
    if (receiverNode.transactions_in.length < MAX_DISPLAY_TX_PER_NODE)
      receiverNode.transactions_in.push(tx);

    // Running amount totals (accurate for all transactions)
    this.totalAmountIn.set(tx.receiver, (this.totalAmountIn.get(tx.receiver) || 0) + tx.amount);
    this.totalAmountOut.set(tx.sender, (this.totalAmountOut.get(tx.sender) || 0) + tx.amount);

    // Compact peer refs (accurate for all transactions)
    if (!this.incomingPeers.has(tx.receiver)) this.incomingPeers.set(tx.receiver, []);
    if (!this.outgoingPeers.has(tx.sender))   this.outgoingPeers.set(tx.sender,   []);
    this.incomingPeers.get(tx.receiver)!.push({ peer: tx.sender,   ts: txTime });
    this.outgoingPeers.get(tx.sender)!.push(  { peer: tx.receiver, ts: txTime });

    // Capped edge list (for Cytoscape rendering)
    if (this.edges.length < MAX_STORED_EDGES) {
      this.edges.push({
        id:        `e-${this.edgeIdCounter++}`,
        source:    tx.sender,
        target:    tx.receiver,
        amount:    tx.amount,
        timestamp: txTime,
      });
    }

    this.updateNodeTime(senderNode,   txTime);
    this.updateNodeTime(receiverNode, txTime);
    this.transactionCount++;
    this.totalVolume += tx.amount;

    // ── PaySim-specific tracking ────────────────────────────────────────
    this.trackPaySimSignals(tx);

    // ── Universal anomaly tracking ──────────────────────────────────────
    this.trackUniversalAnomalies(tx);
  }

  private trackPaySimSignals(tx: Transaction): void {
    // Track ground truth
    if (tx.isFraud !== undefined) {
      this.hasGroundTruth = true;
      if (tx.isFraud) {
        this.totalFraudTx++;
        this.fraudulentNodes.add(tx.sender);
        this.fraudulentNodes.add(tx.receiver);
      } else {
        this.totalLegitTx++;
      }
    }

    // Track transaction type breakdown
    if (tx.txType) {
      this.hasPaySimData = true;
      const typeStats = this.fraudByType.get(tx.txType) || { total: 0, fraud: 0 };
      typeStats.total++;
      if (tx.isFraud) typeStats.fraud++;
      this.fraudByType.set(tx.txType, typeStats);
    }

    // Per-node tx count (for ratio calculations)
    this.totalTxCountPerNode.set(tx.sender, (this.totalTxCountPerNode.get(tx.sender) || 0) + 1);
    this.totalTxCountPerNode.set(tx.receiver, (this.totalTxCountPerNode.get(tx.receiver) || 0) + 1);

    // Balance anomaly detection (originator side)
    if (tx.oldBalanceOrig !== undefined && tx.newBalanceOrig !== undefined) {
      this.hasPaySimData = true;
      const expected = tx.oldBalanceOrig - tx.amount;
      if (Math.abs(expected - tx.newBalanceOrig) > THRESHOLDS.BALANCE_ANOMALY_EPSILON) {
        this.balanceAnomalyCount.set(tx.sender, (this.balanceAnomalyCount.get(tx.sender) || 0) + 1);
      }
      // Account draining: balance goes to 0 (or near 0) after a large transfer
      if (tx.newBalanceOrig < THRESHOLDS.BALANCE_ANOMALY_EPSILON && tx.oldBalanceOrig > 0 && tx.amount > 0) {
        this.accountDrainCount.set(tx.sender, (this.accountDrainCount.get(tx.sender) || 0) + 1);
      }
    }

    // Balance anomaly detection (destination side)
    if (tx.oldBalanceDest !== undefined && tx.newBalanceDest !== undefined) {
      this.hasPaySimData = true;
      // Zero-balance destination: receiving into an account with 0 balance
      if (tx.oldBalanceDest < THRESHOLDS.BALANCE_ANOMALY_EPSILON && tx.amount > 0) {
        this.zeroDestBalCount.set(tx.receiver, (this.zeroDestBalCount.get(tx.receiver) || 0) + 1);
      }
      // Destination balance anomaly
      const expectedDest = tx.oldBalanceDest + tx.amount;
      if (Math.abs(expectedDest - tx.newBalanceDest) > THRESHOLDS.BALANCE_ANOMALY_EPSILON) {
        this.balanceAnomalyCount.set(tx.receiver, (this.balanceAnomalyCount.get(tx.receiver) || 0) + 1);
      }
    }

    // High-risk transaction type (TRANSFER and CASH_OUT are most fraud-prone in PaySim)
    if (tx.txType === 'TRANSFER' || tx.txType === 'CASH_OUT') {
      this.highRiskTxCount.set(tx.sender, (this.highRiskTxCount.get(tx.sender) || 0) + 1);
      this.highRiskTxCount.set(tx.receiver, (this.highRiskTxCount.get(tx.receiver) || 0) + 1);
    }
  }

  private trackUniversalAnomalies(tx: Transaction): void {
    // Store transaction for global stats
    this.allTransactions.push(tx);

    const txTime = new Date(tx.timestamp).getTime();

    // Round amount detection
    if (tx.amount % THRESHOLDS.ROUND_AMOUNT_THRESHOLD === 0) {
      this.roundAmountCount.set(tx.sender, (this.roundAmountCount.get(tx.sender) || 0) + 1);
      this.roundAmountCount.set(tx.receiver, (this.roundAmountCount.get(tx.receiver) || 0) + 1);
    }

    // Temporal burst detection - requires checking time diff from last transaction
    const senderNode = this.nodeMap.get(tx.sender)!;
    const receiverNode = this.nodeMap.get(tx.receiver)!;
    
    // Check if this is close to sender's last transaction
    if (senderNode.last_seen > 0) {
      const timeDiff = txTime - senderNode.last_seen;
      if (timeDiff > 0 && timeDiff < THRESHOLDS.TEMPORAL_BURST_MINUTES * 60 * 1000) {
        this.temporalBurstCount.set(tx.sender, (this.temporalBurstCount.get(tx.sender) || 0) + 1);
      }
    }
    
    // Check if this is close to receiver's last transaction
    if (receiverNode.last_seen > 0) {
      const timeDiff = txTime - receiverNode.last_seen;
      if (timeDiff > 0 && timeDiff < THRESHOLDS.TEMPORAL_BURST_MINUTES * 60 * 1000) {
        this.temporalBurstCount.set(tx.receiver, (this.temporalBurstCount.get(tx.receiver) || 0) + 1);
      }
    }

    // Amount clustering detection
    if (!this.amountsByNode.has(tx.sender)) this.amountsByNode.set(tx.sender, []);
    if (!this.amountsByNode.has(tx.receiver)) this.amountsByNode.set(tx.receiver, []);
    this.amountsByNode.get(tx.sender)!.push(tx.amount);
    this.amountsByNode.get(tx.receiver)!.push(tx.amount);
  }

  // ── Post-ingestion metrics ──────────────────────────────────────────────────

  public finalizeMetrics(): void {
    this.nodeMap.forEach(node => {
      const span = node.last_seen - node.first_seen;
      node.active_days = Math.max(1, span / (1000 * 60 * 60 * 24));

      const totalTx     = node.in_degree + node.out_degree;
      const hoursActive = Math.max(1, span / (1000 * 60 * 60));
      node.velocity     = totalTx / hoursActive;

      // Unique counterparties from compact peer refs (accurate for all tx)
      const uniquePeers = new Set<string>();
      (this.incomingPeers.get(node.id) || []).forEach(r => uniquePeers.add(r.peer));
      (this.outgoingPeers.get(node.id) || []).forEach(r => uniquePeers.add(r.peer));
      node.unique_counterparties = uniquePeers.size;

      // Flow-through from accurate totals
      const totalIn  = this.totalAmountIn.get(node.id)  || 0;
      const totalOut = this.totalAmountOut.get(node.id) || 0;
      node.flow_through = Math.min(totalIn, totalOut) / (Math.max(totalIn, totalOut) || 1);
    });

    // NOTE: Do NOT clear incomingPeers/outgoingPeers here!
    // They are needed by detectFanPatternsAsync(), detectCyclesAsync(), and
    // detectShellChainsAsync() which run AFTER finalizeMetrics().
    // Clearing is deferred to releaseCompactRefs() called after pattern detection.
    this.totalAmountIn.clear();
    this.totalAmountOut.clear();
  }

  /** Release compact peer refs after pattern detection is complete */
  public releaseCompactRefs(): void {
    this.incomingPeers.clear();
    this.outgoingPeers.clear();
  }

  // ── Pattern detection (yielding async) ────────────────────────────────────

  /** Helper: get ALL unique outgoing neighbours for a node from the uncapped peer refs */
  private getOutgoingNeighbours(nodeId: string): Set<string> {
    const refs = this.outgoingPeers.get(nodeId);
    if (!refs || refs.length === 0) return new Set();
    return new Set(refs.map(r => r.peer));
  }

  private async detectCyclesAsync(): Promise<Set<string>> {
    const flagged = new Set<string>();
    const processedCycles = new Set<string>(); // To avoid duplicate cycles
    let processed = 0;

    for (const [startId, startNode] of this.nodeMap) {
      processed++;
      if (processed % 100 === 0) await new Promise(r => setTimeout(r, 0));

      if (startNode.in_degree === 0 || startNode.out_degree === 0) continue;

      const stack: { current: string; depth: number; path: string[] }[] = [
        { current: startId, depth: 1, path: [startId] },
      ];

      let iterations = 0;
      const MAX_ITER = 800;

      while (stack.length > 0) {
        if (++iterations > MAX_ITER) break;
        const { current, depth, path } = stack.pop()!;
        if (depth > THRESHOLDS.CYCLE_DEPTH_LIMIT) continue;

        // Use uncapped outgoingPeers for accurate neighbour discovery
        const neighbours = this.getOutgoingNeighbours(current);

        for (const neighbour of neighbours) {
          if (neighbour === startId) {
            if (path.length >= THRESHOLDS.CYCLE_MIN_LEN && path.length <= THRESHOLDS.CYCLE_MAX_LEN) {
              path.forEach(id => flagged.add(id));
              
              // Store this cycle instance
              const sortedPath = [...path].sort().join('-');
              if (!processedCycles.has(sortedPath)) {
                processedCycles.add(sortedPath);
                this.cycleInstances.push({
                  nodes: path,
                  length: path.length
                });
              }
            }
          } else if (!path.includes(neighbour) && path.length < THRESHOLDS.CYCLE_MAX_LEN) {
            stack.push({ current: neighbour, depth: depth + 1, path: [...path, neighbour] });
          }
        }
      }
    }

    return flagged;
  }

  private async detectFanPatternsAsync(): Promise<{ fanIn: Set<string>; fanOut: Set<string> }> {
    const fanIn  = new Set<string>();
    const fanOut = new Set<string>();
    const windowMs = THRESHOLDS.WINDOW_HOURS * 3600 * 1000;

    let maxTs = 0;
    this.nodeMap.forEach(n => { if (n.last_seen > maxTs) maxTs = n.last_seen; });
    const windowStart = maxTs - windowMs;

    let processed = 0;
    for (const [_, node] of this.nodeMap) {
      if (++processed % 500 === 0) await new Promise(r => setTimeout(r, 0));

      // ── Fan-in: use uncapped incomingPeers for accurate unique sender count ──
      const inRefs = this.incomingPeers.get(node.id) || [];
      // All unique senders (windowed)
      const windowedSenders = new Set(
        inRefs.filter(r => r.ts >= windowStart).map(r => r.peer)
      );
      // All unique senders (total, for fallback)
      const allSenders = new Set(inRefs.map(r => r.peer));

      // Use the larger of windowed vs total to ensure we capture the pattern
      const effectiveInSources = windowedSenders.size >= allSenders.size * 0.5
        ? windowedSenders : allSenders;

      if (effectiveInSources.size >= THRESHOLDS.FAN_THRESHOLD) {
        fanIn.add(node.id);
        this.fanInInstances.push({
          hub: node.id,
          sources: Array.from(effectiveInSources)
        });
      }

      // ── Fan-out: use uncapped outgoingPeers for accurate unique receiver count ──
      const outRefs = this.outgoingPeers.get(node.id) || [];
      // All unique receivers (windowed)
      const windowedReceivers = new Set(
        outRefs.filter(r => r.ts >= windowStart).map(r => r.peer)
      );
      // All unique receivers (total, for fallback)
      const allReceivers = new Set(outRefs.map(r => r.peer));

      // Use the larger of windowed vs total to ensure we capture the pattern
      const effectiveOutDests = windowedReceivers.size >= allReceivers.size * 0.5
        ? windowedReceivers : allReceivers;

      if (effectiveOutDests.size >= THRESHOLDS.FAN_THRESHOLD) {
        fanOut.add(node.id);
        this.fanOutInstances.push({
          hub: node.id,
          destinations: Array.from(effectiveOutDests)
        });
      }
    }

    console.log(`[FAN DETECTION] Fan-in hubs: ${fanIn.size}, Fan-out hubs: ${fanOut.size} (threshold: ${THRESHOLDS.FAN_THRESHOLD} unique peers)`);

    return { fanIn, fanOut };
  }

  private async detectShellChainsAsync(): Promise<Set<string>> {
    const flagged = new Set<string>();
    const processedChains = new Set<string>(); // To avoid duplicate chains

    const isShellNode = (id: string): boolean => {
      const n = this.nodeMap.get(id);
      if (!n) return false;
      return n.total_degree >= THRESHOLDS.SHELL_TX_MIN && n.total_degree <= THRESHOLDS.SHELL_TX_MAX;
    };

    let processed = 0;
    for (const [startId, startNode] of this.nodeMap) {
      if (++processed % 100 === 0) await new Promise(r => setTimeout(r, 0));
      if (startNode.out_degree === 0) continue;

      const queue: { current: string; path: string[] }[] = [{ current: startId, path: [startId] }];
      let iterations = 0;
      const MAX_ITER = 400;

      while (queue.length > 0) {
        if (++iterations > MAX_ITER) break;
        const { current, path } = queue.shift()!;

        if (path.length >= THRESHOLDS.SHELL_CHAIN_MIN_LENGTH) {
          const intermediates = path.slice(1, -1);
          if (intermediates.length > 0 && intermediates.every(id => isShellNode(id))) {
            path.forEach(id => flagged.add(id));
            
            // Store this shell chain instance
            const sortedPath = [...path].sort().join('-');
            if (!processedChains.has(sortedPath)) {
              processedChains.add(sortedPath);
              this.shellChainInstances.push({
                nodes: path
              });
            }
          }
        }

        if (path.length >= THRESHOLDS.CYCLE_DEPTH_LIMIT) continue;

        // Use uncapped outgoingPeers for accurate neighbour discovery
        const neighbours = this.getOutgoingNeighbours(current);
        for (const neighbour of neighbours) {
          if (!path.includes(neighbour)) {
            queue.push({ current: neighbour, path: [...path, neighbour] });
          }
        }
      }
    }

    return flagged;
  }

  // ── Scoring ────────────────────────────────────────────────────────────────

  public async detectPatternsAndScoreAsync(): Promise<{ id: string; score: SuspicionScore }[]> {
    const results: { id: string; score: SuspicionScore }[] = [];

    // Reset pattern instances
    this.cycleInstances = [];
    this.fanInInstances = [];
    this.fanOutInstances = [];
    this.shellChainInstances = [];

    const cycleAccounts = await this.detectCyclesAsync();
    const { fanIn, fanOut } = await this.detectFanPatternsAsync();
    const shellAccounts = await this.detectShellChainsAsync();

    // Velocity statistics for outlier detection
    const velocities = Array.from(this.nodeMap.values()).map(n => n.velocity);
    let meanVel = 0, stdVel = 0;
    if (velocities.length > 1) {
      meanVel = mean(velocities);
      stdVel  = standardDeviation(velocities);
    }

    // Degree statistics for centrality proxy
    const degrees = Array.from(this.nodeMap.values()).map(n => n.total_degree);
    let meanDeg = 0, stdDeg = 0;
    if (degrees.length > 1) {
      meanDeg = mean(degrees);
      stdDeg  = standardDeviation(degrees);
    }

    let processed = 0;
    for (const [_, node] of this.nodeMap) {
      if (++processed % 1000 === 0) await new Promise(r => setTimeout(r, 0));

      const patterns:     string[] = [];
      const riskFactors:  string[] = [];

      let structuralScore = 0;
      let behavioralScore = 0;
      let networkScore    = 0;

      // ── Classic structural patterns ──
      if (cycleAccounts.has(node.id)) { structuralScore += SCORES.STRUCTURAL.CYCLE;   patterns.push('cycle'); }
      if (fanIn.has(node.id))         { structuralScore += SCORES.STRUCTURAL.FAN_IN;  patterns.push('fan_in'); }
      if (fanOut.has(node.id))        { structuralScore += SCORES.STRUCTURAL.FAN_OUT; patterns.push('fan_out'); }
      if (shellAccounts.has(node.id)) { structuralScore += SCORES.STRUCTURAL.SHELL;   patterns.push('shell'); }

      // ── Classic behavioral signals ──
      if (node.velocity > THRESHOLDS.HIGH_VELOCITY_TX_PER_HOUR) {
        behavioralScore += SCORES.BEHAVIORAL.HIGH_VELOCITY;
        riskFactors.push('high_velocity');
      }

      // ── PaySim-calibrated behavioural signals ──
      if (this.hasPaySimData) {
        const nodeTxCount = this.totalTxCountPerNode.get(node.id) || 1;

        // Balance anomaly: ANY anomaly flags the account
        const anomalyCount = this.balanceAnomalyCount.get(node.id) || 0;
        if (anomalyCount > 0) {
          // Base score for ANY anomaly, bonus for high ratio
          const ratio = anomalyCount / nodeTxCount;
          if (ratio >= THRESHOLDS.BALANCE_ANOMALY_RATIO) {
            behavioralScore += SCORES.BEHAVIORAL.BALANCE_ANOMALY;
          } else {
            behavioralScore += Math.floor(SCORES.BEHAVIORAL.BALANCE_ANOMALY * 0.5);
          }
          riskFactors.push('balance_anomaly');
          patterns.push('balance_discrepancy');
        }

        // Account draining: ANY draining event is highly suspicious
        const drainCount = this.accountDrainCount.get(node.id) || 0;
        if (drainCount > 0) {
          // Draining is always a strong signal
          behavioralScore += SCORES.BEHAVIORAL.ACCOUNT_DRAINING;
          riskFactors.push('account_draining');
          patterns.push('account_drain');
        }

        // Zero-balance destination: ANY such transaction is suspicious
        const zeroDest = this.zeroDestBalCount.get(node.id) || 0;
        if (zeroDest > 0) {
          const ratio = zeroDest / nodeTxCount;
          if (ratio >= THRESHOLDS.ZERO_DEST_RATIO) {
            behavioralScore += SCORES.BEHAVIORAL.ZERO_DEST_BALANCE;
          } else {
            behavioralScore += Math.floor(SCORES.BEHAVIORAL.ZERO_DEST_BALANCE * 0.5);
          }
          riskFactors.push('zero_balance_destination');
          patterns.push('zero_dest_balance');
        }

        // High-risk transaction type: If account primarily uses TRANSFER/CASH_OUT
        const highRiskCount = this.highRiskTxCount.get(node.id) || 0;
        if (highRiskCount > 0 && (highRiskCount / nodeTxCount) >= THRESHOLDS.HIGH_RISK_TX_RATIO) {
          behavioralScore += SCORES.BEHAVIORAL.HIGH_RISK_TX_TYPE;
          riskFactors.push('high_risk_tx_type');
        }
      }

      // ── Universal anomaly signals (work on ANY dataset) ──
      const nodeTxCount = node.total_degree;
      
      // 1. Amount outlier detection (Z-score based)
      const nodeAmounts = this.amountsByNode.get(node.id) || [];
      if (nodeAmounts.length >= 2) {
        try {
          const meanAmt = mean(nodeAmounts);
          const stdAmt = standardDeviation(nodeAmounts);
          if (stdAmt > 0) {
            // Check if any amount is an outlier
            const hasOutlier = nodeAmounts.some(amt => Math.abs((amt - meanAmt) / stdAmt) >= THRESHOLDS.AMOUNT_ZSCORE_THRESHOLD);
            if (hasOutlier) {
              behavioralScore += SCORES.BEHAVIORAL.AMOUNT_OUTLIER;
              riskFactors.push('amount_outlier');
              patterns.push('statistical_anomaly');
            }
          }
        } catch (e) { /* Skip if stats computation fails */ }
      }

      // 2. Round amount detection (structuring indicator)
      const roundAmtCount = this.roundAmountCount.get(node.id) || 0;
      if (roundAmtCount > 0 && nodeTxCount > 0) {
        const roundRatio = roundAmtCount / nodeTxCount;
        if (roundRatio > 0.5) { // More than half are round amounts
          behavioralScore += SCORES.BEHAVIORAL.ROUND_AMOUNT;
          riskFactors.push('round_amounts');
          patterns.push('structuring');
        }
      }

      // 3. Temporal burst detection
      const burstCount = this.temporalBurstCount.get(node.id) || 0;
      if (burstCount >= 2) { // At least 2 burst events
        behavioralScore += SCORES.BEHAVIORAL.TEMPORAL_BURST;
        riskFactors.push('temporal_burst');
        patterns.push('burst_activity');
      }

      // 4. Singleton account detection (very low activity)
      if (nodeTxCount <= THRESHOLDS.SINGLETON_TX_MAX) {
        behavioralScore += SCORES.BEHAVIORAL.SINGLETON_ACCOUNT;
        riskFactors.push('singleton_account');
        patterns.push('minimal_history');
      }

      // 5. Amount clustering detection (similar amounts)
      if (nodeAmounts.length >= THRESHOLDS.AMOUNT_CLUSTER_MIN) {
        let clusterCount = 0;
        for (let i = 0; i < nodeAmounts.length; i++) {
          for (let j = i + 1; j < nodeAmounts.length; j++) {
            const diff = Math.abs(nodeAmounts[i] - nodeAmounts[j]);
            const avg = (nodeAmounts[i] + nodeAmounts[j]) / 2;
            if (avg > 0 && (diff / avg) <= THRESHOLDS.AMOUNT_SIMILARITY_PCT) {
              clusterCount++;
              if (clusterCount >= THRESHOLDS.AMOUNT_CLUSTER_MIN) {
                behavioralScore += SCORES.BEHAVIORAL.AMOUNT_CLUSTERING;
                riskFactors.push('amount_clustering');
                patterns.push('similar_amounts');
                break;
              }
            }
          }
          if (clusterCount >= THRESHOLDS.AMOUNT_CLUSTER_MIN) break;
        }
      }

      // ── Degree-based centrality proxy ──
      if (stdDeg > 0 && node.total_degree > meanDeg + 2 * stdDeg) {
        networkScore += SCORES.NETWORK.HIGH_DEGREE;
        riskFactors.push('high_centrality');
      }

      structuralScore = Math.min(structuralScore, SCORES.STRUCTURAL.MAX);
      behavioralScore = Math.min(behavioralScore, SCORES.BEHAVIORAL.MAX);
      networkScore    = Math.min(networkScore,    SCORES.NETWORK.MAX);

      const totalScore = Math.min(100, structuralScore + behavioralScore + networkScore);

      if (totalScore > 0 || patterns.length > 0) {
        results.push({
          id: node.id,
          score: {
            structural: structuralScore,
            behavioral: behavioralScore,
            network:    networkScore,
            total:      totalScore,
            details:    { patterns, risk_factors: riskFactors },
          },
        });
      }
    }

    return results;
  }

  // ── Ring formation ─────────────────────────────────────────────────────────

  public async formRingsAsync(
    suspiciousNodes: { id: string; score: SuspicionScore }[]
  ): Promise<Ring[]> {
    // Canonical ring deduplication
    const ringMap = new Map<string, Ring>(); // signature -> Ring
    let ringCount = 0;

    // Helper: Create canonical signature for ring deduplication
    const createRingSignature = (ringType: string, nodeIds: string[]): string => {
      const sortedIds = [...nodeIds].sort().join(',');
      return `${ringType}::${sortedIds}`;
    };

    // Create a map for quick lookup of suspicious nodes
    const suspiciousNodeMap = new Map(suspiciousNodes.map(n => [n.id, n]));
    const suspiciousSet = new Set(suspiciousNodes.map(n => n.id));

    // 1. Create rings from cycle instances - ONE RING PER UNIQUE STRUCTURE
    for (const cycle of this.cycleInstances) {
      const suspiciousInCycle = cycle.nodes.filter(id => suspiciousSet.has(id));
      if (suspiciousInCycle.length > 0) {
        // Create canonical signature for deduplication
        const ringType = `cycle_length_${cycle.length}`;
        const signature = createRingSignature(ringType, cycle.nodes);
        
        // Skip if this exact ring structure already exists
        if (ringMap.has(signature)) {
          continue;
        }
        
        ringCount++;
        
        const members = suspiciousInCycle.map(id => suspiciousNodeMap.get(id)!);

        // Update network scores
        const networkBonus = Math.min(SCORES.NETWORK.MAX, 15);
        members.forEach(m => {
          m.score.network = Math.max(m.score.network, networkBonus);
          m.score.total = Math.min(100, m.score.structural + m.score.behavioral + m.score.network);
        });

        // Compute ring risk using THIS RING'S member set and pattern-specific formula
        const totalScore = members.reduce((sum, m) => sum + m.score.total, 0);
        const avgScore = totalScore / members.length;
        
        let risk = (avgScore * 0.6) + (Math.log(members.length + 1) * 10);
        if (cycle.length === 3) risk += 15;
        else if (cycle.length === 4) risk += 10;
        else if (cycle.length === 5) risk += 5;
        risk = Math.min(100, Math.max(0, risk));

        const ring: Ring = {
          id: `RING_${ringCount.toString().padStart(3, '0')}`,
          nodes: suspiciousInCycle,
          risk_score: parseFloat(risk.toFixed(2)),
          patterns: [ringType],
          average_suspicion: parseFloat(avgScore.toFixed(2))
        };
        
        ringMap.set(signature, ring);
      }
      
      if (ringCount % 50 === 0) await new Promise(r => setTimeout(r, 0));
    }

    // 2. Create rings from fan-in instances - ONE RING PER UNIQUE STRUCTURE
    for (const fanIn of this.fanInInstances) {
      // Create ring if hub is suspicious (hub must exist in the pattern)
      // Include all nodes (hub + sources) in the ring, even if sources aren't individually suspicious
      const hubIsSuspicious = suspiciousSet.has(fanIn.hub);
      
      if (hubIsSuspicious && fanIn.sources.length >= 3) {
        // All nodes in the ring (hub + all spokes)
        const allRingNodes = [fanIn.hub, ...fanIn.sources];
        
        // Create canonical signature for deduplication
        const ringType = 'hub_spoke_fan_in';
        const signature = createRingSignature(ringType, allRingNodes);
        
        // Skip if this exact ring structure already exists
        if (ringMap.has(signature)) {
          continue;
        }
        
        ringCount++;
        
        // Get suspicious nodes for scoring
        const suspiciousMembers = allRingNodes
          .filter(id => suspiciousSet.has(id))
          .map(id => suspiciousNodeMap.get(id)!);

        // Update network scores for suspicious members
        const networkBonus = Math.min(SCORES.NETWORK.MAX, 12);
        suspiciousMembers.forEach(m => {
          m.score.network = Math.max(m.score.network, networkBonus);
          m.score.total = Math.min(100, m.score.structural + m.score.behavioral + m.score.network);
        });

        // Compute ring risk - primarily from hub, with contribution from spoke count
        const hubNode = suspiciousNodeMap.get(fanIn.hub);
        const hubScore = hubNode ? hubNode.score.total : 50; // Fallback if hub not in map
        
        // Risk calculation: hub score (70%) + topology bonus (30%)
        let risk = (hubScore * 0.7) + (Math.log(fanIn.sources.length + 1) * 10) + 15;
        risk = Math.min(100, Math.max(0, risk));

        // Average suspicion from all suspicious members
        const totalScore = suspiciousMembers.reduce((sum, m) => sum + m.score.total, 0);
        const avgScore = suspiciousMembers.length > 0 ? totalScore / suspiciousMembers.length : hubScore;

        const ring: Ring = {
          id: `RING_${ringCount.toString().padStart(3, '0')}`,
          nodes: allRingNodes.filter(id => suspiciousSet.has(id)), // Only include suspicious nodes in output
          risk_score: parseFloat(risk.toFixed(2)),
          patterns: [ringType],
          average_suspicion: parseFloat(avgScore.toFixed(2)),
          central_hub: fanIn.hub
        };
        
        ringMap.set(signature, ring);
      }
      
      if (ringCount % 50 === 0) await new Promise(r => setTimeout(r, 0));
    }

    // 3. Create rings from fan-out instances - ONE RING PER UNIQUE STRUCTURE
    for (const fanOut of this.fanOutInstances) {
      // Create ring if hub is suspicious (hub must exist in the pattern)
      // Include all nodes (hub + destinations) in the ring, even if destinations aren't individually suspicious
      const hubIsSuspicious = suspiciousSet.has(fanOut.hub);
      
      if (hubIsSuspicious && fanOut.destinations.length >= 3) {
        // All nodes in the ring (hub + all spokes)
        const allRingNodes = [fanOut.hub, ...fanOut.destinations];
        
        // Create canonical signature for deduplication
        const ringType = 'hub_spoke_fan_out';
        const signature = createRingSignature(ringType, allRingNodes);
        
        // Skip if this exact ring structure already exists
        if (ringMap.has(signature)) {
          continue;
        }
        
        ringCount++;
        
        // Get suspicious nodes for scoring
        const suspiciousMembers = allRingNodes
          .filter(id => suspiciousSet.has(id))
          .map(id => suspiciousNodeMap.get(id)!);

        // Update network scores for suspicious members
        const networkBonus = Math.min(SCORES.NETWORK.MAX, 12);
        suspiciousMembers.forEach(m => {
          m.score.network = Math.max(m.score.network, networkBonus);
          m.score.total = Math.min(100, m.score.structural + m.score.behavioral + m.score.network);
        });

        // Compute ring risk - primarily from hub, with contribution from spoke count
        const hubNode = suspiciousNodeMap.get(fanOut.hub);
        const hubScore = hubNode ? hubNode.score.total : 50; // Fallback if hub not in map
        
        // Risk calculation: hub score (70%) + topology bonus (30%)
        let risk = (hubScore * 0.7) + (Math.log(fanOut.destinations.length + 1) * 10) + 15;
        risk = Math.min(100, Math.max(0, risk));

        // Average suspicion from all suspicious members
        const totalScore = suspiciousMembers.reduce((sum, m) => sum + m.score.total, 0);
        const avgScore = suspiciousMembers.length > 0 ? totalScore / suspiciousMembers.length : hubScore;

        const ring: Ring = {
          id: `RING_${ringCount.toString().padStart(3, '0')}`,
          nodes: allRingNodes.filter(id => suspiciousSet.has(id)), // Only include suspicious nodes in output
          risk_score: parseFloat(risk.toFixed(2)),
          patterns: [ringType],
          average_suspicion: parseFloat(avgScore.toFixed(2)),
          central_hub: fanOut.hub
        };
        
        ringMap.set(signature, ring);
      }
      
      if (ringCount % 50 === 0) await new Promise(r => setTimeout(r, 0));
    }

    // 4. Create rings from shell chain instances - ONE RING PER UNIQUE STRUCTURE
    for (const shellChain of this.shellChainInstances) {
      const suspiciousShellNodes = shellChain.nodes.filter(id => suspiciousSet.has(id));
      
      if (suspiciousShellNodes.length > 0) {
        // Create canonical signature for deduplication
        const ringType = 'shell_account_chain';
        const signature = createRingSignature(ringType, shellChain.nodes);
        
        // Skip if this exact ring structure already exists
        if (ringMap.has(signature)) {
          continue;
        }
        
        ringCount++;
        
        const members = suspiciousShellNodes.map(id => suspiciousNodeMap.get(id)!);

        // Update network scores
        const networkBonus = Math.min(SCORES.NETWORK.MAX, 10);
        members.forEach(m => {
          m.score.network = Math.max(m.score.network, networkBonus);
          m.score.total = Math.min(100, m.score.structural + m.score.behavioral + m.score.network);
        });

        // Compute ring risk using THIS RING'S member set and pattern-specific formula
        const totalScore = members.reduce((sum, m) => sum + m.score.total, 0);
        const avgScore = totalScore / members.length;
        
        let risk = (avgScore * 0.5) + (Math.log(members.length + 1) * 7) + 8;
        risk = Math.min(100, Math.max(0, risk));

        const ring: Ring = {
          id: `RING_${ringCount.toString().padStart(3, '0')}`,
          nodes: suspiciousShellNodes,
          risk_score: parseFloat(risk.toFixed(2)),
          patterns: [ringType],
          average_suspicion: parseFloat(avgScore.toFixed(2))
        };
        
        ringMap.set(signature, ring);
      }
      
      if (ringCount % 50 === 0) await new Promise(r => setTimeout(r, 0));
    }

    // Extract deduplicated rings from map
    const deduplicatedRings = Array.from(ringMap.values());

    // VALIDATION: Ensure each ring has only one pattern type
    for (const ring of deduplicatedRings) {
      if (ring.patterns.length > 1) {
        throw new Error(
          `FRAUD RING VALIDATION FAILED: Ring ${ring.id} contains ${ring.patterns.length} pattern types: ${ring.patterns.join(', ')}. ` +
          `Each ring MUST contain exactly ONE pattern type. This indicates rings were incorrectly merged.`
        );
      }
    }

    return deduplicatedRings.sort((a, b) => b.risk_score - a.risk_score);
  }

  // ── Ground truth computation ───────────────────────────────────────────────

  private computeGroundTruth(
    suspiciousNodes: { id: string; score: SuspicionScore }[]
  ): GroundTruthMetrics | undefined {
    if (!this.hasGroundTruth) return undefined;

    // Node-level evaluation: a "flagged" node is one with score > 0
    const flaggedSet = new Set(suspiciousNodes.filter(n => n.score.total > 0).map(n => n.id));
    const flaggedScoreMap = new Map(suspiciousNodes.map(n => [n.id, n.score.total]));

    // All nodes in the graph
    const allNodeIds = new Set(this.nodeMap.keys());

    let tp = 0, fp = 0, tn = 0, fn = 0;
    let totalScoreFraud = 0, countFraud = 0;
    let totalScoreLegit = 0, countLegit = 0;

    for (const nodeId of allNodeIds) {
      const isFlagged      = flaggedSet.has(nodeId);
      const isActualFraud  = this.fraudulentNodes.has(nodeId);
      const score          = flaggedScoreMap.get(nodeId) || 0;

      if (isActualFraud) {
        totalScoreFraud += score;
        countFraud++;
        if (isFlagged) tp++; else fn++;
      } else {
        totalScoreLegit += score;
        countLegit++;
        if (isFlagged) fp++; else tn++;
      }
    }

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall    = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1Score   = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    const total     = tp + fp + tn + fn;
    const accuracy  = total > 0 ? (tp + tn) / total : 0;

    // Convert fraud-by-type map to plain object
    const fraudByType: Record<string, { total: number; fraud: number }> = {};
    for (const [type, stats] of this.fraudByType) {
      fraudByType[type] = { total: stats.total, fraud: stats.fraud };
    }

    return {
      available: true,
      totalFraudTx: this.totalFraudTx,
      totalLegitTx: this.totalLegitTx,
      truePositives:  tp,
      falsePositives: fp,
      trueNegatives:  tn,
      falseNegatives: fn,
      precision:  parseFloat(precision.toFixed(4)),
      recall:     parseFloat(recall.toFixed(4)),
      f1Score:    parseFloat(f1Score.toFixed(4)),
      accuracy:   parseFloat(accuracy.toFixed(4)),
      fraudByType,
      avgScoreFraudNodes: countFraud > 0 ? parseFloat((totalScoreFraud / countFraud).toFixed(2)) : 0,
      avgScoreLegitNodes: countLegit > 0 ? parseFloat((totalScoreLegit / countLegit).toFixed(2)) : 0,
    };
  }

  // ── Result assembly ────────────────────────────────────────────────────────

  public async getResultAsync(): Promise<GraphAnalysisResult> {
    const suspiciousNodes = await this.detectPatternsAndScoreAsync();
    const rings           = await this.formRingsAsync(suspiciousNodes);
    const groundTruth     = this.computeGroundTruth(suspiciousNodes);

    // Release compact peer refs now that all pattern detection is complete
    this.releaseCompactRefs();

    // Free PaySim tracking maps
    this.balanceAnomalyCount.clear();
    this.accountDrainCount.clear();
    this.zeroDestBalCount.clear();
    this.highRiskTxCount.clear();
    this.totalTxCountPerNode.clear();

    return {
      nodes:            this.nodeMap,
      edges:            this.edges,
      rings,
      suspicious_nodes: suspiciousNodes,
      metadata: {
        total_transactions: this.transactionCount,
        total_volume:       this.totalVolume,
        processed_at:       new Date().toISOString(),
      },
      ground_truth: groundTruth,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private createNode(id: string): void {
    this.nodeMap.set(id, {
      id,
      in_degree:            0,
      out_degree:           0,
      total_degree:         0,
      transactions_in:      [],
      transactions_out:     [],
      first_seen:           Infinity,
      last_seen:            -Infinity,
      active_days:          0,
      velocity:             0,
      unique_counterparties: 0,
      time_concentration:   0,
      amount_variance:      0,
      flow_through:         0,
    });
  }

  private updateNodeTime(node: NodeData, time: number): void {
    if (time < node.first_seen) node.first_seen = time;
    if (time > node.last_seen)  node.last_seen  = time;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function uploadAndAnalyze(
  transactions: Transaction[],
  onProgress: (progress: UploadProgress) => void
): Promise<GraphAnalysisResult> {
  // ── GUARD RAIL: Prevent detection on empty dataset ──
  if (!transactions || transactions.length === 0) {
    onProgress({ 
      status: 'failed', 
      percent: 0, 
      message: 'No transactions available for analysis. Please upload a valid dataset.' 
    });
    throw new Error('Cannot run detection on empty transaction dataset. Upload a CSV file with transaction data.');
  }

  const chunkSize   = 2_000;
  const engine      = new ChunkedGraphEngine();
  const totalChunks = Math.ceil(transactions.length / chunkSize);

  onProgress({ status: 'processing', percent: 0, message: `Initialising analysis on ${transactions.length.toLocaleString()} transactions...`, totalChunks, chunksProcessed: 0 });

  for (let i = 0; i < transactions.length; i += chunkSize) {
    engine.addChunk(transactions.slice(i, i + chunkSize));

    const chunksProcessed = Math.floor(i / chunkSize) + 1;
    onProgress({
      status:          'processing',
      percent:         Math.round((chunksProcessed / totalChunks) * 75),
      message:         `Building graph... chunk ${chunksProcessed}/${totalChunks}`,
      chunksProcessed,
      totalChunks,
    });

    await new Promise(resolve => setTimeout(resolve, 0));
  }

  onProgress({ status: 'processing', percent: 76, message: 'Finalising node metrics...' });
  await new Promise(resolve => setTimeout(resolve, 10));
  engine.finalizeMetrics();

  onProgress({ status: 'processing', percent: 80, message: 'Detecting fraud patterns (PaySim-calibrated)...' });
  await new Promise(resolve => setTimeout(resolve, 10));

  const result = await engine.getResultAsync();

  onProgress({ status: 'completed', percent: 100, message: 'Analysis complete' });
  return result;
}

// Kept for compatibility
export function serializeAnalysisResult(result: GraphAnalysisResult): Blob {
  return new Blob([JSON.stringify(result)], { type: 'application/json' });
}