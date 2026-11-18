import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  GitFork,
  Heart,
  Tag,
} from 'lucide-react';
import {
  CommentTargetType,
  PublicStoryWork,
  StoryComment,
  StoryDisplayMode,
  StoryProject,
  StoryTurn,
  UserCollection,
} from '../types/story';
import { buildPublicStoryUrl } from '../utils/storyLinks';
import { CommentAddPayload, CommentsSection } from './CommentsSection';
import { StoryFloatingBar } from './StoryFloatingBar';

interface PublicStoryViewProps {
  story: PublicStoryWork;
  comments: StoryComment[];
  hasGivenKudo: boolean;
  isSignedIn: boolean;
  currentReaderUid: string;
  currentReaderName: string;
  isOwner: boolean;
  displayMode: StoryDisplayMode;
  onChangeDisplayMode: (mode: StoryDisplayMode) => void;
  collections: UserCollection[];
  isSubscribed: boolean;
  onToggleSubscribe: () => void;
  onToggleCollectionStory: (collectionId: string, storyId: string) => void;
  onQuickCreateCollection: (name: string, storyId: string) => void;
  onBackToIndex: () => void;
  onGiveKudo: (
    storyId: string,
    options?: { anonymous?: boolean },
  ) => Promise<void> | void;
  onAddComment: (
    storyId: string,
    payload: CommentAddPayload,
  ) => Promise<void> | void;
  onDeleteComment: (storyId: string, commentId: string) => Promise<void> | void;
  onOpenInStudio: (project: StoryProject) => void;
  onEditTagsAndVisibility?: () => void;
}

