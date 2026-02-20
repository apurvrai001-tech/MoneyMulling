/**
 * ROLE CLASSIFICATION UTILITY
 * 
 * Maps detected patterns to human-readable role classifications.
 * CRITICAL: Roles are INFERRED classifications, NOT account identifiers.
 * Account IDs must NEVER be replaced with role names.
 */

export type AccountRole = 
  | 'shell_account'
  | 'mule_operator'
  | 'smurfing_hub'
  | 'distribution_hub'
  | 'layering_node'
  | 'balance_manipulator'
  | 'unknown';

export interface RoleClassification {
  primary: AccountRole;
  label: string;
  description: string;
  confidence: 'high' | 'medium' | 'low';
  patterns: string[];
}

/**
 * Classifies an account based on detected patterns
 * 
 * @param patterns - Array of detected pattern strings
 * @returns Role classification with label and confidence
 */
export function classifyAccountRole(patterns: string[]): RoleClassification {
  // Balance Anomaly / Account Draining — PaySim-specific
  if (patterns.includes('balance_discrepancy') || patterns.includes('account_drain')) {
    return {
      primary: 'balance_manipulator',
      label: 'Balance Manipulator',
      description: 'Balance discrepancies or account draining detected — indicates fraudulent transfers',
      confidence: 'high',
      patterns: patterns.filter(p => p === 'balance_discrepancy' || p === 'account_drain' || p === 'zero_dest_balance'),
    };
  }

  // Shell Account - High flow-through, low connections
  if (patterns.includes('shell_account') || patterns.includes('shell')) {
    return {
      primary: 'shell_account',
      label: 'Shell Account',
      description: 'Pass-through vehicle with high flow-through ratio',
      confidence: 'high',
      patterns: patterns.filter(p => p === 'shell_account' || p === 'rapid_pass_through')
    };
  }

  // Smurfing Hub - Multiple diverse transactions in burst
  if (patterns.includes('smurfing_hub')) {
    return {
      primary: 'smurfing_hub',
      label: 'Smurfing Hub',
      description: 'Coordinates multiple small transactions to evade detection',
      confidence: 'high',
      patterns: patterns.filter(p => p === 'smurfing_hub' || p === 'burst_activity')
    };
  }

  // Star Pattern - Distribution hub
  if (patterns.includes('star_pattern')) {
    return {
      primary: 'distribution_hub',
      label: 'Distribution Hub',
      description: 'Central node fanning out to multiple endpoints',
      confidence: 'high',
      patterns: patterns.filter(p => p === 'star_pattern' || p === 'high_degree')
    };
  }

  // Circular Transfers - Layering node
  if (patterns.includes('circular_transfers') || patterns.includes('cycle_participant')) {
    return {
      primary: 'layering_node',
      label: 'Layering Node',
      description: 'Participates in circular fund routing to obscure origin',
      confidence: 'high',
      patterns: patterns.filter(p => p.includes('circular') || p.includes('cycle'))
    };
  }

  // Mule Operator - Combination of high velocity and multiple counterparties
  if (patterns.includes('high_velocity') && patterns.includes('high_counterparty_count')) {
    return {
      primary: 'mule_operator',
      label: 'Suspected Mule',
      description: 'High transaction velocity with diverse counterparties',
      confidence: 'medium',
      patterns: patterns
    };
  }

  // Unknown/Generic suspicious activity
  if (patterns.length > 0) {
    return {
      primary: 'unknown',
      label: 'Suspicious Activity',
      description: 'Exhibits concerning patterns requiring investigation',
      confidence: 'medium',
      patterns: patterns
    };
  }

  // No patterns detected
  return {
    primary: 'unknown',
    label: 'No Classification',
    description: 'Insufficient data for role classification',
    confidence: 'low',
    patterns: []
  };
}

/**
 * Gets a badge color for a role type
 * 
 * @param role - The account role
 * @returns Tailwind color class
 */
export function getRoleBadgeColor(role: AccountRole): {
  bg: string;
  text: string;
  border: string;
} {
  switch (role) {
    case 'shell_account':
      return {
        bg: 'bg-purple-950/30',
        text: 'text-purple-300',
        border: 'border-purple-900/40'
      };
    case 'balance_manipulator':
      return {
        bg: 'bg-cyan-950/30',
        text: 'text-cyan-300',
        border: 'border-cyan-900/40'
      };
    case 'mule_operator':
      return {
        bg: 'bg-red-950/30',
        text: 'text-red-300',
        border: 'border-red-900/40'
      };
    case 'smurfing_hub':
      return {
        bg: 'bg-orange-950/30',
        text: 'text-orange-300',
        border: 'border-orange-900/40'
      };
    case 'distribution_hub':
      return {
        bg: 'bg-yellow-950/30',
        text: 'text-yellow-300',
        border: 'border-yellow-900/40'
      };
    case 'layering_node':
      return {
        bg: 'bg-pink-950/30',
        text: 'text-pink-300',
        border: 'border-pink-900/40'
      };
    default:
      return {
        bg: 'bg-slate-950/30',
        text: 'text-slate-300',
        border: 'border-slate-900/40'
      };
  }
}