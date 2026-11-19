import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  Feather,
  FileText,
  Flag,
  GitBranch,
  ImagePlus,
  Loader2,
  Pause,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Share2,
  Tag,
  Users,
  Volume2,
} from 'lucide-react';
import { NarrativeSpeechControls } from '../hooks/useNarrativeSpeech';
import {
  CommentTargetType,
  CrossIndexEntry,
  ModelConfig,
  StoryChapter,
  StoryChoice,
  StoryComment,
  StoryDisplayMode,
  StoryIllustration,
  StoryProject,
  StoryTurn,
  UserCollection,
} from '../types/story';
import { downloadSceneHtml } from '../utils/htmlExport';
import { downloadScenePdf } from '../utils/pdfExport';
import { buildCollabUrl, buildShareUrl } from '../utils/storyLinks';
import {
  extractCharacterNames,
  extractHighlightTerms,
  matchStoryTurns,
} from '../utils/turnSearch';
import { AuthorNoteBlock } from './AuthorNoteBlock';
import { CommentAddPayload, CommentsSection } from './CommentsSection';
import { DictaquillButton } from './DictaquillButton';
import { IllustrationFigure } from './IllustrationFigure';
import { IllustrationModal, IllustrationTarget } from './IllustrationModal';
import { ItemLoreModal, LoreTarget } from './ItemLoreModal';
import { ModelConfigPanel } from './ModelConfigPanel';
import { RewriteCorrectionPayload, SceneCorrectionModal } from './SceneCorrectionModal';
import { SceneInlineEditor } from './SceneInlineEditor';
import { StoryFloatingBar } from './StoryFloatingBar';
import { StoryTurnSearchBar } from './StoryTurnSearchBar';
import { WorkspaceTab } from './TopNav';
import { TtsPlayerBar } from './TtsPlayerBar';

