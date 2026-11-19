import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookCopy,
  BookOpen,
  Loader2,
} from 'lucide-react';
import { formatReadableFirestoreError, useAuth } from '../contexts/AuthContext';
import { SharedWork, StoryProject, StoryTurn } from '../types/story';
import { AuthorNoteBlock } from './AuthorNoteBlock';

interface SharedWorkViewProps {
  shareId: string;
  onExit: () => void;
  onImportWork: (project: StoryProject) => void;
}

export const SharedWorkView: React.FC<SharedWorkViewProps> = ({
  shareId,
  onExit,
  onImportWork,
}) => {
  const { fetchSharedWork } = useAuth();
  const [work, setWork] = useState<SharedWork | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void (async () => {
      try {
        const fetched = await fetchSharedWork(shareId);
        if (!cancelled) {
          setWork(fetched);
        }
      } catch (err) {
        if (!cancelled) {
          setError(formatReadableFirestoreError(err));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shareId, fetchSharedWork]);

  const handleImportCopy = () => {
    if (!work) return;
    const clonedTurns = work.turns.map((t, idx) => ({
      ...t,
      turnNumber: idx + 1,
    }));
    const protagonist =
      work.characters.find((c) => c.role === 'Protagonist') ?? work.characters[0];

    const importedProject: StoryProject = {
      id: `proj-${Date.now()}`,
      title: work.scope === 'story' ? `${work.storyTitle} (Copy)` : work.workTitle,
      universe: work.universe,
      setting: work.setting,
      tone: work.tone,
      premise: work.premise,
      prefixNote: work.scope === 'story' ? work.prefixNote : undefined,
      suffixNote: work.scope === 'story' ? work.suffixNote : undefined,
      protagonistId: protagonist?.id ?? '',
      turns: clonedTurns,
      characters: work.characters,
      crossIndex: [],
      chapters: work.chapters,
      savePoints: [],
      updatedAt: Date.now(),
    };
    onImportWork(importedProject);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#111827]">
      <header className="sticky top-0 z-30 bg-white border-b border-neutral-200">
        <div className="max-w-[960px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center gap-2 text-sm font-medium text-[#4B5563] hover:text-[#111827] transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Studio
          </button>

          {work && (
            <button
              type="button"
              onClick={handleImportCopy}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <BookCopy className="w-3.5 h-3.5" />
              Import Copy to My Stories
            </button>
          )}
        </div>
      </header>

      <main className="max-w-[960px] mx-auto px-4 sm:px-8 py-10">
        {isLoading ? (
          <div className="bg-white border border-neutral-200 rounded-xl p-12 flex flex-col items-center justify-center gap-3 text-sm text-[#4B5563]">
            <Loader2 className="w-6 h-6 animate-spin text-[#1D4ED8]" />
            <span>Loading shared manuscript from Firestore...</span>
          </div>
        ) : error ? (
          <div className="bg-white border border-[#FECACA] rounded-xl p-8 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#DC2626] shrink-0 mt-0.5" />
              <div>
                <h1 className="font-editorial text-xl font-semibold text-[#111827]">
                  Unable to load shared link
                </h1>
                <p className="text-sm text-[#4B5563] mt-1">{error}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onExit}
              className="px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors"
            >
              Return to Studio
            </button>
          </div>
        ) : !work ? (
          <div className="bg-white border border-neutral-200 rounded-xl p-10 text-center space-y-3">
            <BookOpen className="w-6 h-6 text-[#6B7280] mx-auto" />
            <h1 className="font-editorial text-2xl font-semibold text-[#111827]">
              Shared work not found
            </h1>
            <p className="text-sm text-[#4B5563] max-w-md mx-auto">
              This share link may have expired or been revoked by its author.
            </p>
            <button
              type="button"
              onClick={onExit}
              className="mt-2 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors"
            >
              Open Folio &amp; Canon Studio
            </button>
          </div>
        ) : (
          <article className="space-y-8">
            <header className="pb-6 border-b border-neutral-200 space-y-2">
              <p className="text-xs text-[#6B7280]">
                Shared{' '}
                {work.scope === 'story'
                  ? 'Full Story'
                  : work.scope === 'chapter'
                    ? 'Chapter'
                    : 'Scene'}{' '}
                <span aria-hidden="true">·</span> {work.universe}{' '}
                {work.setting ? (
                  <>
                    <span aria-hidden="true">·</span> {work.setting}
                  </>
                ) : null}{' '}
                <span aria-hidden="true">·</span> By {work.authorName}
              </p>
              <h1 className="font-editorial text-3xl sm:text-4xl font-semibold text-[#111827] text-balance">
                {work.workTitle}
              </h1>
              {work.scope !== 'story' && (
                <p className="text-sm text-[#4B5563]">From {work.storyTitle}</p>
              )}
              {work.summary && (
                <p className="text-base italic text-[#4B5563] pt-1">
                  {work.summary}
                </p>
              )}
            </header>

            {work.scope !== 'scene' && work.prefixNote && (
              <AuthorNoteBlock
                variant="prefix"
                scope={work.scope === 'chapter' ? 'chapter' : 'story'}
                note={work.prefixNote}
              />
            )}

            {(() => {
              const renderTurnCard = (turn: StoryTurn) => {
                const scenePrefix =
                  work.scope === 'scene'
                    ? work.prefixNote ?? turn.prefixNote
                    : turn.prefixNote;
                const sceneSuffix =
                  work.scope === 'scene'
                    ? work.suffixNote ?? turn.suffixNote
                    : turn.suffixNote;
                return (
                  <section
                    key={turn.id}
                    className="bg-white border border-neutral-200 rounded-xl p-6 sm:p-8 space-y-4"
                  >
                    <div className="pb-3 border-b border-neutral-100">
                      <p className="text-xs font-mono tabular-nums text-[#6B7280]">
                        Scene {String(turn.turnNumber).padStart(2, '0')}{' '}
                        <span aria-hidden="true">·</span> {turn.location}{' '}
                        <span aria-hidden="true">·</span> {turn.inStoryTime}
                      </p>
                      <h2 className="font-editorial text-2xl font-semibold text-[#111827] mt-1">
                        {turn.sceneTitle}
                      </h2>
                    </div>

                    {turn.userAction && (
                      <div className="px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-[#374151] whitespace-pre-wrap">
                        <span className="font-semibold text-[#111827]">Prompt: </span>
                        {turn.userAction}
                      </div>
                    )}

                    {scenePrefix && (
                      <AuthorNoteBlock
                        variant="prefix"
                        scope="scene"
                        note={scenePrefix}
                        compact
                      />
                    )}

                    <div className="space-y-4 max-w-[68ch] text-[15.5px] leading-[1.75] text-[#111827]">
                      {turn.prose.map((p, pIdx) => (
                        <p key={pIdx}>{p}</p>
                      ))}
                    </div>

                    {sceneSuffix && (
                      <AuthorNoteBlock
                        variant="suffix"
                        scope="scene"
                        note={sceneSuffix}
                        compact
                      />
                    )}

                    {turn.activeCharacters.length > 0 && (
                      <p className="pt-3 border-t border-neutral-100 text-xs text-[#6B7280]">
                        Present: {turn.activeCharacters.join(' · ')}
                      </p>
                    )}
                  </section>
                );
              };

              if (work.scope === 'story' && work.chapters.length > 0) {
                const turnMap = new Map(work.turns.map((t) => [t.id, t]));
                const assignedIds = new Set<string>();
                const chapterSections = work.chapters
                  .map((ch) => {
                    const chTurns = ch.turnIds
                      .map((id) => turnMap.get(id))
                      .filter((t): t is StoryTurn => Boolean(t));
                    chTurns.forEach((t) => assignedIds.add(t.id));
                    return { chapter: ch, turns: chTurns };
                  })
                  .filter((entry) => entry.turns.length > 0);
                const unassigned = work.turns.filter((t) => !assignedIds.has(t.id));

                return (
                  <div className="space-y-10">
                    {chapterSections.map(({ chapter, turns }) => (
                      <div key={chapter.id} className="space-y-5">
                        <div className="border-b border-neutral-200 pb-2">
                          <h2 className="font-editorial text-2xl font-semibold text-[#111827]">
                            Chapter {String(chapter.chapterNumber).padStart(2, '0')} —{' '}
                            {chapter.title}
                          </h2>
                          {chapter.summary && (
                            <p className="text-sm text-[#4B5563] mt-1">
                              {chapter.summary}
                            </p>
                          )}
                        </div>
                        {chapter.prefixNote && (
                          <AuthorNoteBlock
                            variant="prefix"
                            scope="chapter"
                            note={chapter.prefixNote}
                            compact
                          />
                        )}
                        <div className="space-y-6">{turns.map(renderTurnCard)}</div>
                        {chapter.suffixNote && (
                          <AuthorNoteBlock
                            variant="suffix"
                            scope="chapter"
                            note={chapter.suffixNote}
                            compact
                          />
                        )}
                      </div>
                    ))}
                    {unassigned.length > 0 && (
                      <div className="space-y-6">{unassigned.map(renderTurnCard)}</div>
                    )}
                  </div>
                );
              }

              return <div className="space-y-8">{work.turns.map(renderTurnCard)}</div>;
            })()}

            {work.scope !== 'scene' && work.suffixNote && (
              <AuthorNoteBlock
                variant="suffix"
                scope={work.scope === 'chapter' ? 'chapter' : 'story'}
                note={work.suffixNote}
              />
            )}
          </article>
        )}
      </main>
    </div>
  );
};
