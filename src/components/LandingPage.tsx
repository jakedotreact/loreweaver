import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Bell,
  BookOpen,
  Compass,
  Filter,
  FolderPlus,
  Heart,
  Lock,
  MessageSquare,
  RotateCcw,
  Search,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  Ao3Category,
  Ao3Rating,
  Ao3Warning,
  PublicStoryWork,
  StorySubscription,
  UserCollection,
} from '../types/story';
import {
  AO3_CATEGORIES,
  AO3_RATINGS,
  AO3_WARNINGS,
  buildTagFacetSummary,
  DEFAULT_STORY_INDEX_FILTER,
  filterPublicStories,
  IndexSortMode,
  StoryIndexFilter,
} from '../utils/ao3Tags';
import { LibraryShelfView } from './LibraryShelfView';

type DiscoverShelfTab = 'index' | 'collections' | 'subscriptions';

interface LandingPageProps {
  stories: PublicStoryWork[];
  privateDraftCount: number;
  givenKudoStoryIds: ReadonlySet<string>;
  collections: UserCollection[];
  subscriptions: StorySubscription[];
  onToggleSubscribe: (story: PublicStoryWork) => void;
  onCreateCollection: (payload: {
    name: string;
    description: string;
    isPrivate: boolean;
  }) => void;
  onDeleteCollection: (collectionId: string) => void;
  onToggleCollectionStory: (collectionId: string, storyId: string) => void;
  onOpenStory: (storyId: string) => void;
  onEnterStudio: () => void;
  onOpenNewStory: () => void;
  onImportStory?: () => void;
  externalFilter?: StoryIndexFilter | null;
  onConsumeExternalFilter?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  stories,
  privateDraftCount,
  givenKudoStoryIds,
  collections,
  subscriptions,
  onToggleSubscribe,
  onCreateCollection,
  onDeleteCollection,
  onToggleCollectionStory,
  onOpenStory,
  onEnterStudio,
  onOpenNewStory,
  onImportStory,
}) => {
  const [shelfTab, setShelfTab] = useState<DiscoverShelfTab>('index');
  const [openCollectCardId, setOpenCollectCardId] = useState<string | null>(null);
  const [filter, setFilter] = useState<StoryIndexFilter>(DEFAULT_STORY_INDEX_FILTER);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Defense-in-depth: strictly exclude any private work before facets or display
  const publicOnlyStories = useMemo(
    () => stories.filter((s) => s.isPrivate !== true),
    [stories],
  );
  const subscribedIds = useMemo(
    () => new Set(subscriptions.map((s) => s.storyId)),
    [subscriptions],
  );

  const visibleStories = useMemo(
    () => filterPublicStories(publicOnlyStories, filter),
    [publicOnlyStories, filter],
  );

  const facets = useMemo(
    () => buildTagFacetSummary(publicOnlyStories),
    [publicOnlyStories],
  );

  const totalKudos = useMemo(
    () => publicOnlyStories.reduce((acc, s) => acc + s.kudosCount, 0),
    [publicOnlyStories],
  );

  const hasActiveFilters =
    filter.query.trim() !== '' ||
    filter.rating !== 'ALL' ||
    filter.warning !== 'ALL' ||
    filter.category !== 'ALL' ||
    filter.fandom !== '' ||
    filter.relationship !== '' ||
    filter.character !== '' ||
    filter.freeform !== '';

  const resetFilters = () => setFilter(DEFAULT_STORY_INDEX_FILTER);

  const applyFacetFilter = (
    key: 'fandom' | 'relationship' | 'character' | 'freeform',
    value: string,
  ) => {
    setFilter((prev) => ({
      ...prev,
      [key]: prev[key].toLowerCase() === value.toLowerCase() ? '' : value,
    }));
  };

  const scrollToIndex = () => {
    const el = document.getElementById('public-story-index');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const renderCommaLinks = (
    items: string[],
    onPick: (val: string) => void,
    activeValue: string,
    emptyFallback?: string,
  ) => {
    if (items.length === 0) {
      return emptyFallback ? (
        <span className="text-[#6B7280]">{emptyFallback}</span>
      ) : null;
    }
    return (
      <span>
        {items.map((item, idx) => {
          const isSelected = activeValue.toLowerCase() === item.toLowerCase();
          return (
            <React.Fragment key={`${item}-${idx}`}>
              {idx > 0 && <span className="text-[#9CA3AF]">, </span>}
              <button
                type="button"
                onClick={() => onPick(item)}
                className={`text-left underline-offset-2 hover:underline cursor-pointer ${
                  isSelected
                    ? 'font-semibold text-[#1D4ED8] underline'
                    : 'text-[#1F2937] hover:text-[#1D4ED8]'
                }`}
              >
                {item}
              </button>
            </React.Fragment>
          );
        })}
      </span>
    );
  };

  return (
    <main className="max-w-[1320px] mx-auto px-4 sm:px-8 py-8 sm:py-10 space-y-10">
      {/* Editorial Hero Showcase */}
      <section className="bg-white border border-neutral-200 rounded-xl p-6 sm:p-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
          <div className="lg:col-span-8 space-y-4">
            <p className="inline-flex items-center gap-2 text-xs font-medium tracking-wide uppercase text-[#1D4ED8]">
              <Compass className="w-3.5 h-3.5" />
              Interactive Fiction Archive &amp; Continuity Studio
            </p>
            <h1 className="font-editorial text-3xl sm:text-5xl font-semibold text-[#111827] tracking-tight leading-[1.12] text-balance">
              Canonical worldbuilding, indexed cleanly for curious readers.
            </h1>
            <p className="text-sm sm:text-base text-[#4B5563] max-w-2xl leading-relaxed">
              Browse public interactive manuscripts tagged with full Archive-style metadata—rating,
              warnings, relationships, cast, and freeform tropes—leave kudos or chapter notes, or
              step into the Studio to co-author your own private or indexed work.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={scrollToIndex}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <BookOpen className="w-4 h-4" />
                Browse Story Index
              </button>
              <button
                type="button"
                onClick={onEnterStudio}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#111827] bg-white hover:bg-neutral-50 border border-neutral-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Open Writing Studio
                <ArrowRight className="w-4 h-4 text-[#4B5563]" />
              </button>
              <button
                type="button"
                onClick={onOpenNewStory}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium text-[#1D4ED8] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                Start New Work
              </button>
              {onImportStory && (
                <button
                  type="button"
                  onClick={onImportStory}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium text-[#374151] hover:text-[#1D4ED8] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  Import URL / File
                </button>
              )}
            </div>
          </div>

          <div className="lg:col-span-4 grid grid-cols-3 lg:grid-cols-1 gap-4 border-t lg:border-t-0 lg:border-l border-neutral-200 pt-5 lg:pt-0 lg:pl-8">
            <div>
              <p className="font-mono text-2xl font-semibold text-[#111827] tabular-nums">
                {publicOnlyStories.length}
              </p>
              <p className="text-xs text-[#6B7280]">Public Works Indexed</p>
            </div>
            <div>
              <p className="font-mono text-2xl font-semibold text-[#111827] tabular-nums">
                {facets.fandoms.length}
              </p>
              <p className="text-xs text-[#6B7280]">Fandoms &amp; Universes</p>
            </div>
            <div>
              <p className="font-mono text-2xl font-semibold text-[#111827] tabular-nums">
                {totalKudos}
              </p>
              <p className="text-xs text-[#6B7280]">Reader Kudos Given</p>
            </div>
          </div>
        </div>
      </section>

      {/* Discover Sub-Navigation & Public Story Index */}
      <section id="public-story-index" className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-neutral-200 pb-4">
          <div className="space-y-3">
            <div
              role="tablist"
              aria-label="Discover Sections"
              className="inline-flex items-center bg-neutral-100 border border-neutral-200 rounded-lg p-0.5"
            >
              {(
                [
                  { id: 'index', label: `Story Index (${publicOnlyStories.length})` },
                  { id: 'collections', label: `Collections (${collections.length})` },
                  { id: 'subscriptions', label: `Subscriptions (${subscriptions.length})` },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={shelfTab === t.id}
                  onClick={() => setShelfTab(t.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    shelfTab === t.id
                      ? 'bg-white text-[#1D4ED8] shadow-xs'
                      : 'text-[#4B5563] hover:text-[#111827]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {shelfTab === 'index' && (
              <div>
                <h2 className="font-editorial text-2xl font-semibold text-[#111827]">
                  Public Story Index
                </h2>
                <p className="text-xs text-[#6B7280] mt-1">
                  Showing{' '}
                  <span className="font-mono font-medium text-[#111827] tabular-nums">
                    {visibleStories.length}
                  </span>{' '}
                  of{' '}
                  <span className="font-mono font-medium text-[#111827] tabular-nums">
                    {publicOnlyStories.length}
                  </span>{' '}
                  public works
                  {privateDraftCount > 0 && (
                    <>
                      {' '}
                      <span aria-hidden="true">·</span>{' '}
                      <span className="inline-flex items-center gap-1 text-[#4B5563]">
                        <Lock className="w-3 h-3" />
                        {privateDraftCount} private{' '}
                        {privateDraftCount === 1 ? 'manuscript' : 'manuscripts'} excluded
                      </span>
                    </>
                  )}
                </p>
              </div>
            )}
          </div>

          {shelfTab === 'index' && (
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setShowMobileFilters((v) => !v)}
                className="lg:hidden inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#111827] bg-white border border-neutral-300 rounded-lg cursor-pointer"
              >
                <Filter className="w-3.5 h-3.5" />
                {showMobileFilters ? 'Hide Tag Filters' : 'Filter by AO3 Tags'}
              </button>

              <label className="inline-flex items-center gap-2 text-xs text-[#4B5563]">
                <span className="whitespace-nowrap">Sort by</span>
                <select
                  aria-label="Sort public stories"
                  value={filter.sortBy}
                  onChange={(e) =>
                    setFilter((prev) => ({
                      ...prev,
                      sortBy: e.target.value as IndexSortMode,
                    }))
                  }
                  className="px-2.5 py-2 text-xs font-medium text-[#111827] bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                >
                  <option value="updated">Date Updated</option>
                  <option value="kudos">Most Kudos</option>
                  <option value="comments">Most Comments</option>
                  <option value="words">Word Count</option>
                  <option value="title">Title (A–Z)</option>
                </select>
              </label>
            </div>
          )}
        </div>

        {shelfTab !== 'index' ? (
          <LibraryShelfView
            mode={shelfTab}
            collections={collections}
            subscriptions={subscriptions}
            allStories={publicOnlyStories}
            onCreateCollection={onCreateCollection}
            onDeleteCollection={onDeleteCollection}
            onRemoveStoryFromCollection={onToggleCollectionStory}
            onUnsubscribe={(storyId) => {
              const matched = publicOnlyStories.find((s) => s.id === storyId);
              if (matched) {
                onToggleSubscribe(matched);
              } else {
                const stub = subscriptions.find((s) => s.storyId === storyId);
                if (stub) {
                  onToggleSubscribe({
                    id: stub.storyId,
                    ownerUid: '',
                    sourceStoryId: stub.storyId,
                    authorName: stub.authorName,
                    title: stub.storyTitle,
                    universe: '',
                    setting: '',
                    tone: '',
                    premise: '',
                    isPrivate: false,
                    tags: {
                      rating: 'Not Rated',
                      warnings: ['Creator Chose Not To Use Archive Warnings'],
                      categories: ['Gen'],
                      fandoms: [],
                      relationships: [],
                      characters: [],
                      freeforms: [],
                    },
                    turns: [],
                    chapters: [],
                    characters: [],
                    wordCount: 0,
                    kudosCount: 0,
                    commentCount: 0,
                    createdAtMs: stub.subscribedAtMs,
                    updatedAtMs: stub.updatedAtMs,
                  });
                }
              }
            }}
            onOpenStory={onOpenStory}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Rail: AO3 Taxonomy Filters */}
          <aside
            aria-label="AO3 Story Index Filters"
            className={`lg:col-span-4 xl:col-span-3 space-y-5 bg-white border border-neutral-200 rounded-xl p-5 ${
              showMobileFilters ? 'block' : 'hidden lg:block'
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#4B5563]">
                Filter Works
              </h3>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#1D4ED8] hover:underline cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Clear All
                </button>
              )}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                aria-label="Search public stories and tags"
                value={filter.query}
                onChange={(e) =>
                  setFilter((prev) => ({ ...prev, query: e.target.value }))
                }
                placeholder="Search title, tag, ship, cast..."
                className="w-full pl-8 pr-3 py-2 text-xs text-[#111827] bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
              />
            </div>

            <div className="space-y-3 pt-1">
              <div>
                <label
                  htmlFor="index-filter-rating"
                  className="block text-xs font-medium text-[#111827] mb-1"
                >
                  Rating
                </label>
                <select
                  id="index-filter-rating"
                  value={filter.rating}
                  onChange={(e) =>
                    setFilter((prev) => ({
                      ...prev,
                      rating: e.target.value as Ao3Rating | 'ALL',
                    }))
                  }
                  className="w-full px-2.5 py-2 text-xs text-[#111827] bg-white border border-neutral-300 rounded-lg"
                >
                  <option value="ALL">All Ratings</option>
                  {AO3_RATINGS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="index-filter-warning"
                  className="block text-xs font-medium text-[#111827] mb-1"
                >
                  Archive Warnings
                </label>
                <select
                  id="index-filter-warning"
                  value={filter.warning}
                  onChange={(e) =>
                    setFilter((prev) => ({
                      ...prev,
                      warning: e.target.value as Ao3Warning | 'ALL',
                    }))
                  }
                  className="w-full px-2.5 py-2 text-xs text-[#111827] bg-white border border-neutral-300 rounded-lg"
                >
                  <option value="ALL">All Warnings</option>
                  {AO3_WARNINGS.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="index-filter-category"
                  className="block text-xs font-medium text-[#111827] mb-1"
                >
                  Category
                </label>
                <select
                  id="index-filter-category"
                  value={filter.category}
                  onChange={(e) =>
                    setFilter((prev) => ({
                      ...prev,
                      category: e.target.value as Ao3Category | 'ALL',
                    }))
                  }
                  className="w-full px-2.5 py-2 text-xs text-[#111827] bg-white border border-neutral-300 rounded-lg"
                >
                  <option value="ALL">All Categories</option>
                  {AO3_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Fandom Facets */}
            {facets.fandoms.length > 0 && (
              <div className="pt-3 border-t border-neutral-200 space-y-1.5">
                <h4 className="text-xs font-semibold text-[#111827]">Fandoms</h4>
                <ul className="space-y-1">
                  {facets.fandoms.map((item) => {
                    const active =
                      filter.fandom.toLowerCase() === item.label.toLowerCase();
                    return (
                      <li key={item.label}>
                        <button
                          type="button"
                          onClick={() => applyFacetFilter('fandom', item.label)}
                          className={`w-full flex items-center justify-between gap-2 text-left text-xs py-0.5 cursor-pointer ${
                            active
                              ? 'font-semibold text-[#1D4ED8] underline'
                              : 'text-[#4B5563] hover:text-[#111827]'
                          }`}
                        >
                          <span className="truncate">{item.label}</span>
                          <span className="font-mono text-[11px] text-[#6B7280] tabular-nums shrink-0">
                            ({item.count})
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Relationship Facets */}
            {facets.relationships.length > 0 && (
              <div className="pt-3 border-t border-neutral-200 space-y-1.5">
                <h4 className="text-xs font-semibold text-[#111827]">
                  Relationships
                </h4>
                <ul className="space-y-1">
                  {facets.relationships.map((item) => {
                    const active =
                      filter.relationship.toLowerCase() ===
                      item.label.toLowerCase();
                    return (
                      <li key={item.label}>
                        <button
                          type="button"
                          onClick={() =>
                            applyFacetFilter('relationship', item.label)
                          }
                          className={`w-full flex items-center justify-between gap-2 text-left text-xs py-0.5 cursor-pointer ${
                            active
                              ? 'font-semibold text-[#1D4ED8] underline'
                              : 'text-[#4B5563] hover:text-[#111827]'
                          }`}
                        >
                          <span className="truncate">{item.label}</span>
                          <span className="font-mono text-[11px] text-[#6B7280] tabular-nums shrink-0">
                            ({item.count})
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Additional Freeform Tag Facets */}
            {facets.freeforms.length > 0 && (
              <div className="pt-3 border-t border-neutral-200 space-y-1.5">
                <h4 className="text-xs font-semibold text-[#111827]">
                  Additional Tags
                </h4>
                <ul className="space-y-1">
                  {facets.freeforms.map((item) => {
                    const active =
                      filter.freeform.toLowerCase() === item.label.toLowerCase();
                    return (
                      <li key={item.label}>
                        <button
                          type="button"
                          onClick={() => applyFacetFilter('freeform', item.label)}
                          className={`w-full flex items-center justify-between gap-2 text-left text-xs py-0.5 cursor-pointer ${
                            active
                              ? 'font-semibold text-[#1D4ED8] underline'
                              : 'text-[#4B5563] hover:text-[#111827]'
                          }`}
                        >
                          <span className="truncate">{item.label}</span>
                          <span className="font-mono text-[11px] text-[#6B7280] tabular-nums shrink-0">
                            ({item.count})
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </aside>

          {/* Right Rail: Story Index Works */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-4">
            {hasActiveFilters && (
              <div className="px-4 py-2.5 bg-white border border-neutral-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[#4B5563]">
                  <span className="font-semibold text-[#111827]">
                    Active filters:
                  </span>
                  {filter.query && <span>Query: “{filter.query}”</span>}
                  {filter.rating !== 'ALL' && (
                    <span>Rating: {filter.rating}</span>
                  )}
                  {filter.warning !== 'ALL' && (
                    <span>Warning: {filter.warning}</span>
                  )}
                  {filter.category !== 'ALL' && (
                    <span>Category: {filter.category}</span>
                  )}
                  {filter.fandom && <span>Fandom: {filter.fandom}</span>}
                  {filter.relationship && (
                    <span>Relationship: {filter.relationship}</span>
                  )}
                  {filter.character && (
                    <span>Character: {filter.character}</span>
                  )}
                  {filter.freeform && <span>Tag: {filter.freeform}</span>}
                </div>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="font-medium text-[#1D4ED8] hover:underline cursor-pointer"
                >
                  Reset
                </button>
              </div>
            )}

            {visibleStories.length === 0 ? (
              <div className="bg-white border border-neutral-200 rounded-xl p-10 text-center space-y-3">
                <p className="font-editorial text-lg font-semibold text-[#111827]">
                  No public works match the active tag filters
                </p>
                <p className="text-xs text-[#6B7280] max-w-md mx-auto">
                  Try clearing one or more AO3 tag filters, or mark one of your Studio stories as
                  Public to list it in the archive.
                </p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg cursor-pointer"
                  >
                    Clear All Filters
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {visibleStories.map((story) => {
                  const hasKudoed = givenKudoStoryIds.has(story.id);
                  return (
                    <article
                      key={story.id}
                      data-testid={`story-index-card-${story.id}`}
                      className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4 hover:border-neutral-300 transition-colors"
                    >
                      {/* AO3 Work Title Header */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 pb-3 border-b border-neutral-200">
                        <div className="min-w-0">
                          <h3 className="font-editorial text-xl font-semibold text-[#111827] leading-snug">
                            <button
                              type="button"
                              onClick={() => onOpenStory(story.id)}
                              className="text-left hover:text-[#1D4ED8] hover:underline underline-offset-4 cursor-pointer"
                            >
                              {story.title}
                            </button>{' '}
                            <span className="font-sans text-sm font-normal text-[#6B7280]">
                              by{' '}
                              <span className="text-[#111827] font-medium">
                                {story.authorName}
                              </span>
                            </span>
                          </h3>
                          <p className="text-xs text-[#6B7280] mt-1">
                            {renderCommaLinks(
                              story.tags.fandoms,
                              (val) => applyFacetFilter('fandom', val),
                              filter.fandom,
                              story.universe,
                            )}
                          </p>
                        </div>

                        <div className="text-xs text-[#4B5563] sm:text-right shrink-0 space-y-0.5">
                          <p className="font-medium text-[#111827]">
                            {story.tags.rating}{' '}
                            <span aria-hidden="true">·</span>{' '}
                            {story.tags.categories.join(', ')}
                          </p>
                          <p className="font-mono text-[11px] text-[#6B7280] tabular-nums">
                            {new Date(story.updatedAtMs).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      {/* AO3 Tag Lineup (Zero-pill typographic links) */}
                      <dl className="grid grid-cols-1 sm:grid-cols-[135px_1fr] gap-y-1.5 gap-x-4 text-xs leading-relaxed">
                        <dt className="font-semibold text-[#4B5563]">
                          Archive Warnings
                        </dt>
                        <dd className="font-medium text-[#111827]">
                          {story.tags.warnings.join(', ')}
                        </dd>

                        {story.tags.relationships.length > 0 && (
                          <>
                            <dt className="font-semibold text-[#4B5563]">
                              Relationships
                            </dt>
                            <dd>
                              {renderCommaLinks(
                                story.tags.relationships,
                                (val) => applyFacetFilter('relationship', val),
                                filter.relationship,
                              )}
                            </dd>
                          </>
                        )}

                        {story.tags.characters.length > 0 && (
                          <>
                            <dt className="font-semibold text-[#4B5563]">
                              Characters
                            </dt>
                            <dd>
                              {renderCommaLinks(
                                story.tags.characters,
                                (val) => applyFacetFilter('character', val),
                                filter.character,
                              )}
                            </dd>
                          </>
                        )}

                        {story.tags.freeforms.length > 0 && (
                          <>
                            <dt className="font-semibold text-[#4B5563]">
                              Additional Tags
                            </dt>
                            <dd>
                              {renderCommaLinks(
                                story.tags.freeforms,
                                (val) => applyFacetFilter('freeform', val),
                                filter.freeform,
                              )}
                            </dd>
                          </>
                        )}
                      </dl>

                      {/* Premise Summary */}
                      <p className="text-sm text-[#374151] leading-relaxed line-clamp-3">
                        {story.premise}
                      </p>

                      {/* Stats & Actions Footer */}
                      <div className="pt-3 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-3 text-xs text-[#6B7280]">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono tabular-nums">
                          <span>Words: {story.wordCount.toLocaleString()}</span>
                          <span>
                            Chapters:{' '}
                            {story.chapters.length > 0 ? story.chapters.length : 1}
                          </span>
                          <span>Scenes: {story.turns.length}</span>
                          <span className="inline-flex items-center gap-1 text-[#111827]">
                            <MessageSquare className="w-3.5 h-3.5 text-[#6B7280]" />
                            Comments: {story.commentCount}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 ${
                              hasKudoed
                                ? 'text-[#B91C1C] font-semibold'
                                : 'text-[#111827]'
                            }`}
                          >
                            <Heart
                              className={`w-3.5 h-3.5 ${
                                hasKudoed
                                  ? 'fill-[#DC2626] text-[#DC2626]'
                                  : 'text-[#6B7280]'
                              }`}
                            />
                            Kudos: {story.kudosCount}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 font-sans">
                          <button
                            type="button"
                            onClick={() => onToggleSubscribe(story)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border cursor-pointer ${
                              subscribedIds.has(story.id)
                                ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8] font-medium'
                                : 'bg-white border-neutral-200 text-[#4B5563] hover:text-[#111827]'
                            }`}
                          >
                            <Bell className="w-3 h-3" />
                            {subscribedIds.has(story.id) ? 'Subscribed' : 'Subscribe'}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setOpenCollectCardId((prev) =>
                                prev === story.id ? null : story.id,
                              )
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-white border border-neutral-200 text-[#4B5563] hover:text-[#111827] rounded-md cursor-pointer"
                          >
                            <FolderPlus className="w-3 h-3" />
                            Collect
                          </button>

                          <button
                            type="button"
                            onClick={() => onOpenStory(story.id)}
                            className="inline-flex items-center gap-1.5 font-medium text-[#1D4ED8] hover:underline whitespace-nowrap cursor-pointer"
                          >
                            Read Story, Comments &amp; Kudos
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {openCollectCardId === story.id && (
                        <div className="pt-2 border-t border-neutral-100 flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-medium text-[#4B5563]">
                            Collections:
                          </span>
                          {collections.length === 0 ? (
                            <button
                              type="button"
                              onClick={() => setShelfTab('collections')}
                              className="text-[#1D4ED8] hover:underline cursor-pointer"
                            >
                              Create a collection first →
                            </button>
                          ) : (
                            collections.map((col) => {
                              const included = col.storyIds.includes(story.id);
                              return (
                                <button
                                  key={col.id}
                                  type="button"
                                  onClick={() =>
                                    onToggleCollectionStory(col.id, story.id)
                                  }
                                  className={`px-2 py-0.5 rounded border cursor-pointer ${
                                    included
                                      ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8] font-medium'
                                      : 'bg-white border-neutral-300 text-[#374151]'
                                  }`}
                                >
                                  {included ? '✓ ' : '+ '}
                                  {col.name}
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        )}
      </section>
    </main>
  );
};
