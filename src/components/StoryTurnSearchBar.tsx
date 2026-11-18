import React from 'react';
import { CornerDownRight, Filter, Search, Users, X } from 'lucide-react';
import { StoryTurn } from '../types/story';
import { TurnSearchMatch } from '../utils/turnSearch';

interface StoryTurnSearchBarProps {
  turns: StoryTurn[];
  characterOptions: string[];
  query: string;
  characterFilter: string;
  filterStream: boolean;
  matches: TurnSearchMatch[];
  onQueryChange: (value: string) => void;
  onCharacterFilterChange: (value: string) => void;
  onFilterStreamChange: (enabled: boolean) => void;
  onJumpToTurn: (turnId: string) => void;
  onClearAll: () => void;
}

export const StoryTurnSearchBar: React.FC<StoryTurnSearchBarProps> = ({
  turns,
  characterOptions,
  query,
  characterFilter,
  filterStream,
  matches,
  onQueryChange,
  onCharacterFilterChange,
  onFilterStreamChange,
  onJumpToTurn,
  onClearAll,
}) => {
  const hasActiveFilter = Boolean(query.trim() || characterFilter.trim());
  const totalTurns = turns.length;

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && hasActiveFilter) {
      e.preventDefault();
      onClearAll();
      return;
    }
    if (e.key === 'Enter' && matches.length > 0) {
      e.preventDefault();
      onJumpToTurn(matches[0].turn.id);
    }
  };

  return (
    <section
      aria-label="Search and jump to story scenes"
      className="bg-white border border-neutral-200 rounded-xl p-4 sm:p-5 space-y-3"
    >
      <div className="flex flex-col md:flex-row md:items-center gap-2.5">
        {/* Search Input */}
        <div className="relative flex-1 min-w-0">
          <Search
            aria-hidden="true"
            className="w-4 h-4 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          />
          <input
            id="story-turn-search-input"
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search scenes by number (#2), title, keyword, or character..."
            aria-label="Search scenes by number, title, keyword, or character"
            className="w-full pl-9 pr-9 py-2 text-sm text-[#111827] placeholder:text-[#6B7280] bg-[#F8FAFC] border border-neutral-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#1D4ED8] focus:border-[#1D4ED8] transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              aria-label="Clear search query"
              className="p-1 text-[#6B7280] hover:text-[#111827] absolute right-2 top-1/2 -translate-y-1/2 rounded transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Character Filter Dropdown */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0">
          <div className="relative flex-1 sm:flex-initial min-w-[160px]">
            <Users
              aria-hidden="true"
              className="w-3.5 h-3.5 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            />
            <select
              id="story-turn-character-filter"
              value={characterFilter}
              onChange={(e) => onCharacterFilterChange(e.target.value)}
              aria-label="Filter scenes by character"
              className="w-full pl-8 pr-7 py-2 text-xs font-medium text-[#111827] bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] focus:border-[#1D4ED8]"
            >
              <option value="">All characters</option>
              {characterOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Direct Jump-to-Scene Dropdown */}
          <div className="flex-1 sm:flex-initial min-w-[170px]">
            <select
              id="story-turn-jump-select"
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  onJumpToTurn(e.target.value);
                }
              }}
              aria-label="Jump directly to scene"
              className="w-full px-3 py-2 text-xs font-medium text-[#111827] bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] focus:border-[#1D4ED8]"
            >
              <option value="">Jump to scene ({totalTurns})...</option>
              {turns.map((turn) => (
                <option key={turn.id} value={turn.id}>
                  Scene {String(turn.turnNumber).padStart(2, '0')} — {turn.sceneTitle}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Status Row + Quick Jump Results when Filtering/Searching */}
      {hasActiveFilter ? (
        <div className="pt-2.5 border-t border-neutral-100 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[#4B5563] font-mono tabular-nums">
              {matches.length} of {totalTurns}{' '}
              {totalTurns === 1 ? 'scene' : 'scenes'} match
              {characterFilter && (
                <>
                  {' '}
                  <span aria-hidden="true">·</span> {characterFilter}
                </>
              )}
            </p>

            <div className="flex items-center gap-2 shrink-0">
              {/* Interactive Filter vs Show-All Segmented Control */}
              <div
                role="group"
                aria-label="Search display mode"
                className="inline-flex items-center p-0.5 bg-neutral-100 rounded-lg"
              >
                <button
                  type="button"
                  onClick={() => onFilterStreamChange(true)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    filterStream
                      ? 'bg-white text-[#111827] shadow-xs'
                      : 'text-[#4B5563] hover:text-[#111827]'
                  }`}
                >
                  <Filter className="w-3 h-3" />
                  Filter stream
                </button>
                <button
                  type="button"
                  onClick={() => onFilterStreamChange(false)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    !filterStream
                      ? 'bg-white text-[#111827] shadow-xs'
                      : 'text-[#4B5563] hover:text-[#111827]'
                  }`}
                >
                  Show all
                </button>
              </div>

              <button
                type="button"
                onClick={onClearAll}
                className="px-2.5 py-1 text-xs font-medium text-[#1D4ED8] hover:underline whitespace-nowrap shrink-0"
              >
                Clear
              </button>
            </div>
          </div>

          {matches.length > 0 && (
            <div
              aria-label="Matching scenes quick jump"
              className="flex flex-wrap items-center gap-1.5"
            >
              {matches.map(({ turn, reasons }) => (
                <button
                  key={turn.id}
                  type="button"
                  onClick={() => onJumpToTurn(turn.id)}
                  title={`Jump to Scene ${String(turn.turnNumber).padStart(2, '0')}: ${turn.sceneTitle}${
                    reasons.length > 0 ? ` (${reasons.join(', ')})` : ''
                  }`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-[#111827] bg-[#F8FAFC] hover:bg-[#EFF6FF] border border-neutral-200 hover:border-[#BFDBFE] rounded-lg transition-colors max-w-full"
                >
                  <CornerDownRight className="w-3 h-3 text-[#1D4ED8] shrink-0" />
                  <span className="font-mono tabular-nums font-medium text-[#1D4ED8] shrink-0">
                    {String(turn.turnNumber).padStart(2, '0')}
                  </span>
                  <span className="truncate max-w-[200px]">{turn.sceneTitle}</span>
                  {reasons.length > 0 && (
                    <span className="text-[11px] text-[#6B7280] hidden sm:inline whitespace-nowrap shrink-0">
                      <span aria-hidden="true">·</span> {reasons[0]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
};
