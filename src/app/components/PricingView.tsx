import React, { memo } from 'react';
import { Check, X, Shield, Users, Database, LineChart, FileText, Clock, Headphones, Lock } from 'lucide-react';

interface PricingTier {
  name: string;
  subtitle: string;
  price: string;
  period: string;
  description: string;
  features: Array<{ text: string; included: boolean }>;
  cta: string;
  highlighted?: boolean;
}

const tiers: PricingTier[] = [
  {
    name: 'Free / Trial',
    subtitle: 'Get Started',
    price: '$0',
    period: '/month',
    description: 'Essential fraud detection for small teams and evaluation purposes.',
    features: [
      { text: '10 scans per month', included: true },
      { text: '50 MB max CSV size', included: true },
      { text: 'Core pattern detection (circular, fan-in/fan-out, pass-through)', included: true },
      { text: 'Graph visualization', included: true },
      { text: 'Read-only alerts', included: true },
      { text: 'Ground truth validation', included: true },
      { text: 'Evidence export (JSON/PDF)', included: false },
      { text: 'Fraud ring analysis', included: false },
      { text: 'Historical scan storage', included: false },
      { text: 'Team access', included: false },
    ],
    cta: 'Start Free Trial',
  },
  {
    name: 'Analyst / Pro',
    subtitle: 'Most Popular',
    price: '$299',
    period: '/month',
    description: 'Full-featured professional toolkit for compliance analysts and investigators.',
    features: [
      { text: 'Unlimited scans', included: true },
      { text: '500 MB max CSV size', included: true },
      { text: 'All pattern detection algorithms', included: true },
      { text: 'Advanced graph visualization', included: true },
      { text: 'Full alerts & investigation panel', included: true },
      { text: 'Fraud ring analysis & clustering', included: true },
      { text: 'Evidence export (JSON/PDF/CSV)', included: true },
      { text: 'Case actions (mark investigated, flag compliance)', included: true },
      { text: 'Historical scan storage (90 days)', included: true },
      { text: 'Priority email support', included: true },
      { text: 'Team access (up to 5 seats)', included: false },
      { text: 'Audit logs & compliance reports', included: false },
    ],
    cta: 'Upgrade to Pro',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    subtitle: 'Custom Solutions',
    price: 'Custom',
    period: '',
    description: 'Tailored for financial institutions and large-scale AML operations.',
    features: [
      { text: 'Unlimited data volume', included: true },
      { text: 'Unlimited team seats & role-based access', included: true },
      { text: 'Advanced audit logs & retention policies', included: true },
      { text: 'Custom risk threshold calibration', included: true },
      { text: 'White-label deployment options', included: true },
      { text: 'Dedicated account manager', included: true },
      { text: 'SLA guarantee (99.9% uptime)', included: true },
      { text: '24/7 priority support', included: true },
      { text: 'Custom integrations (API, webhooks)', included: true },
      { text: 'Quarterly compliance reviews', included: true },
    ],
    cta: 'Contact Sales',
  },
];

