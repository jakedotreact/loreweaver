import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNarrativeSpeech } from '../../src/hooks/useNarrativeSpeech';

const SAMPLE_WAV_BASE64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

class MockAudio {
  src = '';
  paused = true;
  currentTime = 0;
  duration = 12;
  private listeners = new Map<string, Set<() => void>>();

  addEventListener(event: string, cb: () => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(cb);
  }

  removeEventListener(event: string, cb: () => void) {
    this.listeners.get(event)?.delete(cb);
  }

  private emit(event: string) {
    for (const cb of this.listeners.get(event) ?? []) {
      cb();
    }
  }

  async play() {
    this.paused = false;
    this.emit('play');
  }

  pause() {
    this.paused = true;
    this.emit('pause');
  }
}

describe('useNarrativeSpeech', () => {
  const originalAudio = globalThis.Audio;
  const originalFetch = globalThis.fetch;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  let blobSeq = 0;

  beforeEach(() => {
    blobSeq = 0;
    vi.stubGlobal('Audio', MockAudio);
    URL.createObjectURL = vi.fn(() => `blob:test-audio-${++blobSeq}`);
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.stubGlobal('Audio', originalAudio);
    vi.stubGlobal('fetch', originalFetch);
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it('does not fire background /api/story/tts requests when autoPlayOnReady is false', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useNarrativeSpeech({ initialAutoPlay: false }),
    );

    await act(async () => {
      result.current.precomputeItems([
        { key: 'scene:1', label: 'Scene 1', text: 'First scene prose.' },
        { key: 'scene:2', label: 'Scene 2', text: 'Second scene prose.' },
      ]);
      await result.current.precomputeAndMaybePlay({
        key: 'scene:3',
        label: 'Scene 3',
        text: 'Third scene prose.',
      });
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('synthesizes on demand when togglePlay is clicked and reuses cached audio on replay', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ audioBase64: SAMPLE_WAV_BASE64, mimeType: 'audio/wav' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useNarrativeSpeech({ initialAutoPlay: false }),
    );

    const item = {
      key: 'scene:1',
      label: 'Scene 1',
      text: 'The lantern flickered along the quay.',
      tone: 'Atmospheric',
    };

    await act(async () => {
      await result.current.togglePlay(item);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.isItemReady(item)).toBe(true);
    expect(result.current.isPlaying).toBe(true);

    await act(async () => {
      await result.current.togglePlay(item);
    });
    expect(result.current.isPlaying).toBe(false);

    await act(async () => {
      await result.current.togglePlay(item);
    });
    expect(result.current.isPlaying).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('trips a cooldown on 429 so background precompute calls do not storm /api/story/tts', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: 'Text-to-Speech rate or daily quota limit reached (429).',
          code: 'upstream_rate_limited',
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '90',
          },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useNarrativeSpeech({ initialAutoPlay: true }),
    );

    await act(async () => {
      await result.current.precomputeAndMaybePlay({
        key: 'scene:1',
        label: 'Scene 1',
        text: 'Scene one triggers 429.',
      });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.error).toMatch(/429|quota/i);

    await act(async () => {
      result.current.precomputeItems([
        { key: 'scene:2', label: 'Scene 2', text: 'Scene two.' },
        { key: 'scene:3', label: 'Scene 3', text: 'Scene three.' },
      ]);
      await result.current.precomputeAndMaybePlay({
        key: 'scene:4',
        label: 'Scene 4',
        text: 'Scene four.',
      });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
