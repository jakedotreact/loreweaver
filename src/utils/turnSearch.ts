import { StoryTurn } from '../types/story';

export interface TurnChapterInfo {
  chapterNumber: number;
  title: string;
}

export interface TurnSearchMatch {
  turn: StoryTurn;
  reasons: string[];
}

const EXPLICIT_NUMBER_QUERY_RE = /^(?:#|(?:scene|turn|sc)\s*#?\s*)0*(\d+)$/i;
const PURE_DIGITS_RE = /^0*(\d+)$/;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function extractCharacterNames(
  projectCharacters: Array<{ name: string }>,
  turns: StoryTurn[],
): string[] {
  const seen = new Map<string, string>();

  for (const char of projectCharacters) {
    const trimmed = char.name.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, trimmed);
    }
  }

  for (const turn of turns) {
    for (const name of turn.activeCharacters) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, trimmed);
      }
    }
  }

  return Array.from(seen.values());
}

function turnMentionsCharacter(turn: StoryTurn, characterName: string): boolean {
  const target = normalize(characterName);
  if (!target) return true;

  const targetTokens = target.split(/\s+/).filter((t) => t.length >= 2);

  const inActiveCast = turn.activeCharacters.some((activeName) => {
    const activeLow = normalize(activeName);
    return (
      activeLow === target ||
      activeLow.includes(target) ||
      target.includes(activeLow)
    );
  });
  if (inActiveCast) return true;

  const haystack = normalize(
    [
      turn.sceneTitle,
      turn.userAction ?? '',
      ...turn.prose,
      ...turn.continuityNotes,
    ].join('\n'),
  );

  if (haystack.includes(target)) return true;

  // Match distinct full-name tokens (e.g. searching "Severus Snape" finds "Snape")
  if (targetTokens.length > 1) {
    return targetTokens.some((token) => {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b${escaped}\\b`, 'i').test(haystack);
    });
  }

  return false;
}

export function matchStoryTurns(
  turns: StoryTurn[],
  query: string,
  characterFilter: string,
  turnChapterMap: Map<string, TurnChapterInfo>,
): TurnSearchMatch[] {
  const trimmedQuery = query.trim();
  const normalizedQuery = normalize(trimmedQuery);
  const hasCharacterFilter = Boolean(characterFilter.trim());

  const explicitNumberMatch = trimmedQuery.match(EXPLICIT_NUMBER_QUERY_RE);
  const pureDigitsMatch = trimmedQuery.match(PURE_DIGITS_RE);
  const rawNumberToken = explicitNumberMatch?.[1] ?? pureDigitsMatch?.[1] ?? null;
  const parsedTurnNumber = rawNumberToken
    ? Number.parseInt(rawNumberToken, 10)
    : null;
  const isStrictTurnPrefix =
    Boolean(explicitNumberMatch) && !pureDigitsMatch;

  const hasExactTurnNumberMatch =
    parsedTurnNumber !== null &&
    turns.some((t) => t.turnNumber === parsedTurnNumber);

  const queryTokens = normalizedQuery
    .split(/\s+/)
    .filter((token) => token.length > 0);

  const results: TurnSearchMatch[] = [];

  for (const turn of turns) {
    if (hasCharacterFilter && !turnMentionsCharacter(turn, characterFilter)) {
      continue;
    }

    const reasons: string[] = [];
    if (hasCharacterFilter) {
      reasons.push(`Character: ${characterFilter}`);
    }

    if (!normalizedQuery) {
      results.push({ turn, reasons });
      continue;
    }

    // 1. Strict turn/scene prefix like "#2", "scene 2", "turn 02"
    if (isStrictTurnPrefix && parsedTurnNumber !== null) {
      if (turn.turnNumber === parsedTurnNumber) {
        reasons.push(`Scene ${String(turn.turnNumber).padStart(2, '0')}`);
        results.push({ turn, reasons });
      }
      continue;
    }

    // 2. Pure digits (e.g. "2" or "02") when matching a turn number directly
    if (pureDigitsMatch && parsedTurnNumber !== null && hasExactTurnNumberMatch) {
      if (turn.turnNumber === parsedTurnNumber) {
        reasons.push(`Scene ${String(turn.turnNumber).padStart(2, '0')}`);
        results.push({ turn, reasons });
      }
      continue;
    }

    // 3. Keyword, scene title, character mention, location, time, continuity
    const chapterInfo = turnChapterMap.get(turn.id);
    const titleHaystack = normalize(
      `${turn.sceneTitle} ${chapterInfo?.title ?? ''}`,
    );
    const metaHaystack = normalize(
      `${turn.location} ${turn.inStoryTime} Scene ${turn.turnNumber} Turn ${turn.turnNumber}`,
    );
    const charactersHaystack = normalize(turn.activeCharacters.join(' '));
    const actionHaystack = normalize(turn.userAction ?? '');
    const proseHaystack = normalize(turn.prose.join('\n'));
    const notesHaystack = normalize(
      [...turn.continuityNotes, turn.continuityWarning ?? ''].join('\n'),
    );

    const combinedHaystack = [
      titleHaystack,
      metaHaystack,
      charactersHaystack,
      actionHaystack,
      proseHaystack,
      notesHaystack,
    ].join('\n');

    const matchesAllTokens =
      combinedHaystack.includes(normalizedQuery) ||
      queryTokens.every((token) => combinedHaystack.includes(token));

    if (!matchesAllTokens) {
      continue;
    }

    if (
      titleHaystack.includes(normalizedQuery) ||
      queryTokens.every((token) => titleHaystack.includes(token))
    ) {
      reasons.push('Title');
    }
    if (
      charactersHaystack.includes(normalizedQuery) ||
      queryTokens.every((token) => charactersHaystack.includes(token))
    ) {
      reasons.push('Character');
    }
    if (
      proseHaystack.includes(normalizedQuery) ||
      queryTokens.every((token) => proseHaystack.includes(token))
    ) {
      reasons.push('Prose');
    }
    if (
      actionHaystack.includes(normalizedQuery) ||
      (actionHaystack && queryTokens.every((token) => actionHaystack.includes(token)))
    ) {
      reasons.push('Action');
    }
    if (
      reasons.length === 0 &&
      (metaHaystack.includes(normalizedQuery) ||
        notesHaystack.includes(normalizedQuery))
    ) {
      reasons.push('Scene details');
    }

    results.push({ turn, reasons });
  }

  return results;
}

export function extractHighlightTerms(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  if (EXPLICIT_NUMBER_QUERY_RE.test(trimmed)) return [];
  return Array.from(
    new Set(
      trimmed
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2),
    ),
  );
}
