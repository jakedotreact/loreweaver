import React, { useEffect, useState } from 'react';
import { AlertTriangle, Flag, Loader2, RefreshCw, X } from 'lucide-react';
import { CrossIndexCategory, CrossIndexEntry, StoryTurn } from '../types/story';
import { DictaquillButton } from './DictaquillButton';

export interface RewriteCorrectionPayload {
  targetTurnId: string;
  correctionInstruction: string;
  editedFields: {
    sceneTitle: string;
    location: string;
    inStoryTime: string;
    userAction: string | null;
    activeCharacters: string[];
    continuityWarning: string | null;
    draftProse?: string[];
  };
  newLoreCorrection?: Omit<CrossIndexEntry, 'id'>;
}

interface SceneCorrectionModalProps {
  turn: StoryTurn | null;
  isRewriting: boolean;
  rewriteError: string | null;
  onClose: () => void;
  onSaveCorrection: (
    updatedTurn: StoryTurn,
    newLoreCorrection?: Omit<CrossIndexEntry, 'id'>,
  ) => void;
  onRewriteWithAi: (payload: RewriteCorrectionPayload) => Promise<boolean>;
}

export const SceneCorrectionModal: React.FC<SceneCorrectionModalProps> = ({
  turn,
  isRewriting,
  rewriteError,
  onClose,
  onSaveCorrection,
  onRewriteWithAi,
}) => {
  const [sceneTitle, setSceneTitle] = useState('');
  const [location, setLocation] = useState('');
  const [inStoryTime, setInStoryTime] = useState('');
  const [userAction, setUserAction] = useState('');
  const [proseText, setProseText] = useState('');
  const [activeCharsText, setActiveCharsText] = useState('');
  const [continuityWarning, setContinuityWarning] = useState('');
  const [correctionInstruction, setCorrectionInstruction] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  // Optional Cross-Index lore rule to prevent future recurrence
  const [addLoreRule, setAddLoreRule] = useState(false);
  const [loreCategory, setLoreCategory] = useState<CrossIndexCategory>('world_rule');
  const [loreTitle, setLoreTitle] = useState('');
  const [loreDetail, setLoreDetail] = useState('');

  useEffect(() => {
    if (turn) {
      setSceneTitle(turn.sceneTitle);
      setLocation(turn.location);
      setInStoryTime(turn.inStoryTime);
      setUserAction(turn.userAction ?? '');
      setProseText(turn.prose.join('\n\n'));
      setActiveCharsText(turn.activeCharacters.join(', '));
      setContinuityWarning(turn.continuityWarning ?? '');
      setCorrectionInstruction('');
      setLocalError(null);
      setAddLoreRule(false);
      setLoreCategory('world_rule');
      setLoreTitle('');
      setLoreDetail('');
    }
  }, [turn]);

  if (!turn) return null;

  const buildNewLoreCorrection = (): Omit<CrossIndexEntry, 'id'> | undefined => {
    if (addLoreRule && loreTitle.trim() && loreDetail.trim()) {
      return {
        category: loreCategory,
        title: loreTitle.trim(),
        detail: loreDetail.trim(),
        tags: ['manual-correction', `turn-${turn.turnNumber}`],
        status: 'active',
        introducedAtTurn: turn.turnNumber,
        lastVerifiedTurn: turn.turnNumber,
        pinned: true,
      };
    }
    return undefined;
  };

  const parseDraftProse = (): string[] =>
    proseText
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);

  const parseChars = (): string[] =>
    activeCharsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  const handleSaveManualOnly = () => {
    if (isRewriting) return;
    setLocalError(null);
    const parsedParagraphs = parseDraftProse();
    const parsedChars = parseChars();
    const nextNotes = [...turn.continuityNotes];
    if (correctionInstruction.trim()) {
      nextNotes.push(`Manual correction: ${correctionInstruction.trim()}`);
    }

    const updatedTurn: StoryTurn = {
      ...turn,
      sceneTitle: sceneTitle.trim() || turn.sceneTitle,
      location: location.trim() || turn.location,
      inStoryTime: inStoryTime.trim() || turn.inStoryTime,
      userAction: userAction.trim() ? userAction.trim() : null,
      prose: parsedParagraphs.length > 0 ? parsedParagraphs : turn.prose,
      activeCharacters: parsedChars,
      continuityWarning: continuityWarning.trim() ? continuityWarning.trim() : null,
      continuityNotes: nextNotes,
    };

    onSaveCorrection(updatedTurn, buildNewLoreCorrection());
    onClose();
  };

  const handleRewriteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRewriting) return;
    setLocalError(null);

    const parsedParagraphs = parseDraftProse();
    const parsedChars = parseChars();
    const newLore = buildNewLoreCorrection();

    const proseChanged = proseText.trim() !== turn.prose.join('\n\n').trim();
    const metadataChanged =
      sceneTitle.trim() !== turn.sceneTitle.trim() ||
      location.trim() !== turn.location.trim() ||
      inStoryTime.trim() !== turn.inStoryTime.trim() ||
      userAction.trim() !== (turn.userAction ?? '').trim() ||
      activeCharsText.trim() !== turn.activeCharacters.join(', ').trim() ||
      continuityWarning.trim() !== (turn.continuityWarning ?? '').trim();

    if (!correctionInstruction.trim() && !proseChanged && !metadataChanged && !newLore) {
      setLocalError(
        'Enter correction instructions, adjust scene details, or add a Cross-Index rule so the model knows what to rewrite.',
      );
      return;
    }

    const ok = await onRewriteWithAi({
      targetTurnId: turn.id,
      correctionInstruction: correctionInstruction.trim(),
      editedFields: {
        sceneTitle: sceneTitle.trim() || turn.sceneTitle,
        location: location.trim() || turn.location,
        inStoryTime: inStoryTime.trim() || turn.inStoryTime,
        userAction:
          turn.turnNumber > 1
            ? userAction.trim()
              ? userAction.trim()
              : null
            : null,
        activeCharacters: parsedChars,
        continuityWarning: continuityWarning.trim() ? continuityWarning.trim() : null,
        draftProse: proseChanged && parsedParagraphs.length > 0 ? parsedParagraphs : undefined,
      },
      newLoreCorrection: newLore,
    });

    if (ok) {
      onClose();
    }
  };

  const displayError = localError || rewriteError;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scene-correction-heading"
    >
      <div className="w-full max-w-2xl bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <Flag className="w-4 h-4 text-[#D97706]" />
            <div>
              <h2
                id="scene-correction-heading"
                className="font-editorial text-xl font-semibold text-[#111827]"
              >
                Correct &amp; Rewrite Scene {String(turn.turnNumber).padStart(2, '0')}
              </h2>
              <p className="text-xs text-[#6B7280]">
                Flag missed inconsistencies or author errors and have the model rewrite this scene retroactively.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isRewriting}
            onClick={onClose}
            aria-label="Close correction dialog"
            className="p-2 text-[#6B7280] hover:text-[#111827] hover:bg-neutral-100 disabled:opacity-40 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleRewriteSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {displayError && (
            <div className="px-4 py-3 bg-[#FEF2F2] border border-[#FECACA] rounded-lg flex items-start gap-2.5 text-sm text-[#B91C1C]">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{displayError}</span>
            </div>
          )}

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <label className="block text-xs font-medium text-[#111827]">
                Correction / Rewrite Instructions for the Model
              </label>
              <DictaquillButton
                disabled={isRewriting}
                contextHint={`Scene ${turn.turnNumber}: ${turn.sceneTitle}. Characters: ${turn.activeCharacters.join(', ')}`}
                onTranscribe={(dictated) =>
                  setCorrectionInstruction((prev) =>
                    prev.trim() ? `${prev.trimEnd()} ${dictated}` : dictated,
                  )
                }
              />
            </div>
            <textarea
              rows={3}
              value={correctionInstruction}
              disabled={isRewriting}
              onChange={(e) => setCorrectionInstruction(e.target.value)}
              placeholder="e.g., Hermione wasn't carrying the Marauder's Map here—Harry kept it in his cloak, and Snape should arrive two minutes later after hearing the alarm."
              className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] disabled:bg-neutral-50"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#111827] mb-1">
                Scene Title
              </label>
              <input
                type="text"
                required
                disabled={isRewriting}
                value={sceneTitle}
                onChange={(e) => setSceneTitle(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] disabled:bg-neutral-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#111827] mb-1">
                Location
              </label>
              <input
                type="text"
                required
                disabled={isRewriting}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] disabled:bg-neutral-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#111827] mb-1">
                In-Story Time
              </label>
              <input
                type="text"
                required
                disabled={isRewriting}
                value={inStoryTime}
                onChange={(e) => setInStoryTime(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] disabled:bg-neutral-50"
              />
            </div>
          </div>

          {turn.turnNumber > 1 && (
            <div>
              <label className="block text-xs font-medium text-[#111827] mb-1">
                Prompt / Action Taken
              </label>
              <textarea
                rows={2}
                disabled={isRewriting}
                value={userAction}
                onChange={(e) => setUserAction(e.target.value)}
                placeholder="Edit the prompt or action recorded for this scene..."
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] disabled:bg-neutral-50"
              />
            </div>
          )}

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <label className="block text-xs font-medium text-[#111827]">
                Scene Prose (edit directly or leave as reference for the model rewrite)
              </label>
              <DictaquillButton
                disabled={isRewriting}
                contextHint={`Scene ${turn.turnNumber}: ${turn.sceneTitle}. Characters: ${turn.activeCharacters.join(', ')}`}
                onTranscribe={(dictated) =>
                  setProseText((prev) =>
                    prev.trim() ? `${prev.trimEnd()}\n\n${dictated}` : dictated,
                  )
                }
              />
            </div>
            <textarea
              rows={6}
              required
              disabled={isRewriting}
              value={proseText}
              onChange={(e) => setProseText(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm leading-relaxed border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] disabled:bg-neutral-50"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#111827] mb-1">
                Present Characters (comma-separated)
              </label>
              <input
                type="text"
                disabled={isRewriting}
                value={activeCharsText}
                onChange={(e) => setActiveCharsText(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] disabled:bg-neutral-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#111827] mb-1">
                Continuity Notice (clear to dismiss)
              </label>
              <input
                type="text"
                disabled={isRewriting}
                value={continuityWarning}
                onChange={(e) => setContinuityWarning(e.target.value)}
                placeholder="No active notice"
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] disabled:bg-neutral-50"
              />
            </div>
          </div>

          {/* Optional Cross-Index Invariant */}
          <div className="pt-3 border-t border-neutral-200 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium text-[#111827] cursor-pointer">
              <input
                type="checkbox"
                disabled={isRewriting}
                checked={addLoreRule}
                onChange={(e) => setAddLoreRule(e.target.checked)}
                className="rounded border-neutral-300 text-[#1D4ED8] focus:ring-[#1D4ED8]"
              />
              Also pin a Cross-Index rule so this rewrite and future scenes obey it
            </label>

            {addLoreRule && (
              <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#111827] mb-1">
                      Category
                    </label>
                    <select
                      disabled={isRewriting}
                      value={loreCategory}
                      onChange={(e) =>
                        setLoreCategory(e.target.value as CrossIndexCategory)
                      }
                      className="w-full px-2.5 py-2 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                    >
                      <option value="world_rule">World Rule</option>
                      <option value="character_state">Character Fact</option>
                      <option value="item">Item</option>
                      <option value="location">Location</option>
                      <option value="timeline">Timeline</option>
                      <option value="plot_thread">Plot Thread</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#111827] mb-1">
                      Correction Title
                    </label>
                    <input
                      type="text"
                      required={addLoreRule}
                      disabled={isRewriting}
                      value={loreTitle}
                      onChange={(e) => setLoreTitle(e.target.value)}
                      placeholder="e.g., Snape was in the dungeons during curfew"
                      className="w-full px-3 py-2 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#111827] mb-1">
                    Canonical Detail
                  </label>
                  <textarea
                    rows={2}
                    required={addLoreRule}
                    disabled={isRewriting}
                    value={loreDetail}
                    onChange={(e) => setLoreDetail(e.target.value)}
                    placeholder="State the corrected canon fact or constraint..."
                    className="w-full px-3 py-2 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              disabled={isRewriting}
              onClick={handleSaveManualOnly}
              className="px-3.5 py-2 text-xs font-medium text-[#374151] bg-white border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              Save Manual Edits Only
            </button>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={isRewriting}
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-[#4B5563] hover:text-[#111827] disabled:opacity-50 whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isRewriting}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
              >
                {isRewriting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Rewriting Scene...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Rewrite Scene with AI
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
