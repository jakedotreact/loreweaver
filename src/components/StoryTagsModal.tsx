import React, { useEffect, useState } from 'react';
import {
  Eye,
  EyeOff,
  Lock,
  Plus,
  Tag,
  Users,
  X,
} from 'lucide-react';
import {
  Ao3Category,
  Ao3Rating,
  Ao3Warning,
  StoryProject,
  StoryTags,
} from '../types/story';
import {
  AO3_CATEGORIES,
  AO3_RATINGS,
  AO3_SUGGESTED_FREEFORMS,
  AO3_WARNINGS,
  normalizeStoryTags,
} from '../utils/ao3Tags';

interface StoryTagsModalProps {
  isOpen: boolean;
  story: StoryProject | null;
  onClose: () => void;
  onSave: (
    storyId: string,
    updates: { isPrivate: boolean; tags: StoryTags },
  ) => void;
}

interface TagTokenInputProps {
  id: string;
  label: string;
  helper?: string;
  values: string[];
  placeholder: string;
  maxCount: number;
  onChange: (next: string[]) => void;
  quickAction?: {
    label: string;
    onClick: () => void;
  };
  suggestions?: readonly string[];
}

const TagTokenInput: React.FC<TagTokenInputProps> = ({
  id,
  label,
  helper,
  values,
  placeholder,
  maxCount,
  onChange,
  quickAction,
  suggestions,
}) => {
  const [draft, setDraft] = useState('');

  const commitDraft = (raw: string) => {
    const parts = raw
      .split(',')
      .map((p) => p.trim().replace(/\s+/g, ' ').slice(0, 120))
      .filter(Boolean);
    if (parts.length === 0) return;

    const existingLower = new Set(values.map((v) => v.toLowerCase()));
    const next = [...values];
    for (const part of parts) {
      if (!existingLower.has(part.toLowerCase()) && next.length < maxCount) {
        existingLower.add(part.toLowerCase());
        next.push(part);
      }
    }
    onChange(next);
    setDraft('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitDraft(draft);
    }
  };

  const removeAt = (idx: number) => {
    onChange(values.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-semibold text-[#111827]">
          {label}
        </label>
        {quickAction && (
          <button
            type="button"
            onClick={quickAction.onClick}
            className="text-xs font-medium text-[#1D4ED8] hover:underline whitespace-nowrap cursor-pointer"
          >
            {quickAction.label}
          </button>
        )}
      </div>
      {helper && <p className="text-[11px] text-[#6B7280]">{helper}</p>}

      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pb-1">
          {values.map((item, idx) => (
            <span
              key={`${item}-${idx}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-[#111827] bg-neutral-100 border border-neutral-200 rounded-md"
            >
              <span>{item}</span>
              <button
                type="button"
                aria-label={`Remove ${item}`}
                onClick={() => removeAt(idx)}
                className="text-[#6B7280] hover:text-[#DC2626] cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 text-xs text-[#111827] bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
        />
        <button
          type="button"
          onClick={() => commitDraft(draft)}
          disabled={!draft.trim()}
          className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-[#111827] bg-white hover:bg-neutral-50 border border-neutral-300 rounded-lg disabled:opacity-40 cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>

      {suggestions && suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-1 text-[11px] text-[#6B7280]">
          <span className="font-medium text-[#4B5563]">Suggestions:</span>
          {suggestions
            .filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()))
            .slice(0, 7)
            .map((sug) => (
              <button
                key={sug}
                type="button"
                onClick={() => commitDraft(sug)}
                className="text-[#1D4ED8] hover:underline cursor-pointer"
              >
                + {sug}
              </button>
            ))}
        </div>
      )}
    </div>
  );
};

export const StoryTagsModal: React.FC<StoryTagsModalProps> = ({
  isOpen,
  story,
  onClose,
  onSave,
}) => {
  const [isPrivate, setIsPrivate] = useState(false);
  const [tags, setTags] = useState<StoryTags>(() => normalizeStoryTags(story?.tags, story ?? undefined));

  useEffect(() => {
    if (!isOpen || !story) return;
    setIsPrivate(story.isPrivate === true);
    setTags(normalizeStoryTags(story.tags, story));
  }, [isOpen, story]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !story) return null;

  const toggleWarning = (w: Ao3Warning) => {
    setTags((prev) => {
      const exists = prev.warnings.includes(w);
      let next = exists
        ? prev.warnings.filter((item) => item !== w)
        : [...prev.warnings, w];
      if (next.length === 0) {
        next = ['No Archive Warnings Apply'];
      }
      return { ...prev, warnings: next };
    });
  };

  const toggleCategory = (c: Ao3Category) => {
    setTags((prev) => {
      const exists = prev.categories.includes(c);
      let next = exists
        ? prev.categories.filter((item) => item !== c)
        : [...prev.categories, c];
      if (next.length === 0) {
        next = ['Gen'];
      }
      return { ...prev, categories: next };
    });
  };

  const handleSyncCharactersFromCast = () => {
    const castNames = story.characters
      .map((c) => c.name.trim())
      .filter(Boolean);
    setTags((prev) => {
      const merged = Array.from(new Set([...prev.characters, ...castNames])).slice(
        0,
        30,
      );
      return { ...prev, characters: merged };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(story.id, {
      isPrivate,
      tags: normalizeStoryTags(tags, story),
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="story-tags-modal-title"
    >
      <div className="bg-white border border-neutral-200 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <Tag className="w-4 h-4 text-[#1D4ED8] shrink-0" />
            <div className="min-w-0">
              <h2
                id="story-tags-modal-title"
                className="font-editorial text-lg font-semibold text-[#111827] truncate"
              >
                AO3 Tags &amp; Story Visibility
              </h2>
              <p className="text-xs text-[#6B7280] truncate">{story.title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tags and visibility modal"
            className="p-1.5 text-[#6B7280] hover:text-[#111827] rounded-lg hover:bg-neutral-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-5 space-y-6">
          {/* Visibility Toggle: Public Story Index vs Private */}
          <fieldset className="p-4 border border-neutral-200 rounded-xl bg-[#F8FAFC] space-y-3">
            <legend className="text-xs font-semibold text-[#111827] px-1">
              Index Visibility
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIsPrivate(false)}
                className={`p-3.5 text-left border rounded-lg transition-colors cursor-pointer ${
                  !isPrivate
                    ? 'bg-white border-[#1D4ED8] ring-1 ring-[#1D4ED8]'
                    : 'bg-white/60 border-neutral-200 hover:border-neutral-300'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-[#111827]">
                  <Eye className="w-3.5 h-3.5 text-[#1D4ED8]" />
                  Public · Listed in Story Index
                </div>
                <p className="text-[11px] text-[#4B5563] mt-1 leading-relaxed">
                  Appears on the Landing Page Story Index and accepts reader kudos and comments.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setIsPrivate(true)}
                className={`p-3.5 text-left border rounded-lg transition-colors cursor-pointer ${
                  isPrivate
                    ? 'bg-white border-[#B45309] ring-1 ring-[#B45309]'
                    : 'bg-white/60 border-neutral-200 hover:border-neutral-300'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-[#111827]">
                  <EyeOff className="w-3.5 h-3.5 text-[#B45309]" />
                  Private · Hidden from Index
                </div>
                <p className="text-[11px] text-[#4B5563] mt-1 leading-relaxed">
                  Strictly excluded from the public Story Index and only visible in your library.
                </p>
              </button>
            </div>
            {isPrivate && (
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-[#92400E]">
                <Lock className="w-3.5 h-3.5 shrink-0" />
                This story will be hidden from the Landing Page Story Index immediately upon saving.
              </p>
            )}
          </fieldset>

          {/* Rating & Categories */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label
                htmlFor="ao3-rating-select"
                className="block text-xs font-semibold text-[#111827]"
              >
                Rating
              </label>
              <select
                id="ao3-rating-select"
                value={tags.rating}
                onChange={(e) =>
                  setTags((prev) => ({
                    ...prev,
                    rating: e.target.value as Ao3Rating,
                  }))
                }
                className="w-full px-3 py-2 text-xs text-[#111827] bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
              >
                {AO3_RATINGS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-[#111827]">
                Category
              </span>
              <div className="flex flex-wrap gap-2 pt-0.5">
                {AO3_CATEGORIES.map((cat) => {
                  const checked = tags.categories.includes(cat);
                  return (
                    <label
                      key={cat}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs border rounded-md cursor-pointer transition-colors ${
                        checked
                          ? 'bg-[#EFF6FF] border-[#93C5FD] text-[#1E3A8A] font-medium'
                          : 'bg-white border-neutral-300 text-[#4B5563] hover:bg-neutral-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCategory(cat)}
                        className="accent-[#1D4ED8]"
                      />
                      <span>{cat}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Archive Warnings */}
          <div className="space-y-2">
            <span className="block text-xs font-semibold text-[#111827]">
              Archive Warnings
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {AO3_WARNINGS.map((warning) => {
                const checked = tags.warnings.includes(warning);
                return (
                  <label
                    key={warning}
                    className={`flex items-center gap-2 px-3 py-2 text-xs border rounded-lg cursor-pointer transition-colors ${
                      checked
                        ? 'bg-[#F8FAFC] border-[#93C5FD] text-[#111827] font-medium'
                        : 'bg-white border-neutral-200 text-[#4B5563] hover:bg-neutral-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleWarning(warning)}
                      className="accent-[#1D4ED8]"
                    />
                    <span>{warning}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Fandoms, Relationships, Characters, Freeforms */}
          <TagTokenInput
            id="ao3-fandoms-input"
            label="Fandoms"
            helper="Comma or Enter to add universe / fandom tags."
            values={tags.fandoms}
            placeholder="e.g., Harry Potter (Wizarding World), Original Work"
            maxCount={10}
            onChange={(next) => setTags((prev) => ({ ...prev, fandoms: next }))}
          />

          <TagTokenInput
            id="ao3-relationships-input"
            label="Relationships"
            helper="AO3 convention: use '/' for romantic ships (A/B) and '&' for platonic bonds (A & B)."
            values={tags.relationships}
            placeholder="e.g., Harry Potter & Hermione Granger"
            maxCount={20}
            onChange={(next) =>
              setTags((prev) => ({ ...prev, relationships: next }))
            }
          />

          <TagTokenInput
            id="ao3-characters-input"
            label="Characters"
            values={tags.characters}
            placeholder="Add character tag..."
            maxCount={30}
            onChange={(next) => setTags((prev) => ({ ...prev, characters: next }))}
            quickAction={
              story.characters.length > 0
                ? {
                    label: `Sync ${story.characters.length} from Cast`,
                    onClick: handleSyncCharactersFromCast,
                  }
                : undefined
            }
          />

          <TagTokenInput
            id="ao3-freeforms-input"
            label="Additional Tags"
            helper="Tropes, AU settings, genres, content notes, and writing hooks."
            values={tags.freeforms}
            placeholder="e.g., Alternate Universe - Canon Divergence, Mystery"
            maxCount={40}
            onChange={(next) => setTags((prev) => ({ ...prev, freeforms: next }))}
            suggestions={AO3_SUGGESTED_FREEFORMS}
          />

          <div className="pt-4 border-t border-neutral-200 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-[#6B7280]">
              <Users className="w-3.5 h-3.5" />
              {isPrivate ? 'Private manuscript' : 'Public index work'}
            </span>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-[#374151] bg-white hover:bg-neutral-50 border border-neutral-300 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg cursor-pointer"
              >
                Save Tags &amp; Visibility
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
