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

function makeCacheKey(
  item: Pick<TtsSpeechItem, 'key' | 'text'>,
  targetVoice: TtsVoiceName,
): string {
  return `${item.key}::${targetVoice}::${quickTextHash(item.text)}`;
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
  precomputingKey: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  voice: TtsVoiceName;
  autoPlayOnReady: boolean;
  error: string | null;
  errorKey: string | null;
  togglePlay: (item: TtsSpeechItem) => Promise<void>;
  precomputeItems: (items: TtsSpeechItem[]) => void;
  precomputeAndMaybePlay: (item: TtsSpeechItem) => Promise<void>;
  isItemReady: (item: Pick<TtsSpeechItem, 'key' | 'text'>) => boolean;
  isItemPrecomputing: (item: Pick<TtsSpeechItem, 'key'>) => boolean;
  stop: () => void;
  seek: (seconds: number) => void;
  changeVoice: (nextVoice: TtsVoiceName) => Promise<void>;
  setPreferredVoice: (nextVoice: TtsVoiceName) => void;
  setAutoPlayOnReady: (enabled: boolean) => void;
  hydrateAutoPlayOnReady: (enabled: boolean) => void;
  clearError: () => void;
}

export interface NarrativeSpeechPersistenceHandlers {
  onVoicePersist?: (voice: TtsVoiceName) => void;
  onAutoPlayPersist?: (enabled: boolean) => void;
  initialVoice?: TtsVoiceName;
  initialAutoPlay?: boolean;
}

