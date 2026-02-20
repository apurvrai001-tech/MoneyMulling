export interface Transaction {
  sender: string;
  receiver: string;
  amount: number;
  timestamp: string; // ISO string
  id?: string; // Optional unique ID for the transaction itself
  // PaySim-specific fields (optional — populated when dataset includes them)
  txType?: string;            // CASH_IN, CASH_OUT, DEBIT, PAYMENT, TRANSFER
  isFraud?: boolean;          // Ground truth label from labelled datasets
  isFlaggedFraud?: boolean;   // Business-rule flag
  oldBalanceOrig?: number;    // Originator balance before tx
  newBalanceOrig?: number;    // Originator balance after tx
  oldBalanceDest?: number;    // Destination balance before tx
  newBalanceDest?: number;    // Destination balance after tx
}

export interface NodeMetrics {
  in_degree: number;
  out_degree: number;
  total_degree: number;
  first_seen: number; // timestamp
  last_seen: number; // timestamp
  active_days: number;
  velocity: number; // tx/hour
  unique_counterparties: number;
  time_concentration: number; // ratio
  amount_variance: number;
  flow_through: number; // ratio
  pagerank?: number; // Added for advanced metrics
}

export interface NodeData extends NodeMetrics {
  id: string;
  transactions_in: Transaction[];
  transactions_out: Transaction[];
}

export interface EdgeData {
  id: string;
  source: string;
  target: string;
  amount: number;
  timestamp: number;
}

export interface SuspicionScore {
  structural: number;
  behavioral: number;
  network: number;
  total: number;
  details: {
    patterns: string[];
    risk_factors: string[];
  };
}

export interface Ring {
  id: string;
  nodes: string[];
  risk_score: number;
  patterns: string[];
  average_suspicion: number;
  central_hub?: string; // Optional: for fan-in/fan-out patterns
}

export interface GroundTruthMetrics {
  available: boolean;
  totalFraudTx: number;
  totalLegitTx: number;
  // Node-level confusion matrix
  truePositives: number;   // flagged by us AND actually fraudulent
  falsePositives: number;  // flagged by us but NOT fraudulent
  trueNegatives: number;   // NOT flagged and NOT fraudulent
  falseNegatives: number;  // NOT flagged but IS fraudulent
  precision: number;       // TP / (TP + FP)
  recall: number;          // TP / (TP + FN)
  f1Score: number;         // 2 * P * R / (P + R)
  accuracy: number;        // (TP + TN) / total
  // Transaction-type breakdown
  fraudByType: Record<string, { total: number; fraud: number }>;
  // Score distribution for fraud vs legit (for ROC-like insights)
  avgScoreFraudNodes: number;
  avgScoreLegitNodes: number;
}

export interface GraphAnalysisResult {
  nodes: Map<string, NodeData>;
  edges: EdgeData[];
  rings: Ring[];
  suspicious_nodes: { id: string; score: SuspicionScore }[];
  metadata: {
    total_transactions: number;
    total_volume: number;
    processed_at: string;
  };
  ground_truth?: GroundTruthMetrics;
}