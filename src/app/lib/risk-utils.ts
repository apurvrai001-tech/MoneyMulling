/**
 * SINGLE SOURCE OF TRUTH FOR RISK CALCULATION
 * 
 * This module re-exports from forensics-semantics.ts to maintain backward compatibility
 * while enforcing the new semantic correctness rules.
 * 
 * ALL NEW CODE SHOULD IMPORT FROM forensics-semantics.ts
 */

export {
  getRiskLevel,
  getRiskColor,
  getRiskLabel,
  getRiskInfo,
  RISK_THRESHOLDS
} from './forensics-semantics';
