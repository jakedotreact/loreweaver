import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  AtSign,
  CheckCircle2,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  Settings,
  Shield,
  Sliders,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAvailableModels } from '../hooks/useAvailableModels';
import { ModelConfig } from '../types/story';

interface AccountSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
  onChangeUsername: (nextUsername: string) => Promise<void> | void;
  modelConfig: ModelConfig;
  onChangeModelConfig: (next: ModelConfig) => void;
  onOpenStudioSettings?: () => void;
}

export const AccountSettingsModal: React.FC<AccountSettingsModalProps> = ({
  isOpen,
  onClose,
  username,
  onChangeUsername,
  modelConfig,
  onChangeModelConfig,
  onOpenStudioSettings,
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

  const [draftUsername, setDraftUsername] = useState(username);
  const [selectedAllowed, setSelectedAllowed] = useState<string[]>([]);
  const [restrictModels, setRestrictModels] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setAvatarFailed(false);
    setSavedNotice(null);
    setDraftUsername(username);
    const list = userSettings?.allowedModels ?? [];
    setSelectedAllowed(list);
    setRestrictModels(list.length > 0);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, username, userSettings?.allowedModels, onClose]);

  if (!isOpen) return null;

  const handleToggleAllowedModel = (modelId: string) => {
    setSelectedAllowed((prev) =>
      prev.includes(modelId)
        ? prev.filter((id) => id !== modelId)
        : [...prev, modelId],
    );
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedUsername = draftUsername.trim().slice(0, 40);
    setIsSaving(true);
    setSavedNotice(null);
    try {
      await onChangeUsername(cleanedUsername);

      if (user) {
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
          username: cleanedUsername || undefined,
          preferredModel: nextModel,
          thinkingLevel: nextThinking,
          allowedModels: nextAllowed,
        });
      }

      setSavedNotice('Account username and profile saved.');
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
      <div className="w-full max-w-xl bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-start gap-3">
            <Sliders className="w-5 h-5 text-[#1D4ED8] shrink-0 mt-1" />
            <div>
              <p className="text-xs text-[#6B7280]">
                Author Handle, OAuth &amp; Allowed Models
              </p>
              <h2
                id="account-settings-heading"
                className="font-editorial text-xl sm:text-2xl font-semibold text-[#111827] mt-0.5"
              >
                Account Profile
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

        <form onSubmit={handleSaveProfile} className="p-6 space-y-6 overflow-y-auto flex-1">
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

          {/* Custom Freely Chooseable Account Username */}
          <section className="space-y-2">
            <label
              htmlFor="account-username-input"
              className="flex items-center gap-1.5 text-sm font-semibold text-[#111827]"
            >
              <AtSign className="w-4 h-4 text-[#1D4ED8]" />
              Account Username
            </label>
            <input
              id="account-username-input"
              type="text"
              value={draftUsername}
              onChange={(e) => setDraftUsername(e.target.value)}
              maxLength={40}
              placeholder="Choose any author or reader pen name..."
              className="w-full px-3 py-2 text-sm text-[#111827] bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
            />
            <p className="text-xs text-[#6B7280]">
              Displayed publicly on stories you index, comments, and non-anonymous kudos. Max 40 characters.
            </p>
          </section>

          {/* Authentication Card */}
          {!user ? (
            <section className="border border-neutral-200 rounded-xl p-5 space-y-3 bg-neutral-50">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-[#1D4ED8] shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-[#111827]">
                    Sign in with Google OAuth
                  </h3>
                  <p className="text-xs text-[#4B5563] mt-1 leading-relaxed">
                    Sync your username, stories, collections, subscriptions, and model preferences to Firestore across devices.
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={isSigningIn}
                  onClick={() => void signInWithGoogle()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isSigningIn ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <LogIn className="w-3.5 h-3.5" />
                      Continue with Google
                    </>
                  )}
                </button>
              </div>
            </section>
          ) : (
            <>
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#374151] bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>

              {/* Per-User Model Associations */}
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-neutral-100">
                  <div>
                    <h3 className="text-sm font-semibold text-[#111827]">
                      Associated Models
                    </h3>
                    <p className="text-xs text-[#6B7280] mt-0.5">
                      Restrict your profile to specific discovered models if desired.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void refreshModels()}
                    disabled={isRefreshing}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#1D4ED8] hover:underline disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
                    />
                    Refresh
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
                  Allow all extracted models ({models.length} available)
                </label>

                {restrictModels && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 max-h-44 overflow-y-auto pr-1">
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
            </>
          )}

          {/* Direct link to Studio Settings (avoids duplicate model/voice forms) */}
          {onOpenStudioSettings && (
            <div className="pt-2 flex items-center justify-between text-xs text-[#6B7280] border-t border-neutral-100">
              <span>Model selection, TTS voice &amp; auto-play live in Studio Settings.</span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenStudioSettings();
                }}
                className="inline-flex items-center gap-1 font-medium text-[#1D4ED8] hover:underline shrink-0 cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                Studio Settings
              </button>
            </div>
          )}

          <div className="pt-3 border-t border-neutral-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[#4B5563] hover:text-[#111827] cursor-pointer"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={isSaving || (user ? restrictModels && selectedAllowed.length === 0 : false)}
              className="px-5 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              {isSaving ? 'Saving...' : 'Save Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
