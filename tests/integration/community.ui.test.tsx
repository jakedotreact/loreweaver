// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    firebaseConfigured: false,
    user: null,
    authReady: true,
    isSigningIn: false,
    authError: null,
    userSettings: null,
    settingsLoaded: true,
    syncError: null,
    signInWithGoogle: vi.fn(async () => {}),
    signOutUser: vi.fn(async () => {}),
    updateUserSettings: vi.fn(async () => {}),
    clearAuthError: vi.fn(),
    clearSyncError: vi.fn(),
  }),
  formatReadableFirestoreError: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
}));

import { LandingPage } from '../../src/components/LandingPage';
import { PublicStoryView } from '../../src/components/PublicStoryView';
import { StoryTagsModal } from '../../src/components/StoryTagsModal';
import { TopNav } from '../../src/components/TopNav';
import { UNIVERSE_TEMPLATES } from '../../src/data/presets';
import {
  PublicStoryWork,
  StoryComment,
  StoryDisplayMode,
  StorySubscription,
  UserCollection,
} from '../../src/types/story';
import { normalizeStoryTags } from '../../src/utils/ao3Tags';
import { storyProjectToPublicWork } from '../../src/utils/communityStore';

function buildFixtureWorks(): PublicStoryWork[] {
  const hpBase = JSON.parse(JSON.stringify(UNIVERSE_TEMPLATES[0].starterProject));
  hpBase.turns.push({
    ...hpBase.turns[0],
    id: 'turn-hp-2',
    turnNumber: 2,
    sceneTitle: 'The Midnight Detour',
    prose: ['Second scene prose in the same chapter or next chapter.'],
    timestamp: Date.now(),
  });
  hpBase.chapters = [
    {
      id: 'ch-hp-1',
      chapterNumber: 1,
      title: 'The Tapestry Inquiry',
      summary: 'Opening investigations.',
      turnIds: [hpBase.turns[0].id],
      createdAt: 1000,
    },
    {
      id: 'ch-hp-2',
      chapterNumber: 2,
      title: 'Midnight Detour',
      summary: 'Second chapter.',
      turnIds: ['turn-hp-2'],
      createdAt: 2000,
    },
  ];
  const hp = storyProjectToPublicWork(hpBase, {
    authorName: 'J. Archivist',
    kudosCount: 25,
    commentCount: 3,
  });
  const dune = storyProjectToPublicWork(UNIVERSE_TEMPLATES[1].starterProject, {
    authorName: 'Paul Chronicler',
    kudosCount: 14,
    commentCount: 1,
  });
  const secretDraft: PublicStoryWork = {
    ...storyProjectToPublicWork(UNIVERSE_TEMPLATES[2].starterProject, {
      authorName: 'Hidden Author',
      kudosCount: 500,
    }),
    id: 'pub-secret-draft',
    title: 'Confidential Unindexed Manuscript',
    isPrivate: true,
  };
  return [hp, dune, secretDraft];
}

