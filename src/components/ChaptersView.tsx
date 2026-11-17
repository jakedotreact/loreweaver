import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  Combine,
  Download,
  ImagePlus,
  Loader2,
  Pause,
  Pencil,
  Plus,
  Save,
  Trash2,
  Unlink,
  Volume2,
  X,
} from 'lucide-react';
import { NarrativeSpeechControls } from '../hooks/useNarrativeSpeech';
import {
  ModelConfig,
  StoryChapter,
  StoryIllustration,
  StoryProject,
  StoryTurn,
} from '../types/story';
import { downloadChapterHtml } from '../utils/htmlExport';
import { IllustrationFigure } from './IllustrationFigure';
import { IllustrationModal, IllustrationTarget } from './IllustrationModal';
import { ItemLoreModal, LoreTarget } from './ItemLoreModal';
import { SceneInlineEditor } from './SceneInlineEditor';
import { TtsPlayerBar } from './TtsPlayerBar';

interface ChaptersViewProps {
  project: StoryProject;
  modelConfig: ModelConfig;
  onUpdateChapters: (chapters: StoryChapter[]) => void;
  onUpdateChapterIllustration: (
    chapterId: string,
    illustration: StoryIllustration | null,
  ) => void;
  onUpdateTurnIllustration?: (
    turnId: string,
    illustration: StoryIllustration | null,
  ) => void;
  onOpenHtmlExport: (chapterId?: string) => void;
  onOpenCrossIndex?: () => void;
  onCorrectTurn?: (updatedTurn: StoryTurn) => void;
  speech: NarrativeSpeechControls;
}

