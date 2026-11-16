import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bookmark,
  BookOpen,
  CheckCircle2,
  Download,
  Flag,
  GitBranch,
  Library,
  Loader2,
  Pause,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Volume2,
} from 'lucide-react';
import { NarrativeSpeechControls } from '../hooks/useNarrativeSpeech';
import { CrossIndexEntry, ModelConfig, StoryChoice, StoryProject, StoryTurn } from '../types/story';
import { downloadSceneHtml } from '../utils/htmlExport';
import { DictaquillButton } from './DictaquillButton';
import { ItemLoreModal, LoreTarget } from './ItemLoreModal';
import { ModelConfigPanel } from './ModelConfigPanel';
import { RewriteCorrectionPayload, SceneCorrectionModal } from './SceneCorrectionModal';
import { WorkspaceTab } from './TopNav';
import { TtsPlayerBar } from './TtsPlayerBar';

interface StoryWorkspaceProps {
  project: StoryProject;
  storyCount: number;
  onOpenStoriesLibrary: () => void;
  isAdvancing: boolean;
  pendingPrompt: string | null;
  advanceError: string | null;
  lastFailedAction: {
    userAction: string;
    selectedChoiceId: string | null;
  } | null;
  onAdvanceStory: (userAction: string, selectedChoiceId: string | null) => void;
  onRetryAdvance: () => void;
  onDismissAdvanceError: () => void;
  onBranchFromTurn: (turnNumber: number) => void;
  onCreateSavePoint: (label: string) => void;
  onRestoreSavePoint: (saveId: string) => void;
  onNavigateTab: (tab: WorkspaceTab) => void;
  onRunAuditAndOpen: () => void;
  onOpenHtmlExport: () => void;
  onCorrectTurn: (
    updatedTurn: StoryTurn,
    newLoreCorrection?: Omit<CrossIndexEntry, 'id'>,
  ) => void;
  isRewritingScene: boolean;
  rewriteError: string | null;
  onRewriteTurn: (payload: RewriteCorrectionPayload) => Promise<boolean>;
  modelConfig: ModelConfig;
  onChangeModelConfig: (next: ModelConfig) => void;
  speech: NarrativeSpeechControls;
}

