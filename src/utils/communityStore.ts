import { UNIVERSE_TEMPLATES } from '../data/presets';
import {
  PublicStoryWork,
  StoryComment,
  StoryProject,
  StorySubscription,
  UserCollection,
} from '../types/story';
import { countStoryWords, normalizeStoryTags } from './ao3Tags';

export const COMMUNITY_STORAGE_KEY = 'folio-canon-community-v1';

export interface LocalCommunityState {
  username: string;
  anonClientId: string;
  givenKudoStoryIds: string[];
  kudoCountsByStoryId: Record<string, number>;
  commentsByStoryId: Record<string, StoryComment[]>;
  collections: UserCollection[];
  subscriptions: StorySubscription[];
}

const SEED_NOW = 1763400000000;

const INITIAL_KUDO_COUNTS: Record<string, number> = {
  'pub-hogwarts-1995': 42,
  'pub-dune-arrakeen': 29,
  'pub-meridian-1889': 36,
};

const INITIAL_COMMENTS: Record<string, StoryComment[]> = {
  'pub-hogwarts-1995': [
    {
      id: 'cmt-seed-hp-1',
      storyId: 'pub-hogwarts-1995',
      authorUid: 'reader-luna-archive',
      authorName: 'M. Lovegood',
      body: 'The detail about the wand-core ledger excluding Muggle-born third-years sets up the Ministry conspiracy brilliantly. Already hooked.',
      targetType: 'scene',
      targetId: UNIVERSE_TEMPLATES[0].starterProject.turns[0].id,
      targetLabel: 'Scene 01 — The Ledger Behind the Tapestry',
      chapterOrSceneLabel: 'Scene 01 — The Ledger Behind the Tapestry',
      storyIsPrivate: false,
      createdAtMs: SEED_NOW - 1000 * 60 * 60 * 5,
      updatedAtMs: SEED_NOW - 1000 * 60 * 60 * 5,
    },
    {
      id: 'cmt-seed-hp-2',
      storyId: 'pub-hogwarts-1995',
      authorUid: 'reader-order-owl',
      authorName: 'Archivist Finnegan',
      body: 'Hermione’s immediate instinct to check Filch vs. Snape on the Marauder’s Map feels completely faithful to fifth-year canon.',
      targetType: 'scene',
      targetId: UNIVERSE_TEMPLATES[0].starterProject.turns[0].id,
      targetLabel: 'Scene 01 — The Ledger Behind the Tapestry',
      chapterOrSceneLabel: 'Scene 01 — The Ledger Behind the Tapestry',
      parentCommentId: 'cmt-seed-hp-1',
      storyIsPrivate: false,
      createdAtMs: SEED_NOW - 1000 * 60 * 60 * 2,
      updatedAtMs: SEED_NOW - 1000 * 60 * 60 * 2,
    },
  ],
  'pub-dune-arrakeen': [
    {
      id: 'cmt-seed-dune-1',
      storyId: 'pub-dune-arrakeen',
      authorUid: 'reader-sietch-tabr',
      authorName: 'Chani of the Sietch',
      body: 'Leaving the water untouched to frame a desert kill is a razor-sharp Mentat detail. Curious how Shadout Mapes reacts.',
      targetType: 'scene',
      targetId: UNIVERSE_TEMPLATES[1].starterProject.turns[0].id,
      targetLabel: 'Scene 01 — Moisture on the Conservatory Stone',
      chapterOrSceneLabel: 'Scene 01 — Moisture on the Conservatory Stone',
      storyIsPrivate: false,
      createdAtMs: SEED_NOW - 1000 * 60 * 60 * 9,
      updatedAtMs: SEED_NOW - 1000 * 60 * 60 * 9,
    },
  ],
  'pub-meridian-1889': [
    {
      id: 'cmt-seed-pm-1',
      storyId: 'pub-meridian-1889',
      authorUid: 'reader-harbor-watch',
      authorName: 'E. Holloway',
      body: 'A pocket astrolabe that spins backward when someone lies is such a tactile detective hook—especially under a 45-minute tide clock.',
      targetType: 'scene',
      targetId: UNIVERSE_TEMPLATES[2].starterProject.turns[0].id,
      targetLabel: 'Scene 01 — The Backward Escapement',
      chapterOrSceneLabel: 'Scene 01 — The Backward Escapement',
      storyIsPrivate: false,
      createdAtMs: SEED_NOW - 1000 * 60 * 60 * 14,
      updatedAtMs: SEED_NOW - 1000 * 60 * 60 * 14,
    },
  ],
};

