// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { StoryChapter, StoryComment, StoryTurn } from '../../src/types/story';
import {
  buildCommentTree,
  formatTargetBadgeLabel,
  getScopedComments,
  resolveCommentTarget,
} from '../../src/utils/commentsTree';
import { resolveDisplayUsername } from '../../src/utils/communityStore';

const TURNS: StoryTurn[] = [
  {
    id: 'turn-1',
    turnNumber: 1,
    sceneTitle: 'The Ledger',
    location: 'Library',
    inStoryTime: 'Night',
    activeCharacters: ['Hermione'],
    userAction: '',
    prose: ['Scene one prose.'],
    continuityNotes: [],
    continuityWarning: null,
    selectedChoiceId: null,
    timestamp: 1000,
    choices: [],
  },
  {
    id: 'turn-2',
    turnNumber: 2,
    sceneTitle: 'The Courtyard',
    location: 'Courtyard',
    inStoryTime: 'Dawn',
    activeCharacters: ['Harry'],
    userAction: '',
    prose: ['Scene two prose.'],
    continuityNotes: [],
    continuityWarning: null,
    selectedChoiceId: null,
    timestamp: 2000,
    choices: [],
  },
  {
    id: 'turn-3',
    turnNumber: 3,
    sceneTitle: 'The Owlery',
    location: 'Tower',
    inStoryTime: 'Noon',
    activeCharacters: ['Ron'],
    userAction: '',
    prose: ['Scene three prose.'],
    continuityNotes: [],
    continuityWarning: null,
    selectedChoiceId: null,
    timestamp: 3000,
    choices: [],
  },
];

const CHAPTERS: StoryChapter[] = [
  {
    id: 'ch-1',
    chapterNumber: 1,
    title: 'Opening Gambits',
    summary: 'First two scenes.',
    turnIds: ['turn-1', 'turn-2'],
    mergedAt: 1000,
  },
  {
    id: 'ch-2',
    chapterNumber: 2,
    title: 'Second Movements',
    summary: 'Scene three.',
    turnIds: ['turn-3'],
    mergedAt: 3000,
  },
];

const COMMENTS: StoryComment[] = [
  {
    id: 'cmt-story',
    storyId: 'pub-1',
    authorUid: 'u1',
    authorName: 'Reader A',
    body: 'Overall story comment.',
    targetType: 'story',
    targetId: 'pub-1',
    storyIsPrivate: false,
    createdAtMs: 100,
    updatedAtMs: 100,
  },
  {
    id: 'cmt-ch1',
    storyId: 'pub-1',
    authorUid: 'u2',
    authorName: 'Reader B',
    body: 'Chapter 1 pacing rocks.',
    targetType: 'chapter',
    targetId: 'ch-1',
    targetLabel: 'Chapter 01 — Opening Gambits',
    storyIsPrivate: false,
    createdAtMs: 200,
    updatedAtMs: 200,
  },
  {
    id: 'cmt-scene1',
    storyId: 'pub-1',
    authorUid: 'u3',
    authorName: 'Reader C',
    body: 'Loved the Scene 1 ledger clue.',
    targetType: 'scene',
    targetId: 'turn-1',
    targetLabel: 'Scene 01 — The Ledger',
    storyIsPrivate: false,
    createdAtMs: 300,
    updatedAtMs: 300,
  },
  {
    id: 'cmt-scene1-reply',
    storyId: 'pub-1',
    authorUid: 'u4',
    authorName: 'Reader D',
    body: 'Sub-comment on Scene 1!',
    targetType: 'scene',
    targetId: 'turn-1',
    parentCommentId: 'cmt-scene1',
    storyIsPrivate: false,
    createdAtMs: 400,
    updatedAtMs: 400,
  },
  {
    id: 'cmt-scene3',
    storyId: 'pub-1',
    authorUid: 'u5',
    authorName: 'Reader E',
    body: 'Scene 3 in Chapter 2.',
    targetType: 'scene',
    targetId: 'turn-3',
    targetLabel: 'Scene 03 — The Owlery',
    storyIsPrivate: false,
    createdAtMs: 500,
    updatedAtMs: 500,
  },
];

describe('Hierarchical commentsTree & resolveDisplayUsername', () => {
  it('shows scene comments + sub-comments in scene scope, rolls them into chapters, and rolls everything into full story', () => {
    const scene1Scoped = getScopedComments({
      comments: COMMENTS,
      scope: 'scene',
      targetId: 'turn-1',
      chapters: CHAPTERS,
      turns: TURNS,
    });
    expect(scene1Scoped.map((c) => c.id)).toEqual([
      'cmt-scene1',
      'cmt-scene1-reply',
    ]);

    const ch1Scoped = getScopedComments({
      comments: COMMENTS,
      scope: 'chapter',
      targetId: 'ch-1',
      chapters: CHAPTERS,
      turns: TURNS,
    });
    expect(ch1Scoped.map((c) => c.id)).toEqual([
      'cmt-ch1',
      'cmt-scene1',
      'cmt-scene1-reply',
    ]);

    const storyScoped = getScopedComments({
      comments: COMMENTS,
      scope: 'story',
      targetId: 'pub-1',
      chapters: CHAPTERS,
      turns: TURNS,
    });
    expect(storyScoped.map((c) => c.id)).toEqual([
      'cmt-story',
      'cmt-ch1',
      'cmt-scene1',
      'cmt-scene1-reply',
      'cmt-scene3',
    ]);

    const tree = buildCommentTree(ch1Scoped);
    expect(tree).toHaveLength(2);
    expect(tree[1].comment.id).toBe('cmt-scene1');
    expect(tree[1].replies).toHaveLength(1);
    expect(tree[1].replies[0].comment.id).toBe('cmt-scene1-reply');
  });

  it('infers legacy chapterOrSceneLabel targets and formats target badges', () => {
    const legacyComment: StoryComment = {
      id: 'cmt-legacy',
      storyId: 'pub-1',
      authorUid: 'u1',
      authorName: 'Legacy Reader',
      body: 'Nice detail.',
      chapterOrSceneLabel: 'Scene 02 — Courtyard',
      storyIsPrivate: false,
      createdAtMs: 600,
      updatedAtMs: 600,
    };
    const resolved = resolveCommentTarget(legacyComment, CHAPTERS, TURNS);
    expect(resolved.targetType).toBe('scene');
    expect(resolved.targetId).toBe('turn-2');
    expect(formatTargetBadgeLabel(legacyComment, CHAPTERS, TURNS)).toBe(
      'Scene 02 — Courtyard',
    );
  });

  it('resolves freely chosen custom username ahead of OAuth displayName', () => {
    expect(
      resolveDisplayUsername({
        customUsername: '  LoreSmith_42  ',
        localUsername: 'LocalPen',
        oauthDisplayName: 'Google User',
      }),
    ).toBe('LoreSmith_42');

    expect(
      resolveDisplayUsername({
        customUsername: '',
        localUsername: 'LocalPen',
        oauthDisplayName: 'Google User',
      }),
    ).toBe('LocalPen');

    expect(
      resolveDisplayUsername({
        customUsername: '',
        localUsername: '',
        oauthDisplayName: '',
        fallback: 'Reader',
      }),
    ).toBe('Reader');
  });
});
