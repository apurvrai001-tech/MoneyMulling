
import { Transaction, NodeData, EdgeData, SuspicionScore, Ring, GraphAnalysisResult } from './types';

// Constants for scoring
const SCORES = {
  STRUCTURAL: {
    CYCLE_3: 40,
    CYCLE_4: 35,
    CYCLE_5: 30,
    SMURFING: 25,
    SHELL: 20,
    FAN_IN: 30,   // Hub-and-spoke fan-in (collection pattern)
    FAN_OUT: 30,  // Hub-and-spoke fan-out (distribution pattern)
    MAX: 50
  },
  BEHAVIORAL: {
    HIGH_VELOCITY: 10,
    HIGH_DIVERSITY: 10,
    BURST: 10,
    MAX: 30
  },
  NETWORK: {
    RING_SIZE_FACTOR: 5,
    AVG_RING_SUSPICION: 10,
    MULTI_PATTERN: 5,
    MAX: 20
  }
};

const THRESHOLDS = {
  SMURFING_BURST_WINDOW_HOURS: 72,
  SMURFING_DIVERSITY_RATIO: 0.8, // 80% unique
  SHELL_FLOW_THROUGH: 0.8,
  SHELL_MAX_DEGREE: 5, // Slightly relaxed from 3 for better detection
  HIGH_VELOCITY_TX_PER_HOUR: 5,
  ACTIVE_DAYS_LEGIT: 7
};

export class GraphEngine {
  private transactions: Transaction[];
  private nodeMap: Map<string, NodeData>;
  private edges: EdgeData[];

  constructor(transactions: Transaction[]) {
    this.transactions = transactions;
    this.nodeMap = new Map();
    this.edges = [];
  }

  public process(): GraphAnalysisResult {
    this.buildGraph();
    const suspiciousNodes = this.detectPatternsAndScore();
    const rings = this.formRings(suspiciousNodes);

    return {
      nodes: this.nodeMap,
      edges: this.edges,
      rings,
      suspicious_nodes: suspiciousNodes,
      metadata: {
        total_transactions: this.transactions.length,
        total_volume: this.transactions.reduce((sum, tx) => sum + tx.amount, 0),
        processed_at: new Date().toISOString()
      }
    };
  }

  private buildGraph() {
    this.transactions.forEach((tx, index) => {
      // Ensure nodes exist
      if (!this.nodeMap.has(tx.sender)) this.createNode(tx.sender);
      if (!this.nodeMap.has(tx.receiver)) this.createNode(tx.receiver);

      const senderNode = this.nodeMap.get(tx.sender)!;
      const receiverNode = this.nodeMap.get(tx.receiver)!;

      // Update Node Data
      senderNode.out_degree++;
      senderNode.total_degree++;
      senderNode.transactions_out.push(tx);
      
      receiverNode.in_degree++;
      receiverNode.total_degree++;
      receiverNode.transactions_in.push(tx);

      // Create Edge
      this.edges.push({
        id: `e-${index}`,
        source: tx.sender,
        target: tx.receiver,
        amount: tx.amount,
        timestamp: new Date(tx.timestamp).getTime()
      });

      // Update timestamps
      const txTime = new Date(tx.timestamp).getTime();
      this.updateNodeTime(senderNode, txTime);
      this.updateNodeTime(receiverNode, txTime);
    });

    // Post-process metrics
    this.nodeMap.forEach(node => {
      node.active_days = (node.last_seen - node.first_seen) / (1000 * 60 * 60 * 24);
      if (node.active_days === 0) node.active_days = 1; // Avoid div by zero

      const totalTx = node.in_degree + node.out_degree;
      const hoursActive = Math.max(1, (node.last_seen - node.first_seen) / (1000 * 60 * 60));
      node.velocity = totalTx / hoursActive;
      
      const uniquePeers = new Set([
        ...node.transactions_in.map(t => t.sender),
        ...node.transactions_out.map(t => t.receiver)
      ]);
      node.unique_counterparties = uniquePeers.size;
      
      const totalIn = node.transactions_in.reduce((sum, t) => sum + t.amount, 0);
      const totalOut = node.transactions_out.reduce((sum, t) => sum + t.amount, 0);
      
      node.flow_through = Math.min(totalIn, totalOut) / (Math.max(totalIn, totalOut) || 1);
    });
  }

  private createNode(id: string) {
    this.nodeMap.set(id, {
      id,
      in_degree: 0,
      out_degree: 0,
      total_degree: 0,
      transactions_in: [],
      transactions_out: [],
      first_seen: Infinity,
      last_seen: -Infinity,
      active_days: 0,
      velocity: 0,
      unique_counterparties: 0,
      time_concentration: 0,
      amount_variance: 0,
      flow_through: 0
    });
  }

  private updateNodeTime(node: NodeData, time: number) {
    if (time < node.first_seen) node.first_seen = time;
    if (time > node.last_seen) node.last_seen = time;
  }

  // Pattern instance tracking
  private cycleInstances: { nodes: string[]; length: number }[] = [];
  private fanInInstances: { hub: string; sources: string[] }[] = [];
  private fanOutInstances: { hub: string; destinations: string[] }[] = [];
  private shellChains: { nodes: string[] }[] = [];

