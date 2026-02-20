# Avg Ring Risk Computation Fix

## Problem Statement

The "Avg Ring Risk" metric was being computed from **filtered ring views** instead of the **full detection output**, causing incorrect behavior:

❌ **Before Fix:**
- Pattern filters active → Avg Ring Risk computed from filtered rings
- All patterns disabled → Avg Ring Risk showed 0.0 (even when rings were detected)
- Clicking pattern toggles → Avg Ring Risk changed dynamically

This violated the critical principle: **Global detection metrics must be independent of view-layer filters.**

---

## Root Cause

**File:** `/src/app/App.tsx` (Line 648)

```tsx
// ❌ INCORRECT: StatsPanel received filtered data
<StatsPanel data={filteredData || data} />
```

**Explanation:**
- `filteredData` contains rings filtered by pattern visibility (line 379-381)
- When `filteredData.rings` had fewer rings (or zero), `StatsPanel` computed average from the filtered subset
- When all patterns were disabled, `filteredData` equaled `data`, but this was inconsistent behavior

---

## Solution

**File:** `/src/app/App.tsx` (Line 648)

```tsx
// ✅ CORRECT: StatsPanel receives full detection output
<StatsPanel data={data} />
```

**Explanation:**
- `data` contains the complete, unfiltered detection output from the backend
- `data.rings` includes **all detected fraud rings** regardless of pattern filters
- `StatsPanel` now computes metrics from the full detection dataset

---

## Implementation Details

### Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Detection Phase (Backend)                                   │
│ ─────────────────────────────────────────────────────────── │
│ Input: CSV transactions                                     │
│ Output: data = {                                            │
│   suspicious_nodes: [...],  // ALL detected entities        │
│   rings: [...],             // ALL detected fraud rings     │
│   edges: [...],             // ALL transaction edges        │
│   metadata: { total_transactions, total_volume }            │
│ }                                                            │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ View Filtering Phase (Frontend)                             │
│ ─────────────────────────────────────────────────────────── │
│ Input: data + enabledPatterns                               │
│ Output: filteredData = {                                    │
│   suspicious_nodes: [...],  // Filtered by patterns         │
│   rings: [...],             // Filtered by visible nodes    │
│   edges: [...],             // Filtered by visible nodes    │
│   metadata: { ... }         // Same (not filtered)          │
│ }                                                            │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ Rendering Phase                                             │
│ ─────────────────────────────────────────────────────────── │
│ StatsPanel        → USES: data (full detection)             │
│ GraphView         → USES: filteredData (visible entities)   │
│ RingList          → USES: filteredData (visible rings)      │
│ AlertsPanel       → USES: filteredData (visible alerts)     │
│ PatternFilters    → USES: filteredData.length + data.length │
└─────────────────────────────────────────────────────────────┘
```

### Key Principle: Separation of Concerns

**Detection Metrics (MUST use `data`):**
- Total Transactions → `data.metadata.total_transactions`
- Suspicious Entities Count → `data.suspicious_nodes.length`
- Fraud Rings Detected → `data.rings.length`
- **Avg Ring Risk → `data.rings.reduce(...) / data.rings.length`**
- Detection F1 Score → `data.ground_truth.f1Score`

**View Metrics (CAN use `filteredData`):**
- Visible Nodes → `filteredData.suspicious_nodes.length`
- Flagged Count (above threshold) → `filteredData.suspicious_nodes.filter(...)`
- Matching Pattern Count → shown in `PatternFilters` component
- Empty State Detection → `filteredData.suspicious_nodes.length === 0`

---

## Verification: StatsPanel Computation

**File:** `/src/app/components/StatsPanel.tsx` (Lines 10-18)

```tsx
const stats = useMemo(() => {
  if (!data) return null;
  const totalSuspicious = data.suspicious_nodes.length;
  const totalRings = data.rings.length;
  const avgRisk = totalRings > 0
    ? data.rings.reduce((sum, r) => sum + r.risk_score, 0) / totalRings
    : 0;
  return { totalSuspicious, totalRings, avgRisk };
}, [data]);
```

✅ **Correct Behavior:**
- Uses `data.rings` directly (all detected rings)
- Computes average: `sum(risk_scores) / count(rings)`
- Returns `0` only when `totalRings === 0` (legitimate case)

---

## Acceptance Criteria

### ✅ Before Analysis
- StatsPanel not rendered (no data)

### ✅ After Analysis Completes
- **Avg Ring Risk shows non-zero value** (if rings detected)
- Value computed from `data.rings` (full detection output)
- Example: If 5 rings detected with scores [75, 82, 68, 90, 77]:
  - Avg Ring Risk = (75 + 82 + 68 + 90 + 77) / 5 = **78.4/100**

### ✅ When Pattern Filters Applied
- **Avg Ring Risk DOES NOT change**
- GraphView shows fewer nodes (filtered)
- RingList shows fewer rings (filtered)
- But StatsPanel metrics remain constant

### ✅ When All Patterns Disabled
- **Avg Ring Risk DOES NOT change**
- GraphView shows all nodes
- RingList shows all rings
- StatsPanel metrics remain constant

### ✅ Only Changes When:
1. New CSV uploaded → new detection run → new `data.rings`
2. Detection algorithm updated → different ring scores
3. **NEVER** when filters toggle

---

## Testing Scenarios

### Scenario 1: Detection with Rings
```
1. Upload CSV with fraud patterns
2. Analysis completes → data.rings = [ring1, ring2, ring3]
3. StatsPanel shows: "Avg Ring Risk: 78.4/100"
4. Toggle pattern filters ON/OFF
5. ✅ Avg Ring Risk stays 78.4/100
```

### Scenario 2: Detection without Rings
```
1. Upload CSV with no fraud patterns
2. Analysis completes → data.rings = []
3. StatsPanel shows: "Avg Ring Risk: 0.0/100"
4. Toggle pattern filters ON/OFF
5. ✅ Avg Ring Risk stays 0.0/100
```

### Scenario 3: Pattern Filter Sequence
```
1. Upload PaySim1 dataset
2. Analysis completes → 3 rings detected
3. Initial view: Avg Ring Risk = 72.3/100
4. Disable "Circular Transfers" filter
5. ✅ Avg Ring Risk = 72.3/100 (unchanged)
6. Enable only "Fan-in/Fan-out" filter
7. ✅ Avg Ring Risk = 72.3/100 (unchanged)
8. Disable all filters
9. ✅ Avg Ring Risk = 72.3/100 (unchanged)
```

---

## Related Components Verified

### ✅ Correct Usage of `data` (full detection)
- **StatsPanel** → Always uses `data` (FIXED)
- **GroundTruthPanel** → Uses `data.ground_truth` (detection metrics)
- **TransactionIntelligence** → Uses `data` (full transaction history)
- **handleDownloadJSON** → Uses `data` (exports full detection)

### ✅ Correct Usage of `filteredData` (view layer)
- **GraphView** → Uses `filteredData` (renders visible nodes/edges)
- **RingList** → Uses `filteredData.rings` (shows visible rings)
- **AlertsPanel** → Uses `filteredData` (shows visible alerts)
- **PatternFilters** → Uses both (`filteredData.length` vs `data.length`)
- **Empty State Check** → Uses `filteredData.suspicious_nodes.length === 0`

---

## Semantic Guarantee

**After this fix:**

```typescript
// INVARIANT: Global detection metrics are immutable given fixed input data
const globalMetrics = {
  totalTransactions: data.metadata.total_transactions,
  suspiciousEntities: data.suspicious_nodes.length,
  fraudRings: data.rings.length,
  avgRingRisk: average(data.rings.map(r => r.risk_score)),
  detectionF1: data.ground_truth?.f1Score,
};

// These metrics:
// ✅ Depend ONLY on backend detection output
// ✅ Are independent of pattern filters
// ✅ Are independent of risk threshold slider
// ✅ Are independent of time window selection
// ✅ Are independent of graph display mode
// ✅ Change ONLY when new data is analyzed
```

---

## Files Changed

| File | Line | Change | Reason |
|------|------|--------|--------|
| `/src/app/App.tsx` | 648 | `<StatsPanel data={data} />` | Use full detection output, not filtered view |

---

## Documentation

This fix is documented in:
- `/AVG_RING_RISK_FIX.md` (this file)
- `/EXECUTION_ORDER_AND_DATA_BINDING.md` (reference to detection vs. view separation)
- `/PATTERN_FILTERING.md` (clarifies filters don't affect metrics)

---

## Impact Summary

**Before Fix:**
- ❌ Avg Ring Risk changed when pattern filters toggled
- ❌ Could show 0.0 even when rings were detected
- ❌ Metric depended on view state (semantic violation)

**After Fix:**
- ✅ Avg Ring Risk constant after analysis
- ✅ Shows correct average from all detected rings
- ✅ Independent of view-layer filters (semantic correctness)

**Result:** Global detection metrics now have consistent, predictable behavior aligned with the principle that **detection output is immutable once computed**.
