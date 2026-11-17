import React, { useState } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { StoryTurn } from '../types/story';
import { DictaquillButton } from './DictaquillButton';

interface SceneInlineEditorProps {
  turn: StoryTurn;
  openingPremise?: string;
  contextHint?: string;
  onSave: (updatedTurn: StoryTurn) => void;
  onCancel: () => void;
}

export const SceneInlineEditor: React.FC<SceneInlineEditorProps> = ({
  turn,
  openingPremise,
  contextHint,
  onSave,
  onCancel,
}) => {
  const [sceneTitle, setSceneTitle] = useState(turn.sceneTitle);
  const [location, setLocation] = useState(turn.location);
  const [inStoryTime, setInStoryTime] = useState(turn.inStoryTime);
  const [userAction, setUserAction] = useState(turn.userAction ?? '');
  const [proseText, setProseText] = useState(turn.prose.join('\n\n'));
  const [activeCharsText, setActiveCharsText] = useState(
    turn.activeCharacters.join(', '),
  );
  const [continuityWarning, setContinuityWarning] = useState(
    turn.continuityWarning ?? '',
  );
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const paragraphs = proseText
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);

    if (paragraphs.length === 0) {
      setError('Scene output cannot be empty. Enter at least one paragraph.');
      return;
    }

    const activeCharacters = activeCharsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const updatedTurn: StoryTurn = {
      ...turn,
      sceneTitle: sceneTitle.trim() || turn.sceneTitle,
      location: location.trim() || turn.location,
      inStoryTime: inStoryTime.trim() || turn.inStoryTime,
      userAction: userAction.trim() ? userAction.trim() : null,
      prose: paragraphs,
      activeCharacters,
      continuityWarning: continuityWarning.trim()
        ? continuityWarning.trim()
        : null,
    };

    onSave(updatedTurn);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-200">
        <div>
          <p className="text-xs font-mono tabular-nums text-[#1D4ED8] font-medium">
            Editing Scene {String(turn.turnNumber).padStart(2, '0')}
          </p>
          <p className="text-xs text-[#6B7280] mt-0.5">
            Modify the prompt, narrative output, or scene details directly.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#4B5563] hover:text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Check className="w-3.5 h-3.5" />
            Save Changes
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="px-3.5 py-2.5 text-xs text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] rounded-lg flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 text-[#DC2626]" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-[#111827] mb-1">
            Scene Title
          </label>
          <input
            type="text"
            required
            value={sceneTitle}
            onChange={(e) => setSceneTitle(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#111827] mb-1">
            Location
          </label>
          <input
            type="text"
            required
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#111827] mb-1">
            In-Story Time
          </label>
          <input
            type="text"
            required
            value={inStoryTime}
            onChange={(e) => setInStoryTime(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
          />
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <label className="block text-xs font-medium text-[#111827]">
            Prompt / Action Taken
          </label>
          <DictaquillButton
            contextHint={contextHint}
            onTranscribe={(dictated) =>
              setUserAction((prev) =>
                prev.trim() ? `${prev.trimEnd()} ${dictated}` : dictated,
              )
            }
          />
        </div>
        <textarea
          rows={2}
          value={userAction}
          onChange={(e) => setUserAction(e.target.value)}
          placeholder={
            turn.turnNumber === 1 && openingPremise
              ? `Optional scene prompt (defaults to opening premise: ${openingPremise.slice(0, 90)}${openingPremise.length > 90 ? '...' : ''})`
              : 'Enter or edit the prompt/action that led to this scene (leave blank to clear)...'
          }
          className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white resize-y focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
        />
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <label className="block text-xs font-medium text-[#111827]">
            Scene Output (Prose)
          </label>
          <DictaquillButton
            contextHint={contextHint}
            onTranscribe={(dictated) =>
              setProseText((prev) =>
                prev.trim() ? `${prev.trimEnd()}\n\n${dictated}` : dictated,
              )
            }
          />
        </div>
        <textarea
          rows={8}
          required
          value={proseText}
          onChange={(e) => setProseText(e.target.value)}
          placeholder="Write or edit the scene prose here. Separate paragraphs with a blank line."
          className="w-full px-3.5 py-2.5 text-[15px] leading-relaxed border border-neutral-300 rounded-lg bg-white resize-y focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
        />
        <p className="text-[11px] text-[#6B7280] mt-1">
          Separate paragraphs with a blank line.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-[#111827] mb-1">
            Present Characters (comma-separated)
          </label>
          <input
            type="text"
            value={activeCharsText}
            onChange={(e) => setActiveCharsText(e.target.value)}
            placeholder="e.g., Harry Potter, Hermione Granger"
            className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#111827] mb-1">
            Continuity Notice (optional)
          </label>
          <input
            type="text"
            value={continuityWarning}
            onChange={(e) => setContinuityWarning(e.target.value)}
            placeholder="No active continuity notice"
            className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
          />
        </div>
      </div>

      <div className="pt-3 border-t border-neutral-100 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3.5 py-1.5 text-xs font-medium text-[#4B5563] hover:text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Check className="w-3.5 h-3.5" />
          Save Changes
        </button>
      </div>
    </form>
  );
};
