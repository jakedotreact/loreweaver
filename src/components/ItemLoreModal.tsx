import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, ChevronDown, ChevronUp, ExternalLink, X } from 'lucide-react';
import {
  CharacterProfile,
  CrossIndexCategory,
  CrossIndexEntry,
  CrossIndexStatus,
  StoryChapter,
  StoryProject,
  StoryTurn,
} from '../types/story';

export type LoreTarget =
  | { kind: 'scene'; turn: StoryTurn }
  | { kind: 'chapter'; chapter: StoryChapter; turns: StoryTurn[] };

interface ItemLoreModalProps {
  project: StoryProject;
  target: LoreTarget | null;
  onClose: () => void;
  onOpenCrossIndex?: () => void;
}

const CATEGORY_LABELS: Record<CrossIndexCategory, string> = {
  world_rule: 'World Rule',
  location: 'Location',
  item: 'Item',
  plot_thread: 'Plot Thread',
  timeline: 'Timeline',
  character_state: 'Character Fact',
};

const STATUS_LABELS: Record<CrossIndexStatus, string> = {
  active: 'Active',
  resolved: 'Resolved',
  conflict: 'Conflict',
};

const ORIGIN_LABELS: Record<CharacterProfile['origin'], string> = {
  canon: 'Canon',
  original: 'Original',
  emergent: 'Emergent',
};

interface MatchedLoreItem {
  entry: CrossIndexEntry;
  reasons: string[];
}

