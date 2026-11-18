import { describe, expect, it } from 'vitest';
import { StoryProject } from '../../src/types/story';
import { generateStoryHtml } from '../../src/utils/htmlExport';

const sampleProject: StoryProject = {
  id: 'story-1',
  title: 'Clockwork <script>alert(1)</script> Meridian',
  universe: 'Brass & Ether',
  setting: 'Highland Citadels',
  tone: 'Literary Adventure',
  premise: 'An archivist races to repair a failing celestial timepiece.',
  protagonistId: 'char-1',
  updatedAt: 1000,
  savePoints: [],
  turns: [
    {
      id: 't1',
      turnNumber: 1,
      sceneTitle: 'Pendulum Chamber',
      location: 'Tower Spire',
      inStoryTime: 'Midnight',
      activeCharacters: ['Mira'],
      userAction: null,
      prose: ['Dust drifted through the gears & brass arches.'],
      continuityNotes: ['Pocket barometer intact'],
      continuityWarning: null,
      timestamp: 1700000000000,
      choices: [
        {
          id: 'ch1',
          label: 'Inspect escapement',
          intent: 'Search for fracture',
          consequenceHint: 'Reveals hairline gear split',
        },
      ],
      selectedChoiceId: 'ch1',
    },
    {
      id: 't2',
      turnNumber: 2,
      sceneTitle: 'Gutter Lanterns',
      location: 'Lower Bridge',
      inStoryTime: '02:00',
      activeCharacters: ['Mira'],
      userAction: 'Descend to the canal lock.',
      prose: ['Water slapped against mossy masonry.'],
      continuityNotes: [],
      continuityWarning: null,
      selectedChoiceId: null,
      timestamp: 1700000001000,
      choices: [],
    },
  ],
  chapters: [
    {
      id: 'chap-1',
      chapterNumber: 1,
      title: 'The Halted Hour',
      summary: 'Mira discovers the fracture.',
      turnIds: ['t1'],
      mergedAt: 900,
    },
  ],
  characters: [
    {
      id: 'char-1',
      name: 'Mira Thorne',
      role: 'Protagonist',
      origin: 'original',
      summary: 'Precision horologist',
      pros: ['Sharp ear'],
      flaws: ['Overworks'],
      motivation: 'Restore the Meridian tower before solstice',
      voiceAndMannerisms: 'Measured, observant',
      location: 'Lower Bridge',
      status: 'Active',
      inventory: ['Brass Loupe'],
      relationships: [],
      deducedFromContext: false,
    },
  ],
  crossIndex: [
    {
      id: 'ix-1',
      category: 'item',
      title: 'Torsion Key',
      detail: 'Unlocks the Meridian vault',
      tags: ['key'],
      status: 'active',
      introducedAtTurn: 1,
      lastVerifiedTurn: 2,
      pinned: true,
    },
  ],
};

describe('htmlExport utilities', () => {
  it('escapes HTML injection and renders chapters, prompts, choices, and appendix', () => {
    const html = generateStoryHtml(sampleProject, {
      includePrompts: true,
      includeChoices: true,
      includeContinuityNotes: true,
      includeCastAndLore: true,
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('The Halted Hour');
    expect(html).toContain('Gutter Lanterns');
    expect(html).toContain('Initial Story Premise Prompt');
    expect(html).toContain('Universe Appendix');
    expect(html).toContain('Mira Thorne');
    expect(html).toContain('Torsion Key');
  });

  it('supports filtering to a single scene turnId and omitting prompts/appendix', () => {
    const html = generateStoryHtml(sampleProject, {
      includePrompts: false,
      includeChoices: false,
      includeContinuityNotes: false,
      includeCastAndLore: false,
      turnId: 't2',
    });

    expect(html).toContain('Gutter Lanterns');
    expect(html).not.toContain('Pendulum Chamber');
    expect(html).not.toContain('Initial Story Premise Prompt');
    expect(html).not.toContain('Universe Appendix');
  });

  it('supports filtering to a single chapter chapterId', () => {
    const html = generateStoryHtml(sampleProject, {
      includePrompts: true,
      includeChoices: false,
      includeContinuityNotes: false,
      includeCastAndLore: false,
      chapterId: 'chap-1',
    });

    expect(html).toContain('Pendulum Chamber');
    expect(html).not.toContain('Gutter Lanterns');
  });
});