function generateAnonToken(): string {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `anon_${hex}`;
}

function getEmptyState(): LocalCommunityState {
  return {
    username: '',
    anonClientId: generateAnonToken(),
    givenKudoStoryIds: [],
    kudoCountsByStoryId: { ...INITIAL_KUDO_COUNTS },
    commentsByStoryId: JSON.parse(JSON.stringify(INITIAL_COMMENTS)) as Record<
      string,
      StoryComment[]
    >,
    collections: [],
    subscriptions: [],
  };
}

export function loadLocalCommunityState(): LocalCommunityState {
  try {
    const raw = localStorage.getItem(COMMUNITY_STORAGE_KEY);
    if (!raw) return getEmptyState();
    const parsed = JSON.parse(raw) as Partial<LocalCommunityState>;
    const base = getEmptyState();
    return {
      username: typeof parsed.username === 'string' ? parsed.username.slice(0, 40) : '',
      anonClientId:
        typeof parsed.anonClientId === 'string' &&
        /^anon_[a-zA-Z0-9_-]{8,64}$/.test(parsed.anonClientId)
          ? parsed.anonClientId
          : base.anonClientId,
      givenKudoStoryIds: Array.isArray(parsed.givenKudoStoryIds)
        ? parsed.givenKudoStoryIds.filter((v): v is string => typeof v === 'string')
        : [],
      kudoCountsByStoryId: {
        ...base.kudoCountsByStoryId,
        ...(parsed.kudoCountsByStoryId && typeof parsed.kudoCountsByStoryId === 'object'
          ? parsed.kudoCountsByStoryId
          : {}),
      },
      commentsByStoryId: {
        ...base.commentsByStoryId,
        ...(parsed.commentsByStoryId && typeof parsed.commentsByStoryId === 'object'
          ? parsed.commentsByStoryId
          : {}),
      },
      collections: Array.isArray(parsed.collections)
        ? parsed.collections.filter(
            (c): c is UserCollection =>
              Boolean(c && typeof c.id === 'string' && typeof c.name === 'string'),
          )
        : [],
      subscriptions: Array.isArray(parsed.subscriptions)
        ? parsed.subscriptions.filter(
            (s): s is StorySubscription =>
              Boolean(s && typeof s.storyId === 'string' && typeof s.storyTitle === 'string'),
          )
        : [],
    };
  } catch {
    return getEmptyState();
  }
}