export const PublicStoryView: React.FC<PublicStoryViewProps> = ({
  story,
  comments,
  hasGivenKudo,
  isSignedIn,
  currentReaderUid,
  currentReaderName,
  isOwner,
  displayMode,
  onChangeDisplayMode,
  collections,
  isSubscribed,
  onToggleSubscribe,
  onToggleCollectionStory,
  onQuickCreateCollection,
  onBackToIndex,
  onGiveKudo,
  onAddComment,
  onDeleteComment,
  onOpenInStudio,
  onEditTagsAndVisibility,
}) => {
  const [selectedTurnIndex, setSelectedTurnIndex] = useState(0);
  const [selectedChapterIdx, setSelectedChapterIdx] = useState(0);
  const [giveAnonymously, setGiveAnonymously] = useState(!isSignedIn);
  const [givingKudo, setGivingKudo] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    setSelectedTurnIndex(0);
    setSelectedChapterIdx(0);
  }, [story.id]);

  useEffect(() => {
    if (!isSignedIn) setGiveAnonymously(true);
  }, [isSignedIn]);

  const chapterGroups = useMemo(() => {
    if (!story.chapters || story.chapters.length === 0) {
      return [
        {
          id: story.id,
          title: 'Story Manuscript',
          summary: '',
          turns: story.turns,
          isSynthetic: true,
        },
      ];
    }
    const turnMap = new Map(story.turns.map((t) => [t.id, t]));
    const assigned = new Set<string>();
    const groups = story.chapters
      .map((ch) => {
        const chTurns = ch.turnIds
          .map((id) => turnMap.get(id))
          .filter((t): t is StoryTurn => Boolean(t));
        chTurns.forEach((t) => assigned.add(t.id));
        return {
          id: ch.id,
          title: `Chapter ${String(ch.chapterNumber).padStart(2, '0')} — ${ch.title}`,
          summary: ch.summary,
          turns: chTurns,
          isSynthetic: false,
        };
      })
      .filter((g) => g.turns.length > 0);

    const unassigned = story.turns.filter((t) => !assigned.has(t.id));
    if (unassigned.length > 0) {
      groups.push({
        id: `${story.id}-unassigned`,
        title: 'Recent Unassigned Scenes',
        summary: '',
        turns: unassigned,
        isSynthetic: true,
      });
    }
    return groups;
  }, [story.chapters, story.turns, story.id]);

  const clampedTurnIndex = Math.min(
    Math.max(0, selectedTurnIndex),
    Math.max(0, story.turns.length - 1),
  );
  const activeTurn = story.turns[clampedTurnIndex];

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
    if (displayMode === 'scene' && activeTurn) {
      return {
        scope: 'scene',
        targetId: activeTurn.id,
        targetLabel: `Scene ${String(activeTurn.turnNumber).padStart(2, '0')} — ${activeTurn.sceneTitle}`,
      };
    }
    if (displayMode === 'chapters' && activeChapterGroup && !activeChapterGroup.isSynthetic) {
      return {
        scope: 'chapter',
        targetId: activeChapterGroup.id,
        targetLabel: activeChapterGroup.title,
      };
    }
    return {
      scope: 'story',
      targetId: story.id,
      targetLabel: story.title,
    };
  })();

  const handleKudoClick = async () => {
    if (hasGivenKudo || givingKudo) return;
    setGivingKudo(true);
    try {
      await onGiveKudo(story.id, { anonymous: giveAnonymously || !isSignedIn });
    } finally {
      setGivingKudo(false);
    }
  };

  const handleCopyLink = async () => {
    const url = buildPublicStoryUrl(window.location.origin, story.id);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      // Ignore clipboard error
    }
  };

  const handleForkToStudio = () => {
    onOpenInStudio({
      id: `proj-fork-${Date.now().toString(36)}`,
      title: `${story.title} (Studio Copy)`,
      universe: story.universe,
      setting: story.setting,
      tone: story.tone,
      premise: story.premise,
      coverImage: story.coverImage,
      protagonistId: story.characters[0]?.id ?? '',
      turns: JSON.parse(JSON.stringify(story.turns)),
      characters: JSON.parse(JSON.stringify(story.characters)),
      crossIndex: [],
      chapters: JSON.parse(JSON.stringify(story.chapters ?? [])),
      savePoints: [],
      isPrivate: true,
      tags: JSON.parse(JSON.stringify(story.tags)),
      updatedAt: Date.now(),
    });
  };

  const renderTurn = (turn: StoryTurn) => (
    <div key={turn.id} className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-editorial text-xl font-semibold text-[#111827]">
          Scene {String(turn.turnNumber).padStart(2, '0')} — {turn.sceneTitle}
        </h3>
        <p className="text-xs text-[#6B7280]">
          {turn.location} · {turn.inStoryTime}
        </p>
      </div>
      {turn.userAction && (
        <p className="text-xs italic text-[#4B5563] pl-3 border-l-2 border-neutral-300">
          Author Direction: {turn.userAction}
        </p>
      )}
      <div className="space-y-4 text-base text-[#1F2937] leading-[1.78] font-editorial">
        {turn.prose.map((para, pIdx) => (
          <p key={pIdx}>{para}</p>
        ))}
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 pt-8 pb-28 space-y-8">
      {/* Top Reader Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-neutral-200">
        <button
          type="button"
          onClick={onBackToIndex}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1D4ED8] hover:underline cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Story Index
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {isOwner && onEditTagsAndVisibility && (
            <button
              type="button"
              onClick={onEditTagsAndVisibility}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#111827] bg-white hover:bg-neutral-50 border border-neutral-300 rounded-lg cursor-pointer"
            >
              <Tag className="w-3.5 h-3.5 text-[#1D4ED8]" />
              Edit Tags &amp; Privacy
            </button>
          )}
          <button
            type="button"
            onClick={onToggleSubscribe}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg cursor-pointer ${
              isSubscribed
                ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8]'
                : 'bg-white border-neutral-300 text-[#111827] hover:bg-neutral-50'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            {isSubscribed ? 'Subscribed' : 'Subscribe'}
          </button>
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#111827] bg-white hover:bg-neutral-50 border border-neutral-300 rounded-lg cursor-pointer"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#15803D]" />
                Link Copied
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-[#4B5563]" />
                Copy Story URL
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleForkToStudio}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg cursor-pointer"
          >
            <GitFork className="w-3.5 h-3.5" />
            Branch in Studio
          </button>
        </div>
      </div>

      {/* AO3-Style Work Metadata Card */}
      <section className="bg-white border border-neutral-200 rounded-xl p-6 sm:p-8 space-y-6">
        <div className="space-y-2 border-b border-neutral-200 pb-5">
          <p className="text-xs text-[#6B7280]">
            {story.universe} <span aria-hidden="true">·</span> {story.setting}
          </p>
          <h1 className="font-editorial text-3xl sm:text-4xl font-semibold text-[#111827] text-balance">
            {story.title}
          </h1>
          <p className="text-sm text-[#4B5563]">
            by <span className="font-medium text-[#111827]">{story.authorName}</span>
          </p>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-[150px_1fr] gap-y-2 gap-x-5 text-xs leading-relaxed">
          <dt className="font-semibold text-[#4B5563]">Rating</dt>
          <dd className="font-medium text-[#111827]">{story.tags.rating}</dd>

          <dt className="font-semibold text-[#4B5563]">Archive Warnings</dt>
          <dd className="font-medium text-[#111827]">{story.tags.warnings.join(', ')}</dd>

          <dt className="font-semibold text-[#4B5563]">Category</dt>
          <dd className="text-[#111827]">{story.tags.categories.join(', ')}</dd>

          <dt className="font-semibold text-[#4B5563]">Fandoms</dt>
          <dd className="text-[#111827]">{story.tags.fandoms.join(', ')}</dd>

          {story.tags.relationships.length > 0 && (
            <>
              <dt className="font-semibold text-[#4B5563]">Relationships</dt>
              <dd className="text-[#111827]">{story.tags.relationships.join(', ')}</dd>
            </>
          )}

          {story.tags.characters.length > 0 && (
            <>
              <dt className="font-semibold text-[#4B5563]">Characters</dt>
              <dd className="text-[#111827]">{story.tags.characters.join(', ')}</dd>
            </>
          )}

          {story.tags.freeforms.length > 0 && (
            <>
              <dt className="font-semibold text-[#4B5563]">Additional Tags</dt>
              <dd className="text-[#111827]">{story.tags.freeforms.join(', ')}</dd>
            </>
          )}

          <dt className="font-semibold text-[#4B5563]">Stats</dt>
          <dd className="font-mono text-[#4B5563] tabular-nums">
            Published {new Date(story.createdAtMs).toLocaleDateString()} · Words:{' '}
            {story.wordCount.toLocaleString()} · Scenes: {story.turns.length} ·
            Comments: {comments.length} · Kudos: {story.kudosCount}
          </dd>
        </dl>

        <div className="pt-4 border-t border-neutral-200 space-y-1.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#4B5563]">
            Summary
          </h2>
          <p className="text-sm text-[#1F2937] leading-relaxed">{story.premise}</p>
        </div>
      </section>

      {/* Inline View Toggle + Scope Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-neutral-200 rounded-xl px-5 py-3">
        <div
          role="group"
          aria-label="Reader display scope"
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
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                displayMode === item.id
                  ? 'bg-white text-[#1D4ED8] shadow-xs'
                  : 'text-[#4B5563] hover:text-[#111827]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {displayMode === 'scene' && story.turns.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              disabled={clampedTurnIndex === 0}
              onClick={() => setSelectedTurnIndex((i) => Math.max(0, i - 1))}
              className="p-1.5 border border-neutral-300 rounded-md disabled:opacity-40 hover:bg-neutral-50 cursor-pointer"
              aria-label="Previous scene"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-[#111827]">
              Scene {clampedTurnIndex + 1} of {story.turns.length}
            </span>
            <button
              type="button"
              disabled={clampedTurnIndex >= story.turns.length - 1}
              onClick={() =>
                setSelectedTurnIndex((i) => Math.min(story.turns.length - 1, i + 1))
              }
              className="p-1.5 border border-neutral-300 rounded-md disabled:opacity-40 hover:bg-neutral-50 cursor-pointer"
              aria-label="Next scene"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {displayMode === 'chapters' && chapterGroups.length > 1 && (
          <select
            aria-label="Select chapter to read"
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
        )}
      </div>

      {/* Readable Prose Container (Respects Current Scene / Chapters / Full Story) */}
      <article className="bg-white border border-neutral-200 rounded-xl p-6 sm:p-10 space-y-10">
        {displayMode === 'scene' && activeTurn && (
          <section className="space-y-8">{renderTurn(activeTurn)}</section>
        )}

        {displayMode === 'chapters' && activeChapterGroup && (
          <section className="space-y-8">
            <header className="border-b border-neutral-200 pb-3">
              <h2 className="font-editorial text-2xl font-semibold text-[#111827]">
                {activeChapterGroup.title}
              </h2>
              {activeChapterGroup.summary && (
                <p className="text-sm text-[#4B5563] mt-1">
                  {activeChapterGroup.summary}
                </p>
              )}
            </header>
            <div className="space-y-9">
              {activeChapterGroup.turns.map(renderTurn)}
            </div>
          </section>
        )}

        {displayMode === 'story' &&
          chapterGroups.map((group) => (
            <section key={group.id} className="space-y-8">
              <header className="border-b border-neutral-200 pb-3">
                <h2 className="font-editorial text-2xl font-semibold text-[#111827]">
                  {group.title}
                </h2>
                {group.summary && (
                  <p className="text-sm text-[#4B5563] mt-1">{group.summary}</p>
                )}
              </header>
              <div className="space-y-9">{group.turns.map(renderTurn)}</div>
            </section>
          ))}

        {/* Kudos Bar (Supports Anonymous Kudos) */}
        <div className="pt-6 border-t border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-[#111827]">
              {hasGivenKudo
                ? 'You have left kudos on this work.'
                : 'Enjoyed this story? Leave kudos for the author.'}
            </p>
            <p className="font-mono text-xs text-[#6B7280] tabular-nums">
              {story.kudosCount} {story.kudosCount === 1 ? 'person' : 'people'} left kudos
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {!hasGivenKudo && (
              <label className="inline-flex items-center gap-1.5 text-xs text-[#4B5563] cursor-pointer">
                <input
                  type="checkbox"
                  checked={giveAnonymously || !isSignedIn}
                  disabled={!isSignedIn}
                  onChange={(e) => setGiveAnonymously(e.target.checked)}
                  className="rounded border-neutral-300 text-[#1D4ED8]"
                />
                Anonymous kudos
              </label>
            )}

            <button
              type="button"
              onClick={() => void handleKudoClick()}
              disabled={hasGivenKudo || givingKudo}
              data-testid="give-kudos-btn"
              className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                hasGivenKudo
                  ? 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B] cursor-default'
                  : 'bg-white hover:bg-[#FEF2F2] border-neutral-300 hover:border-[#FCA5A5] text-[#111827] cursor-pointer'
              }`}
            >
              <Heart
                className={`w-4 h-4 ${
                  hasGivenKudo ? 'fill-[#DC2626] text-[#DC2626]' : 'text-[#DC2626]'
                }`}
              />
              {hasGivenKudo ? 'Kudos Given' : 'Give Kudos ♥'}
            </button>
          </div>
        </div>
      </article>

      {/* Hierarchical Reader Comments Section (rolls scene -> chapter -> story) */}
      <CommentsSection
        storyId={story.id}
        comments={comments}
        chapters={story.chapters ?? []}
        turns={story.turns}
        scope={commentScopeConfig.scope}
        targetId={commentScopeConfig.targetId}
        targetLabel={commentScopeConfig.targetLabel}
        currentReaderUid={currentReaderUid}
        currentReaderName={currentReaderName}
        isOwner={isOwner}
        onAddComment={onAddComment}
        onDeleteComment={onDeleteComment}
      />

      {/* Hovering Overlay Storywide Menu Bar */}
      <StoryFloatingBar
        displayMode={displayMode}
        onChangeDisplayMode={onChangeDisplayMode}
        storyIdForLibrary={story.id}
        collections={collections}
        isSubscribed={isSubscribed}
        onToggleSubscribe={onToggleSubscribe}
        onToggleCollectionStory={onToggleCollectionStory}
        onQuickCreateCollection={onQuickCreateCollection}
        onShareStory={handleCopyLink}
      />
    </div>
  );
};
