import { describe, expect, it } from 'vitest';
import {
  sanitizeAuthorNote,
  stripChaptersForCloud,
  stripIllustrationDataUrl,
  stripSavePointsForCloud,
  stripTurnsForCloud,
  stripUndefinedDeep,
} from '../../src/utils/cloudSanitize';

describe('cloudSanitize utilities', () => {
  it('recursively strips undefined keys and array items while preserving class instances', () => {
    class MockFieldValue {
      readonly _methodName = 'serverTimestamp';
    }
    const sentinel = new MockFieldValue();

    const cleaned = stripUndefinedDeep({
      title: 'Test',
      optional: undefined,
      nested: { keep: 1, drop: undefined },
      list: ['a', undefined, 'b'],
      ts: sentinel,
    });

    expect(cleaned).toEqual({
      title: 'Test',
      nested: { keep: 1 },
      list: ['a', 'b'],
      ts: sentinel,
    });
    expect('optional' in cleaned).toBe(false);
    expect('drop' in cleaned.nested).toBe(false);
  });

  it('strips inline base64 dataUrl payloads while preserving prompt metadata', () => {
    const stripped = stripIllustrationDataUrl({
      id: 'ill-1',
      promptUsed: 'Watercolor harbor',
      dataUrl: 'data:image/png;base64,AAAABBBBCCCC',
      caption: 'Harbor',
      source: 'generated',
      createdAt: 1700000,
    });
    expect(stripped?.dataUrl).toBe('');
    expect(stripped?.promptUsed).toBe('Watercolor harbor');

    const httpsUrl = stripIllustrationDataUrl({
      id: 'ill-2',
      promptUsed: 'Hosted art',
      dataUrl: 'https://cdn.example.com/art.png',
      caption: 'Hosted',
      source: 'uploaded',
      createdAt: 1700001,
    });
    expect(httpsUrl?.dataUrl).toBe('https://cdn.example.com/art.png');
  });

  it('sanitizes turns, chapters, and save points without leaving undefined fields', () => {
    const turns = stripTurnsForCloud([
      {
        id: 't1',
        turnNumber: 1,
        sceneTitle: 'Opening',
        location: 'Square',
        inStoryTime: 'Morning',
        activeCharacters: ['Ada'],
        userAction: null,
        prose: ['First paragraph.'],
        continuityNotes: [],
        continuityWarning: null,
        selectedChoiceId: null,
        timestamp: 1700000,
        choices: [],
        prefixNote: '  Before scene one.  ',
        suffixNote: '   ',
        illustration: {
          id: 'ill-t1',
          promptUsed: 'Prompt',
          dataUrl: 'data:image/jpeg;base64,XYZ',
          caption: 'Cap',
          source: 'generated',
          createdAt: 123,
        },
        artStyle: undefined,
      } as unknown as Parameters<typeof stripTurnsForCloud>[0][number],
    ]);

    expect(turns[0].illustration?.dataUrl).toBe('');
    expect('artStyle' in turns[0]).toBe(false);
    expect(turns[0].prefixNote).toBe('Before scene one.');
    expect('suffixNote' in turns[0]).toBe(false);

    const chapters = stripChaptersForCloud([
      {
        id: 'c1',
        chapterNumber: 1,
        title: 'Part I',
        summary: 'Start',
        prefixNote: '  Chapter intro note  ',
        suffixNote: '',
        turnIds: ['t1'],
        mergedAt: 100,
        illustration: {
          id: 'ill-c1',
          promptUsed: 'Cover',
          dataUrl: 'data:image/png;base64,ZZZ',
          caption: 'Cover',
          source: 'generated',
          createdAt: 101,
        },
      },
    ]);
    expect(chapters[0].illustration?.dataUrl).toBe('');
    expect(chapters[0].prefixNote).toBe('Chapter intro note');
    expect('suffixNote' in chapters[0]).toBe(false);

    const savePoints = stripSavePointsForCloud([
      {
        id: 'sp1',
        label: 'Checkpoint',
        createdAt: 200,
        turnNumber: 1,
        sceneTitle: 'Opening',
        snapshot: {
          title: 'Book',
          universe: 'Arcane',
          setting: 'City',
          tone: 'Warm',
          premise: 'A tale',
          prefixNote: '  Story beginning note  ',
          suffixNote: '  ',
          protagonistId: 'char1',
          turns,
          characters: [],
          crossIndex: [],
          chapters,
        },
      },
    ]);
    expect(savePoints).toHaveLength(1);
    expect(savePoints[0].snapshot.turns[0].illustration?.dataUrl).toBe('');
    expect(savePoints[0].snapshot.prefixNote).toBe('Story beginning note');
    expect('suffixNote' in savePoints[0].snapshot).toBe(false);
  });

  it('trims, drops empty, and truncates author notes over 4000 chars', () => {
    expect(sanitizeAuthorNote(undefined)).toBeUndefined();
    expect(sanitizeAuthorNote(null)).toBeUndefined();
    expect(sanitizeAuthorNote('   \n\t  ')).toBeUndefined();
    expect(sanitizeAuthorNote('  Hello\nWorld  ')).toBe('Hello\nWorld');

    const oversized = 'A'.repeat(4500);
    const bounded = sanitizeAuthorNote(oversized);
    expect(bounded).toHaveLength(4000);
  });
});

