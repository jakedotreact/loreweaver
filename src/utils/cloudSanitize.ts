import {
  SavePoint,
  StoryChapter,
  StoryIllustration,
  StoryProject,
  StoryTags,
  StoryTurn,
} from '../types/story';
import { normalizeStoryTags } from './ao3Tags';

function isPlainObject(val: unknown): val is Record<string, unknown> {
  if (!val || typeof val !== 'object') return false;
  const proto = Object.getPrototypeOf(val);
  return proto === Object.prototype || proto === null;
}

/**
 * Recursively removes `undefined` fields so Firestore never rejects writes with
 * "Unsupported field value: undefined", while preserving Firestore FieldValue / Timestamp objects.
 */
export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

export function stripIllustrationDataUrl(
  ill?: StoryIllustration | null,
): StoryIllustration | null | undefined {
  if (!ill) return ill;
  return stripUndefinedDeep({
    ...ill,
    dataUrl: ill.dataUrl.startsWith('data:') ? '' : ill.dataUrl.slice(0, 500),
  });
}

export function stripTurnsForCloud(turns: StoryTurn[]): StoryTurn[] {
  return turns.slice(-200).map((t) => {
    const cleaned = { ...t };
    const safeIll = stripIllustrationDataUrl(t.illustration);
    if (safeIll === undefined) {
      delete cleaned.illustration;
    } else {
      cleaned.illustration = safeIll;
    }
    return stripUndefinedDeep(cleaned);
  });
}

export function stripChaptersForCloud(chapters: StoryChapter[] = []): StoryChapter[] {
  return chapters.slice(0, 100).map((ch) => {
    const cleaned = { ...ch };
    const safeIll = stripIllustrationDataUrl(ch.illustration);
    if (safeIll === undefined) {
      delete cleaned.illustration;
    } else {
      cleaned.illustration = safeIll;
    }
    return stripUndefinedDeep(cleaned);
  });
}

export function stripSavePointsForCloud(savePoints: SavePoint[] = []): SavePoint[] {
  return savePoints.slice(0, 50).map((sp) =>
    stripUndefinedDeep({
      ...sp,
      snapshot: {
        ...sp.snapshot,
        turns: stripTurnsForCloud(sp.snapshot.turns),
        chapters: stripChaptersForCloud(sp.snapshot.chapters ?? []),
      },
    }),
  );
}

export function stripTagsForCloud(
  tags?: Partial<StoryTags> | null,
  fallback?: Pick<StoryProject, 'universe' | 'tone' | 'characters'>,
): StoryTags {
  return stripUndefinedDeep(normalizeStoryTags(tags, fallback));
}
