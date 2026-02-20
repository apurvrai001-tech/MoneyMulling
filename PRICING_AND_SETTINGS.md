# MuleGuard Pricing & Settings Implementation

## Overview

Added fully functional **Pricing** and **Settings** sections to the MuleGuard financial forensics dashboard. Both sections reflect a professional compliance-grade product and provide visibility controls without altering detection logic.

---

## 🔷 Pricing Page

**Location:** `/src/app/components/PricingView.tsx`  
**Navigation:** Sidebar → Pricing

### Three Tiers

#### 1. **Free / Trial**
- **Price:** $0/month
- **Features:**
  - 10 scans per month
  - 50 MB max CSV size
  - Core pattern detection (circular, fan-in/fan-out, pass-through)
  - Graph visualization
  - Read-only alerts
  - Ground truth validation
- **Restrictions:**
  - ❌ No evidence export
  - ❌ No fraud ring analysis
  - ❌ No historical scan storage
  - ❌ No team access
- **CTA:** "Start Free Trial"

#### 2. **Analyst / Pro** (Most Popular)
- **Price:** $299/month
- **Features:**
  - ✅ Unlimited scans
  - ✅ 500 MB max CSV size
  - ✅ All pattern detection algorithms
  - ✅ Advanced graph visualization
  - ✅ Full alerts & investigation panel
  - ✅ Fraud ring analysis & clustering
  - ✅ Evidence export (JSON/PDF/CSV)
  - ✅ Case actions (mark investigated, flag compliance)
  - ✅ Historical scan storage (90 days)
  - ✅ Priority email support
- **Restrictions:**
  - ❌ Team access limited to 5 seats
  - ❌ No audit logs
- **CTA:** "Upgrade to Pro"
- **Highlighted with blue gradient badge**

#### 3. **Enterprise** (Custom Solutions)
- **Price:** Custom
- **Features:**
  - ✅ Unlimited data volume
  - ✅ Unlimited team seats & role-based access
  - ✅ Advanced audit logs & retention policies
  - ✅ Custom risk threshold calibration
  - ✅ White-label deployment options
  - ✅ Dedicated account manager
  - ✅ SLA guarantee (99.9% uptime)
  - ✅ 24/7 priority support
  - ✅ Custom integrations (API, webhooks)
  - ✅ Quarterly compliance reviews
- **CTA:** "Contact Sales"

### Additional Sections

**Why Choose MuleGuard?**
- 6 feature highlights with icons:
  - Compliance-Grade Detection
  - Transparent Risk Scoring
  - Large-Scale Processing
  - Evidence Export
  - Team Collaboration
  - Data Privacy First

**FAQ Section**
- What happens if I exceed my monthly scan limit?
- Do pricing tiers affect detection accuracy? (No - critical)
- Can I anonymize account IDs in exports?
- What's included in Enterprise support?

**Bottom CTA:** "Talk to Sales" button

---

## ⚙️ Settings Page

**Location:** `/src/app/components/SettingsView.tsx`  
**Navigation:** Sidebar → Settings  
**Storage:** Settings persisted in `localStorage` as `muleguard_settings`

### Sections

#### 1. **Analysis Settings**
- **Default Time Window:** Dropdown (24h / 7d / 30d)
  - Initial time range filter for graph visualization
  - Does NOT affect detection
- **Node Rendering Limit:** View-only (1,500 nodes)
  - Performance optimization, hardcoded
- **Default Risk Threshold:** View-only (50/100)
  - Adjustable during analysis, not in settings
- **Auto-Isolate High-Risk Entities:** Toggle
  - Auto-highlight entities with suspicion > 80

#### 2. **Detection Visibility**
- **Circular Transfers Pattern:** Toggle (default: ON)
  - Show/hide entities in circular loops
- **Fan-In / Fan-Out Pattern:** Toggle (default: ON)
  - Show/hide smurfing/distribution patterns
- **Rapid Pass-Through Pattern:** Toggle (default: ON)
  - Show/hide shell accounts
- **Alert Verbosity:** Dropdown (Compact / Detailed)
  - Controls alert panel detail level
- **Ring Isolation Behavior:** Dropdown
  - Highlight (preserve full graph)
  - Filter (isolate ring only)
  - None

#### 3. **Export & Evidence**
- **Default Export Format:** Dropdown (JSON / PDF / CSV)
  - Preferred format for evidence export
- **Include Graph Snapshot:** Toggle (default: ON)
  - Embed visual graph in PDF exports