const PricingCard = memo(function PricingCard({ tier }: { tier: PricingTier }) {
  const [clicked, setClicked] = React.useState(false);

  const handleCTA = () => {
    setClicked(true);
    setTimeout(() => setClicked(false), 2000);
  };

  return (
    <div
      className={`relative bg-[#0a0a0a] rounded-xl p-8 flex flex-col transition-all duration-300 ${tier.highlighted
          ? 'border-2 border-blue-500 shadow-[0_0_40px_rgba(59,130,246,0.2)] scale-105'
          : 'border border-[#262626] hover:border-[#404040]'
        }`}
    >
      {tier.highlighted && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-blue-600 to-blue-500 text-white text-xs font-semibold rounded-full shadow-lg">
          {tier.subtitle}
        </div>
      )}

      <div className="mb-6">
        <h3 className="text-2xl font-bold text-white mb-1">{tier.name}</h3>
        {!tier.highlighted && <p className="text-sm text-slate-400">{tier.subtitle}</p>}
      </div>

      <div className="mb-6">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-bold text-white">{tier.price}</span>
          {tier.period && <span className="text-slate-400">{tier.period}</span>}
        </div>
        <p className="text-sm text-slate-300 mt-2">{tier.description}</p>
      </div>

      <button
        onClick={handleCTA}
        className={`w-full py-3 px-4 rounded-lg font-semibold transition-all duration-200 mb-8 ${clicked
            ? 'bg-emerald-600 text-white'
            : tier.highlighted
              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30'
              : 'bg-[#171717] hover:bg-[#262626] text-white border border-[#262626]'
          }`}
      >
        {clicked ? (tier.name === 'Enterprise' ? 'Sales team will reach out!' : 'Added to waitlist!') : tier.cta}
      </button>

      <div className="flex-1 space-y-3">
        {tier.features.map((feature, idx) => (
          <div key={idx} className="flex items-start gap-3">
            {feature.included ? (
              <Check className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
            ) : (
              <X className="w-5 h-5 text-slate-600 shrink-0 mt-0.5" />
            )}
            <span
              className={`text-sm ${feature.included
                  ? 'text-slate-200'
                  : 'text-slate-500 line-through'
                }`}
            >
              {feature.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});

const FeatureHighlight = memo(function FeatureHighlight({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="p-3 bg-blue-900/20 rounded-lg text-blue-400 shrink-0">
        {icon}
      </div>
      <div>
        <h4 className="text-base font-semibold text-white mb-1">{title}</h4>
        <p className="text-sm text-slate-300">{description}</p>
      </div>
    </div>
  );
});

export const PricingView = memo(function PricingView() {
  const [salesClicked, setSalesClicked] = React.useState(false);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="mb-12 text-center max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-4">
          Professional Fraud Detection Pricing
        </h1>
        <p className="text-lg text-slate-300">
          Choose the plan that fits your compliance and investigation needs. All plans include our core PaySim-calibrated detection algorithms.
        </p>
      </div>

      {/* Pricing Tiers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
        {tiers.map((tier) => (
          <PricingCard key={tier.name} tier={tier} />
        ))}
      </div>

      {/* Feature Highlights */}
      <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl p-8 mb-12">
        <h2 className="text-2xl font-bold text-white mb-8 text-center">
          Why Choose MuleGuard?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <FeatureHighlight
            icon={<Shield className="w-6 h-6" />}
            title="Compliance-Grade Detection"
            description="Built for financial crime investigators with pattern detection algorithms validated against PaySim fraud datasets."
          />
          <FeatureHighlight
            icon={<LineChart className="w-6 h-6" />}
            title="Transparent Risk Scoring"
            description="Explainable suspicion scores with full breakdown of structural, behavioral, and network components."
          />
          <FeatureHighlight
            icon={<Database className="w-6 h-6" />}
            title="Large-Scale Processing"
            description="Optimized chunked ingestion handles datasets up to 500MB with intelligent capping for browser performance."
          />
          <FeatureHighlight
            icon={<FileText className="w-6 h-6" />}
            title="Evidence Export"
            description="Professional export formats (JSON, PDF, CSV) with full audit trails for regulatory submissions."
          />
          <FeatureHighlight
            icon={<Users className="w-6 h-6" />}
            title="Team Collaboration"
            description="Multi-analyst workflows with role-based access, case tagging, and shared investigation history."
          />
          <FeatureHighlight
            icon={<Lock className="w-6 h-6" />}
            title="Data Privacy First"
            description="Local-first processing with optional anonymization. Your transaction data never leaves your control."
          />
        </div>
      </div>

      {/* FAQ Section */}
      <div className="bg-[#171717] border border-[#262626] rounded-xl p-8">
        <h2 className="text-2xl font-bold text-white mb-6 text-center">
          Frequently Asked Questions
        </h2>
        <div className="space-y-6 max-w-3xl mx-auto">
          <div>
            <h3 className="text-base font-semibold text-white mb-2">
              What happens if I exceed my monthly scan limit?
            </h3>
            <p className="text-sm text-slate-300">
              Free tier users will be prompted to upgrade to Pro. Pro and Enterprise plans include unlimited scans.
            </p>
          </div>
          <div>
            <h3 className="text-base font-semibold text-white mb-2">
              Do pricing tiers affect detection accuracy?
            </h3>
            <p className="text-sm text-slate-300">
              No. All tiers use the same PaySim-calibrated detection algorithms. Upgrades unlock advanced features like export, team access, and audit logs, but never alter detection results.
            </p>
          </div>
          <div>
            <h3 className="text-base font-semibold text-white mb-2">
              Can I anonymize account IDs in exports?
            </h3>
            <p className="text-sm text-slate-300">
              Yes. Pro and Enterprise plans include an anonymization toggle in export settings to protect PII while maintaining graph structure for analysis.
            </p>
          </div>
          <div>
            <h3 className="text-base font-semibold text-white mb-2">
              What's included in Enterprise support?
            </h3>
            <p className="text-sm text-slate-300">
              Enterprise customers receive 24/7 priority support, a dedicated account manager, quarterly compliance reviews, custom threshold calibration, and SLA guarantees.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="mt-12 text-center">
        <p className="text-slate-300 mb-4">
          Need help choosing the right plan?
        </p>
        <button
          onClick={() => { setSalesClicked(true); setTimeout(() => setSalesClicked(false), 3000); }}
          className={`px-6 py-3 rounded-lg font-semibold transition-all duration-200 shadow-lg inline-flex items-center gap-2 ${salesClicked
              ? 'bg-emerald-600 text-white shadow-emerald-500/30'
              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/30'
            }`}
        >
          <Headphones className="w-5 h-5" />
          {salesClicked ? 'Request received! We\'ll be in touch.' : 'Talk to Sales'}
        </button>
      </div>
    </div>
  );
});