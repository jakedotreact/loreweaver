import React from 'react';
import {
  AlertTriangle,
  Download,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Square,
  Volume2,
} from 'lucide-react';
import { NarrativeSpeechControls } from '../hooks/useNarrativeSpeech';
import { TtsVoiceName } from '../types/story';

const VOICE_OPTIONS: Array<{ id: TtsVoiceName; label: string }> = [
  { id: 'Charon', label: 'Charon (Deep Narrator)' },
  { id: 'Kore', label: 'Kore (Warm & Clear)' },
  { id: 'Fenrir', label: 'Fenrir (Dramatic)' },
  { id: 'Puck', label: 'Puck (Light & Nimble)' },
  { id: 'Zephyr', label: 'Zephyr (Calm & Measured)' },
];

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

interface TtsPlayerBarProps {
  itemKey: string;
  downloadName: string;
  speech: NarrativeSpeechControls;
  onReplay: () => void;
}

export const TtsPlayerBar: React.FC<TtsPlayerBarProps> = ({
  itemKey,
  downloadName,
  speech,
  onReplay,
}) => {
  const isThisActive = speech.activeKey === itemKey;
  const isThisLoading = speech.loadingKey === itemKey;
  const hasThisError = speech.errorKey === itemKey && Boolean(speech.error);

  if (!isThisActive && !isThisLoading && !hasThisError) {
    return null;
  }

  return (
    <div className="mt-4 px-4 py-3 bg-[#F8FAFC] border border-neutral-200 rounded-lg space-y-2">
      {hasThisError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#B91C1C]">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{speech.error}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onReplay}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-[#B91C1C] hover:bg-[#991B1B] rounded transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
            <button
              type="button"
              onClick={speech.clearError}
              className="text-xs font-medium text-[#4B5563] hover:text-[#111827] whitespace-nowrap shrink-0"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {isThisLoading ? (
              <span className="inline-flex items-center gap-2 text-xs font-medium text-[#1D4ED8]">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Synthesizing narration ({speech.voice})...
              </span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onReplay}
                  aria-label={speech.isPlaying ? 'Pause narration' : 'Play narration'}
                  className="p-1.5 text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md transition-colors shrink-0"
                >
                  {speech.isPlaying ? (
                    <Pause className="w-3.5 h-3.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={speech.stop}
                  aria-label="Stop narration"
                  className="p-1.5 text-[#4B5563] hover:text-[#111827] bg-white border border-neutral-200 hover:bg-neutral-50 rounded-md transition-colors shrink-0"
                >
                  <Square className="w-3.5 h-3.5" />
                </button>
                <div className="flex items-center gap-2 min-w-[160px] sm:min-w-[220px]">
                  <Volume2 className="w-3.5 h-3.5 text-[#6B7280] shrink-0" />
                  <input
                    type="range"
                    min={0}
                    max={speech.duration || 1}
                    step={0.1}
                    value={Math.min(speech.currentTime, speech.duration || 1)}
                    onChange={(e) => speech.seek(Number(e.target.value))}
                    aria-label="Audio playback position"
                    className="w-full accent-[#1D4ED8] cursor-pointer"
                  />
                  <span className="text-[11px] font-mono tabular-nums text-[#6B7280] whitespace-nowrap shrink-0">
                    {formatAudioTime(speech.currentTime)} / {formatAudioTime(speech.duration)}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label htmlFor={`tts-voice-${itemKey}`} className="sr-only">
              Narrator Voice
            </label>
            <select
              id={`tts-voice-${itemKey}`}
              disabled={isThisLoading}
              value={speech.voice}
              onChange={(e) => speech.changeVoice(e.target.value as TtsVoiceName)}
              className="px-2.5 py-1 text-xs bg-white border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] disabled:opacity-50"
            >
              {VOICE_OPTIONS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>

            {speech.activeAudioUrl && !isThisLoading && (
              <a
                href={speech.activeAudioUrl}
                download={`${downloadName}.wav`}
                aria-label="Download WAV audio"
                title="Download narration WAV"
                className="p-1.5 text-[#4B5563] hover:text-[#1D4ED8] bg-white border border-neutral-200 hover:border-[#BFDBFE] rounded-md transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
