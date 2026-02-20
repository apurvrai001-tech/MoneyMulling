/**
 * FINANCIAL FORENSICS ENGINE - SEMANTIC CORRECTNESS ENFORCEMENT
 * 
 * This module is the SINGLE SOURCE OF TRUTH for all risk calculations,
 * aggregations, and semantic interpretations in the system.
 * 
 * CRITICAL RULES:
 * 1. Risk is ALWAYS a numeric score (0-100)
 * 2. Risk level (Low/Medium/High) is a DERIVED LABEL, not a score
 * 3. Ring risk uses ONE consistent aggregation rule globally
 * 4. Account IDs are immutable identifiers
 * 5. Roles are inferred classifications, separate from IDs
 * 6. Pattern toggles are visibility filters ONLY
 * 7. Threshold sliders filter entities, NOT scores
 */

import { Ring, SuspicionScore } from './types';

// ────────────────────────────────────────────────────────────────────────────
// 1️⃣ RISK SCORE DEFINITION (NUMERIC 0-100)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Risk Level Thresholds (IMMUTABLE)
 * These define how numeric scores map to categorical risk levels
 */
export const RISK_THRESHOLDS = {
  LOW_MAX: 39,      // 0-39 = Low
  MEDIUM_MAX: 69,   // 40-69 = Medium
  HIGH_MIN: 70      // 70-100 = High
} as const;

/**
 * Derives risk level from numeric score
 * CRITICAL: This is the ONLY function that determines risk level
 */
export function getRiskLevel(score: number): 'low' | 'medium' | 'high' {
  if (typeof score !== 'number' || isNaN(score)) {
    console.warn('Invalid risk score:', score);
    return 'low';
  }

  if (score >= RISK_THRESHOLDS.HIGH_MIN) return 'high';
  if (score >= RISK_THRESHOLDS.LOW_MAX + 1) return 'medium';
  return 'low';
}

/**
 * Returns display label for risk level
 */
export function getRiskLabel(level: 'low' | 'medium' | 'high'): string {
  switch (level) {
    case 'high': return 'High Risk';
    case 'medium': return 'Medium Risk';
    case 'low': return 'Low Risk';
  }
}

/**
 * Returns color for risk level (for UI consistency)
 */
export function getRiskColor(level: 'low' | 'medium' | 'high'): string {
  switch (level) {
    case 'high': return '#ef4444';    // Red
    case 'medium': return '#f59e0b';  // Amber
    case 'low': return '#22c55e';     // Green
  }
}

/**
 * Gets complete risk info from numeric score
 */
