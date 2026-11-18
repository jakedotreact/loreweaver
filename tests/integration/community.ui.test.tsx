// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LandingPage } from '../../src/components/LandingPage';
import { PublicStoryView } from '../../src/components/PublicStoryView';
import { StoryTagsModal } from '../../src/components/StoryTagsModal';
import { UNIVERSE_TEMPLATES } from '../../src/data/presets';
import { PublicStoryWork, StoryComment } from '../../src/types/story';
import { normalizeStoryTags } from '../../src/utils/ao3Tags';
import { storyProjectToPublicWork } from '../../src/utils/communityStore';

function buildFixtureWorks(): PublicStoryWork[] {
  const hp = storyProjectToPublicWork(UNIVERSE_TEMPLATES[0].starterProject, {
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

describe('Landing Page Story Index, AO3 Tags, Comments & Kudos UI Integration', () => {
  it('excludes stories marked isPrivate: true and filters Story Index when AO3 tags are clicked', () => {
    const works = buildFixtureWorks();
    const onOpenStory = vi.fn();

    render(
      <LandingPage
        stories={works}
        privateDraftCount={1}
        givenKudoStoryIds={new Set()}
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

    // Click an AO3 Relationship tag on the card to filter the index
    fireEvent.click(
      screen.getAllByRole('button', { name: /Paul Atreides & Lady Jessica/i })[0],
    );
    expect(screen.getByText('Shadows of the Salt Throne')).toBeInTheDocument();
    expect(screen.queryByText('The Umbridge Ledger')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Shadows of the Salt Throne' }));
    expect(onOpenStory).toHaveBeenCalledWith(works[1].id);
  });

  it('supports one-click kudos deduplication and threaded reader comments in PublicStoryView', async () => {
    const work = buildFixtureWorks()[0];
    let hasKudo = false;
    let kudosCount = work.kudosCount;
    const comments: StoryComment[] = [
      {
        id: 'cmt-1',
        storyId: work.id,
        authorUid: 'reader-1',
        authorName: 'Reader One',
        body: 'Fantastic opening intrigue.',
        storyIsPrivate: false,
        createdAtMs: 1763400000000,
        updatedAtMs: 1763400000000,
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
        authorUid: 'user-self',
        authorName: payload.authorName || 'Tester',
        body: payload.body,
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

    const { rerender } = render(
      <PublicStoryView
        story={{ ...work, kudosCount }}
        comments={[...comments]}
        hasGivenKudo={hasKudo}
        currentReaderUid="user-self"
        currentReaderName="Tester"
        isOwner={false}
        onBackToIndex={() => {}}
        onGiveKudo={onGiveKudo}
        onAddComment={onAddComment}
        onDeleteComment={onDeleteComment}
        onOpenInStudio={() => {}}
      />,
    );

    const kudoBtn = screen.getByTestId('give-kudos-btn');
    expect(kudoBtn).toHaveTextContent('Give Kudos');
    fireEvent.click(kudoBtn);
    await waitFor(() => expect(onGiveKudo).toHaveBeenCalledWith(work.id));

    rerender(
      <PublicStoryView
        story={{ ...work, kudosCount }}
        comments={[...comments]}
        hasGivenKudo={hasKudo}
        currentReaderUid="user-self"
        currentReaderName="Tester"
        isOwner={false}
        onBackToIndex={() => {}}
        onGiveKudo={onGiveKudo}
        onAddComment={onAddComment}
        onDeleteComment={onDeleteComment}
        onOpenInStudio={() => {}}
      />,
    );
    expect(screen.getByTestId('give-kudos-btn')).toBeDisabled();
    expect(screen.getByTestId('give-kudos-btn')).toHaveTextContent('Kudos Given');

    // Submit a new comment
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
        }),
      ),
    );

    // Reply to parent comment
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    const replyInput = screen.getByPlaceholderText(/Reply to Reader One/i);
    fireEvent.change(replyInput, { target: { value: 'Agreed completely!' } });
    fireEvent.click(screen.getByRole('button', { name: /Post Reply/i }));
    await waitFor(() =>
      expect(onAddComment).toHaveBeenCalledWith(
        work.id,
        expect.objectContaining({
          parentCommentId: 'cmt-1',
          body: 'Agreed completely!',
        }),
      ),
    );

    // Rerender with comments and delete own comment
    rerender(
      <PublicStoryView
        story={{ ...work, kudosCount }}
        comments={[...comments]}
        hasGivenKudo={hasKudo}
        currentReaderUid="user-self"
        currentReaderName="Tester"
        isOwner={false}
        onBackToIndex={() => {}}
        onGiveKudo={onGiveKudo}
        onAddComment={onAddComment}
        onDeleteComment={onDeleteComment}
        onOpenInStudio={() => {}}
      />,
    );

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

    // Toggle to Private
    fireEvent.click(screen.getByText(/Private · Hidden from Index/i));
    // Change rating
    fireEvent.change(screen.getByLabelText('Rating'), {
      target: { value: 'Mature' },
    });
    // Add an additional freeform tag
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
});
