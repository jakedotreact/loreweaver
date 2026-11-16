import React, { useEffect, useRef, useState } from 'react';
import { Feather, Loader2, Mic, RefreshCw, Square, Upload, X } from 'lucide-react';
import { postJson } from '../utils/api';

interface DictaquillButtonProps {
  onTranscribe: (text: string) => void;
  contextHint?: string;
  disabled?: boolean;
  label?: string;
}

function pickSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read recorded audio.'));
    reader.readAsDataURL(blob);
  });
}

export const DictaquillButton: React.FC<DictaquillButtonProps> = ({
  onTranscribe,
  contextHint,
  disabled = false,
  label = 'Dictaquill',
}) => {
  const [status, setStatus] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const discardRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastAudioRef = useRef<{ blob: Blob; mime: string } | null>(null);
  const [canRetry, setCanRetry] = useState(false);

  const stopTracksAndTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
  };

  useEffect(() => {
    return () => {
      discardRef.current = true;
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop();
        } catch {
          // Ignore stop errors on unmount
        }
      }
      stopTracksAndTimer();
    };
  }, []);

  const transcribeBlob = async (blob: Blob, rawMime: string) => {
    if (blob.size < 256) {
      setError('Recording was too short. Hold and speak before stopping.');
      setStatus('idle');
      return;
    }
    if (blob.size > 16 * 1024 * 1024) {
      setError('Audio clip is larger than 16 MB. Please use a shorter recording.');
      setStatus('idle');
      return;
    }

    lastAudioRef.current = { blob, mime: rawMime };
    setCanRetry(false);
    setStatus('transcribing');
    setError(null);
    try {
      const audioBase64 = await blobToBase64(blob);
      const mimeType = (rawMime || blob.type || 'audio/webm').split(';')[0].trim();
      const data = await postJson<{ text?: string }>('/api/story/transcribe', {
        audioBase64,
        mimeType,
        contextHint,
      });
      if (data.text) {
        onTranscribe(data.text);
      }
      lastAudioRef.current = null;
      setCanRetry(false);
    } catch (err) {
      setCanRetry(true);
      setError(
        err instanceof Error ? err.message : 'Unable to transcribe audio.',
      );
    } finally {
      setStatus('idle');
      setElapsedSec(0);
    }
  };

  const handleStartRecording = async () => {
    if (disabled || status !== 'idle') return;
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Microphone recording is unavailable in this browser. Use audio upload instead.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      discardRef.current = false;

      const preferredMime = pickSupportedMimeType();
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      recorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        const mime = recorder.mimeType || preferredMime || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mime });
        chunksRef.current = [];
        stopTracksAndTimer();

        if (discardRef.current) {
          setStatus('idle');
          setElapsedSec(0);
          return;
        }
        await transcribeBlob(blob, mime);
      };

      recorder.start(250);
      setStatus('recording');
      setElapsedSec(0);
      timerRef.current = window.setInterval(() => {
        setElapsedSec((prev) => prev + 1);
      }, 1000);
    } catch {
      stopTracksAndTimer();
      setError('Microphone access was blocked or unavailable. You can upload an audio file instead.');
      setStatus('idle');
    }
  };

  const handleStopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      discardRef.current = false;
      recorderRef.current.stop();
    }
  };

  const handleCancelRecording = () => {
    discardRef.current = true;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    } else {
      stopTracksAndTimer();
      setStatus('idle');
      setElapsedSec(0);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await transcribeBlob(file, file.type || 'audio/mp3');
  };

  return (
    <div className="inline-flex flex-col items-end gap-1.5">
      <div className="inline-flex items-center gap-1.5">
        {status === 'idle' && (
          <>
            <button
              type="button"
              disabled={disabled}
              onClick={handleStartRecording}
              aria-label="Start Dictaquill speech-to-text recording"
              title="Dictaquill: speak to dictate text"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#1D4ED8] bg-[#EFF6FF] hover:bg-[#DBEAFE] border border-[#BFDBFE] disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Feather className="w-3.5 h-3.5" />
              <Mic className="w-3 h-3" />
              {label}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Transcribe audio file with Dictaquill"
              title="Upload an audio clip to transcribe"
              className="p-1 text-[#6B7280] hover:text-[#1D4ED8] hover:bg-[#F8FAFC] border border-neutral-200 hover:border-[#BFDBFE] disabled:opacity-50 rounded-md transition-colors shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        {status === 'recording' && (
          <div className="inline-flex items-center gap-1.5">
            <span className="text-xs font-mono tabular-nums text-[#B91C1C] font-medium px-1.5">
              Recording {formatDuration(elapsedSec)}
            </span>
            <button
              type="button"
              onClick={handleStopRecording}
              aria-label="Stop recording and transcribe"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Square className="w-3 h-3" />
              Transcribe
            </button>
            <button
              type="button"
              onClick={handleCancelRecording}
              aria-label="Cancel recording"
              title="Discard recording"
              className="p-1 text-[#6B7280] hover:text-[#111827] border border-neutral-200 hover:bg-neutral-50 rounded-md transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {status === 'transcribing' && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#1D4ED8] bg-[#EFF6FF] border border-[#BFDBFE] rounded-md whitespace-nowrap shrink-0">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Transcribing...
          </span>
        )}
      </div>

      {error && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] px-2.5 py-1.5 rounded-md">
          <span>{error}</span>
          {canRetry && lastAudioRef.current && (
            <button
              type="button"
              disabled={disabled || status !== 'idle'}
              onClick={() => {
                const saved = lastAudioRef.current;
                if (saved) {
                  void transcribeBlob(saved.blob, saved.mime);
                }
              }}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-white bg-[#B91C1C] hover:bg-[#991B1B] disabled:opacity-50 rounded transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setError(null);
              setCanRetry(false);
              lastAudioRef.current = null;
            }}
            aria-label="Dismiss dictation error"
            className="text-[#991B1B] hover:text-[#7F1D1D]"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
};