export function getRiskInfo(score: number) {
  const level = getRiskLevel(score);
  return {
    score,              // NUMERIC (0-100)
    level,              // DERIVED LABEL
    label: getRiskLabel(level),
    color: getRiskColor(level)
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 2️⃣ RING RISK DEFINITION (PATTERN-SPECIFIC FORMULAS)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Ring Risk Computation Strategy
 * 
 * MANDATORY: Ring risk is computed using pattern-specific formulas that combine:
 * - Member suspicion scores (average)
 * - Pattern-specific bonuses (e.g., cycle length, fan degree)
 * - Logarithmic scaling based on member count
 * 
 * CRITICAL GUARANTEES:
 * - Returns a NUMERIC score (0-100)
 * - Computed ONCE during detection using each ring's own member set
 * - NEVER recomputed on selection/filtering
 * - Each pattern type (cycle, fan-in, fan-out, shell) has its own formula
 * 
 * Pattern-Specific Formulas:
 * 
 * 1. CYCLES:
 *    risk = (avgScore × 0.6) + log(memberCount+1) × 10 + cycleBonus
 *    where cycleBonus = 15 (length 3), 10 (length 4), 5 (length 5)
 * 
 * 2. FAN-IN:
 *    risk = (avgScore × 0.5) + log(sourceCount+1) × 8 + 10
 * 
 * 3. FAN-OUT:
 *    risk = (avgScore × 0.5) + log(destCount+1) × 8 + 10
 * 
 * 4. SHELL CHAINS:
 *    risk = (avgScore × 0.5) + log(memberCount+1) × 7 + 8
 * 
 * NOTE: These formulas are implemented directly in graph-engine.ts and 
 * chunked-uploader.ts during ring formation. This module provides the 
 * semantic framework and validation utilities.
 */

/**
 * Validates that a ring's risk_score matches expected pattern-specific formula
 * Used for integrity checks during testing/debugging
 * 
 * NOTE: This is a simplified validator. Full validation requires pattern type
 * and pattern-specific parameters (cycle length, fan degree, etc.)
 */
export function validateRingRiskRange(ring: Ring): boolean {
  // Ring risk should always be in valid range
  return ring.risk_score >= 0 && ring.risk_score <= 100;
}

// ────────────────────────────────────────────────────────────────────────────
// 3️⃣ ACCOUNT IDENTITY vs INFERENCE (CRITICAL SEPARATION)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Account identity components
 * 
 * STRICT RULES:
 * - Account ID is the TRUE identifier (e.g., "ACC_12345", "C123456789")
 * - Role is an INFERRED classification (e.g., "Mule", "Hub", "Source")
 * - These MUST be displayed separately
 * - ID MUST NEVER be replaced by role
 */
export interface AccountIdentity {
  /** The immutable account identifier from transaction data */
  id: string;
  
  /** Inferred role classification (optional) */
  inferredRole?: {
    primary: string;       // e.g., "mule", "hub", "source"
    label: string;         // e.g., "Money Mule"
    description: string;   // e.g., "Intermediate layering account"
    confidence: string;    // e.g., "High", "Medium", "Low"
  };
}

/**
 * Formats account display with clear separation of ID and role
 * 
 * ❌ WRONG: "Account ID: Mule"
 * ✅ CORRECT: "Account ID: ACC_12345 | Detected Role: Money Mule"
 */
export function formatAccountDisplay(identity: AccountIdentity): {
  idDisplay: string;
  roleDisplay: string | null;
} {
  return {
    idDisplay: identity.id,
    roleDisplay: identity.inferredRole 
      ? `${identity.inferredRole.label} (${identity.inferredRole.confidence})`
      : null
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 4️⃣ THRESHOLD SLIDER SEMANTICS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Filters entities by risk threshold
 * 
 * CRITICAL: This FILTERS entities, it does NOT recompute scores
 * 
 * VALID BEHAVIOR:
 * - Entity count may be the SAME across multiple threshold values
 * - There is NO 1-to-1 mapping between threshold and count
 * - Example: threshold 50→60 might show same count if no entities have scores 50-60
 * 
 * @param entities - Entities with precomputed risk scores
 * @param threshold - Minimum risk score to display (0-100)
 * @returns Filtered entities (scores unchanged)
 */
export function filterByRiskThreshold<T extends { score: number }>(
  entities: T[],
  threshold: number
): T[] {
  // Validate threshold
  if (typeof threshold !== 'number' || threshold < 0 || threshold > 100) {
    console.warn('Invalid risk threshold:', threshold);
    return entities;
  }

  // Filter WITHOUT modifying scores
  return entities.filter(entity => entity.score >= threshold);
}

/**
 * Gets threshold statistics for UI display
 * Shows WHY certain threshold values produce same counts
 */
export function getThresholdStats(scores: number[]) {
  const buckets = {
    low: scores.filter(s => s <= RISK_THRESHOLDS.LOW_MAX).length,
    medium: scores.filter(s => s > RISK_THRESHOLDS.LOW_MAX && s <= RISK_THRESHOLDS.MEDIUM_MAX).length,
    high: scores.filter(s => s >= RISK_THRESHOLDS.HIGH_MIN).length
  };

  return {
    total: scores.length,
    buckets,
    distribution: scores.sort((a, b) => b - a) // Descending order
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 5️⃣ PATTERN FILTER SEMANTICS (VISIBILITY ONLY)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Pattern filter state
 * 
 * CRITICAL: These are VISIBILITY filters ONLY
 * They MUST NOT:
 * - Recompute risk scores
 * - Alter suspicion values
 * - Trigger re-detection
 * - Change ring membership
 */
export interface PatternFilters {
  circular: boolean;         // Show/hide circular transfer patterns
  fanPattern: boolean;       // Show/hide fan-in/fan-out patterns
  rapidPassThrough: boolean; // Show/hide shell/pass-through patterns
}

/**
 * Filters rings by enabled pattern types (VISIBILITY ONLY)
 * 
 * GUARANTEES:
 * - Ring risk scores are UNCHANGED
 * - Ring membership is UNCHANGED
 * - This is purely a view filter
 */
export function filterRingsByPattern(
  rings: Ring[],
  filters: PatternFilters
): Ring[] {
  return rings.filter(ring => {
    const patterns = ring.patterns || [];
    
    // Check if ring contains any enabled pattern
    const hasCircular = patterns.some(p => 
      p.includes('cycle') || p.includes('circular')
    );
    const hasFan = patterns.some(p => 
      p.includes('fan_in') || p.includes('fan_out')
    );
    const hasPassThrough = patterns.some(p => 
      p.includes('shell') || p.includes('pass')
    );

    // Include ring if ANY of its patterns are enabled
    if (hasCircular && filters.circular) return true;
    if (hasFan && filters.fanPattern) return true;
    if (hasPassThrough && filters.rapidPassThrough) return true;

    return false;
  });
}

// ────────────────────────────────────────────────────────────────────────────
// 6️⃣ CONSISTENCY VALIDATION
// ────────────────────────────────────────────────────────────────────────────

/**
 * Validates that risk data is consistent across all representations
 * 
 * USE: Call this during development/testing to catch inconsistencies
 */
export function validateConsistency(
  nodeScore: number,
  displayedScore: number,
  displayedLevel: string,
  displayedLabel: string
): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check numeric consistency
  if (Math.abs(nodeScore - displayedScore) > 0.01) {
    errors.push(`Score mismatch: source=${nodeScore}, display=${displayedScore}`);
  }

  // Check level derivation
  const expectedLevel = getRiskLevel(nodeScore);
  if (displayedLevel !== expectedLevel) {
    errors.push(`Level mismatch: expected=${expectedLevel}, display=${displayedLevel}`);
  }

  // Check label derivation
  const expectedLabel = getRiskLabel(expectedLevel);
  if (displayedLabel !== expectedLabel) {
    errors.push(`Label mismatch: expected=${expectedLabel}, display=${displayedLabel}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 7️⃣ EXPORT SUMMARY
// ────────────────────────────────────────────────────────────────────────────

/**
 * USAGE GUIDE:
 * 
 * 1. Risk Scores:
 *    - Use getRiskInfo(score) to get all risk data
 *    - Display score as numeric, level as label
 * 
 * 2. Ring Risk:
 *    - Use computeRingRisk() during detection
 *    - NEVER recompute on selection/filtering
 * 
 * 3. Account Identity:
 *    - Use formatAccountDisplay() for consistent formatting
 *    - NEVER show role as ID
 * 
 * 4. Thresholds:
 *    - Use filterByRiskThreshold() to filter
 *    - Scores remain unchanged
 * 
 * 5. Pattern Filters:
 *    - Use filterRingsByPattern() for visibility
 *    - NEVER recompute risk
 * 
 * 6. Validation:
 *    - Use validateConsistency() during testing
 *    - Ensure single source of truth
 */
