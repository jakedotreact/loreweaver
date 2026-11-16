import React from 'react';
import { ModelConfig, ModelThinkingLevel, SupportedModelId } from '../types/story';

interface ModelOption {
  id: SupportedModelId;
  label: string;
  description: string;
  allowedThinkingLevels: ModelThinkingLevel[];
  defaultThinking: ModelThinkingLevel;
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen',
    description: 'Balanced prose quality and multi-step Cross-Index continuity reasoning.',
    allowedThinkingLevels: ['LOW', 'MEDIUM', 'HIGH', 'XHIGH'],
    defaultThinking: 'HIGH',
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    description: 'Ultra-fast, lightweight narrative drafting and rapid character deduction.',
    allowedThinkingLevels: ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'],
    defaultThinking: 'LOW',
  },
];

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
  const activeOption =
    MODEL_OPTIONS.find((m) => m.id === config.model) ?? MODEL_OPTIONS[0];

  const handleModelChange = (nextModelId: SupportedModelId) => {
    const nextOption =
      MODEL_OPTIONS.find((m) => m.id === nextModelId) ?? MODEL_OPTIONS[0];
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
        <label
          htmlFor={compact ? 'compact-model-select' : 'rail-model-select'}
          className="block text-xs font-medium text-[#111827] mb-1"
        >
          Model
        </label>
        <select
          id={compact ? 'compact-model-select' : 'rail-model-select'}
          value={activeOption.id}
          onChange={(e) => handleModelChange(e.target.value as SupportedModelId)}
          className="w-full px-3 py-2 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
        >
          {MODEL_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
        {!compact && (
          <p className="text-xs text-[#6B7280] mt-1.5 leading-relaxed">
            {activeOption.description}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor={compact ? 'compact-thinking-select' : 'rail-thinking-select'}
          className="block text-xs font-medium text-[#111827] mb-1"
        >
          Reasoning Depth
        </label>
        <select
          id={compact ? 'compact-thinking-select' : 'rail-thinking-select'}
          value={config.thinkingLevel}
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
    </div>
  );
};
