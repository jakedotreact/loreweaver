import type {
  Ao3Category,
  Ao3Rating,
  Ao3Warning,
  PublicStoryWork,
  StoryProject,
  StoryTags,
} from '../types/story.ts';

export const AO3_RATINGS: readonly Ao3Rating[] = [
  'General Audiences',
  'Teen And Up Audiences',
  'Mature',
  'Explicit',
  'Not Rated',
] as const;

export const AO3_WARNINGS: readonly Ao3Warning[] = [
  'No Archive Warnings Apply',
  'Creator Chose Not To Use Archive Warnings',
  'Graphic Depictions Of Violence',
  'Major Character Death',
  'Rape/Non-Con',
  'Underage Sex',
] as const;

export const AO3_CATEGORIES: readonly Ao3Category[] = [
  'Gen',
  'F/F',
  'F/M',
  'M/M',
  'Multi',
  'Other',
] as const;

export const AO3_SUGGESTED_FREEFORMS: readonly string[] = [
  'Alternate Universe - Canon Divergence',
  'Found Family',
  'Mystery & Investigation',
  'Political Intrigue',
  'Slow Burn',
  'Hurt/Comfort',
  'Canonical Character Voices',
  'Case Fic',
  'Locked Room Mystery',
  'Character Study',
  'Worldbuilding',
  'Noir',
] as const;

const VALID_RATING_SET = new Set<string>(AO3_RATINGS);
const VALID_WARNING_SET = new Set<string>(AO3_WARNINGS);
const VALID_CATEGORY_SET = new Set<string>(AO3_CATEGORIES);

function normalizeTagList(input: unknown, maxCount: number): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of input) {
    if (typeof item !== 'string') continue;
    const cleaned = item.trim().replace(/\s+/g, ' ').slice(0, 120);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= maxCount) break;
  }
  return out;
}

export function createDefaultTagsForProject(
  project?: Pick<StoryProject, 'universe' | 'tone' | 'characters'>,
): StoryTags {
  const fandom = project?.universe?.trim().slice(0, 120);
  const cast = (project?.characters ?? [])
    .map((c) => c.name.trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 6);

  const freeforms: string[] = [];
  if (project?.tone) {
    for (const part of project.tone.split(/&|,|\//)) {
      const cleaned = part.trim().slice(0, 120);
      if (cleaned && freeforms.length < 4) {
        freeforms.push(cleaned);
      }
    }
  }

  return {
    rating: 'Teen And Up Audiences',
    warnings: ['No Archive Warnings Apply'],
    categories: ['Gen'],
    fandoms: fandom ? [fandom] : ['Original Work'],
    relationships: [],
    characters: Array.from(new Set(cast)),
    freeforms: freeforms.length > 0 ? freeforms : ['Interactive Fiction'],
  };
}

export function normalizeStoryTags(
  raw?: Partial<StoryTags> | null,
  fallbackProject?: Pick<StoryProject, 'universe' | 'tone' | 'characters'>,
): StoryTags {
  const defaults = createDefaultTagsForProject(fallbackProject);
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }

  const rating: Ao3Rating =
    typeof raw.rating === 'string' && VALID_RATING_SET.has(raw.rating)
      ? (raw.rating as Ao3Rating)
      : defaults.rating;

  const warningsRaw = Array.isArray(raw.warnings)
    ? raw.warnings.filter(
        (w): w is Ao3Warning =>
          typeof w === 'string' && VALID_WARNING_SET.has(w),
      )
    : [];
  const warnings =
    warningsRaw.length > 0
      ? Array.from(new Set(warningsRaw)).slice(0, 6)
      : defaults.warnings;

  const categoriesRaw = Array.isArray(raw.categories)
    ? raw.categories.filter(
        (c): c is Ao3Category =>
          typeof c === 'string' && VALID_CATEGORY_SET.has(c),
      )
    : [];
  const categories =
    categoriesRaw.length > 0
      ? Array.from(new Set(categoriesRaw)).slice(0, 6)
      : defaults.categories;

  const fandoms = normalizeTagList(raw.fandoms, 10);
  const relationships = normalizeTagList(raw.relationships, 20);
  const characters = normalizeTagList(raw.characters, 30);
  const freeforms = normalizeTagList(raw.freeforms, 40);

  return {
    rating,
    warnings,
    categories,
    fandoms: fandoms.length > 0 ? fandoms : defaults.fandoms,
    relationships,
    characters: characters.length > 0 ? characters : defaults.characters,
    freeforms,
  };
}

export function countStoryWords(
  turns: Array<{ prose?: string[]; sceneTitle?: string }>,
): number {
  let words = 0;
  for (const t of turns) {
    if (Array.isArray(t.prose)) {
      for (const p of t.prose) {
        const trimmed = p.trim();
        if (!trimmed) continue;
        words += trimmed.split(/\s+/).length;
      }
    }
  }
  return words;
}

export type IndexSortMode = 'updated' | 'kudos' | 'comments' | 'words' | 'title';

