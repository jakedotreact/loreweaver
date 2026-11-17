import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  Shield,
  Sliders,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAvailableModels } from '../hooks/useAvailableModels';
import { ModelConfig, ModelThinkingLevel, TtsVoiceName } from '../types/story';

interface AccountSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  modelConfig: ModelConfig;
  onChangeModelConfig: (next: ModelConfig) => void;
  preferredVoice: TtsVoiceName;
  onChangeVoice: (nextVoice: TtsVoiceName) => void;
}

const VOICE_OPTIONS: Array<{ id: TtsVoiceName; label: string }> = [
  { id: 'Charon', label: 'Charon — Warm Baritone' },
  { id: 'Kore', label: 'Kore — Clear Literary' },
  { id: 'Fenrir', label: 'Fenrir — Deep Dramatic' },
  { id: 'Puck', label: 'Puck — Lively Expressive' },
  { id: 'Zephyr', label: 'Zephyr — Calm Velvet' },
];

const THINKING_LABELS: Record<ModelThinkingLevel, string> = {
  MINIMAL: 'Minimal (Fastest)',
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High (Recommended)',
  XHIGH: 'Extra High (Max Depth)',
};

export const AccountSettingsModal: React.FC<AccountSettingsModalProps> = ({
  isOpen,
  onClose,
  modelConfig,
  onChangeModelConfig,
  preferredVoice,
  onChangeVoice,
}) => {
  const {
    user,
    isSigningIn,
    authError,
    userSettings,
    syncError,
    signInWithGoogle,
    signOutUser,
    updateUserSettings,
    clearAuthError,
  } = useAuth();
  const { models, isRefreshing, refreshModels } = useAvailableModels();

  const [selectedAllowed, setSelectedAllowed] = useState<string[]>([]);
  const [restrictModels, setRestrictModels] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setAvatarFailed(false);
    setSavedNotice(null);
    const list = userSettings?.allowedModels ?? [];
    setSelectedAllowed(list);
    setRestrictModels(list.length > 0);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, userSettings?.allowedModels, onClose]);

  if (!isOpen) return null;

  const activeModelOption =
    models.find((m) => m.id === modelConfig.model) ?? models[0];

  const handleToggleAllowedModel = (modelId: string) => {
    setSelectedAllowed((prev) =>
      prev.includes(modelId)
        ? prev.filter((id) => id !== modelId)
        : [...prev, modelId],
    );
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSaving(true);
    setSavedNotice(null);
    try {
      const nextAllowed = restrictModels ? selectedAllowed : [];
      let nextModel = modelConfig.model;
      let nextThinking = modelConfig.thinkingLevel;

      if (nextAllowed.length > 0 && !nextAllowed.includes(nextModel)) {
        nextModel = nextAllowed[0];
        const matched = models.find((m) => m.id === nextModel);
        if (matched && !matched.allowedThinkingLevels.includes(nextThinking)) {
          nextThinking = matched.defaultThinking;
        }
        onChangeModelConfig({ model: nextModel, thinkingLevel: nextThinking });
      }

      await updateUserSettings({
        preferredModel: nextModel,
        thinkingLevel: nextThinking,
        preferredVoice,
        allowedModels: nextAllowed,
      });
      setSavedNotice('Settings saved to your cloud profile.');
      setTimeout(() => setSavedNotice(null), 2600);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-settings-heading"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-start gap-3">
            <Sliders className="w-5 h-5 text-[#1D4ED8] shrink-0 mt-1" />
            <div>
              <p className="text-xs text-[#6B7280]">
                OAuth Account &amp; Cloud Sync
              </p>
              <h2
                id="account-settings-heading"
                className="font-editorial text-xl sm:text-2xl font-semibold text-[#111827] mt-0.5"
              >
                Account &amp; Model Associations
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close account settings"
            className="p-2 text-[#6B7280] hover:text-[#111827] hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {(authError || syncError) && (
            <div
              role="alert"
              className="px-4 py-3 bg-[#FEF2F2] border border-[#FECACA] rounded-lg flex items-start gap-2.5 text-xs text-[#991B1B]"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#DC2626]" />
              <div className="flex-1">
                <p>{authError || syncError}</p>
                {authError && (
                  <button
                    type="button"
                    onClick={clearAuthError}
                    className="mt-1 font-semibold underline hover:no-underline"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            </div>
          )}

          {savedNotice && (
            <div className="px-4 py-2.5 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg flex items-center gap-2 text-xs text-[#15803D]">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{savedNotice}</span>
            </div>
          )}

          {/* Authentication Card */}
          {!user ? (
            <section className="border border-neutral-200 rounded-xl p-6 space-y-4 bg-neutral-50">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-[#1D4ED8] shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-base font-semibold text-[#111827]">
                    Sign in with Google OAuth
                  </h3>
                  <p className="text-sm text-[#4B5563] mt-1 leading-relaxed">
                    Persist your preferred Gemini model, reasoning depth, narrator voice, per-user model associations, and stories in Firestore across sessions and devices.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <span className="text-xs text-[#6B7280]">
                  Guest sessions continue using browser storage until you sign in.
                </span>
                <button
                  type="button"
                  disabled={isSigningIn}
                  onClick={() => void signInWithGoogle()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  {isSigningIn ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      Continue with Google
                    </>
                  )}
                </button>
              </div>
            </section>
          ) : (
            <form onSubmit={handleSavePreferences} className="space-y-6">
              {/* Signed-in User Bar */}
              <div className="border border-neutral-200 rounded-xl p-4 bg-neutral-50 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {user.photoURL && !avatarFailed ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'Account avatar'}
                      referrerPolicy="no-referrer"
                      onError={() => setAvatarFailed(true)}
                      className="w-10 h-10 rounded-full object-cover border border-neutral-200 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#1D4ED8] shrink-0">
                      <UserIcon className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#111827] truncate">
                      {user.displayName || 'Authenticated Author'}
                    </p>
                    <p className="text-xs text-[#6B7280] truncate">{user.email}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void signOutUser()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#374151] bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>

              {/* Default Preferences */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-[#111827] pb-2 border-b border-neutral-100">
                  Persistent Studio Preferences
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="acct-default-model"
                      className="block text-xs font-medium text-[#111827] mb-1"
                    >
                      Default Narrative Model
                    </label>
                    <select
                      id="acct-default-model"
                      value={activeModelOption?.id ?? modelConfig.model}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        const opt = models.find((m) => m.id === nextId);
                        const validLevel = opt?.allowedThinkingLevels.includes(
                          modelConfig.thinkingLevel,
                        )
                          ? modelConfig.thinkingLevel
                          : opt?.defaultThinking ?? 'HIGH';
                        onChangeModelConfig({
                          model: nextId,
                          thinkingLevel: validLevel,
                        });
                      }}
                      className="w-full px-3 py-2 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                    >
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label === m.id ? m.label : `${m.label} (${m.id})`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {activeModelOption?.supportsThinkingLevel && (
                    <div>
                      <label
                        htmlFor="acct-thinking-level"
                        className="block text-xs font-medium text-[#111827] mb-1"
                      >
                        Default Reasoning Depth
                      </label>
                      <select
                        id="acct-thinking-level"
                        value={
                          activeModelOption.allowedThinkingLevels.includes(
                            modelConfig.thinkingLevel,
                          )
                            ? modelConfig.thinkingLevel
                            : activeModelOption.defaultThinking
                        }
                        onChange={(e) =>
                          onChangeModelConfig({
                            ...modelConfig,
                            thinkingLevel: e.target.value as ModelThinkingLevel,
                          })
                        }
                        className="w-full px-3 py-2 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                      >
                        {activeModelOption.allowedThinkingLevels.map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {THINKING_LABELS[lvl]}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="acct-tts-voice"
                    className="block text-xs font-medium text-[#111827] mb-1"
                  >
                    Default Narrator Voice (Text-to-Speech)
                  </label>
                  <select
                    id="acct-tts-voice"
                    value={preferredVoice}
                    onChange={(e) =>
                      onChangeVoice(e.target.value as TtsVoiceName)
                    }
                    className="w-full sm:w-1/2 px-3 py-2 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  >
                    {VOICE_OPTIONS.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
              </section>

              {/* Per-User Model Associations */}
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-neutral-100">
                  <div>
                    <h3 className="text-sm font-semibold text-[#111827]">
                      Associated Models for Your Account
                    </h3>
                    <p className="text-xs text-[#6B7280] mt-0.5">
                      Choose whether this user profile can access all discovered models or a curated subset.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void refreshModels()}
                    disabled={isRefreshing}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#1D4ED8] hover:underline disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
                    />
                    Refresh Discovered
                  </button>
                </div>

                <label className="flex items-center gap-2.5 text-xs font-medium text-[#111827] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!restrictModels}
                    onChange={(e) => {
                      const allowAll = e.target.checked;
                      setRestrictModels(!allowAll);
                      if (!allowAll && selectedAllowed.length === 0) {
                        setSelectedAllowed([modelConfig.model]);
                      }
                    }}
                    className="rounded border-neutral-300 text-[#1D4ED8] focus:ring-[#1D4ED8]"
                  />
                  Allow all extracted models for this account ({models.length} available)
                </label>

                {restrictModels && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 max-h-48 overflow-y-auto pr-1">
                    {models.map((m) => {
                      const checked = selectedAllowed.includes(m.id);
                      return (
                        <label
                          key={m.id}
                          className={`p-2.5 border rounded-lg flex items-start gap-2.5 cursor-pointer text-xs transition-colors ${
                            checked
                              ? 'border-[#BFDBFE] bg-[#EFF6FF]'
                              : 'border-neutral-200 bg-white hover:bg-neutral-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleAllowedModel(m.id)}
                            className="mt-0.5 rounded border-neutral-300 text-[#1D4ED8] focus:ring-[#1D4ED8]"
                          />
                          <div className="min-w-0">
                            <p className="font-medium text-[#111827] truncate">
                              {m.label}
                            </p>
                            <p className="text-[11px] font-mono text-[#6B7280] truncate">
                              {m.id}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </section>

              <div className="pt-4 border-t border-neutral-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-[#4B5563] hover:text-[#111827]"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isSaving || (restrictModels && selectedAllowed.length === 0)}
                  className="px-5 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  {isSaving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