export function useNarrativeSpeech(
  handlersOrVoiceCallback?:
    | NarrativeSpeechPersistenceHandlers
    | ((voice: TtsVoiceName) => void),
): NarrativeSpeechControls {
  const handlers: NarrativeSpeechPersistenceHandlers =
    typeof handlersOrVoiceCallback === 'function'
      ? { onVoicePersist: handlersOrVoiceCallback }
      : handlersOrVoiceCallback ?? {};

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [activeAudioUrl, setActiveAudioUrl] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [precomputingKey, setPrecomputingKey] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [voice, setVoice] = useState<TtsVoiceName>(
    handlers.initialVoice ?? 'Charon',
  );
  const [autoPlayOnReady, setAutoPlayOnReadyState] = useState<boolean>(
    handlers.initialAutoPlay ?? false,
  );
  const [, setCacheVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cacheRef = useRef<Map<string, string>>(new Map());
  const inFlightRef = useRef<
    Map<string, { promise: Promise<string>; controller: AbortController }>
  >(new Map());
  const failedKeysRef = useRef<Set<string>>(new Set());
  const pendingQueueRef = useRef<TtsSpeechItem[]>([]);
  const workerRunningRef = useRef(false);
  const workerGenerationRef = useRef(0);
  const playbackAbortRef = useRef<AbortController | null>(null);
  const playbackRequestIdRef = useRef(0);

  const activeKeyRef = useRef<string | null>(activeKey);
  activeKeyRef.current = activeKey;
  const activeItemRef = useRef<TtsSpeechItem | null>(null);
  const voiceRef = useRef<TtsVoiceName>(voice);
  voiceRef.current = voice;
  const autoPlayRef = useRef<boolean>(autoPlayOnReady);
  autoPlayRef.current = autoPlayOnReady;
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

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
      workerGenerationRef.current += 1;
      playbackAbortRef.current?.abort();
      for (const entry of inFlightRef.current.values()) {
        entry.controller.abort();
      }
      inFlightRef.current.clear();
      pendingQueueRef.current = [];
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

  const synthesizeAndCache = useCallback(
    (
      item: TtsSpeechItem,
      targetVoice: TtsVoiceName,
      externalSignal?: AbortSignal,
    ): Promise<string> => {
      const cacheKey = makeCacheKey(item, targetVoice);
      const cached = cacheRef.current.get(cacheKey);
      if (cached) {
        return Promise.resolve(cached);
      }

      const existing = inFlightRef.current.get(cacheKey);
      if (existing) {
        return existing.promise;
      }

      const controller = new AbortController();
      if (externalSignal) {
        if (externalSignal.aborted) {
          controller.abort();
        } else {
          externalSignal.addEventListener('abort', () => controller.abort(), {
            once: true,
          });
        }
      }

      const promise = (async () => {
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

          const url = base64ToWavUrl(
            data.audioBase64,
            data.mimeType || 'audio/wav',
          );
          const alreadyCached = cacheRef.current.get(cacheKey);
          if (alreadyCached && alreadyCached !== url) {
            URL.revokeObjectURL(url);
            return alreadyCached;
          }
          cacheRef.current.set(cacheKey, url);
          failedKeysRef.current.delete(cacheKey);
          setCacheVersion((v) => v + 1);
          return url;
        } finally {
          inFlightRef.current.delete(cacheKey);
        }
      })();

      inFlightRef.current.set(cacheKey, { promise, controller });
      return promise;
    },
    [],
  );

  const safePlayAudio = useCallback(async (audio: HTMLAudioElement) => {
    try {
      await audio.play();
    } catch (err) {
      const domErr = err as { name?: string };
      // If browser blocks unprompted autoplay, keep loaded audio ready in the bar without surfacing an error
      if (domErr?.name === 'NotAllowedError') {
        setIsPlaying(false);
        return;
      }
      throw err;
    }
  }, []);

  const stop = useCallback(() => {
    playbackRequestIdRef.current += 1;
    playbackAbortRef.current?.abort();
    playbackAbortRef.current = null;
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
    async (
      item: TtsSpeechItem,
      targetVoice: TtsVoiceName,
      opts?: { allowAutoplayGraceful?: boolean },
    ) => {
      const audio = audioRef.current;
      if (!audio) return;

      const reqId = ++playbackRequestIdRef.current;
      setError(null);
      setErrorKey(null);
      playbackAbortRef.current?.abort();

      const cacheKey = makeCacheKey(item, targetVoice);
      failedKeysRef.current.delete(cacheKey);
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
        if (opts?.allowAutoplayGraceful) {
          await safePlayAudio(audio);
        } else {
          await audio.play();
        }
        return;
      }

      const controller = new AbortController();
      playbackAbortRef.current = controller;
      audio.pause();
      setLoadingKey(item.key);
      setActiveKey(item.key);
      setActiveLabel(item.label);
      setActiveAudioUrl(null);
      setCurrentTime(0);
      setDuration(0);
      activeItemRef.current = item;

      try {
        const url = await synthesizeAndCache(item, targetVoice);

        if (controller.signal.aborted || playbackRequestIdRef.current !== reqId) {
          return;
        }

        audio.src = url;
        audio.currentTime = 0;
        setActiveAudioUrl(url);
        setLoadingKey(null);
        if (opts?.allowAutoplayGraceful) {
          await safePlayAudio(audio);
        } else {
          await audio.play();
        }
      } catch (err) {
        if (
          (err as Error)?.name === 'AbortError' ||
          playbackRequestIdRef.current !== reqId
        ) {
          return;
        }
        setLoadingKey(null);
        setIsPlaying(false);
        setErrorKey(item.key);
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to synthesize speech audio.',
        );
      }
    },
    [safePlayAudio, synthesizeAndCache],
  );

  const runBackgroundWorker = useCallback(async () => {
    if (workerRunningRef.current) return;
    workerRunningRef.current = true;
    const generation = workerGenerationRef.current;

    try {
      while (
        pendingQueueRef.current.length > 0 &&
        workerGenerationRef.current === generation
      ) {
        const nextItem = pendingQueueRef.current.shift();
        if (!nextItem || !nextItem.text.trim()) continue;

        const targetVoice = voiceRef.current;
        const cacheKey = makeCacheKey(nextItem, targetVoice);
        if (
          cacheRef.current.has(cacheKey) ||
          failedKeysRef.current.has(cacheKey)
        ) {
          continue;
        }

        setPrecomputingKey(nextItem.key);
        try {
          await synthesizeAndCache(nextItem, targetVoice);
        } catch {
          // Background pre-compute failures are silent so they never disrupt reading;
          // user clicking Listen clears failedKeysRef and surfaces an explicit error if retry fails.
          failedKeysRef.current.add(cacheKey);
        } finally {
          setPrecomputingKey((curr) =>
            curr === nextItem.key ? null : curr,
          );
        }
      }
    } finally {
      workerRunningRef.current = false;
      setPrecomputingKey(null);
      if (
        pendingQueueRef.current.length > 0 &&
        workerGenerationRef.current === generation
      ) {
        void runBackgroundWorker();
      }
    }
  }, [synthesizeAndCache]);

  const precomputeItems = useCallback(
    (items: TtsSpeechItem[]) => {
      const targetVoice = voiceRef.current;
      const seenKeys = new Set<string>();
      const nextQueue: TtsSpeechItem[] = [];

      for (const item of items) {
        if (!item.text.trim()) continue;
        const cacheKey = makeCacheKey(item, targetVoice);
        if (seenKeys.has(cacheKey)) continue;
        seenKeys.add(cacheKey);
        if (
          !cacheRef.current.has(cacheKey) &&
          !failedKeysRef.current.has(cacheKey)
        ) {
          nextQueue.push(item);
        }
      }

      pendingQueueRef.current = nextQueue;
      if (nextQueue.length > 0) {
        void runBackgroundWorker();
      }
    },
    [runBackgroundWorker],
  );

  const precomputeAndMaybePlay = useCallback(
    async (item: TtsSpeechItem) => {
      if (!item.text.trim()) return;
      const targetVoice = voiceRef.current;
      const cacheKey = makeCacheKey(item, targetVoice);
      failedKeysRef.current.delete(cacheKey);

      if (autoPlayRef.current) {
        await playWithVoice(item, targetVoice, {
          allowAutoplayGraceful: true,
        });
        return;
      }

      // Always pre-compute narration in the background even when auto-play is disabled
      setPrecomputingKey(item.key);
      try {
        await synthesizeAndCache(item, targetVoice);
        // If user enabled auto-play while this scene was synthesizing, start playback on success
        if (autoPlayRef.current) {
          await playWithVoice(item, targetVoice, {
            allowAutoplayGraceful: true,
          });
        }
      } catch {
        failedKeysRef.current.add(cacheKey);
      } finally {
        setPrecomputingKey((curr) => (curr === item.key ? null : curr));
      }
    },
    [playWithVoice, synthesizeAndCache],
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
      const expectedCacheKey = makeCacheKey(item, currentVoice);
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
      workerGenerationRef.current += 1;
      pendingQueueRef.current = [];
      voiceRef.current = nextVoice;
      setVoice(nextVoice);
      handlersRef.current.onVoicePersist?.(nextVoice);
      if (activeItemRef.current && activeKeyRef.current) {
        await playWithVoice(activeItemRef.current, nextVoice);
      }
    },
    [playWithVoice],
  );

  const setPreferredVoice = useCallback((nextVoice: TtsVoiceName) => {
    if (voiceRef.current === nextVoice) return;
    workerGenerationRef.current += 1;
    pendingQueueRef.current = [];
    voiceRef.current = nextVoice;
    setVoice(nextVoice);
  }, []);

  const setAutoPlayOnReady = useCallback((enabled: boolean) => {
    autoPlayRef.current = enabled;
    setAutoPlayOnReadyState(enabled);
    handlersRef.current.onAutoPlayPersist?.(enabled);
  }, []);

  const hydrateAutoPlayOnReady = useCallback((enabled: boolean) => {
    autoPlayRef.current = enabled;
    setAutoPlayOnReadyState(enabled);
  }, []);

  const isItemReady = useCallback(
    (item: Pick<TtsSpeechItem, 'key' | 'text'>) =>
      cacheRef.current.has(makeCacheKey(item, voiceRef.current)),
    [],
  );

  const isItemPrecomputing = useCallback(
    (item: Pick<TtsSpeechItem, 'key'>) => precomputingKey === item.key,
    [precomputingKey],
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
    precomputingKey,
    isPlaying,
    currentTime,
    duration,
    voice,
    autoPlayOnReady,
    error,
    errorKey,
    togglePlay,
    precomputeItems,
    precomputeAndMaybePlay,
    isItemReady,
    isItemPrecomputing,
    stop,
    seek,
    changeVoice,
    setPreferredVoice,
    setAutoPlayOnReady,
    hydrateAutoPlayOnReady,
    clearError,
  };
}
