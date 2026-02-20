# Pattern Filtering Implementation

## Overview

Pattern toggles in the Detection Patterns section are **real functional filters** that control visibility across the entire application. They are NOT cosmetic toggles.

## How It Works

### 1. Source of Truth

Pattern membership is determined during the detection phase and stored in:
```typescript
suspiciousNode.score.details.patterns: string[]
```

**Available pattern flags:**
- `'cycle'` - Node participates in circular money flows (Circular Transfers)
- `'fan_in'` - Node receives from many sources (Fan-in Pattern)
- `'fan_out'` - Node distributes to many destinations (Fan-out Pattern)
- `'shell'` - Node has high flow-through ratio (Rapid Pass-through)

### 2. Pattern Mapping

**UI Toggle → Pattern Flags:**
- ✅ **Circular Transfers** → filters for nodes with `'cycle'` pattern
- ✅ **Fan-in / Fan-out Patterns** → filters for nodes with `'fan_in'` OR `'fan_out'` pattern
- ✅ **Rapid Pass-through** → filters for nodes with `'shell'` pattern

### 3. Filter Logic

**When NO patterns are enabled:**
- Shows ALL nodes, edges, and rings (unfiltered view)

**When ONE or MORE patterns are enabled:**
- Filters `suspicious_nodes` to only those matching **ALL** selected patterns (AND logic)
- Filters `rings` to only those containing at least one visible node
- Filters `edges` to only those where BOTH source AND target are visible

**Example:**
- Circular ✓ + Fan-out ✓ = Shows ONLY nodes that have BOTH `'cycle'` AND `'fan_out'` patterns
- Circular ✗ + Fan-out ✓ = Shows ALL nodes with `'fan_out'` (includes `'fan_in'` too)

### 4. Synchronization

All components receive the **same filtered data**:
- ✅ **GraphView** - renders only filtered nodes/edges
- ✅ **FraudRingSelector** - shows only filtered rings
- ✅ **AlertsPanel** - shows alerts only for filtered nodes
- ✅ **StatsPanel** - stats computed from filtered data
- ✅ **RingList** - displays only filtered rings

### 5. Empty State

When filters result in zero matching entities:
- Shows "No Matching Entities" message
- Suggests disabling some filters
- Visual indicator shows `0 / N` count

### 6. Visual Feedback

**Active Filter Indicator:**
- Pattern toggle shows matching count: `125 / 450` (125 matches out of 450 total)
- Green = matches found
- Red = zero matches

## Critical Guarantees

### ✅ DO:
- Filter using precomputed `score.details.patterns` flags
- Apply filters synchronously across all components
- Use AND logic for multiple active patterns
- Show empty state when no matches

### ❌ DO NOT:
- Re-run detection algorithms
- Recompute risk scores
- Infer patterns dynamically from node metrics
- Use visual heuristics

## Implementation Details

**Location:** `/src/app/App.tsx`

**Key Function:**
```typescript
const filteredData = useMemo(() => {
  if (!data) return null;
  
  // Check if any patterns are active
  const hasActivePatterns = 
    enabledPatterns.circular || 
    enabledPatterns.fanPattern || 
    enabledPatterns.rapidPassThrough;
  
  if (!hasActivePatterns) {
    return data; // No filtering
  }

  // Filter suspicious nodes by pattern membership
  const filteredSuspiciousNodes = data.suspicious_nodes.filter(suspNode => {
    const patterns = suspNode.score.details?.patterns || [];
    let matches = true;

    if (enabledPatterns.circular) {
      matches = matches && patterns.includes('cycle');
    }
    if (enabledPatterns.fanPattern) {
      matches = matches && (patterns.includes('fan_in') || patterns.includes('fan_out'));
    }
    if (enabledPatterns.rapidPassThrough) {
      matches = matches && patterns.includes('shell');
    }

    return matches;
  });

  // Create visibility set
  const visibleNodeIds = new Set(filteredSuspiciousNodes.map(n => n.id));

  // Filter rings and edges accordingly
  // ...

  return { ...data, suspicious_nodes, rings, edges };
}, [data, enabledPatterns]);
```

## Testing Checklist

- [ ] Toggling Circular Transfers shows only cycle nodes
- [ ] Toggling Fan patterns shows only fan_in/fan_out nodes
- [ ] Toggling Rapid Pass-through shows only shell nodes
- [ ] Multiple toggles use AND logic correctly
- [ ] Graph updates immediately when toggle changes
- [ ] Ring list updates immediately
- [ ] Alerts panel updates immediately
- [ ] Stats panel reflects filtered counts
- [ ] Empty state appears when no matches
- [ ] Disabling all toggles restores full view
- [ ] No recomputation or score changes occur
- [ ] Filter count indicator shows correct numbers