export const StoryWorkspace: React.FC<StoryWorkspaceProps> = ({
  project,
  storyCount,
  onOpenStoriesLibrary,
  isAdvancing,
  pendingPrompt,
  advanceError,
  lastFailedAction,
  onAdvanceStory,
  onRetryAdvance,
  onDismissAdvanceError,
  onBranchFromTurn,
  onCreateSavePoint,
  onRestoreSavePoint,
  onNavigateTab,
  onRunAuditAndOpen,
  onOpenHtmlExport,
  onCorrectTurn,
  isRewritingScene,
  rewriteError,
  onRewriteTurn,
  modelConfig,
  onChangeModelConfig,
  speech,
}) => {
  const [customAction, setCustomAction] = useState('');
  const [quickSaveLabel, setQuickSaveLabel] = useState('');
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [flaggingTurn, setFlaggingTurn] = useState<StoryTurn | null>(null);
  const [loreTarget, setLoreTarget] = useState<LoreTarget | null>(null);
  const latestSceneRef = useRef<HTMLElement>(null);
  const pendingRef = useRef<HTMLDivElement>(null);

  const latestTurn = project.turns[project.turns.length - 1];

  const turnChapterMap = useMemo(() => {
    const map = new Map<string, { chapterNumber: number; title: string }>();
    for (const ch of project.chapters ?? []) {
      for (const tid of ch.turnIds) {
        map.set(tid, { chapterNumber: ch.chapterNumber, title: ch.title });
      }
    }
    return map;
  }, [project.chapters]);

  useEffect(() => {
    if (isAdvancing && pendingRef.current) {
      pendingRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isAdvancing]);

  useEffect(() => {
    if (project.turns.length > 1 && latestSceneRef.current) {
      latestSceneRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [project.turns.length]);

  const handleChoiceClick = (choice: StoryChoice) => {
    if (isAdvancing) return;
    onAdvanceStory(choice.label, choice.id);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customAction.trim() || isAdvancing) return;
    const text = customAction.trim();
    setCustomAction('');
    onAdvanceStory(text, null);
  };

  const handleQuickSave = (e: React.FormEvent) => {
    e.preventDefault();
    const label =
      quickSaveLabel.trim() ||
      `Scene ${String(latestTurn?.turnNumber ?? 1).padStart(2, '0')} — ${
        latestTurn?.sceneTitle ?? 'Checkpoint'
      }`;
    onCreateSavePoint(label);
    setQuickSaveLabel('');
    setSaveToast(`Saved "${label}"`);
    setTimeout(() => setSaveToast(null), 2600);
  };

  const pinnedLore = project.crossIndex.filter((e) => e.status === 'active').slice(0, 6);

  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-8 py-8">
      {/* Story Masthead */}
      <div className="pb-6 mb-8 border-b border-neutral-200 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-xs text-[#6B7280]">
            {project.universe} <span aria-hidden="true">·</span> {project.setting}{' '}
            <span aria-hidden="true">·</span> {project.tone}
          </p>
          <h1 className="font-editorial text-3xl sm:text-4xl font-semibold text-[#111827] mt-1.5 text-balance">
            {project.title}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onOpenStoriesLibrary}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <Library className="w-4 h-4 text-[#1D4ED8]" />
            My Stories ({storyCount})
          </button>
          <button
            type="button"
            onClick={() => {
              const label = `Scene ${String(latestTurn?.turnNumber ?? 1).padStart(
                2,
                '0',
              )} — ${latestTurn?.sceneTitle ?? 'Checkpoint'}`;
              onCreateSavePoint(label);
              setSaveToast(`Saved "${label}"`);
              setTimeout(() => setSaveToast(null), 2600);
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <Bookmark className="w-4 h-4 text-[#1D4ED8]" />
            Save Point
          </button>
          <button
            type="button"
            onClick={onOpenHtmlExport}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-[#1D4ED8]" />
            Export HTML
          </button>
          <button
            type="button"
            onClick={onRunAuditAndOpen}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <ShieldCheck className="w-4 h-4 text-[#1D4ED8]" />
            Audit Continuity
          </button>
        </div>
      </div>

      {saveToast && (
        <div className="mb-6 px-4 py-2.5 text-sm text-[#15803D] bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{saveToast}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8 items-start">
        {/* Left Main Narrative & Steering Column */}
        <main className="space-y-8 min-w-0">
          {/* Narrative Turns Stream */}
          <div className="space-y-8">
            {project.turns.map((turn, index) => {
              const isLatest = index === project.turns.length - 1;
              const chapterInfo = turnChapterMap.get(turn.id);
              const ttsKey = `scene:${turn.id}`;
              const isTtsLoading = speech.loadingKey === ttsKey;
              const isTtsActive = speech.activeKey === ttsKey;
              const isTtsPlaying = isTtsActive && speech.isPlaying;
              const ttsItem = {
                key: ttsKey,
                label: `Scene ${String(turn.turnNumber).padStart(2, '0')} — ${turn.sceneTitle}`,
                text: `Scene ${turn.turnNumber}: ${turn.sceneTitle}.\n\n${turn.prose.join('\n\n')}`,
                tone: project.tone,
              };
              return (
                <article
                  key={turn.id}
                  ref={isLatest ? latestSceneRef : undefined}
                  className="bg-white border border-neutral-200 rounded-xl p-6 sm:p-8"
                >
                  {/* Scene Header */}
                  <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-neutral-100">
                    <div>
                      <p className="text-xs font-mono tabular-nums text-[#6B7280]">
                        {chapterInfo && (
                          <>
                            <span className="text-[#1D4ED8] font-medium">
                              Ch. {String(chapterInfo.chapterNumber).padStart(2, '0')} ({chapterInfo.title})
                            </span>{' '}
                            <span aria-hidden="true">·</span>{' '}
                          </>
                        )}
                        Scene {String(turn.turnNumber).padStart(2, '0')}{' '}
                        <span aria-hidden="true">·</span> {turn.location}{' '}
                        <span aria-hidden="true">·</span> {turn.inStoryTime}
                      </p>
                      <h2 className="font-editorial text-2xl font-semibold text-[#111827] mt-1">
                        {turn.sceneTitle}
                      </h2>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => speech.togglePlay(ttsItem)}
                        aria-label={
                          isTtsLoading
                            ? `Synthesizing audio for scene ${turn.turnNumber}`
                            : isTtsPlaying
                              ? `Pause narration for scene ${turn.turnNumber}`
                              : `Listen to scene ${turn.turnNumber}`
                        }
                        title="Read scene aloud (Text-to-Speech)"
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                          isTtsActive || isTtsLoading
                            ? 'text-[#1D4ED8] bg-[#EFF6FF] border-[#BFDBFE]'
                            : 'text-[#4B5563] hover:text-[#1D4ED8] hover:bg-[#F8FAFC] border-neutral-200 hover:border-[#BFDBFE]'
                        }`}
                      >
                        {isTtsLoading ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Loading
                          </>
                        ) : isTtsPlaying ? (
                          <>
                            <Pause className="w-3.5 h-3.5" />
                            Pause
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3.5 h-3.5" />
                            Listen
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setLoreTarget({ kind: 'scene', turn })}
                        aria-label={`View lore for scene ${turn.turnNumber}`}
                        title="View scene lore and continuity facts"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#4B5563] hover:text-[#1D4ED8] hover:bg-[#F8FAFC] border border-neutral-200 hover:border-[#BFDBFE] rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        Lore
                      </button>
                      <button
                        type="button"
                        onClick={() => setFlaggingTurn(turn)}
                        aria-label={`Flag scene ${turn.turnNumber} for manual correction`}
                        title="Flag missed inconsistency or author error"
                        className="p-1.5 text-[#6B7280] hover:text-[#B45309] hover:bg-[#FFFBEB] border border-neutral-200 hover:border-[#FDE68A] rounded-lg transition-colors"
                      >
                        <Flag className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const filename = downloadSceneHtml(project, turn);
                          setSaveToast(`Saved ${filename}`);
                          setTimeout(() => setSaveToast(null), 2600);
                        }}
                        aria-label={`Save scene ${turn.turnNumber} HTML`}
                        title="Save scene HTML source"
                        className="p-1.5 text-[#6B7280] hover:text-[#1D4ED8] hover:bg-[#F8FAFC] border border-neutral-200 hover:border-[#BFDBFE] rounded-lg transition-colors"
                      >
                        <Save className="w-3.5 h-3.5" />
                      </button>
                      {!isLatest && (
                        <button
                          type="button"
                          onClick={() => onBranchFromTurn(turn.turnNumber)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#4B5563] hover:text-[#111827] border border-neutral-200 hover:border-neutral-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
                        >
                          <GitBranch className="w-3.5 h-3.5" />
                          Branch from Here
                        </button>
                      )}
                    </div>
                  </div>

                  <TtsPlayerBar
                    itemKey={ttsKey}
                    downloadName={`scene-${String(turn.turnNumber).padStart(2, '0')}`}
                    speech={speech}
                    onReplay={() => speech.togglePlay(ttsItem)}
                  />

                  {/* User Action Leading Into Scene */}
                  {turn.userAction && (
                    <div className="mt-4 px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-[#374151] whitespace-pre-wrap">
                      <span className="font-semibold text-[#111827]">Action taken: </span>
                      {turn.userAction}
                    </div>
                  )}

                  {/* Continuity Notice if user's freeform input conflicted with lore */}
                  {turn.continuityWarning && (
                    <div className="mt-4 px-4 py-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg flex items-start gap-2.5 text-sm text-[#92400E]">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#D97706]" />
                      <div>
                        <span className="font-semibold">Continuity Notice: </span>
                        {turn.continuityWarning}
                      </div>
                    </div>
                  )}

                  {/* Literary Prose */}
                  <div className="mt-5 space-y-4 max-w-[68ch] text-[15.5px] leading-[1.75] text-[#111827]">
                    {turn.prose.map((paragraph, pIdx) => (
                      <p key={pIdx}>{paragraph}</p>
                    ))}
                  </div>

                  {/* Scene Continuity Verification Footer */}
                  <div className="mt-6 pt-4 border-t border-neutral-100 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B7280]">
                      <span>
                        Present: {turn.activeCharacters.join(' · ') || 'Narrator'}
                      </span>
                      <span className="font-mono tabular-nums">
                        {turn.continuityNotes.length} continuity checks passed
                      </span>
                    </div>
                    {turn.continuityNotes.length > 0 && (
                      <ul className="text-xs text-[#6B7280] space-y-0.5">
                        {turn.continuityNotes.map((note, nIdx) => (
                          <li key={nIdx}>{note}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </article>
              );
            })}

            {/* Pending Narrative Notification & Loading Skeleton */}
            {isAdvancing && (
              <div
                ref={pendingRef}
                aria-live="polite"
                className="bg-white border border-neutral-200 rounded-xl p-6 sm:p-8 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-100">
                  <span className="text-xs font-mono tabular-nums text-[#1D4ED8] font-medium">
                    Pending · Scene {String((latestTurn?.turnNumber ?? 0) + 1).padStart(2, '0')}
                  </span>
                  <span className="text-xs text-[#6B7280]">
                    Checking Cross-Index lore and generating next branch...
                  </span>
                </div>

                {pendingPrompt && (
                  <div className="px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-[#111827] whitespace-pre-wrap">
                    <span className="text-xs font-semibold text-[#4B5563] block mb-0.5">
                      Prompt submitted
                    </span>
                    {pendingPrompt}
                  </div>
                )}

                <div className="space-y-3 pt-1 animate-pulse">
                  <div className="h-5 w-64 bg-neutral-200 rounded" />
                  <div className="h-4 w-full bg-neutral-100 rounded" />
                  <div className="h-4 w-11/12 bg-neutral-100 rounded" />
                  <div className="h-4 w-4/5 bg-neutral-100 rounded" />
                </div>
              </div>
            )}
          </div>

          {/* Interactive Choice & Custom Action Deck */}
          {latestTurn && (
            <section
              aria-label="Narrative Choices"
              className="bg-white border border-neutral-200 rounded-xl p-6 sm:p-8 space-y-5"
            >
              <div>
                <h3 className="font-editorial text-xl font-semibold text-[#111827]">
                  Steer the Next Scene
                </h3>
                <p className="text-sm text-[#4B5563] mt-0.5">
                  Choose a narrative branch or write your own action, dialogue, or direction.
                </p>
              </div>

              {advanceError && (
                <div
                  role="alert"
                  className="p-4 bg-[#FEF2F2] border border-[#FECACA] rounded-xl space-y-3"
                >
                  <div className="flex items-start gap-2.5 text-sm text-[#991B1B]">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#DC2626]" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-semibold text-[#991B1B]">
                        Unable to generate next scene
                      </p>
                      <p className="text-sm text-[#991B1B]">{advanceError}</p>
                    </div>
                  </div>

                  {lastFailedAction && (
                    <div className="px-3.5 py-2.5 bg-white border border-[#FECACA] rounded-lg text-xs text-[#374151] whitespace-pre-wrap">
                      <span className="font-semibold text-[#111827] block mb-0.5">
                        Latest prompt
                      </span>
                      {lastFailedAction.userAction}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    {lastFailedAction && (
                      <>
                        <button
                          type="button"
                          disabled={isAdvancing}
                          onClick={onRetryAdvance}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#B91C1C] hover:bg-[#991B1B] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Retry Latest Prompt
                        </button>
                        <button
                          type="button"
                          disabled={isAdvancing}
                          onClick={() => {
                            setCustomAction(lastFailedAction.userAction);
                            onDismissAdvanceError();
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#7F1D1D] bg-white hover:bg-[#FEF2F2] border border-[#FECACA] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                        >
                          Edit in Box
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      disabled={isAdvancing}
                      onClick={onDismissAdvanceError}
                      className="px-3 py-1.5 text-xs font-medium text-[#7F1D1D] hover:text-[#450A0A] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {/* Branching Choices */}
              <div className="grid grid-cols-1 gap-3">
                {latestTurn.choices.map((choice, idx) => (
                  <button
                    key={choice.id}
                    type="button"
                    disabled={isAdvancing}
                    onClick={() => handleChoiceClick(choice)}
                    className="group text-left p-4 border border-neutral-200 hover:border-[#1D4ED8] hover:bg-[#F8FAFC] disabled:opacity-50 rounded-xl transition-colors flex items-start justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-mono tabular-nums text-[#6B7280]">
                        Option {String(idx + 1).padStart(2, '0')} <span aria-hidden="true">·</span>{' '}
                        {choice.intent}
                      </p>
                      <p className="text-sm font-semibold text-[#111827] mt-1 group-hover:text-[#1D4ED8] transition-colors">
                        {choice.label}
                      </p>
                      <p className="text-xs text-[#4B5563] mt-1 leading-relaxed">
                        {choice.consequenceHint}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[#9CA3AF] group-hover:text-[#1D4ED8] shrink-0 mt-1 transition-colors" />
                  </button>
                ))}
              </div>

              {/* Custom Freeform Action Input */}
              <form
                onSubmit={handleCustomSubmit}
                className="pt-4 border-t border-neutral-200 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="custom-story-action"
                    className="block text-xs font-semibold text-[#111827]"
                  >
                    Custom Action or Dialogue
                  </label>
                  <DictaquillButton
                    disabled={isAdvancing}
                    contextHint={`${project.universe}. Characters: ${project.characters
                      .map((c) => c.name)
                      .join(', ')}`}
                    onTranscribe={(dictated) =>
                      setCustomAction((prev) =>
                        prev.trim() ? `${prev.trimEnd()} ${dictated}` : dictated,
                      )
                    }
                  />
                </div>
                <div className="space-y-3">
                  <textarea
                    id="custom-story-action"
                    rows={3}
                    value={customAction}
                    disabled={isAdvancing}
                    onChange={(e) => setCustomAction(e.target.value)}
                    placeholder="Write or dictate with Dictaquill any move, spell, dialogue, or multi-line plot direction..."
                    className="w-full px-4 py-2.5 text-sm border border-neutral-300 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] focus:border-[#1D4ED8]"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-[#6B7280]">
                      Press Enter for a new line. Click Continue Story to submit.
                    </span>
                    <button
                      type="submit"
                      disabled={isAdvancing || !customAction.trim()}
                      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <Send className="w-4 h-4" />
                      Continue Story
                    </button>
                  </div>
                </div>
              </form>
            </section>
          )}
        </main>

        {/* Right Contextual Reference Rail */}
        <aside className="space-y-6 lg:sticky lg:top-24">
          {/* Active Cast Snapshot */}
          <section className="bg-white border border-neutral-200 rounded-xl p-5">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h2 className="text-sm font-semibold text-[#111827]">
                Active Cast ({project.characters.length})
              </h2>
              <button
                type="button"
                onClick={() => onNavigateTab('characters')}
                className="text-xs font-medium text-[#1D4ED8] hover:underline whitespace-nowrap"
              >
                Manage Cast
              </button>
            </div>

            <div className="divide-y divide-neutral-100 max-h-[420px] overflow-y-auto pr-1">
              {[...project.characters]
                .sort((a, b) => {
                  const activeNames = (latestTurn?.activeCharacters ?? []).map((n) =>
                    n.toLowerCase(),
                  );
                  const aInScene = activeNames.some(
                    (n) =>
                      n === a.name.toLowerCase() ||
                      a.name.toLowerCase().includes(n) ||
                      n.includes(a.name.toLowerCase()),
                  );
                  const bInScene = activeNames.some(
                    (n) =>
                      n === b.name.toLowerCase() ||
                      b.name.toLowerCase().includes(n) ||
                      n.includes(b.name.toLowerCase()),
                  );
                  if (aInScene !== bInScene) return aInScene ? -1 : 1;
                  return 0;
                })
                .map((char) => {
                  const isInScene = (latestTurn?.activeCharacters ?? []).some((n) => {
                    const low = n.toLowerCase();
                    const cLow = char.name.toLowerCase();
                    return low === cLow || cLow.includes(low) || low.includes(cLow);
                  });
                  return (
                    <div key={char.id} className="py-3 first:pt-3 last:pb-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold text-[#111827] truncate">
                          {char.name}
                        </span>
                        <span className="text-xs text-[#6B7280] shrink-0">
                          {char.role}
                          {isInScene ? ' · In scene' : ''}
                        </span>
                      </div>
                      <p className="text-xs text-[#4B5563] mt-0.5 truncate">{char.location}</p>
                      {char.flaws[0] && (
                        <p className="text-xs text-[#6B7280] mt-1 line-clamp-1">
                          Flaw: {char.flaws[0]}
                        </p>
                      )}
                    </div>
                  );
                })}
            </div>
          </section>

          {/* Governing Cross-Index Lore */}
          <section className="bg-white border border-neutral-200 rounded-xl p-5">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h2 className="text-sm font-semibold text-[#111827]">Cross-Index Ledger</h2>
              <button
                type="button"
                onClick={() => onNavigateTab('cross-index')}
                className="text-xs font-medium text-[#1D4ED8] hover:underline whitespace-nowrap"
              >
                Open Index ({project.crossIndex.length})
              </button>
            </div>

            <div className="divide-y divide-neutral-100">
              {pinnedLore.map((entry) => (
                <div key={entry.id} className="py-3 first:pt-3 last:pb-0">
                  <p className="text-xs font-medium text-[#111827]">{entry.title}</p>
                  <p className="text-xs text-[#4B5563] mt-0.5 line-clamp-2 leading-relaxed">
                    {entry.detail}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Quick Save Points */}
          <section className="bg-white border border-neutral-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
              <h2 className="text-sm font-semibold text-[#111827]">Save Points</h2>
              <button
                type="button"
                onClick={() => onNavigateTab('save-points')}
                className="text-xs font-medium text-[#1D4ED8] hover:underline whitespace-nowrap"
              >
                View All ({project.savePoints.length})
              </button>
            </div>

            <form onSubmit={handleQuickSave} className="flex gap-2">
              <input
                type="text"
                value={quickSaveLabel}
                onChange={(e) => setQuickSaveLabel(e.target.value)}
                placeholder="Checkpoint label..."
                className="min-w-0 flex-1 px-3 py-1.5 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
              />
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Save
              </button>
            </form>

            {project.savePoints.length > 0 ? (
              <div className="divide-y divide-neutral-100">
                {project.savePoints.slice(0, 3).map((sp) => (
                  <div
                    key={sp.id}
                    className="py-2.5 first:pt-1 last:pb-0 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[#111827] truncate">
                        {sp.label}
                      </p>
                      <p className="text-[11px] font-mono tabular-nums text-[#6B7280]">
                        Scene {String(sp.turnNumber).padStart(2, '0')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRestoreSavePoint(sp.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#111827] border border-neutral-200 hover:bg-neutral-50 rounded-md transition-colors whitespace-nowrap shrink-0"
                    >
                      <RotateCcw className="w-3 h-3 text-[#1D4ED8]" />
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#6B7280]">
                No save points yet. Capture a snapshot before branching choices.
              </p>
            )}
          </section>

          {/* Model Configuration */}
          <section className="bg-white border border-neutral-200 rounded-xl p-5 space-y-3">
            <div className="pb-2 border-b border-neutral-100">
              <h2 className="text-sm font-semibold text-[#111827]">Model Configuration</h2>
            </div>
            <ModelConfigPanel config={modelConfig} onChange={onChangeModelConfig} />
          </section>
        </aside>
      </div>

      <SceneCorrectionModal
        turn={flaggingTurn}
        isRewriting={isRewritingScene}
        rewriteError={rewriteError}
        onClose={() => setFlaggingTurn(null)}
        onSaveCorrection={(updatedTurn, newLoreCorrection) => {
          onCorrectTurn(updatedTurn, newLoreCorrection);
          setSaveToast(
            `Updated Scene ${String(updatedTurn.turnNumber).padStart(2, '0')}${
              newLoreCorrection ? ' and pinned rule to Cross-Index' : ''
            }`,
          );
          setTimeout(() => setSaveToast(null), 3000);
        }}
        onRewriteWithAi={async (payload) => {
          const ok = await onRewriteTurn(payload);
          if (ok && flaggingTurn) {
            setSaveToast(
              `Retroactively rewrote Scene ${String(flaggingTurn.turnNumber).padStart(2, '0')}${
                payload.newLoreCorrection ? ' and updated Cross-Index' : ''
              }`,
            );
            setTimeout(() => setSaveToast(null), 3200);
          }
          return ok;
        }}
      />

      <ItemLoreModal
        project={project}
        target={loreTarget}
        onClose={() => setLoreTarget(null)}
        onOpenCrossIndex={() => onNavigateTab('cross-index')}
      />
    </div>
  );
};
