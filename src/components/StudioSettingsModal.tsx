import React, { useEffect } from 'react';
import { Settings, Shield, Volume2, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ModelConfig, TtsVoiceName } from '../types/story';
import { ModelConfigPanel } from './ModelConfigPanel';

interface StudioSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  modelConfig: ModelConfig;
  onChangeModelConfig: (next: ModelConfig) => void;
  preferredVoice: TtsVoiceName;
  onChangeVoice: (nextVoice: TtsVoiceName) => void;
  autoPlayNarration: boolean;
  onChangeAutoPlayNarration: (enabled: boolean) => void;
  onOpenAccountSettings: () => void;
}

const VOICE_OPTIONS: Array<{ id: TtsVoiceName; label: string }> = [
  { id: 'Charon', label: 'Charon — Warm Baritone' },
  { id: 'Kore', label: 'Kore — Clear Literary' },
  { id: 'Fenrir', label: 'Fenrir — Deep Dramatic' },
  { id: 'Puck', label: 'Puck — Lively Expressive' },
  { id: 'Zephyr', label: 'Zephyr — Calm Velvet' },
];

export const StudioSettingsModal: React.FC<StudioSettingsModalProps> = ({
  isOpen,
  onClose,
  modelConfig,
  onChangeModelConfig,
  preferredVoice,
  onChangeVoice,
  autoPlayNarration,
  onChangeAutoPlayNarration,
  onOpenAccountSettings,
}) => {
  const { user } = useAuth();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-settings-heading"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-start gap-3">
            <Settings className="w-5 h-5 text-[#1D4ED8] shrink-0 mt-1" />
            <div>
              <p className="text-xs text-[#6B7280]">
                Narration, Playback &amp; Model Defaults
              </p>
              <h2
                id="studio-settings-heading"
                className="font-editorial text-xl sm:text-2xl font-semibold text-[#111827] mt-0.5"
              >
                Studio Settings
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close studio settings"
            className="p-2 text-[#6B7280] hover:text-[#111827] hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Narration & Playback Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-neutral-100">
              <Volume2 className="w-4 h-4 text-[#1D4ED8] shrink-0" />
              <h3 className="text-sm font-semibold text-[#111827]">
                Narration &amp; Playback
              </h3>
            </div>

            <div className="px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-[#4B5563] leading-relaxed">
              <span className="font-semibold text-[#111827]">
                Narration pre-computation is always on.
              </span>{' '}
              Scenes are automatically synthesized in the background so narration is ready immediately when you listen.
            </div>

            <label
              htmlFor="studio-autoplay-narration"
              className="flex items-start justify-between gap-4 p-4 border border-neutral-200 rounded-xl hover:border-neutral-300 cursor-pointer transition-colors"
            >
              <div className="min-w-0">
                <span className="block text-sm font-medium text-[#111827]">
                  Automatically start playback when narration is ready
                </span>
                <span className="block text-xs text-[#6B7280] mt-1 leading-relaxed">
                  When a newly generated or rewritten scene finishes pre-computing audio, begin reading it aloud automatically on success.
                </span>
              </div>
              <input
                id="studio-autoplay-narration"
                type="checkbox"
                checked={autoPlayNarration}
                onChange={(e) => onChangeAutoPlayNarration(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-neutral-300 text-[#1D4ED8] focus:ring-[#1D4ED8] shrink-0 cursor-pointer"
              />
            </label>

            <div>
              <label
                htmlFor="studio-tts-voice"
                className="block text-xs font-medium text-[#111827] mb-1"
              >
                Narrator Voice (Text-to-Speech)
              </label>
              <select
                id="studio-tts-voice"
                value={preferredVoice}
                onChange={(e) => onChangeVoice(e.target.value as TtsVoiceName)}
                className="w-full px-3 py-2 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
              >
                {VOICE_OPTIONS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {/* AI Model Configuration */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[#111827] pb-2 border-b border-neutral-100">
              Narrative Model &amp; Reasoning
            </h3>
            <ModelConfigPanel config={modelConfig} onChange={onChangeModelConfig} />
          </section>

          {/* Persistence & Cloud Sync Link */}
          <section className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <Shield className="w-4 h-4 text-[#1D4ED8] shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#111827]">
                  {user ? `Synced to ${user.email || 'Google Account'}` : 'Saved locally in this browser'}
                </p>
                <p className="text-xs text-[#6B7280] mt-0.5">
                  {user
                    ? 'Changes persist across sessions and devices in Firestore.'
                    : 'Sign in with Google OAuth to sync preferences and stories across devices.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenAccountSettings();
              }}
              className="px-3 py-1.5 text-xs font-medium text-[#1D4ED8] bg-white hover:bg-[#EFF6FF] border border-[#BFDBFE] rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {user ? 'Account & Models' : 'Sign In to Sync'}
            </button>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-200 bg-white flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
