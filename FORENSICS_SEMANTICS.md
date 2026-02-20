# Financial Forensics Engine - Semantic Correctness Documentation

## Overview

This document defines the **semantic guarantees** enforced by the MuleShield Financial Forensics Engine. These rules ensure correctness, consistency, and analyst trust at all scales.

---

## 1️⃣ Risk Score Definition (GLOBAL, NON-NEGOTIABLE)

### Rule
- **Risk is ALWAYS a numeric score on a 0–100 scale**
- **Risk level (Low / Medium / High) is a DERIVED LABEL, not a score**
- Numeric risk values must be consistent and comparable everywhere

### Implementation
```typescript
// Single source of truth: /src/app/lib/forensics-semantics.ts

// Numeric score (immutable)
const riskScore: number = 68;  // ✅ CORRECT

// Derived label (computed from score)
const riskLevel = getRiskLevel(riskScore);  // Returns: 'medium'
const riskLabel = getRiskLabel(riskLevel);  // Returns: 'Medium Risk'
```

### Thresholds
```typescript
export const RISK_THRESHOLDS = {
  LOW_MAX: 39,      // 0-39 = Low Risk
  MEDIUM_MAX: 69,   // 40-69 = Medium Risk
  HIGH_MIN: 70      // 70-100 = High Risk
} as const;
```

### Display Rules
- **Primary Display**: Show numeric score (e.g., "Risk: 68")
- **Secondary Display**: Show derived label (e.g., "Medium Risk")
- **Never**: Show only label without score

---

## 2️⃣ Ring Risk Definition (MANDATORY)

### Rule
- **Ring risk is a NUMERIC score (0-100)** derived from member accounts
- Uses **pattern-specific formulas** that combine member scores with pattern bonuses
- Each ring computes risk using **its own member set** during detection
- ❌ Ring risk must NOT be a label
- ❌ Ring risk must NOT be recomputed on selection or filtering
- ❌ Ring risk must NOT be ambiguous

### Implementation
```typescript
// Computed ONCE during detection phase using each ring's member set
// Each pattern type has its own formula

// 1. CYCLES:
let risk = (avgScore * 0.6) + (Math.log(members.length + 1) * 10);
if (cycle.length === 3) risk += 15;      // Shorter cycles are more suspicious
else if (cycle.length === 4) risk += 10;
else if (cycle.length === 5) risk += 5;

// 2. FAN-IN:
let risk = (avgScore * 0.5) + (Math.log(fanIn.sources.length + 1) * 8) + 10;

// 3. FAN-OUT:
let risk = (avgScore * 0.5) + (Math.log(fanOut.destinations.length + 1) * 8) + 10;

// 4. SHELL CHAINS:
let risk = (avgScore * 0.5) + (Math.log(members.length + 1) * 7) + 8;

// All clamped to 0-100 range
risk = Math.min(100, Math.max(0, risk));
```

### Pattern-Specific Formulas Explained

Each formula combines:
1. **Base risk from member scores** (average of member suspicion scores)
2. **Pattern-specific bonuses** (e.g., cycle length penalty)
3. **Logarithmic scaling** based on ring size (more members = higher risk)

This approach ensures:
- Similar member scores + different patterns = different ring risks
- Larger rings score higher (more participants = more concerning)
- Specific patterns add contextual risk (e.g., 3-node cycles are extremely suspicious)

### Critical Guarantee
```typescript
// NEVER recomputed during:
// - Ring selection
// - Threshold filtering
// - Pattern filtering
// - Time window changes

// Ring risk is IMMUTABLE after detection phase
```

---

## 3️⃣ Account Identity vs Inference (CRITICAL)

### Rule
- **Account ID** = immutable identifier (e.g., "C1234567890", "ACC_42")
- **Inferred Role** = classification (e.g., "Money Mule", "Hub Account")
- **MUST be displayed separately**
- ❌ "Account ID: Mule" is FORBIDDEN