  private detectPatternsAndScore(): { id: string; score: SuspicionScore }[] {
    const results: { id: string; score: SuspicionScore }[] = [];

    // Reset pattern instances
    this.cycleInstances = [];
    this.fanInInstances = [];
    this.fanOutInstances = [];
    this.shellChains = [];

    // First pass: detect all pattern instances globally
    this.detectAllCycles();
    this.detectFanPatterns();
    
    this.nodeMap.forEach(node => {
      const patterns: string[] = [];
      const riskFactors: string[] = [];
      
      let structuralScore = 0;
      let behavioralScore = 0;
      let networkScore = 0;

      // 1. Shell Detection
      if (node.total_degree <= THRESHOLDS.SHELL_MAX_DEGREE && 
          node.flow_through > THRESHOLDS.SHELL_FLOW_THROUGH &&
          node.total_degree > 1) { // Need at least in and out
        structuralScore += SCORES.STRUCTURAL.SHELL;
        patterns.push("shell");  // Standardized tag for pattern filters
        patterns.push("shell_account");  // Detailed tag
        
        // Add to shell chains if not already tracked
        const inShellChain = this.shellChains.some(chain => chain.nodes.includes(node.id));
        if (!inShellChain) {
          this.shellChains.push({ nodes: [node.id] });
        }
      }

      // 2. Smurfing Detection
      const sortedTx = [...node.transactions_in, ...node.transactions_out].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      let maxBurst = 0;
      for (let i = 0; i < sortedTx.length; i++) {
        let count = 0;
        const startTime = new Date(sortedTx[i].timestamp).getTime();
        for (let j = i; j < sortedTx.length; j++) {
           if (new Date(sortedTx[j].timestamp).getTime() - startTime <= THRESHOLDS.SMURFING_BURST_WINDOW_HOURS * 3600 * 1000) {
             count++;
           } else {
             break;
           }
        }
        maxBurst = Math.max(maxBurst, count);
      }

      const burstRatio = maxBurst / (node.total_degree || 1);
      const diversityRatio = node.unique_counterparties / (node.total_degree || 1);

      if (burstRatio > 0.5 && diversityRatio > THRESHOLDS.SMURFING_DIVERSITY_RATIO && node.total_degree > 5) {
         structuralScore += SCORES.STRUCTURAL.SMURFING;
         patterns.push("smurfing_hub");
         behavioralScore += SCORES.BEHAVIORAL.BURST;
      }

      // 3. Check if node is in any detected cycles
      const cyclesWithNode = this.cycleInstances.filter(c => c.nodes.includes(node.id));
      if (cyclesWithNode.length > 0) {
        // Use the smallest cycle for scoring
        const minCycleLen = Math.min(...cyclesWithNode.map(c => c.length));
        if (minCycleLen === 3) {
          structuralScore += SCORES.STRUCTURAL.CYCLE_3;
          patterns.push("cycle");  // Standardized tag for pattern filters
          patterns.push("cycle_length_3");  // Detailed tag for ring formation
        } else if (minCycleLen === 4) {
          structuralScore += SCORES.STRUCTURAL.CYCLE_4;
          patterns.push("cycle");  // Standardized tag for pattern filters
          patterns.push("cycle_length_4");  // Detailed tag for ring formation
        } else if (minCycleLen === 5) {
          structuralScore += SCORES.STRUCTURAL.CYCLE_5;
          patterns.push("cycle");  // Standardized tag for pattern filters
          patterns.push("cycle_length_5");  // Detailed tag for ring formation
        }
      }

      // 4. Check if node is a hub in any fan-in pattern
      const fanInHub = this.fanInInstances.find(f => f.hub === node.id);
      if (fanInHub) {
        structuralScore += SCORES.STRUCTURAL.FAN_IN;
        patterns.push("fan_in");
        riskFactors.push(`fan_in_${fanInHub.sources.length}_sources`);
      }

      // 5. Check if node is a hub in any fan-out pattern
      const fanOutHub = this.fanOutInstances.find(f => f.hub === node.id);
      if (fanOutHub) {
        structuralScore += SCORES.STRUCTURAL.FAN_OUT;
        patterns.push("fan_out");
        riskFactors.push(`fan_out_${fanOutHub.destinations.length}_destinations`);
      }

      // Behavioral Scoring
      if (node.velocity > THRESHOLDS.HIGH_VELOCITY_TX_PER_HOUR) {
        behavioralScore += SCORES.BEHAVIORAL.HIGH_VELOCITY;
        riskFactors.push("high_velocity");
      }

      // False Positive Shield
      let isLegit = false;
      if (node.active_days > THRESHOLDS.ACTIVE_DAYS_LEGIT && 
          node.total_degree > 20 && 
          burstRatio < 0.3) {
          isLegit = true;
          structuralScore = Math.max(0, structuralScore - 35); // Reduce score
          riskFactors.push("legitimate_behavior_shield");
      }

      // Normalize scores
      structuralScore = Math.min(structuralScore, SCORES.STRUCTURAL.MAX);
      behavioralScore = Math.min(behavioralScore, SCORES.BEHAVIORAL.MAX);

      const totalScore = structuralScore + behavioralScore; // Network score added later

      if (totalScore > 10 || patterns.length > 0) {
        results.push({
          id: node.id,
          score: {
            structural: structuralScore,
            behavioral: behavioralScore,
            network: 0, // Placeholder
            total: totalScore,
            details: {
              patterns,
              risk_factors: riskFactors
            }
          }
        });
      }
    });

    return results;
  }

