import { describe, expect, it } from 'vitest';
import { StoryTurn } from '../../src/types/story';
import {
  extractCharacterNames,
  extractHighlightTerms,
  matchStoryTurns,
  TurnChapterInfo,
} from '../../src/utils/turnSearch';

const sampleTurns: StoryTurn[] = [
  {
    id: 't1',
    turnNumber: 1,
    sceneTitle: 'Rain on the Glass Harbor',
    location: 'Dockyard Sector 4',
    inStoryTime: 'Night, 23:10',
    activeCharacters: ['Clara Vance', 'Harbor Warden'],
    userAction: null,
    prose: ['Fog drifted across the basalt piers while Clara inspected the manifest.'],
    continuityNotes: ['Clara holds the brass seal.'],
    continuityWarning: null,
    selectedChoiceId: null,
    timestamp: 1700000001000,
    choices: [],
  },
  {
    id: 't2',
    turnNumber: 2,
    sceneTitle: 'Vault beneath the Observatory',
    location: 'Old Observatory',
    inStoryTime: 'Dawn, 05:30',
    activeCharacters: ['Clara Vance', 'Orin Solis'],
    userAction: 'Ask Orin about the missing star chart.',
    prose: ['Orin unlocked the bronze Orrery and whispered about a comet shard.'],
    continuityNotes: ['Star chart copied into Clara’s satchel.'],
    continuityWarning: null,
    selectedChoiceId: null,
    timestamp: 1700000002000,
    choices: [],
  },
  {
    id: 't3',
    turnNumber: 3,
    sceneTitle: 'Council of Tides',
    location: 'Guildhall Atrium',
    inStoryTime: 'Noon',
    activeCharacters: ['Orin Solis'],
    userAction: 'Confront the tribunal with the evidence.',
    prose: ['Sunlight fractured through the high rose window onto marble tiles.'],
    continuityNotes: [],
    continuityWarning: null,
    selectedChoiceId: null,
    timestamp: 1700000003000,
    choices: [],
  },
];

const chapterMap = new Map<string, TurnChapterInfo>([
  ['t1', { chapterNumber: 1, title: 'Harbor Arrival' }],
  ['t2', { chapterNumber: 1, title: 'Harbor Arrival' }],
]);

describe('turnSearch utilities', () => {
  it('extracts unique character names preserving first casing', () => {
    const names = extractCharacterNames(
      [{ name: 'clara vance' }, { name: 'Lyra Holt' }],
      sampleTurns,
    );
    expect(names).toEqual([
      'clara vance',
      'Lyra Holt',
      'Harbor Warden',
      'Orin Solis',
    ]);
  });

  it('matches turns by strict scene/turn prefix or pure digits', () => {
    expect(matchStoryTurns(sampleTurns, '#2', '', chapterMap).map((m) => m.turn.id)).toEqual([
      't2',
    ]);
    expect(
      matchStoryTurns(sampleTurns, 'scene 3', '', chapterMap).map((m) => m.turn.id),
    ).toEqual(['t3']);
    expect(
      matchStoryTurns(sampleTurns, '01', '', chapterMap).map((m) => m.turn.id),
    ).toEqual(['t1']);
  });

  it('matches turns by scene title, prose keyword, and character filter together', () => {
    const titleMatches = matchStoryTurns(sampleTurns, 'Observatory', '', chapterMap);
    expect(titleMatches).toHaveLength(1);
    expect(titleMatches[0].turn.id).toBe('t2');
    expect(titleMatches[0].reasons).toContain('Title');

    const proseMatches = matchStoryTurns(sampleTurns, 'comet', 'Clara Vance', chapterMap);
    expect(proseMatches).toHaveLength(1);
    expect(proseMatches[0].turn.id).toBe('t2');
    expect(proseMatches[0].reasons).toContain('Character: Clara Vance');
    expect(proseMatches[0].reasons).toContain('Prose');

    const emptyForWrongChar = matchStoryTurns(
      sampleTurns,
      'tribunal',
      'Clara Vance',
      chapterMap,
    );
    expect(emptyForWrongChar).toHaveLength(0);
  });

  it('extracts highlight terms cleanly and suppresses strict scene number queries', () => {
    expect(extractHighlightTerms('#2')).toEqual([]);
    expect(extractHighlightTerms('scene 02')).toEqual([]);
    expect(extractHighlightTerms('bronze comet a')).toEqual(['bronze', 'comet']);
  });
});