### Correct Display Format
```typescript
✅ CORRECT:
Account ID: C1234567890
Detected Role: Money Mule (High Confidence)

❌ WRONG:
Account ID: Mule
```

### Implementation
```typescript
// Account identity
const accountId = "C1234567890";  // True identifier from transactions

// Inferred role (separate)
const role = classifyAccountRole(patterns);  
// Returns: { primary: "mule", label: "Money Mule", confidence: "High" }

// Display
<div>Account ID: {accountId}</div>
<div>Detected Role: {role.label} ({role.confidence})</div>
```

---

## 4️⃣ Detection Pattern Toggles (STRICT SEMANTICS)

### Rule
- Pattern toggles (Circular, Fan-in/Fan-out, Rapid Pass-through) are **visibility filters ONLY**
- They **MUST NOT**:
  - Recompute risk scores
  - Alter suspicion values
  - Influence ring detection
  - Trigger re-analysis

### Implementation
```typescript
// Pattern filters are PURE UI state
const [enabledPatterns, setEnabledPatterns] = useState({
  circular: true,
  fanPattern: true,
  rapidPassThrough: true
});

// Used ONLY for display filtering
const visibleRings = filterRingsByPattern(rings, enabledPatterns);

// Risk scores remain UNCHANGED
visibleRings.forEach(ring => {
  assert(ring.risk_score === originalRiskScore);  // ✅ ALWAYS TRUE
});
```

---

## 5️⃣ Threshold Slider Semantics (IMPORTANT)

### Rule
- Risk threshold slider **filters entities, NOT scores**
- Flagged counts represent **number of entities meeting criteria**
- Counts **MAY remain unchanged** across multiple threshold values
- **NO assumption** of 1-to-1 mapping between threshold and count

### Valid Behavior Example
```typescript
// VALID: Same count across different thresholds
Threshold 50 → 147 flagged accounts
Threshold 55 → 147 flagged accounts  // ✅ CORRECT if no scores in 50-55 range
Threshold 60 → 142 flagged accounts
```

### Implementation
```typescript
// Filtering WITHOUT modifying scores
function filterByRiskThreshold<T extends { score: number }>(
  entities: T[],
  threshold: number
): T[] {
  return entities.filter(entity => entity.score >= threshold);
  // Scores remain UNCHANGED
}
```

---

## 6️⃣ Large-Data Safety (NO EXCEPTIONS)

### Rules
The system **MUST NEVER**:
- Load full datasets into memory at once
- Stringify massive objects in one pass
- Render full graphs automatically

### Enforced Limits
```typescript
// Chunked ingestion
const CHUNK_SIZE = 2_000;  // Transactions per chunk

// Rendering limits
const MAX_NODES = 1_500;   // Maximum nodes rendered in graph
const MAX_EDGES = 8_000;   // Maximum edges rendered

// Display caps
const MAX_TX_PER_NODE = 50;      // Transaction objects per node (UI only)
const MAX_STORED_EDGES = 10_000; // Edge data stored for Cytoscape

// Ring list
const MAX_VISIBLE_RINGS = 100;   // Rings shown in UI list
```

### Implementation
```typescript
// Chunked processing
for (let i = 0; i < transactions.length; i += CHUNK_SIZE) {
  engine.addChunk(transactions.slice(i, i + CHUNK_SIZE));
  await new Promise(resolve => setTimeout(resolve, 0));  // Yield to UI
}

// Limited rendering
const topNodes = suspiciousNodes
  .sort((a, b) => b.score.total - a.score.total)
  .slice(0, MAX_NODES);
```

---

## 7️⃣ Rendering Discipline

### Rule
Initial graph render **MUST be limited to**:
- Top-risk entities (sorted by score)
- Selected rings (user interaction)
- User-filtered subsets (explicit filters)

### Forbidden
❌ Full-graph rendering without explicit user interaction

