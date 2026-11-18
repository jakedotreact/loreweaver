// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { UNIVERSE_TEMPLATES } from '../../src/data/presets';
import { PublicStoryWork, StoryProject } from '../../src/types/story';
import {
  buildTagFacetSummary,
  createDefaultTagsForProject,
  DEFAULT_STORY_INDEX_FILTER,
  filterPublicStories,
  normalizeStoryTags,
} from '../../src/utils/ao3Tags';
import { stripTagsForCloud } from '../../src/utils/cloudSanitize';
import {
  buildMergedPublicStoryIndex,
  loadLocalCommunityState,
  storyProjectToPublicWork,
} from '../../src/utils/communityStore';
import { buildPublicStoryUrl, parseRouteLinks } from '../../src/utils/storyLinks';

function makePublicWork(
  id: string,
  overrides: Partial<PublicStoryWork> = {},
): PublicStoryWork {
  const base = UNIVERSE_TEMPLATES[0].starterProject;
  return {
    ...storyProjectToPublicWork(base, {
      kudosCount: 10,
      commentCount: 2,
    }),
    id,
    title: `Story ${id}`,
    isPrivate: false,
    updatedAtMs: 1700000000000,
    ...overrides,
  };
}

describe('AO3 tagging, private exclusion & community index helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('normalizes AO3 tags cleanly, enforces bounds, and removes duplicates case-insensitively', () => {
    const normalized = normalizeStoryTags({
      rating: 'Mature',
      warnings: ['Major Character Death', 'Major Character Death'],
      categories: ['F/F', 'Gen'],
      fandoms: ['Dune', 'dune', '  Original Work  '],
      relationships: ['A/B', 'a/b', 'A & C'],
      characters: Array.from({ length: 45 }, (_, i) => `Char ${i + 1}`),
      freeforms: ['Slow Burn', 'Found Family', 'slow burn'],
    });

    expect(normalized.rating).toBe('Mature');
    expect(normalized.warnings).toEqual(['Major Character Death']);
    expect(normalized.categories).toEqual(['F/F', 'Gen']);
    expect(normalized.fandoms).toEqual(['Dune', 'Original Work']);
    expect(normalized.relationships).toEqual(['A/B', 'A & C']);
    expect(normalized.characters).toHaveLength(30);
    expect(normalized.freeforms).toEqual(['Slow Burn', 'Found Family']);
  });

  it('falls back safely when invalid enums are passed to stripTagsForCloud', () => {
    const fallback = createDefaultTagsForProject(UNIVERSE_TEMPLATES[2].starterProject);
    expect(fallback.fandoms).toContain('Original · Clockwork Maritime Noir');

    const stripped = stripTagsForCloud({
      rating: 'Invalid Rating' as never,
      warnings: ['No Archive Warnings Apply'],
      categories: [],
      fandoms: [],
      relationships: [],
      characters: [],
      freeforms: ['Locked Room'],
    });

    expect(stripped.rating).toBe('Teen And Up Audiences');
    expect(stripped.categories).toEqual(['Gen']);
    expect(stripped.fandoms).toEqual(['Original Work']);
    expect(stripped.freeforms).toEqual(['Locked Room']);
  });

  it('strictly excludes stories marked isPrivate: true from filterPublicStories and facets', () => {
    const publicOne = makePublicWork('pub-1', {
      title: 'Open Candlelight Mystery',
      isPrivate: false,
      kudosCount: 15,
    });
    const privateOne = makePublicWork('priv-secret', {
      title: 'Secret Unlisted Diary',
      isPrivate: true,
      kudosCount: 999,
    });

    const filtered = filterPublicStories(
      [publicOne, privateOne],
      DEFAULT_STORY_INDEX_FILTER,
    );
    expect(filtered.map((s) => s.id)).toEqual(['pub-1']);

    const facets = buildTagFacetSummary([publicOne, privateOne]);
    expect(facets.ratings.reduce((sum, r) => sum + r.count, 0)).toBe(1);
  });

  it('filters public works by rating, warning, category, relationship, freeform, and sort order', () => {
    const w1 = makePublicWork('w1', {
      title: 'Beta Work',
      kudosCount: 40,
      commentCount: 5,
      wordCount: 3200,
      tags: normalizeStoryTags({
        rating: 'Mature',
        warnings: ['Graphic Depictions Of Violence'],
        categories: ['M/M'],
        fandoms: ['Fandom Alpha'],
        relationships: ['Hero/Rival'],
        characters: ['Hero'],
        freeforms: ['Slow Burn', 'Angst'],
      }),
    });
    const w2 = makePublicWork('w2', {
      title: 'Alpha Work',
      kudosCount: 12,
      commentCount: 18,
      wordCount: 8400,
      tags: normalizeStoryTags({
        rating: 'General Audiences',
        warnings: ['No Archive Warnings Apply'],
        categories: ['Gen'],
        fandoms: ['Fandom Beta'],
        relationships: ['Mentor & Apprentice'],
        characters: ['Mentor'],
        freeforms: ['Found Family'],
      }),
    });

    const byRel = filterPublicStories([w1, w2], {
      ...DEFAULT_STORY_INDEX_FILTER,
      relationship: 'hero/rival',
    });
    expect(byRel.map((s) => s.id)).toEqual(['w1']);

    const byComments = filterPublicStories([w1, w2], {
      ...DEFAULT_STORY_INDEX_FILTER,
      sortBy: 'comments',
    });
    expect(byComments.map((s) => s.id)).toEqual(['w2', 'w1']);

    const byTitle = filterPublicStories([w1, w2], {
      ...DEFAULT_STORY_INDEX_FILTER,
      sortBy: 'title',
    });
    expect(byTitle.map((s) => s.id)).toEqual(['w2', 'w1']);
  });

  it('hides local stories flagged isPrivate: true even when seeded or listed in cloud index', () => {
    const starterCopy: StoryProject = {
      ...JSON.parse(JSON.stringify(UNIVERSE_TEMPLATES[0].starterProject)),
      isPrivate: true,
    };
    const community = loadLocalCommunityState();

    const merged = buildMergedPublicStoryIndex({
      localLibraryStories: [starterCopy],
      cloudPublicStories: [
        makePublicWork('pub-hogwarts-1995', {
          sourceStoryId: starterCopy.id,
          isPrivate: false,
        }),
      ],
      communityState: community,
    });

    expect(merged.some((w) => w.sourceStoryId === starterCopy.id)).toBe(false);
    expect(merged.some((w) => w.id === 'pub-hogwarts-1995')).toBe(false);
  });

  it('builds and parses ?story= public links cleanly alongside ?share= and ?collab=', () => {
    const url = buildPublicStoryUrl('https://folio.example.com/', 'pub-hogwarts-1995');
    expect(url).toBe('https://folio.example.com/?story=pub-hogwarts-1995');
    const parsed = parseRouteLinks('?story=pub-hogwarts-1995');
    expect(parsed).toEqual({
      shareId: null,
      collabId: null,
      storyId: 'pub-hogwarts-1995',
    });
  });
});