  // Detect all cycles in the graph (up to length 5)
  private detectAllCycles() {
    const visited = new Set<string>();
    const processedCycles = new Set<string>(); // To avoid duplicate cycles

    this.nodeMap.forEach((node, nodeId) => {
      if (node.in_degree > 0 && node.out_degree > 0) {
        this.findCyclesFromNode(nodeId, 5, processedCycles);
      }
    });
  }

  private findCyclesFromNode(startNodeId: string, maxDepth: number, processedCycles: Set<string>) {
    const stack: { id: string; depth: number; path: string[] }[] = [
      { id: startNodeId, depth: 0, path: [startNodeId] }
    ];

    let iterations = 0;
    const MAX_ITERATIONS = 500;

    while (stack.length > 0) {
      iterations++;
      if (iterations > MAX_ITERATIONS) break;

      const { id, depth, path } = stack.pop()!;

      if (depth >= maxDepth) continue;

      const node = this.nodeMap.get(id);
      if (!node) continue;

      for (const tx of node.transactions_out) {
        const neighbor = tx.receiver;
        
        if (neighbor === startNodeId && depth + 1 >= 3) {
          // Cycle found!
          const cycleLen = depth + 1;
          const cyclePath = [...path];
          
          // Create a canonical representation (sorted) to avoid duplicates
          const sortedPath = [...cyclePath].sort().join('-');
          
          if (!processedCycles.has(sortedPath)) {
            processedCycles.add(sortedPath);
            this.cycleInstances.push({
              nodes: cyclePath,
              length: cycleLen
            });
          }
          continue;
        }

        if (!path.includes(neighbor)) {
          stack.push({
            id: neighbor,
            depth: depth + 1,
            path: [...path, neighbor]
          });
        }
      }
    }
  }

  // Detect fan-in and fan-out patterns
  private detectFanPatterns() {
    this.nodeMap.forEach((node, nodeId) => {
      // Fan-in: many sources → one hub
      if (node.in_degree >= 5 && node.unique_counterparties >= 5) {
        const sources = [...new Set(node.transactions_in.map(t => t.sender))];
        if (sources.length >= 5) {
          this.fanInInstances.push({
            hub: nodeId,
            sources: sources
          });
        }
      }

      // Fan-out: one hub → many destinations
      if (node.out_degree >= 5 && node.unique_counterparties >= 5) {
        const destinations = [...new Set(node.transactions_out.map(t => t.receiver))];
        if (destinations.length >= 5) {
          this.fanOutInstances.push({
            hub: nodeId,
            destinations: destinations
          });
        }
      }
    });
  }

  private formRings(suspiciousNodes: { id: string; score: SuspicionScore }[]): Ring[] {
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
      // Only create ring if at least one node is suspicious
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
        
        const members = cycle.nodes
          .filter(id => suspiciousSet.has(id))
          .map(id => suspiciousNodeMap.get(id)!);

        // Update network scores for members
        const networkBonus = Math.min(SCORES.NETWORK.MAX, 15);
        members.forEach(m => {
          m.score.network = Math.max(m.score.network, networkBonus);
          m.score.total = Math.min(100, m.score.structural + m.score.behavioral + m.score.network);
        });

        // Compute ring risk using THIS RING'S member set and pattern-specific formula
        let totalScore = 0;
        members.forEach(m => {
          totalScore += m.score.total;
        });
        const avgScore = totalScore / members.length;
        
        // Cycle-specific risk calculation
        let risk = (avgScore * 0.6) + (Math.log(members.length + 1) * 10);
        if (cycle.length === 3) risk += 15; // Shorter cycles are more suspicious
        else if (cycle.length === 4) risk += 10;
        else if (cycle.length === 5) risk += 5;
        risk = Math.min(100, Math.max(0, risk));

        const ring: Ring = {
          id: `RING_${ringCount.toString().padStart(3, '0')}`,
          nodes: cycle.nodes.filter(id => suspiciousSet.has(id)),
          risk_score: parseFloat(risk.toFixed(2)),
          patterns: [ringType],
          average_suspicion: parseFloat(avgScore.toFixed(2))
        };
        
        ringMap.set(signature, ring);
      }
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
    }

    // 4. Create rings from shell chains - ONE RING PER UNIQUE STRUCTURE
    for (const shellChain of this.shellChains) {
      // Only create ring if nodes are suspicious
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
        let totalScore = 0;
        members.forEach(m => {
          totalScore += m.score.total;
        });
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

    // Sort rings by risk score DESC
    return deduplicatedRings.sort((a, b) => b.risk_score - a.risk_score);
  }
}
