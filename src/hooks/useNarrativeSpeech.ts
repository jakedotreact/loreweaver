import { useCallback, useEffect, useRef, useState } from 'react';
import { TtsVoiceName } from '../types/story';
import { postJson } from '../utils/api';

export interface TtsSpeechItem {
  key: string;
  label: string;
  text: string;
  tone?: string;
}

function quickTextHash(str: string): string {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function base64ToWavUrl(base64: string, mimeType: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  return URL.createObjectURL(blob);
}

export interface NarrativeSpeechControls {
  activeKey: string | null;
  activeLabel: string | null;
  activeAudioUrl: string | null;
  loadingKey: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  voice: TtsVoiceName;
  error: string | null;
  errorKey: string | null;
  togglePlay: (item: TtsSpeechItem) => Promise<void>;
  stop: () => void;
  seek: (seconds: number) => void;
  changeVoice: (nextVoice: TtsVoiceName) => Promise<void>;
  clearError: () => void;
}

export function useNarrativeSpeech(): NarrativeSpeechControls {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [activeAudioUrl, setActiveAudioUrl] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [voice, setVoice] = useState<TtsVoiceName>('Charon');
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cacheRef = useRef<Map<string, string>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const activeItemRef = useRef<TtsSpeechItem | null>(null);
  const voiceRef = useRef<TtsVoiceName>(voice);
  voiceRef.current = voice;

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const onTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const onLoadedMetadata = () => setDuration(audio.duration || 0);
    const onError = () => {
      setIsPlaying(false);
      setError('Audio playback failed for this narration clip.');
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('error', onError);

    return () => {
      abortRef.current?.abort();
      audio.pause();
      audio.src = '';
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('error', onError);
      for (const url of cacheRef.current.values()) {
        URL.revokeObjectURL(url);
      }
      cacheRef.current.clear();
    };
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setLoadingKey(null);
    setActiveKey(null);
    setActiveLabel(null);
    setActiveAudioUrl(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    activeItemRef.current = null;
  }, []);

  const playWithVoice = useCallback(
    async (item: TtsSpeechItem, targetVoice: TtsVoiceName) => {
      const audio = audioRef.current;
      if (!audio) return;

      setError(null);
      setErrorKey(null);
      abortRef.current?.abort();

      const cacheKey = `${item.key}::${targetVoice}::${quickTextHash(item.text)}`;
      const cachedUrl = cacheRef.current.get(cacheKey);
      if (cachedUrl) {
        audio.pause();
        audio.src = cachedUrl;
        audio.currentTime = 0;
        activeItemRef.current = item;
        setActiveKey(item.key);
        setActiveLabel(item.label);
        setActiveAudioUrl(cachedUrl);
        setLoadingKey(null);
        await audio.play();
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      audio.pause();
      setLoadingKey(item.key);
      setActiveKey(item.key);
      setActiveLabel(item.label);
      setActiveAudioUrl(null);
      setCurrentTime(0);
      setDuration(0);
      activeItemRef.current = item;

      try {
        const data = await postJson<{ audioBase64: string; mimeType?: string }>(
          '/api/story/tts',
          {
            text: item.text,
            tone: item.tone,
            voiceName: targetVoice,
          },
          controller.signal,
        );

        const url = base64ToWavUrl(data.audioBase64, data.mimeType || 'audio/wav');
        cacheRef.current.set(cacheKey, url);

        if (controller.signal.aborted) return;

        audio.src = url;
        audio.currentTime = 0;
        setActiveAudioUrl(url);
        setLoadingKey(null);
        await audio.play();
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        setLoadingKey(null);
        setIsPlaying(false);
        setErrorKey(item.key);
        setError(
          err instanceof Error ? err.message : 'Unable to synthesize speech audio.',
        );
      }
    },
    [],
  );

  const togglePlay = useCallback(
    async (item: TtsSpeechItem) => {
      const audio = audioRef.current;
      if (!audio) return;

      if (loadingKey === item.key) {
        stop();
        return;
      }

      const currentVoice = voiceRef.current;
      const expectedCacheKey = `${item.key}::${currentVoice}::${quickTextHash(item.text)}`;
      const cachedUrl = cacheRef.current.get(expectedCacheKey);

      if (activeKey === item.key && cachedUrl && audio.src === cachedUrl) {
        if (audio.paused) {
          setError(null);
          setErrorKey(null);
          await audio.play();
        } else {
          audio.pause();
        }
        return;
      }

      await playWithVoice(item, currentVoice);
    },
    [activeKey, loadingKey, playWithVoice, stop],
  );

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seconds)) return;
    audio.currentTime = Math.max(0, Math.min(seconds, audio.duration || 0));
    setCurrentTime(audio.currentTime);
  }, []);

  const changeVoice = useCallback(
    async (nextVoice: TtsVoiceName) => {
      setVoice(nextVoice);
      if (activeItemRef.current && activeKey) {
        await playWithVoice(activeItemRef.current, nextVoice);
      }
    },
    [activeKey, playWithVoice],
  );

  const clearError = useCallback(() => {
    setError(null);
    setErrorKey(null);
  }, []);

  return {
    activeKey,
    activeLabel,
    activeAudioUrl,
    loadingKey,
    isPlaying,
    currentTime,
    duration,
    voice,
    error,
    errorKey,
    togglePlay,
    stop,
    seek,
    changeVoice,
    clearError,
  };
}