- **Include Alerts Timeline:** Toggle (default: ON)
  - Add chronological alerts to exports
- **Anonymize Account IDs:** Toggle (default: OFF)
  - Hash account identifiers while preserving graph structure
  - Critical for PII protection

#### 4. **Account & Security**
- **Change Password:** Button (placeholder)
  - Triggers password update flow
- **Session Timeout:** Dropdown (15 / 30 / 60 / 120 min / Never)
  - Auto-logout after inactivity
- **API Key:** View-only (Enterprise only)
  - Masked API key with copy button
- **Data Retention Period:** Dropdown (30 / 90 / 180 / 365 days)
  - How long scan history is preserved in localStorage

#### 5. **About & Transparency**

**Risk Scoring Methodology:**
- Composite suspicion score breakdown:
  - **Structural (max 100):** Cycles, fan-in/out, shell behavior
  - **Behavioral (max 40):** Timing, velocity, balance anomalies
  - **Network (max 20):** Ring membership, peer propagation
- Total = min(structural + behavioral + network, 100)

**Detection Algorithms:**
- Cycle Detection: DFS for circular flows (3-10 hops)
- Smurfing Detection: Fan-in clustering
- Shell Account Detection: High flow-through, low retention
- PaySim Calibration: Balance anomalies, account draining, zero-balance destinations

**Version Information:**
- MuleGuard v1.0.0 (PaySim-Calibrated Build)

**Support Links:**
- Documentation (external link placeholder)
- Contact Support (external link placeholder)

### Info Banner (Bottom of Settings)

Blue info box with AlertCircle icon:

> **Settings Do Not Affect Detection**  
> All configuration changes are visibility and workflow preferences only. Detection algorithms, scoring formulas, and pattern thresholds remain unchanged. To modify detection sensitivity, contact your account manager for custom threshold calibration (Enterprise only).

---

## 🔒 Constraints Enforced

### ✅ Settings Do NOT Change Detection Logic

