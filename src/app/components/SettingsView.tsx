import React, { memo, useState, useEffect, useCallback } from 'react';
import {
  Eye,
  Shield,
  Info,
  AlertCircle,
  Activity,
  FileText,
  Cpu,
  Check,
  Trash2,
} from 'lucide-react';
import { CurrentUser } from '../lib/local-auth';

interface SettingsViewProps {
  onSettingsChange?: (settings: UserSettings) => void;
  user?: CurrentUser | null;
}

export interface UserSettings {
  defaultTimeWindow: '24h' | '7d' | '30d';
  nodeRenderingLimit: number;
  defaultRiskThreshold: number;
  patternVisibility: {
    circular: boolean;
    fanPattern: boolean;
    rapidPassThrough: boolean;
  };
}

const defaultSettings: UserSettings = {
  defaultTimeWindow: '7d',
  nodeRenderingLimit: 1500,
  defaultRiskThreshold: 50,
  patternVisibility: {
    circular: false,
    fanPattern: false,
    rapidPassThrough: false,
  },
};

const SettingSection = memo(function SettingSection({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl p-6 mb-6">
      <div className="flex items-start gap-3 mb-6">
        <div className="p-2 bg-blue-900/20 rounded-lg text-blue-400">
          {icon}
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-white mb-1">{title}</h2>
          <p className="text-sm text-slate-300">{description}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
});

const SettingRow = memo(function SettingRow({
  label,
  description,
  children,
  isViewOnly,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  isViewOnly?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-[#1f1f1f] last:border-0">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-white">{label}</label>
          {isViewOnly && (
            <span className="px-2 py-0.5 bg-[#171717] text-slate-400 text-xs rounded">
              View Only
            </span>
          )}
        </div>
        {description && <p className="text-xs text-slate-400 mt-1">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
});

const Toggle = memo(function Toggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? 'bg-blue-600' : 'bg-[#404040]'
        }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
      />
    </button>
  );
});

export const SettingsView = memo(function SettingsView({ onSettingsChange, user }: SettingsViewProps) {
  const [settings, setSettings] = useState<UserSettings>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('muleguard_settings');
      if (stored) {
        try {
          return { ...defaultSettings, ...JSON.parse(stored) };
        } catch {
          return defaultSettings;
        }
      }
    }
    return defaultSettings;
  });

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordFields, setPasswordFields] = useState({ current: '', new1: '', new2: '' });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Save to localStorage whenever settings change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('muleguard_settings', JSON.stringify(settings));
      onSettingsChange?.(settings);
      setSaveStatus('saved');
      const t = setTimeout(() => setSaveStatus('idle'), 2000);
      return () => clearTimeout(t);
    }
  }, [settings, onSettingsChange]);

  const updateSetting = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const updateNestedSetting = <K extends keyof UserSettings>(
    parentKey: K,
    childKey: string,
    value: any
  ) => {
    setSettings((prev) => ({
      ...prev,
      [parentKey]: {
        ...(prev[parentKey] as any),
        [childKey]: value,
      },
    }));
  };

  const handleChangePassword = useCallback(() => {
    setPasswordError(null);
    setPasswordSuccess(false);
    const { current, new1, new2 } = passwordFields;
    if (!current || !new1 || !new2) {
      setPasswordError('All fields are required');
      return;
    }
    if (new1.length < 6) {
      setPasswordError('New password must be at least 6 characters');
      return;
    }
    if (new1 !== new2) {
      setPasswordError('New passwords do not match');
      return;
    }

    try {
      // Verify current password then update
      const usersStr = localStorage.getItem('aml_users');
      if (!usersStr) { setPasswordError('No users found'); return; }
      const users = JSON.parse(usersStr);
      const simpleHash = (password: string): string => {
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
          const char = password.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash;
        }
        return hash.toString(36) + btoa(password).slice(0, 10);
      };
      const currentUser = user;
      if (!currentUser) { setPasswordError('Not logged in'); return; }
      const idx = users.findIndex((u: any) => u.id === currentUser.id);
      if (idx === -1) { setPasswordError('User not found'); return; }
      if (users[idx].passwordHash !== simpleHash(current)) {
        setPasswordError('Current password is incorrect');
        return;
      }
      users[idx].passwordHash = simpleHash(new1);
      localStorage.setItem('aml_users', JSON.stringify(users));
      setPasswordSuccess(true);
      setPasswordFields({ current: '', new1: '', new2: '' });
      setTimeout(() => { setShowPasswordForm(false); setPasswordSuccess(false); }, 2000);
    } catch {
      setPasswordError('Failed to update password');
    }
  }, [passwordFields, user]);

  const handleClearAllData = useCallback(() => {
    try {
      // Preserve user credentials — only clear history + settings
      const keys = Object.keys(localStorage).filter(k =>
        (k.startsWith('aml_') || k.startsWith('muleguard_')) &&
        k !== 'aml_users' && k !== 'aml_current_user'
      );
      keys.forEach(k => localStorage.removeItem(k));
      setShowClearConfirm(false);
      window.location.reload();
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
          <p className="text-slate-300">
            Configure analysis preferences, visibility controls, and export options.
          </p>
        </div>
        {saveStatus === 'saved' && (
          <div className="flex items-center gap-1.5 text-emerald-400 text-sm font-medium animate-in fade-in duration-300">
            <Check className="w-4 h-4" />
            Saved
          </div>
        )}
      </div>


      {/* Analysis Settings */}
      <SettingSection
        icon={<Activity className="w-5 h-5" />}
        title="Analysis Settings"
        description="Configure default analysis parameters for new scans."
      >
        <SettingRow
          label="Default Time Window"
          description="Initial time range filter applied to graph visualization."
        >
          <select
            value={settings.defaultTimeWindow}
            onChange={(e) => updateSetting('defaultTimeWindow', e.target.value as any)}
            className="px-3 py-1.5 bg-[#171717] border border-[#404040] rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
        </SettingRow>

        <SettingRow
          label="Node Rendering Limit"
          description="Maximum nodes displayed in graph (performance optimization)."
          isViewOnly
        >
          <div className="px-3 py-1.5 bg-[#171717] border border-[#262626] rounded-lg text-sm text-slate-400">
            {settings.nodeRenderingLimit.toLocaleString()} nodes
          </div>
        </SettingRow>

        <SettingRow
          label="Default Risk Threshold"
          description="Initial suspicion score threshold for flagging entities."
        >
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              value={settings.defaultRiskThreshold}
              onChange={e => updateSetting('defaultRiskThreshold', Number(e.target.value))}
              className="w-28 h-1.5 bg-[#404040] rounded-lg appearance-none cursor-pointer"
            />
            <span className="font-mono text-sm font-bold text-white w-8 text-right">
              {settings.defaultRiskThreshold}
            </span>
          </div>
        </SettingRow>
      </SettingSection>

      {/* Detection Visibility */}
      <SettingSection
        icon={<Eye className="w-5 h-5" />}
        title="Detection Visibility"
        description="Control which fraud patterns are visible by default (does not affect detection logic)."
      >
        <SettingRow
          label="Circular Transfers Pattern"
          description="Show entities involved in circular money flow loops."
        >
          <Toggle
            enabled={settings.patternVisibility.circular}
            onChange={(val) => updateNestedSetting('patternVisibility', 'circular', val)}
          />
        </SettingRow>

        <SettingRow
          label="Fan-In / Fan-Out Pattern"
          description="Show entities with high concentration or distribution of funds."
        >
          <Toggle
            enabled={settings.patternVisibility.fanPattern}
            onChange={(val) => updateNestedSetting('patternVisibility', 'fanPattern', val)}
          />
        </SettingRow>

        <SettingRow
          label="Rapid Pass-Through Pattern"
          description="Show shell accounts with fast fund turnover (low balance retention)."
        >
          <Toggle
            enabled={settings.patternVisibility.rapidPassThrough}
            onChange={(val) => updateNestedSetting('patternVisibility', 'rapidPassThrough', val)}
          />
        </SettingRow>
      </SettingSection>

      {/* Account & Security */}
      <SettingSection
        icon={<Shield className="w-5 h-5" />}
        title="Account & Security"
        description="Manage authentication, session, and data retention settings."
      >
        <SettingRow
          label="Change Password"
          description={user ? "Update your account password." : "Log in to change your password."}
        >
          {user ? (
            <button
              onClick={() => { setShowPasswordForm(!showPasswordForm); setPasswordError(null); setPasswordSuccess(false); }}
              className="px-3 py-1.5 bg-[#171717] hover:bg-[#262626] border border-[#404040] rounded-lg text-sm text-white transition-colors"
            >
              {showPasswordForm ? 'Cancel' : 'Update'}
            </button>
          ) : (
            <span className="text-xs text-slate-400">Not logged in</span>
          )}
        </SettingRow>

        {showPasswordForm && user && (
          <div className="p-4 bg-[#0f0f0f] border border-[#262626] rounded-lg space-y-3">
            {passwordError && (
              <div className="text-xs text-red-400 bg-red-900/20 p-2 rounded border border-red-900/30">
                {passwordError}
              </div>
            )}
            {passwordSuccess && (
              <div className="text-xs text-emerald-400 bg-emerald-900/20 p-2 rounded border border-emerald-900/30 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" /> Password updated successfully
              </div>
            )}
            <div>
              <label className="text-xs text-slate-400 block mb-1">Current Password</label>
              <input
                type="password"
                value={passwordFields.current}
                onChange={e => setPasswordFields(p => ({ ...p, current: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-black border border-[#262626] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="Current password"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">New Password</label>
              <input
                type="password"
                value={passwordFields.new1}
                onChange={e => setPasswordFields(p => ({ ...p, new1: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-black border border-[#262626] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="New password (min 6 chars)"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Confirm New Password</label>
              <input
                type="password"
                value={passwordFields.new2}
                onChange={e => setPasswordFields(p => ({ ...p, new2: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-black border border-[#262626] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="Confirm new password"
              />
            </div>
            <button
              onClick={handleChangePassword}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium transition-colors"
            >
              Update Password
            </button>
          </div>
        )}

        <SettingRow
          label="Clear All Local Data"
          description="Remove all accounts, history, and settings from this browser."
        >
          {showClearConfirm ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleClearAllData}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg font-medium transition-colors"
              >
                Confirm Delete
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-3 py-1.5 bg-[#262626] text-slate-300 text-sm rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="px-3 py-1.5 bg-red-900/20 hover:bg-red-900/30 border border-red-900/30 rounded-lg text-sm text-red-400 transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Data
            </button>
          )}
        </SettingRow>
      </SettingSection>

      {/* About & Transparency */}
      <SettingSection
        icon={<Info className="w-5 h-5" />}
        title="About & Transparency"
        description="Learn about MuleGuard's detection methodology and algorithms."
      >
        <div className="bg-[#171717] border border-[#262626] rounded-lg p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
              <Cpu className="w-4 h-4" />
              Risk Scoring Methodology
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              MuleGuard uses a composite suspicion score combining three dimensions:
            </p>
            <ul className="text-xs text-slate-300 mt-2 space-y-1 ml-4">
              <li>• <strong>Structural (max 100)</strong>: Graph topology patterns (cycles, fan-in/out, shell behavior)</li>
              <li>• <strong>Behavioral (max 40)</strong>: Transaction timing, velocity, balance anomalies</li>
              <li>• <strong>Network (max 20)</strong>: Ring membership, peer suspicion propagation</li>
            </ul>
            <p className="text-xs text-slate-400 mt-2">
              Total suspicion score = min(structural + behavioral + network, 100)
            </p>
          </div>

          <div className="border-t border-[#262626] pt-4">
            <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Detection Algorithms
            </h3>
            <ul className="text-xs text-slate-300 space-y-1 ml-4">
              <li>• <strong>Cycle Detection:</strong> Depth-first search for circular fund flows (3-10 hops)</li>
              <li>• <strong>Smurfing Detection:</strong> Fan-in clustering with amount/timing correlation</li>
              <li>• <strong>Shell Account Detection:</strong> High flow-through, low balance retention</li>
              <li>• <strong>PaySim Calibration:</strong> Balance anomaly detection, account draining, zero-balance destinations</li>
            </ul>
          </div>

          <div className="border-t border-[#262626] pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-white">Version</p>
                <p className="text-xs text-slate-400">MuleGuard v1.0.0 (PaySim-Calibrated Build)</p>
              </div>
            </div>
          </div>
        </div>
      </SettingSection>

      {/* Info Banner */}
      <div className="bg-blue-900/10 border border-blue-800/30 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-blue-200 mb-1">
            Settings Do Not Affect Detection
          </h3>
          <p className="text-xs text-blue-300">
            All configuration changes are visibility and workflow preferences only. Detection algorithms, scoring
            formulas, and pattern thresholds remain unchanged.
          </p>
        </div>
      </div>
    </div >
  );
});