describe('Landing Page Story Index, Collections, Subscriptions, Anonymous Kudos & Hierarchical Comments', () => {
  it('renders an icon-only Account button without a visible text label in TopNav', () => {
    render(
      <TopNav
        activeTab="discover"
        onSelectTab={() => {}}
        onOpenNewStory={() => {}}
        onOpenStudioSettings={() => {}}
        onOpenAccountSettings={() => {}}
        accountUsername="ArchivistPen"
      />,
    );

    const accountBtn = screen.getByTestId('account-icon-btn');
    expect(accountBtn).toBeInTheDocument();
    expect(accountBtn.textContent?.trim()).toBe('');
    expect(accountBtn).toHaveAttribute('aria-label', 'Account (ArchivistPen)');
  });

  it('excludes private stories, supports AO3 tag filtering, collections & subscriptions in LandingPage', () => {
    const works = buildFixtureWorks();
    const onOpenStory = vi.fn();
    const onToggleSubscribe = vi.fn();
    const onCreateCollection = vi.fn();
    const onDeleteCollection = vi.fn();
    const onToggleCollectionStory = vi.fn();

    const collections: UserCollection[] = [
      {
        id: 'col-1',
        ownerUid: 'u1',
        name: 'Slow Burn Favorites',
        description: 'Top picks',
        isPrivate: true,
        storyIds: [works[0].id],
        createdAtMs: 1000,
        updatedAtMs: 1000,
      },
    ];
    const subscriptions: StorySubscription[] = [
      {
        storyId: works[0].id,
        storyTitle: works[0].title,
        authorName: works[0].authorName,
        lastSeenTurnCount: 1,
        lastSeenChapterCount: 1,
        subscribedAtMs: 1000,
        updatedAtMs: 1000,
      },
    ];

    render(
      <LandingPage
        stories={works}
        privateDraftCount={1}
        givenKudoStoryIds={new Set()}
        collections={collections}
        subscriptions={subscriptions}
        onToggleSubscribe={onToggleSubscribe}
        onCreateCollection={onCreateCollection}
        onDeleteCollection={onDeleteCollection}
        onToggleCollectionStory={onToggleCollectionStory}
        onOpenStory={onOpenStory}
        onEnterStudio={() => {}}
        onOpenNewStory={() => {}}
      />,
    );

    expect(screen.getByText('The Umbridge Ledger')).toBeInTheDocument();
    expect(screen.getByText('Shadows of the Salt Throne')).toBeInTheDocument();
    expect(
      screen.queryByText('Confidential Unindexed Manuscript'),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/1 private manuscript excluded/i)).toBeInTheDocument();

    // Filter by AO3 Relationship tag
    fireEvent.click(
      screen.getAllByRole('button', { name: /Paul Atreides & Lady Jessica/i })[0],
    );
    expect(screen.getByText('Shadows of the Salt Throne')).toBeInTheDocument();
    expect(screen.queryByText('The Umbridge Ledger')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Shadows of the Salt Throne' }));
    expect(onOpenStory).toHaveBeenCalledWith(works[1].id);

    // Switch to Subscriptions tab & verify new-scene indicator
    fireEvent.click(screen.getByRole('tab', { name: /Subscriptions \(1\)/i }));
    expect(screen.getByText(/\+1 new scene/i)).toBeInTheDocument();

    // Switch to Collections tab & create a collection
    fireEvent.click(screen.getByRole('tab', { name: /Collections \(1\)/i }));
    expect(screen.getByText('Slow Burn Favorites')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Collection title/i), {
      target: { value: 'Mystery Shelf' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create Collection/i }));
    expect(onCreateCollection).toHaveBeenCalledWith({
      name: 'Mystery Shelf',
      description: '',
      isPrivate: true,
    });
  });

  it('supports anonymous kudos, hovering floating bar, 3-way display mode toggle, and hierarchical scene->chapter->story comments', async () => {
    const work = buildFixtureWorks()[0];
    let hasKudo = false;
    let kudosCount = work.kudosCount;
    let displayMode: StoryDisplayMode = 'scene';
    const comments: StoryComment[] = [
      {
        id: 'cmt-scene-1',
        storyId: work.id,
        authorUid: 'reader-1',
        authorName: 'Reader One',
        body: 'Scene 1 specific critique.',
        targetType: 'scene',
        targetId: work.turns[0].id,
        targetLabel: 'Scene 01 — The Ledger Behind the Tapestry',
        storyIsPrivate: false,
        createdAtMs: 1763400000000,
        updatedAtMs: 1763400000000,
      },
      {
        id: 'cmt-scene-1-sub',
        storyId: work.id,
        authorUid: 'reader-2',
        authorName: 'Sub Commenter',
        body: 'Nested reply on scene 1!',
        targetType: 'scene',
        targetId: work.turns[0].id,
        parentCommentId: 'cmt-scene-1',
        storyIsPrivate: false,
        createdAtMs: 1763400001000,
        updatedAtMs: 1763400001000,
      },
      {
        id: 'cmt-ch-1',
        storyId: work.id,
        authorUid: 'reader-3',
        authorName: 'Chapter Fan',
        body: 'Chapter 1 overall note.',
        targetType: 'chapter',
        targetId: 'ch-hp-1',
        targetLabel: 'Chapter 01 — The Tapestry Inquiry',
        storyIsPrivate: false,
        createdAtMs: 1763400002000,
        updatedAtMs: 1763400002000,
      },
      {
        id: 'cmt-story-top',
        storyId: work.id,
        authorUid: 'reader-4',
        authorName: 'Full Book Fan',
        body: 'Story-wide arc praise.',
        targetType: 'story',
        targetId: work.id,
        storyIsPrivate: false,
        createdAtMs: 1763400003000,
        updatedAtMs: 1763400003000,
      },
    ];

    const onGiveKudo = vi.fn(async () => {
      hasKudo = true;
      kudosCount += 1;
    });
    const onAddComment = vi.fn(async (_id, payload) => {
      comments.push({
        id: `cmt-${comments.length + 1}`,
        storyId: work.id,
        authorUid: 'anon_abc12345',
        authorName: payload.authorName || 'Tester',
        body: payload.body,
        targetType: payload.targetType,
        targetId: payload.targetId,
        parentCommentId: payload.parentCommentId,
        chapterOrSceneLabel: payload.chapterOrSceneLabel,
        storyIsPrivate: false,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      });
    });
    const onDeleteComment = vi.fn(async (_id, commentId) => {
      const idx = comments.findIndex((c) => c.id === commentId);
      if (idx >= 0) comments.splice(idx, 1);
    });

    const renderView = () => (
      <PublicStoryView
        story={{ ...work, kudosCount }}
        comments={[...comments]}
        hasGivenKudo={hasKudo}
        isSignedIn={false}
        currentReaderUid="anon_abc12345"
        currentReaderName="PenName"
        isOwner={false}
        displayMode={displayMode}
        onChangeDisplayMode={(m) => {
          displayMode = m;
        }}
        collections={[]}
        isSubscribed={false}
        onToggleSubscribe={() => {}}
        onToggleCollectionStory={() => {}}
        onQuickCreateCollection={() => {}}
        onBackToIndex={() => {}}
        onGiveKudo={onGiveKudo}
        onAddComment={onAddComment}
        onDeleteComment={onDeleteComment}
        onOpenInStudio={() => {}}
      />
    );

    const { rerender } = render(renderView());

    // Hovering overlay bar is present
    expect(screen.getByTestId('story-floating-bar')).toBeInTheDocument();

    // In Scene 1 view: sees scene comment + sub-comment, NOT chapter/story comments
    expect(screen.getByText('Scene 1 specific critique.')).toBeInTheDocument();
    expect(screen.getByText('Nested reply on scene 1!')).toBeInTheDocument();
    expect(screen.queryByText('Chapter 1 overall note.')).not.toBeInTheDocument();
    expect(screen.queryByText('Story-wide arc praise.')).not.toBeInTheDocument();

    // Switch to Chapters view -> rolls Scene 1 comments & sub-comments into Chapter 1
    displayMode = 'chapters';
    rerender(renderView());
    expect(screen.getByText('Scene 1 specific critique.')).toBeInTheDocument();
    expect(screen.getByText('Nested reply on scene 1!')).toBeInTheDocument();
    expect(screen.getByText('Chapter 1 overall note.')).toBeInTheDocument();
    expect(screen.queryByText('Story-wide arc praise.')).not.toBeInTheDocument();

    // Switch to Full Story view -> rolls story + chapter + scene comments & sub-comments together
    displayMode = 'story';
    rerender(renderView());
    expect(screen.getByText('Scene 1 specific critique.')).toBeInTheDocument();
    expect(screen.getByText('Nested reply on scene 1!')).toBeInTheDocument();
    expect(screen.getByText('Chapter 1 overall note.')).toBeInTheDocument();
    expect(screen.getByText('Story-wide arc praise.')).toBeInTheDocument();

    // Anonymous kudos works while signed out
    const kudoBtn = screen.getByTestId('give-kudos-btn');
    fireEvent.click(kudoBtn);
    await waitFor(() =>
      expect(onGiveKudo).toHaveBeenCalledWith(work.id, { anonymous: true }),
    );

    rerender(renderView());
    expect(screen.getByTestId('give-kudos-btn')).toBeDisabled();
    expect(screen.getByTestId('give-kudos-btn')).toHaveTextContent('Kudos Given');

    // Submit & delete own comment
    const commentBox = screen.getByLabelText(/Leave a Comment/i);
    fireEvent.change(commentBox, {
      target: { value: 'Loved the Marauder Map continuity detail!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Post Comment/i }));
    await waitFor(() =>
      expect(onAddComment).toHaveBeenCalledWith(
        work.id,
        expect.objectContaining({
          body: 'Loved the Marauder Map continuity detail!',
          targetType: 'story',
        }),
      ),
    );

    rerender(renderView());
    const deleteBtns = screen.getAllByRole('button', { name: /Delete/i });
    expect(deleteBtns.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(deleteBtns[0]);
    await waitFor(() => expect(onDeleteComment).toHaveBeenCalled());
  });

  it('edits privacy (isPrivate) and AO3 tags in StoryTagsModal', () => {
    const story = {
      ...UNIVERSE_TEMPLATES[0].starterProject,
      isPrivate: false,
      tags: normalizeStoryTags(UNIVERSE_TEMPLATES[0].starterProject.tags),
    };
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <StoryTagsModal
        isOpen
        story={story}
        onClose={onClose}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByText(/Private · Hidden from Index/i));
    fireEvent.change(screen.getByLabelText('Rating'), {
      target: { value: 'Mature' },
    });
    const freeformInput = screen.getByLabelText('Additional Tags');
    fireEvent.change(freeformInput, { target: { value: 'Hurt/Comfort' } });
    fireEvent.keyDown(freeformInput, { key: 'Enter', code: 'Enter' });

    fireEvent.click(screen.getByRole('button', { name: /Save Tags & Visibility/i }));

    expect(onSave).toHaveBeenCalledWith(
      story.id,
      expect.objectContaining({
        isPrivate: true,
        tags: expect.objectContaining({
          rating: 'Mature',
          freeforms: expect.arrayContaining(['Hurt/Comfort']),
        }),
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('renders story, chapter, and scene prefix/suffix author notes across display modes and preserves them on Branch in Studio', () => {
    const baseWork = buildFixtureWorks()[0];
    baseWork.prefixNote = 'Public story beginning note.';
    baseWork.suffixNote = 'Public story ending note.';
    baseWork.chapters[0].prefixNote = 'Public chapter 1 prefix note.';
    baseWork.chapters[0].suffixNote = 'Public chapter 1 suffix note.';
    baseWork.chapters[1].prefixNote = 'Public chapter 2 prefix note.';
    baseWork.turns[0].prefixNote = 'Public scene 1 prefix note.';
    baseWork.turns[0].suffixNote = 'Public scene 1 suffix note.';

    let displayMode: StoryDisplayMode = 'scene';
    const onOpenInStudio = vi.fn();

    const makeProps = () => ({
      story: baseWork,
      comments: [],
      hasGivenKudo: false,
      isSignedIn: false,
      currentReaderUid: 'anon_abc12345',
      currentReaderName: 'Reader',
      isOwner: false,
      displayMode,
      onChangeDisplayMode: (m: StoryDisplayMode) => {
        displayMode = m;
      },
      collections: [],
      isSubscribed: false,
      onToggleSubscribe: () => {},
      onToggleCollectionStory: () => {},
      onQuickCreateCollection: () => {},
      onBackToIndex: () => {},
      onGiveKudo: async () => {},
      onAddComment: async () => {},
      onDeleteComment: async () => {},
      onOpenInStudio,
    });

    const { rerender } = render(<PublicStoryView {...makeProps()} />);

    // Scene 1: sees story opener + scene 1 prefix/suffix, but NOT story ending yet (since scene 2 is last)
    expect(screen.getByText('Public story beginning note.')).toBeInTheDocument();
    expect(screen.getByText('Public scene 1 prefix note.')).toBeInTheDocument();
    expect(screen.getByText('Public scene 1 suffix note.')).toBeInTheDocument();
    expect(screen.queryByText('Public story ending note.')).not.toBeInTheDocument();

    // Chapters mode (Chapter 1): sees story opener, chapter 1 prefix/suffix, scene 1 notes
    displayMode = 'chapters';
    rerender(<PublicStoryView {...makeProps()} />);
    expect(screen.getByText('Public story beginning note.')).toBeInTheDocument();
    expect(screen.getByText('Public chapter 1 prefix note.')).toBeInTheDocument();
    expect(screen.getByText('Public chapter 1 suffix note.')).toBeInTheDocument();
    expect(screen.getByText('Public scene 1 prefix note.')).toBeInTheDocument();
    expect(screen.queryByText('Public story ending note.')).not.toBeInTheDocument();

    // Full story mode: sees all story, chapter, and scene prefix/suffix notes
    displayMode = 'story';
    rerender(<PublicStoryView {...makeProps()} />);
    expect(screen.getByText('Public story beginning note.')).toBeInTheDocument();
    expect(screen.getByText('Public story ending note.')).toBeInTheDocument();
    expect(screen.getByText('Public chapter 1 prefix note.')).toBeInTheDocument();
    expect(screen.getByText('Public chapter 1 suffix note.')).toBeInTheDocument();
    expect(screen.getByText('Public chapter 2 prefix note.')).toBeInTheDocument();
    expect(screen.getByText('Public scene 1 prefix note.')).toBeInTheDocument();
    expect(screen.getByText('Public scene 1 suffix note.')).toBeInTheDocument();

    // Branch in Studio preserves story/chapter/scene notes
    fireEvent.click(screen.getByRole('button', { name: /Branch in Studio/i }));
    expect(onOpenInStudio).toHaveBeenCalledWith(
      expect.objectContaining({
        prefixNote: 'Public story beginning note.',
        suffixNote: 'Public story ending note.',
        chapters: expect.arrayContaining([
          expect.objectContaining({
            prefixNote: 'Public chapter 1 prefix note.',
            suffixNote: 'Public chapter 1 suffix note.',
          }),
        ]),
        turns: expect.arrayContaining([
          expect.objectContaining({
            prefixNote: 'Public scene 1 prefix note.',
            suffixNote: 'Public scene 1 suffix note.',
          }),
        ]),
      }),
    );
  });
});