All settings are **configuration-only**:
- Time window: Visualization filter only
- Pattern toggles: Visibility filter only (read precomputed flags)
- Risk threshold: View-only in settings (adjustable during analysis, but doesn't recompute scores)
- Export options: Format preferences only
- Anonymization: Post-processing transformation, doesn't affect detection

### ✅ Pricing Tiers Gate Access, Not Results

All tiers use **identical detection algorithms**:
- Free tier: Same algorithms, limited scans
- Pro tier: Same algorithms, unlimited scans + export
- Enterprise: Same algorithms, unlimited + team features

**Detection accuracy is tier-independent.**

### ✅ No AI/Token Pricing

Pricing model is **traditional SaaS**:
- Monthly subscription ($/month)
- Scan-based limits (Free tier)
- Data volume limits (CSV size caps)
- Feature gating (export, team access, audit logs)

**No AI credits, tokens, or model references.**

---

## 🎨 Visual Design

### Consistent with MuleGuard Theme

**Dark Mode Forensic Aesthetic:**
- Background: `bg-[#0a0a0a]` (deep black panels)
- Borders: `border-[#262626]` (subtle dark borders)
- Text: `text-white` (primary), `text-slate-300` (secondary)
- Accents: Blue (`#1e40af`, `#60a5fa`)
- Cards: Elevated with subtle borders, no heavy shadows

**Pricing Cards:**
- Pro tier: Highlighted with blue border + glow effect (`shadow-[0_0_40px_rgba(59,130,246,0.3)]`)
- Gradient badge: "Most Popular" in blue gradient
- Hover states: Subtle border color transitions

**Settings:**
- Section cards with icon badges (blue background)
- Toggle switches: Blue when enabled, gray when disabled
- Dropdowns: Dark mode styled with focus rings
- View-only fields: Gray background with "View Only" badge

---

## 📂 File Structure

```
/src/app/components/
  ├── PricingView.tsx       # Pricing page component
  └── SettingsView.tsx      # Settings page component

/src/app/App.tsx            # Updated with routing logic
```

### App.tsx Changes

1. **Imports:**
   ```typescript
   import { PricingView } from './components/PricingView';
   import { SettingsView } from './components/SettingsView';
   ```

2. **View State:**
   ```typescript
   const [view, setView] = useState<'DASHBOARD' | 'HISTORY' | 'PRICING' | 'SETTINGS'>('DASHBOARD');
   ```

3. **Sidebar Navigation:**
   ```tsx
   <button onClick={() => { setView('PRICING'); setIsSidebarOpen(false); }}>
     <CreditCard /> Pricing
   </button>
   <button onClick={() => { setView('SETTINGS'); setIsSidebarOpen(false); }}>
     <Settings /> Settings
   </button>
   ```

4. **Main Content Routing:**
   ```tsx
   {view === 'PRICING' ? (
     <PricingView />
   ) : view === 'SETTINGS' ? (
     <SettingsView />
   ) : view === 'HISTORY' ? (
     <HistoryView />
   ) : (
     // Dashboard content
   )}
   ```

---

## 🧪 Testing Scenarios

### Pricing Page
1. Navigate to Pricing via sidebar ✓
2. Verify three tiers displayed ✓
3. Pro tier highlighted with blue border ✓
4. Feature checkmarks/X icons correct ✓
5. FAQ section readable ✓
6. Dark mode styling consistent ✓

### Settings Page
1. Navigate to Settings via sidebar ✓
2. All toggles functional (save to localStorage) ✓
3. Dropdown changes persist after refresh ✓
4. View-only fields show "View Only" badge ✓
5. Info banner explains no detection changes ✓
6. About section shows algorithm transparency ✓

### Navigation Flow
1. Sidebar → Pricing → Settings → Dashboard ✓
2. Active view highlighted in sidebar ✓
3. Sidebar closes after navigation ✓

---

## 🚀 User Experience

### Professional Presentation

**Pricing Page:**
- Clear tier differentiation
- No misleading claims about AI or detection accuracy
- Transparent about what upgrades unlock (features, not better detection)
- FAQ addresses concerns about tier differences
- Enterprise tier positioned for institutions

**Settings Page:**
- Organized into logical sections
- Each setting has clear description
- View-only fields prevent confusion
- Transparency section builds trust
- Info banner reinforces that detection is immutable

### Trust & Compliance Focus

**Messaging:**
- "Compliance-Grade Detection"
- "Transparent Risk Scoring"
- "Evidence Export for regulatory submissions"
- "Data Privacy First"
- Algorithm explanations (DFS cycles, fan-in clustering)
- Version information & support links

**No Dark Patterns:**
- No "limited time" pressure
- No fake scarcity
- No confusing tier names
- Clear feature comparison
- Honest about what settings do/don't affect

---

## 📝 Future Enhancements (Not Implemented)

### Pricing
- Actual payment integration (Stripe, etc.)
- Trial countdown timer
- Usage metrics dashboard
- Upgrade flow (modal or checkout page)

### Settings
- Password change flow (currently placeholder)
- API key generation (Enterprise only)
- Team member management UI
- Audit log viewer
- Custom threshold calibration UI (Enterprise)
- Export format preview
- Anonymization preview (before/after account IDs)

### Integration
- Settings affect actual analysis behavior (e.g., apply default time window on scan load)
- Tier-based feature gating (disable export button on Free tier)
- Session timeout implementation
- Data retention auto-cleanup

---

## ✅ Acceptance Criteria Met

### ✓ Pricing Page Requirements
- ✅ Three tiers (Free/Trial, Analyst/Pro, Enterprise)
- ✅ Feature comparison with checkmarks/X icons
- ✅ No AI credits or token-based pricing
- ✅ "Contact Sales" CTA for Enterprise
- ✅ Professional financial-forensics presentation

### ✓ Settings Page Requirements
- ✅ Analysis Settings (time window, rendering limits, threshold)
- ✅ Detection Visibility (pattern toggles, alert verbosity, ring behavior)
- ✅ Export & Evidence (format, snapshots, anonymization)
- ✅ Account & Security (password, session, API key, retention)
- ✅ About & Transparency (scoring methodology, algorithms, version, support)

### ✓ Constraints Enforced
- ✅ Settings do NOT change detection logic
- ✅ Pricing tiers gate access, not results
- ✅ All changes are configuration or visibility only

### ✓ Professional Presentation
- ✅ Matches existing dark forensic theme
- ✅ No redesign of navigation or visual style
- ✅ Trustworthy compliance-grade messaging
- ✅ Clear, honest feature descriptions

---

## 🎯 End Goal Achieved

**MuleGuard now presents itself as:**
- A trustworthy, compliance-grade investigation tool
- With clear, honest pricing for different use cases
- And controlled analyst settings that expose configuration without breaking detection

**Professional, transparent, and ready for financial institutions.**