export const ItemLoreModal: React.FC<ItemLoreModalProps> = ({
  project,
  target,
  onClose,
  onOpenCrossIndex,
}) => {
  const [showGoverningRules, setShowGoverningRules] = useState(false);

  useEffect(() => {
    if (!target) return;
    setShowGoverningRules(false);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [target, onClose]);

  const analysis = useMemo(() => {
    if (!target) return null;

    const turns: StoryTurn[] =
      target.kind === 'scene' ? [target.turn] : target.turns;
    const turnNumbers = new Set(turns.map((t) => t.turnNumber));

    const activeCharacterNames: string[] = [];
    const activeCharSet = new Set<string>();
    for (const t of turns) {
      for (const name of t.activeCharacters) {
        const trimmed = name.trim();
        if (trimmed && !activeCharSet.has(trimmed.toLowerCase())) {
          activeCharSet.add(trimmed.toLowerCase());
          activeCharacterNames.push(trimmed);
        }
      }
    }

    const locations: string[] = [];
    const locationSet = new Set<string>();
    for (const t of turns) {
      const loc = t.location.trim();
      if (loc && !locationSet.has(loc.toLowerCase())) {
        locationSet.add(loc.toLowerCase());
        locations.push(loc);
      }
    }

    const combinedText = turns
      .map((t) =>
        [
          t.sceneTitle,
          t.location,
          t.inStoryTime,
          t.userAction ?? '',
          ...t.prose,
          ...t.continuityNotes,
          t.continuityWarning ?? '',
        ].join(' '),
      )
      .join(' ')
      .toLowerCase();

    const matchedLore: MatchedLoreItem[] = [];
    const governingLore: CrossIndexEntry[] = [];

    for (const entry of project.crossIndex) {
      const reasons: string[] = [];
      const entryText = `${entry.title} ${entry.detail} ${entry.tags.join(' ')}`.toLowerCase();

      if (turnNumbers.has(entry.introducedAtTurn)) {
        reasons.push(
          `Introduced in Scene ${String(entry.introducedAtTurn).padStart(2, '0')}`,
        );
      } else if (turnNumbers.has(entry.lastVerifiedTurn)) {
        reasons.push(
          `Verified in Scene ${String(entry.lastVerifiedTurn).padStart(2, '0')}`,
        );
      }

      for (const charName of activeCharacterNames) {
        const lowerFull = charName.toLowerCase();
        const nameTokens = lowerFull
          .split(/\s+/)
          .filter((tok) => tok.length >= 4);
        const matchesChar =
          entryText.includes(lowerFull) ||
          nameTokens.some((tok) => entryText.includes(tok));
        if (matchesChar) {
          reasons.push(`Mentions ${charName}`);
          break;
        }
      }

      for (const loc of locations) {
        const lowerLoc = loc.toLowerCase();
        const locTokens = lowerLoc
          .split(/[\s,·—-]+/)
          .filter((tok) => tok.length >= 4);
        const matchesLoc =
          entryText.includes(lowerLoc) ||
          (entry.category === 'location' &&
            (combinedText.includes(entry.title.toLowerCase()) ||
              locTokens.some((tok) => entryText.includes(tok))));
        if (matchesLoc) {
          reasons.push(`Location: ${loc}`);
          break;
        }
      }

      const titleLower = entry.title.trim().toLowerCase();
      const hasTextReference =
        (titleLower.length >= 4 && combinedText.includes(titleLower)) ||
        entry.tags.some(
          (tag) => tag.trim().length >= 4 && combinedText.includes(tag.trim().toLowerCase()),
        );
      if (hasTextReference && reasons.length === 0) {
        reasons.push('Referenced in narrative');
      }

      if (reasons.length > 0) {
        matchedLore.push({ entry, reasons });
      } else if (
        (entry.pinned || entry.category === 'world_rule') &&
        entry.status !== 'resolved'
      ) {
        governingLore.push(entry);
      }
    }

    matchedLore.sort((a, b) => {
      if (a.entry.status === 'conflict' && b.entry.status !== 'conflict') return -1;
      if (b.entry.status === 'conflict' && a.entry.status !== 'conflict') return 1;
      if (a.entry.pinned !== b.entry.pinned) return a.entry.pinned ? -1 : 1;
      return b.entry.lastVerifiedTurn - a.entry.lastVerifiedTurn;
    });

    const matchedCharacters = activeCharacterNames
      .map((name) =>
        project.characters.find(
          (c) => c.name.trim().toLowerCase() === name.toLowerCase(),
        ),
      )
      .filter((c): c is CharacterProfile => Boolean(c));

    const continuityItems = turns.flatMap((t) => {
      const items: Array<{ turnNumber: number; kind: 'warning' | 'note'; text: string }> = [];
      if (t.continuityWarning) {
        items.push({
          turnNumber: t.turnNumber,
          kind: 'warning',
          text: t.continuityWarning,
        });
      }
      for (const note of t.continuityNotes) {
        items.push({
          turnNumber: t.turnNumber,
          kind: 'note',
          text: note,
        });
      }
      return items;
    });

    return {
      turns,
      activeCharacterNames,
      locations,
      matchedLore,
      governingLore,
      matchedCharacters,
      continuityItems,
    };
  }, [project.characters, project.crossIndex, target]);

  if (!target || !analysis) return null;

  const headingTitle =
    target.kind === 'scene'
      ? `Scene ${String(target.turn.turnNumber).padStart(2, '0')} Lore — ${target.turn.sceneTitle}`
      : `Chapter ${String(target.chapter.chapterNumber).padStart(2, '0')} Lore — ${target.chapter.title}`;

  const subMetadata =
    target.kind === 'scene'
      ? `${target.turn.location} · ${target.turn.inStoryTime}`
      : `${analysis.turns.length} ${
          analysis.turns.length === 1 ? 'scene' : 'scenes'
        } · ${analysis.locations.join(' / ') || project.setting}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-lore-heading"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
        {/* Sticky Header */}
        <div className="px-6 py-4 border-b border-neutral-200 flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <BookOpen className="w-5 h-5 text-[#1D4ED8] shrink-0 mt-1" />
            <div className="min-w-0">
              <p className="text-xs text-[#6B7280] font-mono tabular-nums">
                {project.universe} <span aria-hidden="true">·</span> {subMetadata}
              </p>
              <h2
                id="item-lore-heading"
                className="font-editorial text-xl sm:text-2xl font-semibold text-[#111827] mt-0.5 text-balance"
              >
                {headingTitle}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close lore dialog"
            className="p-2 text-[#6B7280] hover:text-[#111827] hover:bg-neutral-100 rounded-lg shrink-0 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-8 overflow-y-auto flex-1">
          {/* Chapter Summary if applicable */}
          {target.kind === 'chapter' && target.chapter.summary && (
            <section className="pb-5 border-b border-neutral-100">
              <p className="text-xs font-medium text-[#6B7280] mb-1">Chapter Epigraph</p>
              <p className="text-sm text-[#374151] italic leading-relaxed">
                {target.chapter.summary}
              </p>
            </section>
          )}

          {/* Section 1: Matched Cross-Index Lore */}
          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-4 border-b border-neutral-100 pb-2">
              <h3 className="text-base font-semibold text-[#111827]">
                Cross-Index Lore &amp; World Facts
              </h3>
              <span className="text-xs font-mono tabular-nums text-[#6B7280]">
                {analysis.matchedLore.length}{' '}
                {analysis.matchedLore.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>

            {analysis.matchedLore.length === 0 ? (
              <p className="text-sm text-[#6B7280] py-2">
                No Cross-Index entries directly reference the characters, locations, or turn numbers of this{' '}
                {target.kind === 'scene' ? 'scene' : 'chapter'} yet.
              </p>
            ) : (
              <div className="divide-y divide-neutral-100 border border-neutral-200 rounded-xl bg-white">
                {analysis.matchedLore.map(({ entry, reasons }) => (
                  <div key={entry.id} className="p-4 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B7280] font-mono tabular-nums">
                      <span>
                        {CATEGORY_LABELS[entry.category]} <span aria-hidden="true">·</span>{' '}
                        {entry.status === 'conflict' ? (
                          <span className="text-[#DC2626] font-semibold inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            {STATUS_LABELS[entry.status]}
                          </span>
                        ) : (
                          <span>{STATUS_LABELS[entry.status]}</span>
                        )}
                        {entry.pinned && (
                          <>
                            {' '}
                            <span aria-hidden="true">·</span> Pinned
                          </>
                        )}
                      </span>
                      <span>
                        Introduced Sc. {String(entry.introducedAtTurn).padStart(2, '0')} · Verified Sc.{' '}
                        {String(entry.lastVerifiedTurn).padStart(2, '0')}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold text-[#111827]">{entry.title}</h4>
                    <p className="text-sm text-[#374151] leading-relaxed">{entry.detail}</p>
                    <p className="text-xs text-[#1D4ED8] pt-0.5">
                      Relevance: {reasons.join(' · ')}
                      {entry.tags.length > 0 && (
                        <span className="text-[#6B7280]">
                          {' '}
                          · Tags: {entry.tags.join(', ')}
                        </span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section 2: Characters Present */}
          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-4 border-b border-neutral-100 pb-2">
              <h3 className="text-base font-semibold text-[#111827]">
                Cast Lore in This {target.kind === 'scene' ? 'Scene' : 'Chapter'}
              </h3>
              <span className="text-xs font-mono tabular-nums text-[#6B7280]">
                {analysis.matchedCharacters.length}{' '}
                {analysis.matchedCharacters.length === 1 ? 'profile' : 'profiles'}
              </span>
            </div>

            {analysis.matchedCharacters.length === 0 ? (
              <p className="text-sm text-[#6B7280] py-2">
                Active cast listed:{' '}
                {analysis.activeCharacterNames.join(' · ') || 'Narrator only'}.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {analysis.matchedCharacters.map((char) => (
                  <div
                    key={char.id}
                    className="border border-neutral-200 rounded-xl p-4 space-y-2.5 bg-white"
                  >
                    <div>
                      <p className="text-xs text-[#6B7280]">
                        {char.role} <span aria-hidden="true">·</span>{' '}
                        {ORIGIN_LABELS[char.origin]} <span aria-hidden="true">·</span>{' '}
                        {char.status}
                      </p>
                      <h4 className="font-editorial text-lg font-semibold text-[#111827] mt-0.5">
                        {char.name}
                      </h4>
                    </div>
                    <p className="text-xs text-[#374151] leading-relaxed">{char.summary}</p>
                    <div className="text-xs text-[#4B5563] space-y-1 pt-1 border-t border-neutral-100">
                      <p>
                        <span className="font-semibold text-[#111827]">Motivation: </span>
                        {char.motivation}
                      </p>
                      {char.pros.length > 0 && (
                        <p>
                          <span className="font-semibold text-[#111827]">Strengths: </span>
                          {char.pros.join('; ')}
                        </p>
                      )}
                      {char.flaws.length > 0 && (
                        <p>
                          <span className="font-semibold text-[#111827]">Flaws: </span>
                          {char.flaws.join('; ')}
                        </p>
                      )}
                      {char.inventory.length > 0 && (
                        <p>
                          <span className="font-semibold text-[#111827]">Inventory: </span>
                          {char.inventory.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section 3: Scene Continuity Notes & Warnings */}
          {analysis.continuityItems.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-baseline justify-between gap-4 border-b border-neutral-100 pb-2">
                <h3 className="text-base font-semibold text-[#111827]">
                  Continuity Notes &amp; Checks
                </h3>
                <span className="text-xs font-mono tabular-nums text-[#6B7280]">
                  {analysis.continuityItems.length} items
                </span>
              </div>
              <div className="space-y-2">
                {analysis.continuityItems.map((item, idx) =>
                  item.kind === 'warning' ? (
                    <div
                      key={idx}
                      className="px-4 py-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg flex items-start gap-2.5 text-sm text-[#92400E]"
                    >
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#D97706]" />
                      <div>
                        <span className="font-mono text-xs font-semibold mr-2">
                          Sc. {String(item.turnNumber).padStart(2, '0')}
                        </span>
                        {item.text}
                      </div>
                    </div>
                  ) : (
                    <div
                      key={idx}
                      className="px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-[#374151] flex items-start gap-2"
                    >
                      <span className="font-mono text-[#6B7280] shrink-0">
                        Sc. {String(item.turnNumber).padStart(2, '0')}
                      </span>
                      <span>{item.text}</span>
                    </div>
                  ),
                )}
              </div>
            </section>
          )}

          {/* Section 4: Governing Universe Rules (remaining pinned / world_rule entries) */}
          {analysis.governingLore.length > 0 && (
            <section className="pt-2 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setShowGoverningRules((v) => !v)}
                className="w-full flex items-center justify-between py-2 text-left text-sm font-medium text-[#111827] hover:text-[#1D4ED8] transition-colors"
              >
                <span>
                  Other Active Universe &amp; Pinned Rules (
                  <span className="font-mono tabular-nums">{analysis.governingLore.length}</span>)
                </span>
                {showGoverningRules ? (
                  <ChevronUp className="w-4 h-4 text-[#6B7280]" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[#6B7280]" />
                )}
              </button>

              {showGoverningRules && (
                <div className="mt-3 divide-y divide-neutral-100 border border-neutral-200 rounded-xl bg-white">
                  {analysis.governingLore.map((entry) => (
                    <div key={entry.id} className="p-4 space-y-1">
                      <p className="text-xs font-mono tabular-nums text-[#6B7280]">
                        {CATEGORY_LABELS[entry.category]} <span aria-hidden="true">·</span>{' '}
                        {STATUS_LABELS[entry.status]}
                        {entry.pinned && (
                          <>
                            {' '}
                            <span aria-hidden="true">·</span> Pinned
                          </>
                        )}
                      </p>
                      <h4 className="text-sm font-semibold text-[#111827]">{entry.title}</h4>
                      <p className="text-sm text-[#374151] leading-relaxed">{entry.detail}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="px-6 py-3.5 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between gap-3 shrink-0">
          {onOpenCrossIndex ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCrossIndex();
              }}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1D4ED8] hover:underline whitespace-nowrap"
            >
              <ExternalLink className="w-4 h-4" />
              Open Full Cross-Index
            </button>
          ) : (
            <span />
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