export interface StoryIndexFilter {
  query: string;
  rating: Ao3Rating | 'ALL';
  warning: Ao3Warning | 'ALL';
  category: Ao3Category | 'ALL';
  fandom: string;
  relationship: string;
  character: string;
  freeform: string;
  sortBy: IndexSortMode;
}

export const DEFAULT_STORY_INDEX_FILTER: StoryIndexFilter = {
  query: '',
  rating: 'ALL',
  warning: 'ALL',
  category: 'ALL',
  fandom: '',
  relationship: '',
  character: '',
  freeform: '',
  sortBy: 'updated',
};

function matchesTagIgnoreCase(list: string[], needle: string): boolean {
  const lower = needle.trim().toLowerCase();
  if (!lower) return true;
  return list.some((item) => item.toLowerCase() === lower);
}

/**
 * Filters public showcase/index stories using AO3 taxonomy criteria.
 * Strictly enforces exclusion of every story marked `isPrivate === true`.
 */
export function filterPublicStories(
  stories: PublicStoryWork[],
  filter: StoryIndexFilter,
): PublicStoryWork[] {
  const q = filter.query.trim().toLowerCase();

  const filtered = stories.filter((story) => {
    if (story.isPrivate === true) {
      return false;
    }

    const tags = normalizeStoryTags(story.tags, {
      universe: story.universe,
      tone: story.tone,
      characters: story.characters,
    });

    if (filter.rating !== 'ALL' && tags.rating !== filter.rating) {
      return false;
    }
    if (
      filter.warning !== 'ALL' &&
      !tags.warnings.includes(filter.warning)
    ) {
      return false;
    }
    if (
      filter.category !== 'ALL' &&
      !tags.categories.includes(filter.category)
    ) {
      return false;
    }
    if (filter.fandom && !matchesTagIgnoreCase(tags.fandoms, filter.fandom)) {
      return false;
    }
    if (
      filter.relationship &&
      !matchesTagIgnoreCase(tags.relationships, filter.relationship)
    ) {
      return false;
    }
    if (
      filter.character &&
      !matchesTagIgnoreCase(tags.characters, filter.character)
    ) {
      return false;
    }
    if (
      filter.freeform &&
      !matchesTagIgnoreCase(tags.freeforms, filter.freeform)
    ) {
      return false;
    }

    if (q) {
      const haystack = [
        story.title,
        story.authorName,
        story.universe,
        story.setting,
        story.tone,
        story.premise,
        tags.rating,
        ...tags.warnings,
        ...tags.categories,
        ...tags.fandoms,
        ...tags.relationships,
        ...tags.characters,
        ...tags.freeforms,
      ]
        .join(' ')
        .toLowerCase();

      if (!haystack.includes(q)) {
        return false;
      }
    }

    return true;
  });

  return [...filtered].sort((a, b) => {
    switch (filter.sortBy) {
      case 'kudos':
        return b.kudosCount - a.kudosCount || b.updatedAtMs - a.updatedAtMs;
      case 'comments':
        return b.commentCount - a.commentCount || b.updatedAtMs - a.updatedAtMs;
      case 'words':
        return b.wordCount - a.wordCount || b.updatedAtMs - a.updatedAtMs;
      case 'title':
        return a.title.localeCompare(b.title);
      case 'updated':
      default:
        return b.updatedAtMs - a.updatedAtMs;
    }
  });
}

export interface TagFacetCount {
  label: string;
  count: number;
}

export interface TagFacetSummary {
  ratings: TagFacetCount[];
  categories: TagFacetCount[];
  fandoms: TagFacetCount[];
  relationships: TagFacetCount[];
  characters: TagFacetCount[];
  freeforms: TagFacetCount[];
}

function sortFacetMap(map: Map<string, number>, limit: number): TagFacetCount[] {
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export function buildTagFacetSummary(stories: PublicStoryWork[]): TagFacetSummary {
  const ratings = new Map<string, number>();
  const categories = new Map<string, number>();
  const fandoms = new Map<string, number>();
  const relationships = new Map<string, number>();
  const characters = new Map<string, number>();
  const freeforms = new Map<string, number>();

  for (const story of stories) {
    if (story.isPrivate === true) continue;
    const tags = story.tags;
    ratings.set(tags.rating, (ratings.get(tags.rating) ?? 0) + 1);
    for (const c of tags.categories) {
      categories.set(c, (categories.get(c) ?? 0) + 1);
    }
    for (const f of tags.fandoms) {
      fandoms.set(f, (fandoms.get(f) ?? 0) + 1);
    }
    for (const r of tags.relationships) {
      relationships.set(r, (relationships.get(r) ?? 0) + 1);
    }
    for (const ch of tags.characters) {
      characters.set(ch, (characters.get(ch) ?? 0) + 1);
    }
    for (const ff of tags.freeforms) {
      freeforms.set(ff, (freeforms.get(ff) ?? 0) + 1);
    }
  }

  return {
    ratings: sortFacetMap(ratings, 10),
    categories: sortFacetMap(categories, 10),
    fandoms: sortFacetMap(fandoms, 12),
    relationships: sortFacetMap(relationships, 12),
    characters: sortFacetMap(characters, 14),
    freeforms: sortFacetMap(freeforms, 16),
  };
}