function renderHighlightedText(text: string, terms: string[]): React.ReactNode {
  if (!terms.length || !text) return text;
  const escaped = terms
    .filter((t) => t.trim().length >= 2)
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!escaped.length) return text;

  const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(regex);
  if (parts.length <= 1) return text;

  return parts.map((part, idx) =>
    idx % 2 === 1 ? (
      <mark
        key={idx}
        className="bg-[#FEF3C7] text-[#111827] rounded-xs px-0.5"
      >
        {part}
      </mark>
    ) : (
      <React.Fragment key={idx}>{part}</React.Fragment>
    ),
  );
}

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
  onUpdateTurnIllustration: (
    turnId: string,
    illustration: StoryIllustration | null,
  ) => void;
  isRewritingScene: boolean;
  rewriteError: string | null;
  onRewriteTurn: (payload: RewriteCorrectionPayload) => Promise<boolean>;
  modelConfig: ModelConfig;
  onChangeModelConfig: (next: ModelConfig) => void;
  speech: NarrativeSpeechControls;
  onPersistNow: (
    scopeLabel?: string,
  ) => Promise<{ ok: boolean; location: 'cloud' | 'local'; message: string }>;
  onShareStory: () => void;
  onCollaborateStory: () => void;
  onShareScene: (turn: StoryTurn) => void;
  onEditTagsAndVisibility?: () => void;
  onUpdateStoryNotes?: (notes: {
    prefixNote?: string;
    suffixNote?: string;
  }) => void;
  onUpdateChapters?: (chapters: StoryChapter[]) => void;
  displayMode: StoryDisplayMode;
  onChangeDisplayMode: (mode: StoryDisplayMode) => void;
  publicStoryId: string;
  storyComments: StoryComment[];
  currentReaderUid: string;
  currentReaderName: string;
  onAddComment: (
    storyId: string,
    payload: CommentAddPayload,
  ) => Promise<void> | void;
  onDeleteComment: (storyId: string, commentId: string) => Promise<void> | void;
  collections: UserCollection[];
  isSubscribed: boolean;
  onToggleSubscribe: () => void;
  onToggleCollectionStory: (collectionId: string, storyId: string) => void;
  onQuickCreateCollection: (name: string, storyId: string) => void;
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
  onUpdateTurnIllustration,
  isRewritingScene,
  rewriteError,
  onRewriteTurn,
  modelConfig,
  onChangeModelConfig,
  speech,
  onPersistNow,
  onShareStory,
  onCollaborateStory,
  onShareScene,
  onEditTagsAndVisibility,
  onUpdateStoryNotes,
  onUpdateChapters,
  displayMode,
  onChangeDisplayMode,
  publicStoryId,
  storyComments,
  currentReaderUid,
  currentReaderName,
  onAddComment,
  onDeleteComment,
  collections,
  isSubscribed,
  onToggleSubscribe,
  onToggleCollectionStory,
  onQuickCreateCollection,
}) => {
  const [customAction, setCustomAction] = useState('');
  const [quickSaveLabel, setQuickSaveLabel] = useState('');
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [copiedLinkType, setCopiedLinkType] = useState<'share' | 'collab' | null>(null);
  const [persistError, setPersistError] = useState<string | null>(null);
  const [isPersisting, setIsPersisting] = useState(false);
  const [flaggingTurn, setFlaggingTurn] = useState<StoryTurn | null>(null);
  const [editingTurnId, setEditingTurnId] = useState<string | null>(null);
  const [isEditingStoryNotes, setIsEditingStoryNotes] = useState(false);
  const [storyPrefixDraft, setStoryPrefixDraft] = useState(project.prefixNote ?? '');
  const [storySuffixDraft, setStorySuffixDraft] = useState(project.suffixNote ?? '');
  const [editingChapterNotesId, setEditingChapterNotesId] = useState<string | null>(null);
  const [chapterPrefixDraft, setChapterPrefixDraft] = useState('');
  const [chapterSuffixDraft, setChapterSuffixDraft] = useState('');
  const [loreTarget, setLoreTarget] = useState<LoreTarget | null>(null);
  const [illustrationTarget, setIllustrationTarget] =
    useState<IllustrationTarget | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedChapterIdx, setSelectedChapterIdx] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [characterFilter, setCharacterFilter] = useState('');
  const [filterStream, setFilterStream] = useState(true);
  const [highlightedTurnId, setHighlightedTurnId] = useState<string | null>(null);
  const latestSceneRef = useRef<HTMLElement>(null);
  const turnCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const highlightTimerRef = useRef<number | null>(null);
  const prevTurnCountRef = useRef(project.turns.length);
  const pendingRef = useRef<HTMLDivElement>(null);
  const customActionRef = useRef<HTMLTextAreaElement>(null);

  const focusCustomAction = () => {
    requestAnimationFrame(() => {
      const el = customActionRef.current;
      if (!el) return;
      el.focus();
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const end = el.value.length;
      el.setSelectionRange(end, end);
    });
  };

  useEffect(() => {
    setEditingTurnId(null);
    setIsEditingStoryNotes(false);
    setStoryPrefixDraft(project.prefixNote ?? '');
    setStorySuffixDraft(project.suffixNote ?? '');
    setEditingChapterNotesId(null);
    setIllustrationTarget(null);
    setSelectedSceneId(null);
    setSelectedChapterIdx(0);
    setSearchQuery('');
    setCharacterFilter('');
    setHighlightedTurnId(null);
    prevTurnCountRef.current = project.turns.length;
  }, [project.id]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  const latestTurn = project.turns[project.turns.length - 1];

  const turnChapterMap = useMemo(() => {
    const map = new Map<
      string,
      { chapterNumber: number; title: string; chapterId: string }
    >();
    for (const ch of project.chapters ?? []) {
      for (const tid of ch.turnIds) {
        map.set(tid, {
          chapterNumber: ch.chapterNumber,
          title: ch.title,
          chapterId: ch.id,
        });
      }
    }
    return map;
  }, [project.chapters]);

  const chapterByIdMap = useMemo(() => {
    const map = new Map<string, StoryChapter>();
    for (const ch of project.chapters ?? []) {
      map.set(ch.id, ch);
    }
    return map;
  }, [project.chapters]);

  const chapterGroups = useMemo(() => {
    const chapters = project.chapters ?? [];
    if (chapters.length === 0) {
      return [
        {
          id: project.id,
          title: 'Story Manuscript',
          summary: '',
          prefixNote: undefined as string | undefined,
          suffixNote: undefined as string | undefined,
          turns: project.turns,
          isSynthetic: true,
        },
      ];
    }
    const turnMap = new Map(project.turns.map((t) => [t.id, t]));
    const assigned = new Set<string>();
    const groups = chapters
      .map((ch) => {
        const chTurns = ch.turnIds
          .map((id) => turnMap.get(id))
          .filter((t): t is StoryTurn => Boolean(t));
        chTurns.forEach((t) => assigned.add(t.id));
        return {
          id: ch.id,
          title: `Chapter ${String(ch.chapterNumber).padStart(2, '0')} — ${ch.title}`,
          summary: ch.summary,
          prefixNote: ch.prefixNote,
          suffixNote: ch.suffixNote,
          turns: chTurns,
          isSynthetic: false,
        };
      })
      .filter((g) => g.turns.length > 0);

    const unassigned = project.turns.filter((t) => !assigned.has(t.id));
    if (unassigned.length > 0) {
      groups.push({
        id: `${project.id}-unassigned`,
        title: 'Recent Unassigned Scenes',
        summary: '',
        prefixNote: undefined as string | undefined,
        suffixNote: undefined as string | undefined,
        turns: unassigned,
        isSynthetic: true,
      });
    }
    return groups;
  }, [project.chapters, project.turns, project.id]);

  const activeSceneIndex = useMemo(() => {
    if (project.turns.length === 0) return 0;
    if (selectedSceneId) {
      const idx = project.turns.findIndex((t) => t.id === selectedSceneId);
      if (idx >= 0) return idx;
    }
    return project.turns.length - 1;
  }, [project.turns, selectedSceneId]);

  const activeSceneTurn = project.turns[activeSceneIndex] ?? latestTurn;

  const clampedChapterIdx = Math.min(
    Math.max(0, selectedChapterIdx),
    Math.max(0, chapterGroups.length - 1),
  );
  const activeChapterGroup = chapterGroups[clampedChapterIdx];

  const commentScopeConfig: {
    scope: CommentTargetType;
    targetId: string;
    targetLabel?: string;
  } = (() => {
    if (displayMode === 'scene' && activeSceneTurn) {
      return {
        scope: 'scene',
        targetId: activeSceneTurn.id,
        targetLabel: `Scene ${String(activeSceneTurn.turnNumber).padStart(2, '0')} — ${activeSceneTurn.sceneTitle}`,
      };
    }
    if (
      displayMode === 'chapters' &&
      activeChapterGroup &&
      !activeChapterGroup.isSynthetic
    ) {
      return {
        scope: 'chapter',
        targetId: activeChapterGroup.id,
        targetLabel: activeChapterGroup.title,
      };
    }
    return {
      scope: 'story',
      targetId: publicStoryId,
      targetLabel: project.title,
    };
  })();

  const characterOptions = useMemo(
    () => extractCharacterNames(project.characters, project.turns),
    [project.characters, project.turns],
  );

  const turnMatches = useMemo(
    () =>
      matchStoryTurns(
        project.turns,
        searchQuery,
        characterFilter,
        turnChapterMap,
      ),
    [project.turns, searchQuery, characterFilter, turnChapterMap],
  );

  const hasActiveFilter = Boolean(searchQuery.trim() || characterFilter.trim());

  const displayedTurns = useMemo(() => {
    if (hasActiveFilter && filterStream) {
      return turnMatches.map((m) => m.turn);
    }
    if (displayMode === 'scene') {
      return activeSceneTurn ? [activeSceneTurn] : [];
    }
    if (displayMode === 'chapters') {
      return activeChapterGroup?.turns ?? project.turns;
    }
    return project.turns;
  }, [
    hasActiveFilter,
    filterStream,
    turnMatches,
    displayMode,
    activeSceneTurn,
    activeChapterGroup,
    project.turns,
  ]);

  const highlightTerms = useMemo(() => {
    const terms = extractHighlightTerms(searchQuery);
    if (characterFilter.trim()) {
      terms.push(characterFilter.trim());
    }
    return terms;
  }, [searchQuery, characterFilter]);

  const handleJumpToTurn = (turnId: string) => {
    if (displayMode === 'scene') {
      setSelectedSceneId(turnId);
    } else if (displayMode === 'chapters') {
      const chIdx = chapterGroups.findIndex((g) =>
        g.turns.some((t) => t.id === turnId),
      );
      if (chIdx >= 0) setSelectedChapterIdx(chIdx);
    }

    const isCurrentlyVisible = displayedTurns.some((t) => t.id === turnId);
    if (!isCurrentlyVisible && hasActiveFilter) {
      setFilterStream(false);
    }

    const scrollAndHighlight = () => {
      const targetEl = turnCardRefs.current[turnId];
      if (!targetEl) return;
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setHighlightedTurnId(turnId);
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }
      highlightTimerRef.current = window.setTimeout(() => {
        setHighlightedTurnId((curr) => (curr === turnId ? null : curr));
      }, 2200);
    };

    requestAnimationFrame(() => requestAnimationFrame(scrollAndHighlight));
  };

  useEffect(() => {
    if (isAdvancing && pendingRef.current) {
      pendingRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isAdvancing]);

  useEffect(() => {
    if (project.turns.length > prevTurnCountRef.current) {
      setSearchQuery('');
      setCharacterFilter('');
      setSelectedSceneId(project.turns[project.turns.length - 1]?.id ?? null);
      if (latestSceneRef.current) {
        latestSceneRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    prevTurnCountRef.current = project.turns.length;
  }, [project.turns]);

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

  const handlePersist = async (scopeLabel?: string) => {
    if (isPersisting) return;
    setPersistError(null);
    setIsPersisting(true);
    try {
      const result = await onPersistNow(scopeLabel);
      if (result.ok) {
        setSaveToast(result.message);
        setTimeout(() => setSaveToast(null), 3000);
      } else {
        setPersistError(result.message);
      }
    } finally {
      setIsPersisting(false);
    }
  };

  const pinnedLore = project.crossIndex.filter((e) => e.status === 'active').slice(0, 6);

  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-8 pt-8 pb-28">
      {/* Story Masthead */}
      <div className="pb-6 mb-8 border-b border-neutral-200 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-[#6B7280]">
            {project.universe} <span aria-hidden="true">·</span> {project.setting}{' '}
            <span aria-hidden="true">·</span> {project.tone}
          </p>
          <h1 className="font-editorial text-3xl sm:text-4xl font-semibold text-[#111827] mt-1.5 text-balance">
            {project.title}
          </h1>
          {project.tags && (
            <p className="text-xs text-[#6B7280] mt-1.5 truncate">
              <span className="font-medium text-[#111827]">
                {project.tags.rating}
              </span>{' '}
              <span aria-hidden="true">·</span>{' '}
              {project.tags.categories.join(', ')}{' '}
              {project.tags.freeforms.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>{' '}
                  {project.tags.freeforms.slice(0, 4).join(', ')}
                </>
              )}
            </p>
          )}
        </div>

        {/* Visibility/Tags + Two Links for This Story: Share Link & Collaboration Link */}
        <div
          aria-label="Story Share and Collaboration Links"
          className="flex flex-wrap items-center gap-2 shrink-0"
        >
          {onEditTagsAndVisibility && (
            <button
              type="button"
              onClick={onEditTagsAndVisibility}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                project.isPrivate
                  ? 'text-[#92400E] bg-[#FFFBEB] border-[#FDE68A] hover:bg-[#FEF3C7]'
                  : 'text-[#111827] bg-white border-neutral-300 hover:bg-neutral-50'
              }`}
            >
              {project.isPrivate ? (
                <EyeOff className="w-3.5 h-3.5 text-[#B45309]" />
              ) : (
                <Eye className="w-3.5 h-3.5 text-[#15803D]" />
              )}
              <span>{project.isPrivate ? 'Private' : 'Public'}</span>
              <span aria-hidden="true" className="text-[#9CA3AF]">
                ·
              </span>
              <Tag className="w-3 h-3 text-[#1D4ED8]" />
              <span>AO3 Tags</span>
            </button>
          )}
          {onUpdateStoryNotes && (
            <button
              type="button"
              data-testid="story-author-notes-btn"
              onClick={() => {
                if (isEditingStoryNotes) {
                  setIsEditingStoryNotes(false);
                } else {
                  setStoryPrefixDraft(project.prefixNote ?? '');
                  setStorySuffixDraft(project.suffixNote ?? '');
                  setIsEditingStoryNotes(true);
                }
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                project.prefixNote || project.suffixNote || isEditingStoryNotes
                  ? 'text-[#1D4ED8] bg-[#EFF6FF] border-[#BFDBFE] hover:bg-[#DBEAFE]'
                  : 'text-[#111827] bg-white border-neutral-300 hover:bg-neutral-50'
              }`}
            >
              <Feather className="w-3.5 h-3.5 text-[#1D4ED8]" />
              <span>Author Notes</span>
            </button>
          )}
          <div className="inline-flex items-center border border-neutral-300 rounded-lg bg-white overflow-hidden">
            <button
              type="button"
              onClick={onShareStory}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#111827] hover:bg-neutral-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Share2 className="w-3.5 h-3.5 text-[#1D4ED8]" />
              {project.shareId ? 'Share Link Ready' : 'Share Link'}
            </button>
            {project.shareId && (
              <button
                type="button"
                aria-label="Copy story share link"
                title={buildShareUrl(window.location.origin, project.shareId)}
                onClick={async () => {
                  const url = buildShareUrl(window.location.origin, project.shareId!);
                  try {
                    await navigator.clipboard.writeText(url);
                    setCopiedLinkType('share');
                    setTimeout(() => setCopiedLinkType(null), 1800);
                  } catch {
                    onShareStory();
                  }
                }}
                className="px-2 py-1.5 border-l border-neutral-200 text-[#4B5563] hover:text-[#111827] hover:bg-neutral-50 transition-colors shrink-0"
              >
                {copiedLinkType === 'share' ? (
                  <Check className="w-3.5 h-3.5 text-[#15803D]" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>

          <div className="inline-flex items-center border border-neutral-300 rounded-lg bg-white overflow-hidden">
            <button
              type="button"
              onClick={onCollaborateStory}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#111827] hover:bg-neutral-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Users className="w-3.5 h-3.5 text-[#1D4ED8]" />
              {project.collabId ? 'Collab Link Ready' : 'Collaborate Link'}
            </button>
            {project.collabId && (
              <button
                type="button"
                aria-label="Copy story collaboration link"
                title={buildCollabUrl(window.location.origin, project.collabId)}
                onClick={async () => {
                  const url = buildCollabUrl(window.location.origin, project.collabId!);
                  try {
                    await navigator.clipboard.writeText(url);
                    setCopiedLinkType('collab');
                    setTimeout(() => setCopiedLinkType(null), 1800);
                  } catch {
                    onCollaborateStory();
                  }
                }}
                className="px-2 py-1.5 border-l border-neutral-200 text-[#4B5563] hover:text-[#111827] hover:bg-neutral-50 transition-colors shrink-0"
              >
                {copiedLinkType === 'collab' ? (
                  <Check className="w-3.5 h-3.5 text-[#15803D]" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {saveToast && (
        <div className="mb-6 px-4 py-2.5 text-sm text-[#15803D] bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{saveToast}</span>
        </div>
      )}

      {persistError && (
        <div
          role="alert"
          className="mb-6 px-4 py-2.5 text-sm text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] rounded-lg flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0 text-[#DC2626]" />
            <span className="break-words">{persistError}</span>
          </div>
          <button
            type="button"
            onClick={() => setPersistError(null)}
            className="text-xs font-medium underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {isEditingStoryNotes && onUpdateStoryNotes && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onUpdateStoryNotes({
              prefixNote: storyPrefixDraft.trim()
                ? storyPrefixDraft.trim().slice(0, 4000)
                : undefined,
              suffixNote: storySuffixDraft.trim()
                ? storySuffixDraft.trim().slice(0, 4000)
                : undefined,
            });
            setIsEditingStoryNotes(false);
            setSaveToast('Saved story author notes');
            setTimeout(() => setSaveToast(null), 2600);
          }}
          className="mb-8 bg-white border border-neutral-200 rounded-xl p-5 sm:p-6 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-100">
            <div>
              <h2 className="font-editorial text-lg font-semibold text-[#111827]">
                Story Author Notes
              </h2>
              <p className="text-xs text-[#6B7280]">
                Optional beginning (prefix) and ending (suffix) notes displayed around the full story.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="story-prefix-note-input"
                className="block text-xs font-medium text-[#111827] mb-1"
              >
                Beginning Author&apos;s Note (Prefix)
              </label>
              <textarea
                id="story-prefix-note-input"
                rows={3}
                maxLength={4000}
                value={storyPrefixDraft}
                onChange={(e) => setStoryPrefixDraft(e.target.value)}
                placeholder="Note shown before the story begins..."
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white resize-y focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
              />
            </div>
            <div>
              <label
                htmlFor="story-suffix-note-input"
                className="block text-xs font-medium text-[#111827] mb-1"
              >
                Ending Author&apos;s Note (Suffix)
              </label>
              <textarea
                id="story-suffix-note-input"
                rows={3}
                maxLength={4000}
                value={storySuffixDraft}
                onChange={(e) => setStorySuffixDraft(e.target.value)}
                placeholder="Note shown after the story ends..."
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white resize-y focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
            <button
              type="button"
              onClick={() => setIsEditingStoryNotes(false)}
              className="px-3.5 py-1.5 text-xs font-medium text-[#4B5563] hover:text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg cursor-pointer"
            >
              Save Story Notes
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8 items-start">
        {/* Left Main Narrative & Steering Column */}
        <main className="space-y-8 min-w-0">
          {project.turns.length > 0 && (
            <StoryTurnSearchBar
              turns={project.turns}
              characterOptions={characterOptions}
              query={searchQuery}
              characterFilter={characterFilter}
              filterStream={filterStream}
              matches={turnMatches}
              onQueryChange={(val) => {
                setSearchQuery(val);
                setFilterStream(true);
              }}
              onCharacterFilterChange={(val) => {
                setCharacterFilter(val);
                setFilterStream(true);
              }}
              onFilterStreamChange={setFilterStream}
              onJumpToTurn={handleJumpToTurn}
              onClearAll={() => {
                setSearchQuery('');
                setCharacterFilter('');
                setFilterStream(true);
              }}
            />
          )}

          {/* View Mode Toggle: Current Scene / Chapters / Full Story */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-neutral-200 rounded-xl px-4 py-2.5">
            <div
              role="group"
              aria-label="Workspace display mode"
              className="inline-flex items-center bg-neutral-100 border border-neutral-200 rounded-lg p-0.5"
            >
              {(
                [
                  { id: 'scene', label: 'Current Scene' },
                  { id: 'chapters', label: 'Chapters' },
                  { id: 'story', label: 'Full Story' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChangeDisplayMode(item.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    displayMode === item.id
                      ? 'bg-white text-[#1D4ED8] shadow-xs'
                      : 'text-[#4B5563] hover:text-[#111827]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {displayMode === 'scene' && project.turns.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  disabled={activeSceneIndex <= 0}
                  onClick={() => {
                    const prev = project.turns[Math.max(0, activeSceneIndex - 1)];
                    if (prev) setSelectedSceneId(prev.id);
                  }}
                  aria-label="Previous scene"
                  className="p-1.5 border border-neutral-300 rounded-md disabled:opacity-40 hover:bg-neutral-50 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-[#111827] tabular-nums">
                  Scene {activeSceneIndex + 1} of {project.turns.length}
                </span>
                <button
                  type="button"
                  disabled={activeSceneIndex >= project.turns.length - 1}
                  onClick={() => {
                    const next =
                      project.turns[
                        Math.min(project.turns.length - 1, activeSceneIndex + 1)
                      ];
                    if (next) setSelectedSceneId(next.id);
                  }}
                  aria-label="Next scene"
                  className="p-1.5 border border-neutral-300 rounded-md disabled:opacity-40 hover:bg-neutral-50 cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {displayMode === 'chapters' && chapterGroups.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                {chapterGroups.length > 1 ? (
                  <select
                    aria-label="Select chapter"
                    value={clampedChapterIdx}
                    onChange={(e) => setSelectedChapterIdx(Number(e.target.value))}
                    className="px-2.5 py-1.5 text-xs text-[#111827] bg-white border border-neutral-300 rounded-lg"
                  >
                    {chapterGroups.map((g, idx) => (
                      <option key={g.id} value={idx}>
                        {g.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[#4B5563] font-medium">
                    {activeChapterGroup?.title}
                  </span>
                )}
                {activeChapterGroup && !activeChapterGroup.isSynthetic && onUpdateChapters && (
                  <button
                    type="button"
                    onClick={() => {
                      if (editingChapterNotesId === activeChapterGroup.id) {
                        setEditingChapterNotesId(null);
                      } else {
                        setChapterPrefixDraft(activeChapterGroup.prefixNote ?? '');
                        setChapterSuffixDraft(activeChapterGroup.suffixNote ?? '');
                        setEditingChapterNotesId(activeChapterGroup.id);
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#1D4ED8] bg-[#EFF6FF] border border-[#BFDBFE] hover:bg-[#DBEAFE] rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Feather className="w-3 h-3" />
                    Chapter Notes
                  </button>
                )}
              </div>
            )}
          </div>

          {displayMode === 'chapters' &&
            activeChapterGroup &&
            !activeChapterGroup.isSynthetic &&
            editingChapterNotesId === activeChapterGroup.id &&
            onUpdateChapters && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const nextChapters = (project.chapters ?? []).map((ch) =>
                    ch.id === activeChapterGroup.id
                      ? {
                          ...ch,
                          prefixNote: chapterPrefixDraft.trim()
                            ? chapterPrefixDraft.trim().slice(0, 4000)
                            : undefined,
                          suffixNote: chapterSuffixDraft.trim()
                            ? chapterSuffixDraft.trim().slice(0, 4000)
                            : undefined,
                        }
                      : ch,
                  );
                  onUpdateChapters(nextChapters);
                  setEditingChapterNotesId(null);
                  setSaveToast(`Saved notes for ${activeChapterGroup.title}`);
                  setTimeout(() => setSaveToast(null), 2600);
                }}
                className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4"
              >
                <p className="text-xs font-semibold text-[#111827]">
                  Author Notes for {activeChapterGroup.title}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor={`ws-chap-prefix-${activeChapterGroup.id}`}
                      className="block text-xs font-medium text-[#111827] mb-1"
                    >
                      Chapter Beginning Note (Prefix)
                    </label>
                    <textarea
                      id={`ws-chap-prefix-${activeChapterGroup.id}`}
                      rows={2}
                      maxLength={4000}
                      value={chapterPrefixDraft}
                      onChange={(e) => setChapterPrefixDraft(e.target.value)}
                      placeholder="Optional note displayed before this chapter..."
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white resize-y focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`ws-chap-suffix-${activeChapterGroup.id}`}
                      className="block text-xs font-medium text-[#111827] mb-1"
                    >
                      Chapter Ending Note (Suffix)
                    </label>
                    <textarea
                      id={`ws-chap-suffix-${activeChapterGroup.id}`}
                      rows={2}
                      maxLength={4000}
                      value={chapterSuffixDraft}
                      onChange={(e) => setChapterSuffixDraft(e.target.value)}
                      placeholder="Optional note displayed after this chapter..."
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white resize-y focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingChapterNotesId(null)}
                    className="px-3 py-1.5 text-xs font-medium text-[#4B5563] border border-neutral-300 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg cursor-pointer"
                  >
                    Save Chapter Notes
                  </button>
                </div>
              </form>
            )}

          {project.prefixNote &&
            (displayMode === 'story' ||
              (displayMode === 'chapters' && clampedChapterIdx === 0) ||
              (displayMode === 'scene' && activeSceneIndex === 0)) && (
              <AuthorNoteBlock
                variant="prefix"
                scope="story"
                note={project.prefixNote}
                onEdit={
                  onUpdateStoryNotes
                    ? () => {
                        setStoryPrefixDraft(project.prefixNote ?? '');
                        setStorySuffixDraft(project.suffixNote ?? '');
                        setIsEditingStoryNotes(true);
                      }
                    : undefined
                }
              />
            )}

          {displayMode === 'chapters' &&
            activeChapterGroup &&
            !activeChapterGroup.isSynthetic &&
            activeChapterGroup.prefixNote && (
              <AuthorNoteBlock
                variant="prefix"
                scope="chapter"
                note={activeChapterGroup.prefixNote}
                compact
                onEdit={
                  onUpdateChapters
                    ? () => {
                        setChapterPrefixDraft(activeChapterGroup.prefixNote ?? '');
                        setChapterSuffixDraft(activeChapterGroup.suffixNote ?? '');
                        setEditingChapterNotesId(activeChapterGroup.id);
                      }
                    : undefined
                }
              />
            )}

          {/* Narrative Turns Stream */}
          <div className="space-y-8">
            {displayedTurns.length === 0 && hasActiveFilter && (
              <div className="bg-white border border-neutral-200 rounded-xl p-8 text-center space-y-3">
                <p className="text-base font-semibold text-[#111827]">
                  No scenes match your current search
                </p>
                <p className="text-sm text-[#4B5563]">
                  Try a scene number (like <span className="font-mono">#1</span>), a
                  character name, a scene title, or another keyword.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setCharacterFilter('');
                  }}
                  className="inline-flex items-center px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors"
                >
                  Clear Search & Filters
                </button>
              </div>
            )}

            {displayedTurns.map((turn, turnIdx) => {
              const isLatest = turn.id === latestTurn?.id;
              const isHighlighted = highlightedTurnId === turn.id;
              const chapterInfo = turnChapterMap.get(turn.id);
              const chapterObj = chapterInfo
                ? chapterByIdMap.get(chapterInfo.chapterId)
                : undefined;
              const prevTurn = turnIdx > 0 ? displayedTurns[turnIdx - 1] : undefined;
              const nextTurn =
                turnIdx < displayedTurns.length - 1
                  ? displayedTurns[turnIdx + 1]
                  : undefined;
              const prevChapterId = prevTurn
                ? turnChapterMap.get(prevTurn.id)?.chapterId
                : undefined;
              const nextChapterId = nextTurn
                ? turnChapterMap.get(nextTurn.id)?.chapterId
                : undefined;
              const isChapterStartInStory =
                displayMode === 'story' &&
                !hasActiveFilter &&
                Boolean(chapterObj) &&
                chapterObj!.id !== prevChapterId;
              const isChapterEndInStory =
                displayMode === 'story' &&
                !hasActiveFilter &&
                Boolean(chapterObj) &&
                chapterObj!.id !== nextChapterId;
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
              const isTtsReady = speech.isItemReady(ttsItem);
              const isTtsPrecomputing = speech.isItemPrecomputing(ttsItem);
              const isEditingThis = editingTurnId === turn.id;
              return (
                <React.Fragment key={turn.id}>
                  {isChapterStartInStory && chapterObj?.prefixNote && (
                    <AuthorNoteBlock
                      variant="prefix"
                      scope="chapter"
                      note={chapterObj.prefixNote}
                      compact
                    />
                  )}
                  <article
                  id={`story-turn-${turn.turnNumber}`}
                  data-turn-number={turn.turnNumber}
                  ref={(el) => {
                    turnCardRefs.current[turn.id] = el;
                    if (isLatest) {
                      (
                        latestSceneRef as React.MutableRefObject<HTMLElement | null>
                      ).current = el;
                    }
                  }}
                  className={`scroll-mt-24 bg-white border rounded-xl p-6 sm:p-8 transition-shadow ${
                    isHighlighted
                      ? 'border-[#1D4ED8] ring-2 ring-[#1D4ED8]/25'
                      : 'border-neutral-200'
                  }`}
                >
                  {isEditingThis ? (
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
                            {renderHighlightedText(turn.sceneTitle, highlightTerms)}
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
                            title={
                              isTtsReady
                                ? 'Narration ready — click to play immediately'
                                : isTtsPrecomputing
                                  ? 'Pre-computing narration in background...'
                                  : 'Read scene aloud (Text-to-Speech)'
                            }
                            data-narration-status={
                              isTtsReady
                                ? 'ready'
                                : isTtsPrecomputing
                                  ? 'precomputing'
                                  : 'idle'
                            }
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
                            onClick={() =>
                              setIllustrationTarget({ kind: 'scene', turn })
                            }
                            aria-label={`Illustration studio for scene ${turn.turnNumber}`}
                            title="Generate illustration prompt or upload scene artwork"
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                              turn.illustration
                                ? 'text-[#1D4ED8] bg-[#EFF6FF] border-[#BFDBFE]'
                                : 'text-[#4B5563] hover:text-[#1D4ED8] hover:bg-[#F8FAFC] border-neutral-200 hover:border-[#BFDBFE]'
                            }`}
                          >
                            <ImagePlus className="w-3.5 h-3.5" />
                            Illustrate
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingTurnId(turn.id)}
                            aria-label={`Edit scene ${turn.turnNumber} prompt or output`}
                            title="Edit scene prompt or narrative output freely"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#4B5563] hover:text-[#1D4ED8] hover:bg-[#F8FAFC] border border-neutral-200 hover:border-[#BFDBFE] rounded-lg transition-colors whitespace-nowrap shrink-0"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setFlaggingTurn(turn)}
                            aria-label={`Flag scene ${turn.turnNumber} for manual correction`}
                            title="Flag missed inconsistency or rewrite with AI"
                            className="p-1.5 text-[#6B7280] hover:text-[#B45309] hover:bg-[#FFFBEB] border border-neutral-200 hover:border-[#FDE68A] rounded-lg transition-colors"
                          >
                            <Flag className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isPersisting}
                            onClick={() =>
                              void handlePersist(
                                `Scene ${String(turn.turnNumber).padStart(2, '0')}`,
                              )
                            }
                            aria-label={`Save scene ${turn.turnNumber} to Firestore`}
                            title="Save scene to Firestore & browser storage"
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-[#4B5563] hover:text-[#1D4ED8] hover:bg-[#F8FAFC] border border-neutral-200 hover:border-[#BFDBFE] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                          >
                            <Save className="w-3.5 h-3.5" />
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => onShareScene(turn)}
                            aria-label={`Share scene ${turn.turnNumber}`}
                            title="Share scene via Firestore link"
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-[#4B5563] hover:text-[#1D4ED8] hover:bg-[#F8FAFC] border border-neutral-200 hover:border-[#BFDBFE] rounded-lg transition-colors whitespace-nowrap shrink-0"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                            Share
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const filename = downloadSceneHtml(project, turn);
                              setSaveToast(`Saved ${filename}`);
                              setTimeout(() => setSaveToast(null), 2600);
                            }}
                            aria-label={`Download scene ${turn.turnNumber} HTML`}
                            title="Download scene as HTML"
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-[#4B5563] hover:text-[#1D4ED8] hover:bg-[#F8FAFC] border border-neutral-200 hover:border-[#BFDBFE] rounded-lg transition-colors whitespace-nowrap shrink-0"
                          >
                            <Download className="w-3.5 h-3.5" />
                            HTML
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const filename = await downloadScenePdf(project, turn);
                              setSaveToast(`Saved ${filename}`);
                              setTimeout(() => setSaveToast(null), 2600);
                            }}
                            aria-label={`Download scene ${turn.turnNumber} PDF`}
                            title="Download scene as PDF"
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-[#4B5563] hover:text-[#1D4ED8] hover:bg-[#F8FAFC] border border-neutral-200 hover:border-[#BFDBFE] rounded-lg transition-colors whitespace-nowrap shrink-0"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            PDF
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
                          {renderHighlightedText(turn.userAction, highlightTerms)}
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

                      {/* Scene Illustration */}
                      {turn.illustration && (
                        <div className="mt-5">
                          <IllustrationFigure
                            illustration={turn.illustration}
                            fallbackAlt={`Scene ${String(turn.turnNumber).padStart(2, '0')} — ${turn.sceneTitle}`}
                            onEdit={() => setIllustrationTarget({ kind: 'scene', turn })}
                            onRemove={() => {
                              onUpdateTurnIllustration(turn.id, null);
                              setSaveToast(
                                `Removed illustration from Scene ${String(turn.turnNumber).padStart(2, '0')}`,
                              );
                              setTimeout(() => setSaveToast(null), 2600);
                            }}
                          />
                        </div>
                      )}

                      {/* Scene Beginning Author's Note (Prefix) */}
                      {turn.prefixNote && (
                        <div className="mt-5">
                          <AuthorNoteBlock
                            variant="prefix"
                            scope="scene"
                            note={turn.prefixNote}
                            compact
                            onEdit={() => setEditingTurnId(turn.id)}
                          >
                            {renderHighlightedText(turn.prefixNote, highlightTerms)}
                          </AuthorNoteBlock>
                        </div>
                      )}

                      {/* Literary Prose */}
                      <div className="mt-5 space-y-4 max-w-[68ch] text-[15.5px] leading-[1.75] text-[#111827]">
                        {turn.prose.map((paragraph, pIdx) => (
                          <p key={pIdx}>{renderHighlightedText(paragraph, highlightTerms)}</p>
                        ))}
                      </div>

                      {/* Scene Ending Author's Note (Suffix) */}
                      {turn.suffixNote && (
                        <div className="mt-5">
                          <AuthorNoteBlock
                            variant="suffix"
                            scope="scene"
                            note={turn.suffixNote}
                            compact
                            onEdit={() => setEditingTurnId(turn.id)}
                          >
                            {renderHighlightedText(turn.suffixNote, highlightTerms)}
                          </AuthorNoteBlock>
                        </div>
                      )}

                      {/* Scene Continuity Verification Footer */}
                      <div className="mt-6 pt-4 border-t border-neutral-100 space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B7280]">
                          <span>
                            Present:{' '}
                            {renderHighlightedText(
                              turn.activeCharacters.join(' · ') || 'Narrator',
                              highlightTerms,
                            )}
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
                    </>
                  )}
                </article>
                {isChapterEndInStory && chapterObj?.suffixNote && (
                  <AuthorNoteBlock
                    variant="suffix"
                    scope="chapter"
                    note={chapterObj.suffixNote}
                    compact
                  />
                )}
              </React.Fragment>
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

          {displayMode === 'chapters' &&
            activeChapterGroup &&
            !activeChapterGroup.isSynthetic &&
            activeChapterGroup.suffixNote && (
              <AuthorNoteBlock
                variant="suffix"
                scope="chapter"
                note={activeChapterGroup.suffixNote}
                compact
                onEdit={
                  onUpdateChapters
                    ? () => {
                        setChapterPrefixDraft(activeChapterGroup.prefixNote ?? '');
                        setChapterSuffixDraft(activeChapterGroup.suffixNote ?? '');
                        setEditingChapterNotesId(activeChapterGroup.id);
                      }
                    : undefined
                }
              />
            )}

          {project.suffixNote &&
            (displayMode === 'story' ||
              (displayMode === 'chapters' &&
                clampedChapterIdx === chapterGroups.length - 1) ||
              (displayMode === 'scene' &&
                activeSceneIndex === project.turns.length - 1)) && (
              <AuthorNoteBlock
                variant="suffix"
                scope="story"
                note={project.suffixNote}
                onEdit={
                  onUpdateStoryNotes
                    ? () => {
                        setStoryPrefixDraft(project.prefixNote ?? '');
                        setStorySuffixDraft(project.suffixNote ?? '');
                        setIsEditingStoryNotes(true);
                      }
                    : undefined
                }
              />
            )}

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
                            focusCustomAction();
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
                  <div
                    key={choice.id}
                    className="border border-neutral-200 hover:border-[#1D4ED8] hover:bg-[#F8FAFC] rounded-xl transition-colors flex items-stretch justify-between gap-2"
                  >
                    <button
                      type="button"
                      disabled={isAdvancing}
                      onClick={() => handleChoiceClick(choice)}
                      className="group flex-1 min-w-0 text-left p-4 disabled:opacity-50 flex items-start justify-between gap-4 rounded-l-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
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
                    <div className="flex items-start p-3 pl-0 shrink-0">
                      <button
                        type="button"
                        disabled={isAdvancing}
                        onClick={() => {
                          setCustomAction(choice.label);
                          focusCustomAction();
                        }}
                        aria-label={`Edit option ${idx + 1}: ${choice.label}`}
                        title="Copy action to prompt box to customize"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#4B5563] hover:text-[#1D4ED8] bg-white hover:bg-[#EFF6FF] border border-neutral-200 hover:border-[#BFDBFE] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                    </div>
                  </div>
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
                    ref={customActionRef}
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

          {/* Hierarchical Discussion & Sub-Comments */}
          <CommentsSection
            storyId={publicStoryId}
            comments={storyComments}
            chapters={project.chapters ?? []}
            turns={project.turns}
            scope={commentScopeConfig.scope}
            targetId={commentScopeConfig.targetId}
            targetLabel={commentScopeConfig.targetLabel}
            currentReaderUid={currentReaderUid}
            currentReaderName={currentReaderName}
            isOwner
            onAddComment={onAddComment}
            onDeleteComment={onDeleteComment}
            compact
          />
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

      {/* Hovering Overlay Storywide Menu Bar */}
      <StoryFloatingBar
        displayMode={displayMode}
        onChangeDisplayMode={onChangeDisplayMode}
        storyIdForLibrary={publicStoryId}
        project={project}
        storyCount={storyCount}
        collections={collections}
        isSubscribed={isSubscribed}
        onToggleSubscribe={onToggleSubscribe}
        onToggleCollectionStory={onToggleCollectionStory}
        onQuickCreateCollection={onQuickCreateCollection}
        onPersistNow={() => void handlePersist('Story')}
        isPersisting={isPersisting}
        onShareStory={onShareStory}
        onCollaborateStory={onCollaborateStory}
        onOpenStoriesLibrary={onOpenStoriesLibrary}
        onCreateCheckpoint={() => {
          const label = `Scene ${String(latestTurn?.turnNumber ?? 1).padStart(
            2,
            '0',
          )} — ${latestTurn?.sceneTitle ?? 'Checkpoint'}`;
          onCreateSavePoint(label);
          setSaveToast(`Saved "${label}"`);
          setTimeout(() => setSaveToast(null), 2600);
        }}
        onRunAuditAndOpen={onRunAuditAndOpen}
        onOpenHtmlExport={onOpenHtmlExport}
        onToast={(msg) => {
          setSaveToast(msg);
          setTimeout(() => setSaveToast(null), 2600);
        }}
      />

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

      <IllustrationModal
        project={project}
        target={illustrationTarget}
        modelConfig={modelConfig}
        onClose={() => setIllustrationTarget(null)}
        onSaveIllustration={(illustration) => {
          if (illustrationTarget?.kind === 'scene') {
            const targetTurn = illustrationTarget.turn;
            onUpdateTurnIllustration(targetTurn.id, illustration);
            setSaveToast(
              illustration
                ? `Saved illustration for Scene ${String(targetTurn.turnNumber).padStart(2, '0')}`
                : `Removed illustration from Scene ${String(targetTurn.turnNumber).padStart(2, '0')}`,
            );
            setTimeout(() => setSaveToast(null), 2600);
          }
        }}
      />
    </div>
  );
};