### Implementation
```typescript
// Graph rendering strategy
if (selectedRingId) {
  // Render only selected ring members
  renderNodes = ringNodes;
} else {
  // Render top N by risk score
  renderNodes = suspiciousNodes
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, MAX_NODES);
}
```

---

## 8️⃣ Consistency Enforcement (REQUIRED)

### Rule
For **ANY entity or ring**, these values **MUST be identical** across:
- Graph nodes
- Tooltips
- Inspector panels
- Tables
- Exports
- History

### Guarantees
- ✅ **No duplicated logic** → Use `forensics-semantics.ts` functions
- ✅ **No stale data** → Single source of truth
- ✅ **Single computation** → Precompute during detection

### Validation
```typescript
// During development/testing
const consistency = validateConsistency(
  nodeScore,        // Source score
  displayedScore,   // Displayed score
  displayedLevel,   // Displayed level
  displayedLabel    // Displayed label
);

if (!consistency.valid) {
  console.error('Consistency violation:', consistency.errors);
}
```

---

## Implementation Files

### Core Semantic Engine
- **`/src/app/lib/forensics-semantics.ts`** - Single source of truth for all rules
- **`/src/app/lib/risk-utils.ts`** - Re-exports for backward compatibility
- **`/src/app/lib/graph-engine.ts`** - Uses `computeRingRisk()` for ring risk
- **`/src/app/lib/chunked-uploader.ts`** - Uses `computeRingRisk()` for ring risk

### UI Components
- **`/src/app/components/TransactionIntelligence.tsx`** - Shows ID/role separation
- **`/src/app/components/RingList.tsx`** - Displays precomputed ring risk
- **`/src/app/components/GraphView.tsx`** - Uses `getRiskLevel()` for colors
- **`/src/app/components/PatternFilters.tsx`** - Visibility filters only

---

## Acceptance Criteria

After implementation:

✅ "Risk 68" is **always** understood as **68 points** (numeric)
✅ Ring risk is **numeric**, **defined**, and **auditable**
✅ Pattern toggles **never** imply recomputation
✅ Account identity is **never** polluted by inference
✅ Large datasets **do not crash** APIs or browsers
✅ UI behavior is **stable** at small and large scale
✅ Analysts can **trust** what they see without guessing

---

## End Goal

The system communicates:
- **WHO** is risky (account IDs)
- **WHY** they are risky (patterns, scores)
- **HOW** entities are related (rings, networks)

**Clearly, deterministically, and safely at scale.**

---

## Testing Checklist

### Manual Validation
- [ ] Upload small dataset (< 10K tx) → verify all scores are numeric
- [ ] Upload large dataset (> 100K tx) → verify no crashes, limited rendering
- [ ] Toggle patterns → verify risk scores don't change
- [ ] Adjust threshold → verify scores don't change
- [ ] Select ring → verify ring risk matches displayed value everywhere
- [ ] Inspect account → verify ID and role are separate

### Automated Validation
```typescript
// Add to test suite
describe('Semantic Correctness', () => {
  it('should maintain numeric risk scores', () => {
    const result = analyzeTransactions(testData);
    result.suspicious_nodes.forEach(node => {
      expect(typeof node.score.total).toBe('number');
      expect(node.score.total).toBeGreaterThanOrEqual(0);
      expect(node.score.total).toBeLessThanOrEqual(100);
    });
  });

  it('should use consistent ring risk aggregation', () => {
    const result = analyzeTransactions(testData);
    result.rings.forEach(ring => {
      const members = ring.nodes.map(id => 
        result.suspicious_nodes.find(n => n.id === id)
      );
      const computed = computeRingRisk(members);
      expect(Math.abs(ring.risk_score - computed)).toBeLessThan(0.1);
    });
  });
});
```

---

**Version:** 1.0.0  
**Last Updated:** 2026-02-19  
**Maintainer:** MuleShield Forensics Team