export function saveLocalCommunityState(state: LocalCommunityState): void {
  try {
    localStorage.setItem(COMMUNITY_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

export function resolveDisplayUsername(params: {
  customUsername?: string | null;
  localUsername?: string | null;
  oauthDisplayName?: string | null;
  fallback?: string;
}): string {
  const candidates = [
    params.customUsername,
    params.localUsername,
    params.oauthDisplayName,
    params.fallback ?? 'Reader',
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) {
      return c.trim().slice(0, 40);
    }
  }
  return 'Reader';
}

export function getPublicStoryIdForProject(story: StoryProject): string {
  if (story.publicStoryId && story.publicStoryId.trim()) {
    return story.publicStoryId.trim();
  }
  const cleanSource = story.id.replace(/[^a-zA-Z0-9_-]/g, '-');
  if (cleanSource.startsWith('proj-')) {
    return `pub-${cleanSource.slice(5)}`.slice(0, 128);
  }
  return `pub-${cleanSource}`.slice(0, 128);
}

export function storyProjectToPublicWork(
  story: StoryProject,
  options?: {
    ownerUid?: string;
    authorName?: string;
    kudosCount?: number;
    commentCount?: number;
    isLocalSeed?: boolean;
  },
): PublicStoryWork {
  const publicId = getPublicStoryIdForProject(story);
  const tags = normalizeStoryTags(story.tags, story);
  return {
    id: publicId,
    ownerUid: options?.ownerUid || 'local-author',
    sourceStoryId: story.id,
    authorName: options?.authorName || 'You (Studio Draft)',
    title: story.title,
    universe: story.universe,
    setting: story.setting,
    tone: story.tone,
    premise: story.premise,
    coverImage: story.coverImage,
    isPrivate: story.isPrivate === true,
    tags,
    turns: story.turns,
    chapters: story.chapters ?? [],
    characters: story.characters,
    wordCount: countStoryWords(story.turns),
    kudosCount: options?.kudosCount ?? 0,
    commentCount: options?.commentCount ?? 0,
    isLocalSeed: options?.isLocalSeed,
    createdAtMs: story.turns[0]?.timestamp ?? story.updatedAt,
    updatedAtMs: story.updatedAt,
  };
}

export function buildCuratedShowcaseWorks(
  communityState: LocalCommunityState,
): PublicStoryWork[] {
  return UNIVERSE_TEMPLATES.map((tpl) => {
    const base = tpl.starterProject;
    const publicId = getPublicStoryIdForProject(base);
    const comments = communityState.commentsByStoryId[publicId] ?? [];
    const kudosCount =
      communityState.kudoCountsByStoryId[publicId] ?? INITIAL_KUDO_COUNTS[publicId] ?? 12;
    return storyProjectToPublicWork(base, {
      ownerUid: `curator-${tpl.id}`,
      authorName: 'Folio & Canon Editorial',
      kudosCount,
      commentCount: comments.length,
      isLocalSeed: true,
    });
  }).map((work, idx) => ({
    ...work,
    updatedAtMs: SEED_NOW - idx * 1000 * 60 * 60 * 3,
  }));
}

/**
 * Merges Firestore public works, local library stories, and curated showcase works
 * while strictly EXCLUDING every story whose `isPrivate === true`.
 */
export function buildMergedPublicStoryIndex(params: {
  localLibraryStories: StoryProject[];
  cloudPublicStories: PublicStoryWork[];
  communityState: LocalCommunityState;
  currentAuthorUid?: string;
  currentAuthorName?: string;
}): PublicStoryWork[] {
  const {
    localLibraryStories,
    cloudPublicStories,
    communityState,
    currentAuthorUid,
    currentAuthorName,
  } = params;

  const map = new Map<string, PublicStoryWork>();

  const privateIds = new Set<string>();
  const privateSourceIds = new Set<string>();
  for (const s of localLibraryStories) {
    if (s.isPrivate === true) {
      privateSourceIds.add(s.id);
      privateIds.add(getPublicStoryIdForProject(s));
    }
  }

  for (const seed of buildCuratedShowcaseWorks(communityState)) {
    if (!privateIds.has(seed.id) && !privateSourceIds.has(seed.sourceStoryId)) {
      map.set(seed.id, seed);
    }
  }

  for (const cw of cloudPublicStories) {
    if (
      cw.isPrivate === true ||
      privateIds.has(cw.id) ||
      privateSourceIds.has(cw.sourceStoryId)
    ) {
      map.delete(cw.id);
      continue;
    }
    const existing = map.get(cw.id);
    const localCommentCount =
      (communityState.commentsByStoryId[cw.id] ?? []).length;
    const localKudoCount = communityState.kudoCountsByStoryId[cw.id] ?? 0;
    map.set(cw.id, {
      ...cw,
      kudosCount: Math.max(cw.kudosCount, existing?.kudosCount ?? 0, localKudoCount),
      commentCount: Math.max(
        cw.commentCount,
        existing?.commentCount ?? 0,
        localCommentCount,
      ),
    });
  }

  for (const ls of localLibraryStories) {
    const publicId = getPublicStoryIdForProject(ls);
    if (ls.isPrivate === true) {
      map.delete(publicId);
      continue;
    }
    const existing = map.get(publicId);
    const localComments = communityState.commentsByStoryId[publicId] ?? [];
    const localKudos = communityState.kudoCountsByStoryId[publicId] ?? 0;
    const derived = storyProjectToPublicWork(ls, {
      ownerUid: existing?.ownerUid || currentAuthorUid || 'local-author',
      authorName:
        existing?.isLocalSeed && ls.turns.length === 1
          ? existing.authorName
          : currentAuthorName || existing?.authorName || 'You (Studio Author)',
      kudosCount: Math.max(existing?.kudosCount ?? 0, localKudos),
      commentCount: Math.max(existing?.commentCount ?? 0, localComments.length),
      isLocalSeed: existing?.isLocalSeed,
    });
    map.set(publicId, derived);
  }

  return Array.from(map.values())
    .filter((w) => w.isPrivate !== true)
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}
