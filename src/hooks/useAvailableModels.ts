import { useCallback, useEffect, useState } from 'react';
import { DiscoveredModelOption } from '../types/story';

export interface AvailableModelsResponse {
  source: 'api' | 'default';
  models: DiscoveredModelOption[];
  totalDiscovered?: number;
  error?: string;
}

export const FALLBACK_MODEL_OPTIONS: DiscoveredModelOption[] = [
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen',
    description:
      'Balanced prose quality and multi-step Cross-Index continuity reasoning.',
    allowedThinkingLevels: ['LOW', 'MEDIUM', 'HIGH', 'XHIGH'],
    defaultThinking: 'HIGH',
    supportsThinkingLevel: true,
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    description:
      'Ultra-fast, lightweight narrative drafting and rapid character deduction.',
    allowedThinkingLevels: ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'],
    defaultThinking: 'LOW',
    supportsThinkingLevel: true,
  },
];

let cachedModels: DiscoveredModelOption[] | null = null;
let cachedSource: 'api' | 'default' = 'default';
let cachedError: string | null = null;
const listeners = new Set<() => void>();

function notifyListeners() {
  for (const fn of listeners) fn();
}

async function fetchModelsFromServer(): Promise<void> {
  const res = await fetch('/api/models');
  const raw = await res.text();
  let parsed: AvailableModelsResponse | null = null;
  try {
    parsed = JSON.parse(raw) as AvailableModelsResponse;
  } catch {
    throw new Error('Server returned an unexpected response while listing models.');
  }
  if (!res.ok) {
    throw new Error(
      (parsed as unknown as { error?: string })?.error ||
        `Failed to fetch models (HTTP ${res.status}).`,
    );
  }
  if (parsed && Array.isArray(parsed.models) && parsed.models.length > 0) {
    cachedModels = parsed.models;
    cachedSource = parsed.source ?? 'default';
    cachedError = parsed.error ?? null;
  } else {
    cachedModels = FALLBACK_MODEL_OPTIONS;
    cachedSource = 'default';
    cachedError = parsed?.error ?? null;
  }
  notifyListeners();
}

export function useAvailableModels() {
  const [models, setModels] = useState<DiscoveredModelOption[]>(
    () => cachedModels ?? FALLBACK_MODEL_OPTIONS,
  );
  const [source, setSource] = useState<'api' | 'default'>(cachedSource);
  const [error, setError] = useState<string | null>(cachedError);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const sync = () => {
      if (cachedModels) setModels(cachedModels);
      setSource(cachedSource);
      setError(cachedError);
    };
    listeners.add(sync);

    if (!cachedModels) {
      setIsRefreshing(true);
      fetchModelsFromServer()
        .catch((err) => {
          setError(
            err instanceof Error ? err.message : 'Unable to refresh models.',
          );
        })
        .finally(() => setIsRefreshing(false));
    }

    return () => {
      listeners.delete(sync);
    };
  }, []);

  const refreshModels = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      await fetchModelsFromServer();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to refresh models.');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  return {
    models,
    source,
    error,
    isRefreshing,
    refreshModels,
  };
}
