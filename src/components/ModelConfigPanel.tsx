import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { FALLBACK_MODEL_OPTIONS, useAvailableModels } from '../hooks/useAvailableModels';
import { ModelConfig, ModelThinkingLevel, SupportedModelId } from '../types/story';

export const MODEL_OPTIONS = FALLBACK_MODEL_OPTIONS;

const THINKING_LABELS: Record<ModelThinkingLevel, string> = {
  MINIMAL: 'Minimal (Fastest)',
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High (Recommended)',
  XHIGH: 'Extra High (Max Depth)',
};

interface ModelConfigPanelProps {
  config: ModelConfig;
  onChange: (next: ModelConfig) => void;
  compact?: boolean;
}

export const ModelConfigPanel: React.FC<ModelConfigPanelProps> = ({
  config,
  onChange,
  compact = false,
}) => {
  const { userSettings } = useAuth();
  const { models, error, isRefreshing, refreshModels } = useAvailableModels();
  const discovered = models.length > 0 ? models : FALLBACK_MODEL_OPTIONS;

  const allowedList = userSettings?.allowedModels ?? [];
  const filtered =
    allowedList.length > 0
      ? discovered.filter((m) => allowedList.includes(m.id))
      : discovered;
  const options = filtered.length > 0 ? filtered : discovered;

  const activeOption =
    options.find((m) => m.id === config.model) ?? options[0];

  const handleModelChange = (nextModelId: SupportedModelId) => {
    const nextOption =
      options.find((m) => m.id === nextModelId) ?? options[0];
    const validLevel = nextOption.allowedThinkingLevels.includes(config.thinkingLevel)
      ? config.thinkingLevel
      : nextOption.defaultThinking;
    onChange({
      model: nextOption.id,
      thinkingLevel: validLevel,
    });
  };

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <label
            htmlFor={compact ? 'compact-model-select' : 'rail-model-select'}
            className="block text-xs font-medium text-[#111827]"
          >
            Model
          </label>
          <button
            type="button"
            onClick={() => void refreshModels()}
            disabled={isRefreshing}
            title="Extract available Gemini models from the server API key"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1D4ED8] hover:underline disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw
              className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`}
            />
            {isRefreshing ? 'Refreshing...' : 'Refresh Models'}
          </button>
        </div>
        <select
          id={compact ? 'compact-model-select' : 'rail-model-select'}
          value={activeOption.id}
          onChange={(e) => handleModelChange(e.target.value as SupportedModelId)}
          className="w-full px-3 py-2 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
        >
          {options.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label === opt.id ? opt.label : `${opt.label} (${opt.id})`}
            </option>
          ))}
        </select>
        {!compact && (
          <p className="text-xs text-[#6B7280] mt-1.5 leading-relaxed">
            {activeOption.description}
          </p>
        )}
        {error && (
          <p className="text-[11px] text-[#991B1B] mt-1">{error}</p>
        )}
      </div>

      {activeOption.supportsThinkingLevel && (
        <div>
          <label
            htmlFor={compact ? 'compact-thinking-select' : 'rail-thinking-select'}
            className="block text-xs font-medium text-[#111827] mb-1"
          >
            Reasoning Depth
          </label>
          <select
            id={compact ? 'compact-thinking-select' : 'rail-thinking-select'}
            value={
              activeOption.allowedThinkingLevels.includes(config.thinkingLevel)
                ? config.thinkingLevel
                : activeOption.defaultThinking
            }
            onChange={(e) =>
              onChange({
                ...config,
                thinkingLevel: e.target.value as ModelThinkingLevel,
              })
            }
            className="w-full px-3 py-2 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
          >
            {activeOption.allowedThinkingLevels.map((lvl) => (
              <option key={lvl} value={lvl}>
                {THINKING_LABELS[lvl]}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};