export const ChaptersView: React.FC<ChaptersViewProps> = ({
  project,
  modelConfig,
  onUpdateChapters,
  onUpdateChapterIllustration,
  onUpdateTurnIllustration,
  onOpenHtmlExport,
  onOpenCrossIndex,
  onCorrectTurn,
  speech,
}) => {
  const chapters = useMemo(
    () => [...(project.chapters ?? [])].sort((a, b) => a.chapterNumber - b.chapterNumber),
    [project.chapters],
  );

  const turnMap = useMemo(() => {
    const map = new Map<string, StoryTurn>();
    for (const t of project.turns) map.set(t.id, t);
    return map;
  }, [project.turns]);

  const assignedTurnIds = useMemo(() => {
    const set = new Set<string>();
    for (const ch of chapters) {
      for (const tid of ch.turnIds) set.add(tid);
    }
    return set;
  }, [chapters]);

  const unassignedTurns = useMemo(
    () => project.turns.filter((t) => !assignedTurnIds.has(t.id)),
    [project.turns, assignedTurnIds],
  );

  // Selection state for merging unassigned blurbs into a new or existing chapter
  const [selectedTurnIds, setSelectedTurnIds] = useState<string[]>([]);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [newChapterSummary, setNewChapterSummary] = useState('');
  const [targetExistingChapterId, setTargetExistingChapterId] = useState('');

  // Per-chapter display mode ('merged' seamless prose vs 'blurbs' with prompts)
  const [chapterViewModes, setChapterViewModes] = useState<Record<string, 'merged' | 'blurbs'>>({});

  // Chapter metadata editing modal
  const [editingChapter, setEditingChapter] = useState<StoryChapter | null>(null);
  const [editingTurnId, setEditingTurnId] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [loreTarget, setLoreTarget] = useState<LoreTarget | null>(null);
  const [illustrationTarget, setIllustrationTarget] =
    useState<IllustrationTarget | null>(null);

  const renumberChapters = (list: StoryChapter[]): StoryChapter[] =>
    list.map((ch, idx) => ({ ...ch, chapterNumber: idx + 1 }));

  const toggleSelectTurn = (turnId: string) => {
    setSelectedTurnIds((prev) =>
      prev.includes(turnId) ? prev.filter((id) => id !== turnId) : [...prev, turnId],
    );
  };

  const handleSelectAllUnassigned = () => {
    if (selectedTurnIds.length === unassignedTurns.length) {
      setSelectedTurnIds([]);
    } else {
      setSelectedTurnIds(unassignedTurns.map((t) => t.id));
    }
  };

  const handleCreateChapterFromSelected = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedTurnIds.length === 0) return;

    // Order selected turnIds chronologically by turnNumber
    const orderedIds = project.turns
      .filter((t) => selectedTurnIds.includes(t.id))
      .map((t) => t.id);

    const firstTurn = turnMap.get(orderedIds[0]);
    const defaultTitle =
      orderedIds.length === 1
        ? firstTurn?.sceneTitle ?? `Chapter ${chapters.length + 1}`
        : `${firstTurn?.sceneTitle ?? 'Opening'} & Aftermath`;

    const newChapter: StoryChapter = {
      id: `chap-${Date.now()}`,
      chapterNumber: chapters.length + 1,
      title: newChapterTitle.trim() || defaultTitle,
      summary: newChapterSummary.trim(),
      turnIds: orderedIds,
      mergedAt: Date.now(),
    };

    onUpdateChapters(renumberChapters([...chapters, newChapter]));
    setSelectedTurnIds([]);
    setNewChapterTitle('');
    setNewChapterSummary('');
  };

  const handleAddSelectedToExisting = () => {
    if (selectedTurnIds.length === 0 || !targetExistingChapterId) return;
    const orderedToAdd = project.turns
      .filter((t) => selectedTurnIds.includes(t.id))
      .map((t) => t.id);

    const next = chapters.map((ch) =>
      ch.id === targetExistingChapterId
        ? { ...ch, turnIds: [...ch.turnIds, ...orderedToAdd] }
        : ch,
    );
    onUpdateChapters(next);
    setSelectedTurnIds([]);
  };

  const handleMoveChapter = (chapterId: string, dir: -1 | 1) => {
    const idx = chapters.findIndex((c) => c.id === chapterId);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= chapters.length) return;
    const copy = [...chapters];
    const temp = copy[idx];
    copy[idx] = copy[swapIdx];
    copy[swapIdx] = temp;
    onUpdateChapters(renumberChapters(copy));
  };

  const handleMergeWithNext = (chapterId: string) => {
    const idx = chapters.findIndex((c) => c.id === chapterId);
    if (idx < 0 || idx >= chapters.length - 1) return;
    const current = chapters[idx];
    const next = chapters[idx + 1];
    const merged: StoryChapter = {
      ...current,
      summary: [current.summary, next.summary].filter(Boolean).join(' '),
      turnIds: [...current.turnIds, ...next.turnIds],
      mergedAt: Date.now(),
    };
    const updated = [...chapters.slice(0, idx), merged, ...chapters.slice(idx + 2)];
    onUpdateChapters(renumberChapters(updated));
  };

  const handleUngroupChapter = (chapterId: string) => {
    const updated = chapters.filter((c) => c.id !== chapterId);
    onUpdateChapters(renumberChapters(updated));
  };

  const handleRemoveTurnFromChapter = (chapterId: string, turnId: string) => {
    const updated = chapters
      .map((ch) =>
        ch.id === chapterId
          ? { ...ch, turnIds: ch.turnIds.filter((id) => id !== turnId) }
          : ch,
      )
      .filter((ch) => ch.turnIds.length > 0);
    onUpdateChapters(renumberChapters(updated));
  };

  const handleReorderTurnInChapter = (chapterId: string, turnId: string, dir: -1 | 1) => {
    const updated = chapters.map((ch) => {
      if (ch.id !== chapterId) return ch;
      const idx = ch.turnIds.indexOf(turnId);
      const swapIdx = idx + dir;
      if (idx < 0 || swapIdx < 0 || swapIdx >= ch.turnIds.length) return ch;
      const nextIds = [...ch.turnIds];
      const temp = nextIds[idx];
      nextIds[idx] = nextIds[swapIdx];
      nextIds[swapIdx] = temp;
      return { ...ch, turnIds: nextIds };
    });
    onUpdateChapters(updated);
  };

  const handleSaveChapterEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChapter || !editingChapter.title.trim()) return;
    onUpdateChapters(
      chapters.map((c) =>
        c.id === editingChapter.id
          ? { ...c, title: editingChapter.title.trim(), summary: editingChapter.summary.trim() }
          : c,
      ),
    );
    setEditingChapter(null);
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-neutral-200">
        <div>
          <p className="text-xs text-[#6B7280]">
            {project.title} <span aria-hidden="true">·</span> {project.universe}
          </p>
          <h1 className="font-editorial text-3xl font-semibold text-[#111827] mt-1">
            Chapter Organization
          </h1>
          <p className="text-sm text-[#4B5563] mt-1.5 max-w-2xl">
            Select and merge multiple story blurbs into cohesive chapters, reorder scenes, and export the manuscript as HTML with prompts preserved.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onOpenHtmlExport()}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4" />
          Export HTML
        </button>
      </div>

      {saveToast && (
        <div className="px-4 py-2.5 text-sm text-[#15803D] bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{saveToast}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-8 items-start">
        {/* Left Rail: Unassigned Story Blurbs & Merge Builder */}
        <section
          aria-label="Unassigned Story Blurbs"
          className="bg-white border border-neutral-200 rounded-xl p-5 space-y-5"
        >
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <div>
              <h2 className="text-base font-semibold text-[#111827]">
                Unassigned Story Blurbs
              </h2>
              <p className="text-xs text-[#6B7280] font-mono tabular-nums mt-0.5">
                {unassignedTurns.length} available to merge
              </p>
            </div>
            {unassignedTurns.length > 0 && (
              <button
                type="button"
                onClick={handleSelectAllUnassigned}
                className="text-xs font-medium text-[#1D4ED8] hover:underline whitespace-nowrap"
              >
                {selectedTurnIds.length === unassignedTurns.length
                  ? 'Clear Selection'
                  : 'Select All'}
              </button>
            )}
          </div>

          {unassignedTurns.length === 0 ? (
            <p className="text-sm text-[#6B7280] py-4 text-center">
              All generated story blurbs are currently organized into chapters. Continue the story to generate new blurbs.
            </p>
          ) : (
            <>
              <div className="divide-y divide-neutral-100 max-h-[420px] overflow-y-auto pr-1">
                {unassignedTurns.map((turn) => {
                  const checked = selectedTurnIds.includes(turn.id);
                  return (
                    <label
                      key={turn.id}
                      className={`py-3.5 first:pt-1 flex items-start gap-3 cursor-pointer rounded-lg transition-colors ${
                        checked ? 'bg-[#F8FAFC]' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelectTurn(turn.id)}
                        className="mt-1 rounded border-neutral-300 text-[#1D4ED8] focus:ring-[#1D4ED8]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-mono tabular-nums text-[#6B7280]">
                          Scene {String(turn.turnNumber).padStart(2, '0')} · {turn.inStoryTime}
                        </p>
                        <p className="text-sm font-semibold text-[#111827] mt-0.5">
                          {turn.sceneTitle}
                        </p>
                        {turn.userAction && (
                          <p className="text-xs text-[#1D4ED8] mt-1 line-clamp-1">
                            Prompt: {turn.userAction}
                          </p>
                        )}
                        <p className="text-xs text-[#4B5563] mt-1 line-clamp-2 leading-relaxed">
                          {turn.prose[0]}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Merge Selected Controls */}
              <form
                onSubmit={handleCreateChapterFromSelected}
                className="pt-4 border-t border-neutral-200 space-y-3"
              >
                <p className="text-xs font-semibold text-[#111827]">
                  Merge {selectedTurnIds.length} Selected{' '}
                  {selectedTurnIds.length === 1 ? 'Blurb' : 'Blurbs'} into New Chapter
                </p>
                <input
                  type="text"
                  value={newChapterTitle}
                  onChange={(e) => setNewChapterTitle(e.target.value)}
                  placeholder="Chapter title (e.g., The Seventh-Floor Secret)"
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                />
                <input
                  type="text"
                  value={newChapterSummary}
                  onChange={(e) => setNewChapterSummary(e.target.value)}
                  placeholder="Optional chapter summary or epigraph"
                  className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                />
                <button
                  type="submit"
                  disabled={selectedTurnIds.length === 0}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  Create Merged Chapter
                </button>

                {chapters.length > 0 && (
                  <div className="pt-3 border-t border-neutral-100 flex items-center gap-2">
                    <select
                      value={targetExistingChapterId}
                      onChange={(e) => setTargetExistingChapterId(e.target.value)}
                      className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                    >
                      <option value="">Append to existing chapter...</option>
                      {chapters.map((ch) => (
                        <option key={ch.id} value={ch.id}>
                          Ch. {String(ch.chapterNumber).padStart(2, '0')}: {ch.title}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={selectedTurnIds.length === 0 || !targetExistingChapterId}
                      onClick={handleAddSelectedToExisting}
                      className="px-3 py-1.5 text-xs font-medium text-[#111827] border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 rounded-lg whitespace-nowrap shrink-0"
                    >
                      Append
                    </button>
                  </div>
                )}
              </form>
            </>
          )}
        </section>

        {/* Right Main Area: Organized Chapters */}
        <section aria-label="Organized Chapters" className="space-y-6 min-w-0">
          {chapters.length === 0 ? (
            <div className="bg-white border border-neutral-200 rounded-xl p-10 text-center">
              <BookOpen className="w-6 h-6 text-[#6B7280] mx-auto mb-2" />
              <h2 className="text-base font-semibold text-[#111827]">
                No chapters assembled yet
              </h2>
              <p className="text-sm text-[#4B5563] mt-1 max-w-md mx-auto">
                Select one or more story blurbs on the left and click Create Merged Chapter to stitch them into continuous chapters.
              </p>
            </div>
          ) : (
            chapters.map((chapter, chIdx) => {
              const chTurns = chapter.turnIds
                .map((id) => turnMap.get(id))
                .filter((t): t is StoryTurn => Boolean(t));
              const viewMode = chapterViewModes[chapter.id] ?? 'merged';
              const ttsKey = `chapter:${chapter.id}`;
              const isTtsLoading = speech.loadingKey === ttsKey;
              const isTtsActive = speech.activeKey === ttsKey;
              const isTtsPlaying = isTtsActive && speech.isPlaying;
              const chapterBodyText = chTurns
                .map((t) => `${t.sceneTitle}.\n\n${t.prose.join('\n\n')}`)
                .join('\n\n');
              const ttsItem = {
                key: ttsKey,
                label: `Chapter ${String(chapter.chapterNumber).padStart(2, '0')} — ${chapter.title}`,
                text: [
                  `Chapter ${chapter.chapterNumber}: ${chapter.title}.`,
                  chapter.summary || '',
                  chapterBodyText,
                ]
                  .filter(Boolean)
                  .join('\n\n'),
                tone: project.tone,
              };

              return (
                <article
                  key={chapter.id}
                  className="bg-white border border-neutral-200 rounded-xl p-6 space-y-5"
                >
                  {/* Chapter Header */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-neutral-100">
                    <div className="min-w-0">
                      <p className="text-xs font-mono tabular-nums text-[#6B7280]">
                        Chapter {String(chapter.chapterNumber).padStart(2, '0')}{' '}
                        <span aria-hidden="true">·</span> {chTurns.length}{' '}
                        {chTurns.length === 1 ? 'merged blurb' : 'merged blurbs'}
                      </p>
                      <h2 className="font-editorial text-2xl font-semibold text-[#111827] mt-1">
                        {chapter.title}
                      </h2>
                      {chapter.summary && (
                        <p className="text-sm text-[#4B5563] mt-1 italic">
                          {chapter.summary}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMoveChapter(chapter.id, -1)}
                        disabled={chIdx === 0}
                        aria-label="Move chapter up"
                        className="p-1.5 text-[#6B7280] hover:text-[#111827] disabled:opacity-30 hover:bg-neutral-100 rounded-md"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveChapter(chapter.id, 1)}
                        disabled={chIdx === chapters.length - 1}
                        aria-label="Move chapter down"
                        className="p-1.5 text-[#6B7280] hover:text-[#111827] disabled:opacity-30 hover:bg-neutral-100 rounded-md"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingChapter({ ...chapter })}
                        aria-label="Edit chapter title"
                        className="p-1.5 text-[#6B7280] hover:text-[#111827] hover:bg-neutral-100 rounded-md"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {chIdx < chapters.length - 1 && (
                        <button
                          type="button"
                          onClick={() => handleMergeWithNext(chapter.id)}
                          title="Merge with next chapter"
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#111827] border border-neutral-200 hover:bg-neutral-50 rounded-md whitespace-nowrap"
                        >
                          <Combine className="w-3.5 h-3.5" />
                          Merge Next
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleUngroupChapter(chapter.id)}
                        title="Ungroup chapter back to blurbs"
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#4B5563] hover:text-[#DC2626] border border-neutral-200 hover:bg-neutral-50 rounded-md whitespace-nowrap"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                        Ungroup
                      </button>
                      <button
                        type="button"
                        onClick={() => speech.togglePlay(ttsItem)}
                        disabled={chTurns.length === 0}
                        aria-label={
                          isTtsLoading
                            ? `Synthesizing audio for chapter ${chapter.chapterNumber}`
                            : isTtsPlaying
                              ? `Pause narration for chapter ${chapter.chapterNumber}`
                              : `Listen to chapter ${chapter.chapterNumber}`
                        }
                        title="Read chapter aloud (Text-to-Speech)"
                        className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border rounded-md transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 ${
                          isTtsActive || isTtsLoading
                            ? 'text-[#1D4ED8] bg-[#EFF6FF] border-[#BFDBFE]'
                            : 'text-[#4B5563] hover:text-[#1D4ED8] border-neutral-200 hover:bg-[#F8FAFC] hover:border-[#BFDBFE]'
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
                        onClick={() =>
                          setLoreTarget({
                            kind: 'chapter',
                            chapter,
                            turns: chTurns,
                          })
                        }
                        aria-label={`View lore for chapter ${chapter.chapterNumber}`}
                        title="View chapter lore and continuity facts"
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#4B5563] hover:text-[#1D4ED8] border border-neutral-200 hover:bg-[#F8FAFC] hover:border-[#BFDBFE] rounded-md transition-colors whitespace-nowrap shrink-0"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        Lore
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setIllustrationTarget({
                            kind: 'chapter',
                            chapter,
                            turns: chTurns,
                          })
                        }
                        aria-label={`Illustration studio for chapter ${chapter.chapterNumber}`}
                        title="Generate illustration prompt or upload chapter artwork"
                        className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border rounded-md transition-colors whitespace-nowrap shrink-0 ${
                          chapter.illustration
                            ? 'text-[#1D4ED8] bg-[#EFF6FF] border-[#BFDBFE]'
                            : 'text-[#4B5563] hover:text-[#1D4ED8] border-neutral-200 hover:bg-[#F8FAFC] hover:border-[#BFDBFE]'
                        }`}
                      >
                        <ImagePlus className="w-3.5 h-3.5" />
                        Illustrate
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const filename = downloadChapterHtml(project, chapter);
                          setSaveToast(`Saved ${filename}`);
                          setTimeout(() => setSaveToast(null), 2600);
                        }}
                        aria-label={`Save chapter ${chapter.chapterNumber} HTML`}
                        title="Save chapter HTML source"
                        className="p-1.5 text-[#6B7280] hover:text-[#1D4ED8] hover:bg-[#F8FAFC] border border-neutral-200 hover:border-[#BFDBFE] rounded-md transition-colors"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenHtmlExport(chapter.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#1D4ED8] border border-neutral-200 hover:bg-[#F8FAFC] rounded-md whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5" />
                        HTML
                      </button>
                    </div>
                  </div>

                  <TtsPlayerBar
                    itemKey={ttsKey}
                    downloadName={`chapter-${String(chapter.chapterNumber).padStart(2, '0')}`}
                    speech={speech}
                    onReplay={() => speech.togglePlay(ttsItem)}
                  />

                  {chapter.illustration && (
                    <IllustrationFigure
                      illustration={chapter.illustration}
                      fallbackAlt={`Chapter ${String(chapter.chapterNumber).padStart(2, '0')} — ${chapter.title}`}
                      onEdit={() =>
                        setIllustrationTarget({
                          kind: 'chapter',
                          chapter,
                          turns: chTurns,
                        })
                      }
                      onRemove={() => {
                        onUpdateChapterIllustration(chapter.id, null);
                        setSaveToast(
                          `Removed illustration from Chapter ${String(chapter.chapterNumber).padStart(2, '0')}`,
                        );
                        setTimeout(() => setSaveToast(null), 2600);
                      }}
                    />
                  )}

                  {/* Mode Switcher */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="inline-flex items-center gap-1 p-1 bg-neutral-100 rounded-lg">
                      <button
                        type="button"
                        onClick={() =>
                          setChapterViewModes((prev) => ({ ...prev, [chapter.id]: 'merged' }))
                        }
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                          viewMode === 'merged'
                            ? 'bg-white text-[#111827] shadow-sm'
                            : 'text-[#6B7280] hover:text-[#111827]'
                        }`}
                      >
                        Merged Prose
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setChapterViewModes((prev) => ({ ...prev, [chapter.id]: 'blurbs' }))
                        }
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                          viewMode === 'blurbs'
                            ? 'bg-white text-[#111827] shadow-sm'
                            : 'text-[#6B7280] hover:text-[#111827]'
                        }`}
                      >
                        Blurbs &amp; Prompts ({chTurns.length})
                      </button>
                    </div>
                  </div>

                  {/* Chapter Content */}
                  {viewMode === 'merged' ? (
                    <div className="space-y-4 max-w-[68ch] text-[15.5px] leading-[1.75] text-[#111827]">
                      {chTurns.map((turn, tIdx) => (
                        <React.Fragment key={turn.id}>
                          {tIdx > 0 && (
                            <p className="text-xs font-mono tabular-nums text-[#6B7280] pt-2">
                              * * *
                            </p>
                          )}
                          {turn.illustration && (
                            <div className="py-1">
                              <IllustrationFigure
                                illustration={turn.illustration}
                                fallbackAlt={`Scene ${String(turn.turnNumber).padStart(2, '0')} — ${turn.sceneTitle}`}
                                compact
                              />
                            </div>
                          )}
                          {turn.prose.map((p, pIdx) => (
                            <p key={pIdx}>{p}</p>
                          ))}
                        </React.Fragment>
                      ))}
                    </div>
                  ) : (
                    <div className="divide-y divide-neutral-100">
                      {chTurns.map((turn, tIdx) => (
                        <div key={turn.id} className="py-4 first:pt-1 last:pb-0 space-y-2">
                          {editingTurnId === turn.id && onCorrectTurn ? (
                            <SceneInlineEditor
                              turn={turn}
                              openingPremise={project.premise}
                              contextHint={`${project.universe}. Scene ${turn.turnNumber}: ${turn.sceneTitle}`}
                              onSave={(updatedTurn) => {
                                onCorrectTurn(updatedTurn);
                                setEditingTurnId(null);
                                setSaveToast(
                                  `Saved edits to Scene ${String(updatedTurn.turnNumber).padStart(2, '0')}`,
                                );
                                setTimeout(() => setSaveToast(null), 2600);
                              }}
                              onCancel={() => setEditingTurnId(null)}
                            />
                          ) : (
                            <>
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-mono tabular-nums text-[#6B7280]">
                                  Scene {String(turn.turnNumber).padStart(2, '0')} · {turn.sceneTitle} ·{' '}
                                  {turn.location}
                                </p>
                                <div className="flex items-center gap-1 shrink-0">
                                  {onUpdateTurnIllustration && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setIllustrationTarget({ kind: 'scene', turn })
                                      }
                                      aria-label={`Illustrate scene ${turn.turnNumber}`}
                                      title="Illustrate scene"
                                      className={`p-1 ${
                                        turn.illustration
                                          ? 'text-[#1D4ED8]'
                                          : 'text-[#6B7280] hover:text-[#1D4ED8]'
                                      }`}
                                    >
                                      <ImagePlus className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {onCorrectTurn && (
                                    <button
                                      type="button"
                                      onClick={() => setEditingTurnId(turn.id)}
                                      aria-label={`Edit scene ${turn.turnNumber} prompt or output`}
                                      title="Edit scene prompt or output"
                                      className="p-1 text-[#6B7280] hover:text-[#1D4ED8]"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    disabled={tIdx === 0}
                                    onClick={() =>
                                      handleReorderTurnInChapter(chapter.id, turn.id, -1)
                                    }
                                    aria-label="Move blurb up"
                                    className="p-1 text-[#6B7280] hover:text-[#111827] disabled:opacity-30"
                                  >
                                    <ArrowUp className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={tIdx === chTurns.length - 1}
                                    onClick={() =>
                                      handleReorderTurnInChapter(chapter.id, turn.id, 1)
                                    }
                                    aria-label="Move blurb down"
                                    className="p-1 text-[#6B7280] hover:text-[#111827] disabled:opacity-30"
                                  >
                                    <ArrowDown className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRemoveTurnFromChapter(chapter.id, turn.id)
                                    }
                                    aria-label="Remove blurb from chapter"
                                    className="p-1 text-[#6B7280] hover:text-[#DC2626]"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                              <p className="text-xs text-[#1D4ED8] whitespace-pre-wrap">
                                Prompt: {turn.userAction || project.premise}
                              </p>
                              {turn.illustration && (
                                <IllustrationFigure
                                  illustration={turn.illustration}
                                  fallbackAlt={`Scene ${String(turn.turnNumber).padStart(2, '0')} — ${turn.sceneTitle}`}
                                  compact
                                  onEdit={
                                    onUpdateTurnIllustration
                                      ? () =>
                                          setIllustrationTarget({ kind: 'scene', turn })
                                      : undefined
                                  }
                                  onRemove={
                                    onUpdateTurnIllustration
                                      ? () => {
                                          onUpdateTurnIllustration(turn.id, null);
                                          setSaveToast(
                                            `Removed illustration from Scene ${String(turn.turnNumber).padStart(2, '0')}`,
                                          );
                                          setTimeout(() => setSaveToast(null), 2600);
                                        }
                                      : undefined
                                  }
                                />
                              )}
                              <p className="text-sm text-[#374151] leading-relaxed whitespace-pre-wrap">
                                {turn.prose.join('\n\n')}
                              </p>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </section>
      </div>

      {/* Edit Chapter Metadata Modal */}
      {editingChapter && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-chapter-heading"
        >
          <div className="w-full max-w-md bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
              <h2
                id="edit-chapter-heading"
                className="font-editorial text-xl font-semibold text-[#111827]"
              >
                Edit Chapter {String(editingChapter.chapterNumber).padStart(2, '0')}
              </h2>
              <button
                type="button"
                onClick={() => setEditingChapter(null)}
                className="p-1.5 text-[#6B7280] hover:text-[#111827] rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveChapterEdit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#111827] mb-1">
                  Chapter Title
                </label>
                <input
                  type="text"
                  required
                  value={editingChapter.title}
                  onChange={(e) =>
                    setEditingChapter({ ...editingChapter, title: e.target.value })
                  }
                  className="w-full px-3.5 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#111827] mb-1">
                  Chapter Summary / Epigraph
                </label>
                <textarea
                  rows={3}
                  value={editingChapter.summary}
                  onChange={(e) =>
                    setEditingChapter({ ...editingChapter, summary: e.target.value })
                  }
                  className="w-full px-3.5 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                />
              </div>
              <div className="pt-3 border-t border-neutral-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingChapter(null)}
                  className="px-4 py-2 text-sm font-medium text-[#4B5563] hover:text-[#111827]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg"
                >
                  Save Chapter
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ItemLoreModal
        project={project}
        target={loreTarget}
        onClose={() => setLoreTarget(null)}
        onOpenCrossIndex={onOpenCrossIndex}
      />

      <IllustrationModal
        project={project}
        target={illustrationTarget}
        modelConfig={modelConfig}
        onClose={() => setIllustrationTarget(null)}
        onSaveIllustration={(illustration) => {
          if (!illustrationTarget) return;
          if (illustrationTarget.kind === 'chapter') {
            const ch = illustrationTarget.chapter;
            onUpdateChapterIllustration(ch.id, illustration);
            setSaveToast(
              illustration
                ? `Saved illustration for Chapter ${String(ch.chapterNumber).padStart(2, '0')}`
                : `Removed illustration from Chapter ${String(ch.chapterNumber).padStart(2, '0')}`,
            );
            setTimeout(() => setSaveToast(null), 2600);
          } else if (
            illustrationTarget.kind === 'scene' &&
            onUpdateTurnIllustration
          ) {
            const turn = illustrationTarget.turn;
            onUpdateTurnIllustration(turn.id, illustration);
            setSaveToast(
              illustration
                ? `Saved illustration for Scene ${String(turn.turnNumber).padStart(2, '0')}`
                : `Removed illustration from Scene ${String(turn.turnNumber).padStart(2, '0')}`,
            );
            setTimeout(() => setSaveToast(null), 2600);
          }
        }}
      />
    </div>
  );
};
