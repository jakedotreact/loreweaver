import { fireEvent, render, screen } from '@testing-library/react';
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
    loadCloudStories: vi.fn(async () => []),
    syncStoryToCloud: vi.fn(async () => {}),
    deleteStoryFromCloud: vi.fn(async () => {}),
    clearAuthError: vi.fn(),
    clearSyncError: vi.fn(),
  }),
  formatReadableFirestoreError: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
}));

import { NewStoryModal } from '../../src/components/NewStoryModal';
import { StoryTagsModal } from '../../src/components/StoryTagsModal';
import { StoryWorkspace } from '../../src/components/StoryWorkspace';
import { StudioSettingsModal } from '../../src/components/StudioSettingsModal';
import { UNIVERSE_TEMPLATES } from '../../src/data/presets';
import { resetModalScrollLockForTests } from '../../src/hooks/useModalScrollLock';
import { NarrativeSpeechControls } from '../../src/hooks/useNarrativeSpeech';
import { ModelConfig, StoryProject } from '../../src/types/story';

const mockSpeech: NarrativeSpeechControls = {
  activeKey: null,
  activeLabel: null,
  activeAudioUrl: null,
  loadingKey: null,
  precomputingKey: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  voice: 'Charon',
  autoPlayOnReady: false,
  error: null,
  errorKey: null,
  togglePlay: vi.fn(async () => {}),
  precomputeItems: vi.fn(),
  precomputeAndMaybePlay: vi.fn(async () => {}),
  isItemReady: vi.fn(() => false),
  isItemPrecomputing: vi.fn(() => false),
  stop: vi.fn(),
  seek: vi.fn(),
  changeVoice: vi.fn(async () => {}),
  setPreferredVoice: vi.fn(),
  setAutoPlayOnReady: vi.fn(),
  hydrateAutoPlayOnReady: vi.fn(),
  clearError: vi.fn(),
};

const baseModelConfig: ModelConfig = {
  model: 'gemini-4-hydrogen',
  thinkingLevel: 'HIGH',
};

function makeTwoSceneStory(): StoryProject {
  const starter = JSON.parse(
    JSON.stringify(UNIVERSE_TEMPLATES[0].starterProject),
  ) as StoryProject;
  starter.id = 'story-alpha';
  starter.shareId = 'share-alpha';
  starter.collabId = 'collab-alpha';
  starter.turns.push({
    id: 'turn-2',
    turnNumber: 2,
    sceneTitle: 'Sunken Observatory Dispatch',
    location: 'Meridian Dome',
    inStoryTime: 'Dusk',
    activeCharacters: ['Archivist Lin'],
    userAction: 'Decode the brass astrolabe.',
    prose: ['Stardust flickered inside the cracked lens of the astrolabe.'],
    continuityNotes: [],
    continuityWarning: null,
    selectedChoiceId: null,
    timestamp: 1700000000000,
    choices: [],
  });
  return starter;
}

describe('StoryWorkspace and NewStoryModal dual-link UI integration', () => {
  it('renders both Share Link and Collaborate Link buttons on StoryWorkspace and filters turns by query', () => {
    const story = makeTwoSceneStory();
    const onShareStory = vi.fn();
    const onCollaborateStory = vi.fn();

    render(
      <StoryWorkspace
        project={story}
        storyCount={2}
        onOpenStoriesLibrary={vi.fn()}
        isAdvancing={false}
        pendingPrompt={null}
        advanceError={null}
        lastFailedAction={null}
        onAdvanceStory={vi.fn()}
        onRetryAdvance={vi.fn()}
        onDismissAdvanceError={vi.fn()}
        onBranchFromTurn={vi.fn()}
        onCreateSavePoint={vi.fn()}
        onRestoreSavePoint={vi.fn()}
        onNavigateTab={vi.fn()}
        onRunAuditAndOpen={vi.fn()}
        onOpenHtmlExport={vi.fn()}
        onCorrectTurn={vi.fn()}
        onUpdateTurnIllustration={vi.fn()}
        isRewritingScene={false}
        rewriteError={null}
        onRewriteTurn={vi.fn(async () => true)}
        modelConfig={baseModelConfig}
        onChangeModelConfig={vi.fn()}
        speech={mockSpeech}
        onPersistNow={vi.fn(async () => ({
          ok: true,
          location: 'local' as const,
          message: 'Saved locally',
        }))}
        onShareStory={onShareStory}
        onCollaborateStory={onCollaborateStory}
        onShareScene={vi.fn()}
        displayMode="story"
        onChangeDisplayMode={vi.fn()}
        publicStoryId="pub-alpha"
        storyComments={[]}
        currentReaderUid="anon_testreader1"
        currentReaderName="Tester"
        onAddComment={vi.fn()}
        onDeleteComment={vi.fn()}
        collections={[]}
        isSubscribed={false}
        onToggleSubscribe={vi.fn()}
        onToggleCollectionStory={vi.fn()}
        onQuickCreateCollection={vi.fn()}
      />,
    );

    // Hovering storywide menu overlay is present
    expect(screen.getByTestId('story-floating-bar')).toBeInTheDocument();

    // Masthead exposes both links explicitly
    const shareButtons = screen.getAllByRole('button', {
      name: /^(Share Link|Share Link Ready)$/i,
    });
    const collabButtons = screen.getAllByRole('button', {
      name: /^(Collaborate Link|Collab Link Ready)$/i,
    });
    expect(shareButtons.length).toBeGreaterThanOrEqual(1);
    expect(collabButtons.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(shareButtons[0]);
    expect(onShareStory).toHaveBeenCalledTimes(1);

    fireEvent.click(collabButtons[0]);
    expect(onCollaborateStory).toHaveBeenCalledTimes(1);

    // Search bar filters down to Scene 02 ("astrolabe")
    const searchInput = screen.getByPlaceholderText(
      /Search scenes by number \(#2\)/i,
    );
    fireEvent.change(searchInput, { target: { value: 'astrolabe' } });
    expect(screen.getByText(/1 of 2 scenes match/i)).toBeInTheDocument();
  });

  it('exposes both Share Link and Collab Link for every story in NewStoryModal library', () => {
    const story1 = makeTwoSceneStory();
    const story2: StoryProject = {
      ...JSON.parse(JSON.stringify(UNIVERSE_TEMPLATES[1].starterProject)),
      id: 'story-beta',
      title: 'Second Chronicle',
      updatedAt: Date.now() - 5000,
    };

    const onShareStory = vi.fn();
    const onCollaborateStory = vi.fn();

    render(
      <NewStoryModal
        isOpen={true}
        initialMode="library"
        onClose={vi.fn()}
        onLoadProject={vi.fn()}
        stories={[story1, story2]}
        activeStoryId={story1.id}
        onSelectStory={vi.fn()}
        onDeleteStory={vi.fn()}
        onShareStory={onShareStory}
        onCollaborateStory={onCollaborateStory}
        modelConfig={baseModelConfig}
        onChangeModelConfig={vi.fn()}
      />,
    );

    const shareBtns = screen.getAllByRole('button', { name: /^Share link for /i });
    const collabBtns = screen.getAllByRole('button', {
      name: /^Collaboration link for /i,
    });
    expect(shareBtns).toHaveLength(2);
    expect(collabBtns).toHaveLength(2);

    fireEvent.click(shareBtns[1]);
    expect(onShareStory).toHaveBeenCalledWith(story2);

    fireEvent.click(collabBtns[0]);
    expect(onCollaborateStory).toHaveBeenCalledWith(story1);
  });

  it('imports a story from URL via NewStoryModal Import tab and opens preview in Studio', async () => {
    const importedStub = makeTwoSceneStory();
    importedStub.id = 'proj-imported-1';
    importedStub.title = 'Harbor of Glass';
    importedStub.isPrivate = true;

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          project: importedStub,
          stats: {
            format: 'html',
            sourceName: 'harbor',
            wordCount: 420,
            chapterCount: 1,
            sceneCount: 2,
            characterCount: 3,
            crossIndexCount: 2,
            aiEnriched: false,
          },
          warnings: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const onLoadProject = vi.fn();
    const onClose = vi.fn();

    render(
      <NewStoryModal
        isOpen={true}
        initialMode="import"
        onClose={onClose}
        onLoadProject={onLoadProject}
        stories={[makeTwoSceneStory()]}
        activeStoryId="story-alpha"
        onSelectStory={vi.fn()}
        onDeleteStory={vi.fn()}
        modelConfig={baseModelConfig}
        onChangeModelConfig={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: /Import from URL/i }));
    const urlInput = screen.getByLabelText(/Story Web Page or Document URL/i);
    fireEvent.change(urlInput, {
      target: { value: 'https://example.org/stories/harbor-of-glass' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Parse & Preview Story/i }));

    expect(
      await screen.findByText(/Review Imported Manuscript/i),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('Harbor of Glass')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /Open Imported Story in Studio/i }),
    );
    expect(onLoadProject).toHaveBeenCalledTimes(1);
    expect(onLoadProject.mock.calls[0][0].title).toBe('Harbor of Glass');
    expect(onClose).toHaveBeenCalledTimes(1);

    fetchSpy.mockRestore();
  });

  it('renders and edits story, chapter, and scene prefix and suffix author notes in StoryWorkspace', () => {
    const story = makeTwoSceneStory();
    story.prefixNote = 'Story opening author note.';
    story.suffixNote = 'Story closing author note.';
    story.turns[0].prefixNote = 'Scene 1 prefix note.';
    story.turns[0].suffixNote = 'Scene 1 suffix note.';
    story.chapters = [
      {
        id: 'chap-1',
        chapterNumber: 1,
        title: 'Part One',
        summary: 'Opening chapter',
        prefixNote: 'Chapter 1 prefix note.',
        suffixNote: 'Chapter 1 suffix note.',
        turnIds: [story.turns[0].id, story.turns[1].id],
        mergedAt: 1000,
      },
    ];

    const onUpdateStoryNotes = vi.fn();
    const onUpdateChapters = vi.fn();
    const onCorrectTurn = vi.fn();

    const commonProps = {
      project: story,
      storyCount: 1,
      onOpenStoriesLibrary: vi.fn(),
      isAdvancing: false,
      pendingPrompt: null,
      advanceError: null,
      lastFailedAction: null,
      onAdvanceStory: vi.fn(),
      onRetryAdvance: vi.fn(),
      onDismissAdvanceError: vi.fn(),
      onBranchFromTurn: vi.fn(),
      onCreateSavePoint: vi.fn(),
      onRestoreSavePoint: vi.fn(),
      onNavigateTab: vi.fn(),
      onRunAuditAndOpen: vi.fn(),
      onOpenHtmlExport: vi.fn(),
      onCorrectTurn,
      onUpdateTurnIllustration: vi.fn(),
      isRewritingScene: false,
      rewriteError: null,
      onRewriteTurn: vi.fn(async () => true),
      modelConfig: baseModelConfig,
      onChangeModelConfig: vi.fn(),
      speech: mockSpeech,
      onPersistNow: vi.fn(async () => ({
        ok: true,
        location: 'local' as const,
        message: 'Saved locally',
      })),
      onShareStory: vi.fn(),
      onCollaborateStory: vi.fn(),
      onShareScene: vi.fn(),
      onUpdateStoryNotes,
      onUpdateChapters,
      onChangeDisplayMode: vi.fn(),
      publicStoryId: 'pub-alpha',
      storyComments: [],
      currentReaderUid: 'anon_testreader1',
      currentReaderName: 'Tester',
      onAddComment: vi.fn(),
      onDeleteComment: vi.fn(),
      collections: [],
      isSubscribed: false,
      onToggleSubscribe: vi.fn(),
      onToggleCollectionStory: vi.fn(),
      onQuickCreateCollection: vi.fn(),
    };

    const { rerender } = render(
      <StoryWorkspace {...commonProps} displayMode="story" />,
    );

    // Renders story, chapter, and scene prefix/suffix notes
    expect(screen.getByText('Story opening author note.')).toBeInTheDocument();
    expect(screen.getByText('Story closing author note.')).toBeInTheDocument();
    expect(screen.getByText('Chapter 1 prefix note.')).toBeInTheDocument();
    expect(screen.getByText('Chapter 1 suffix note.')).toBeInTheDocument();
    expect(screen.getByText('Scene 1 prefix note.')).toBeInTheDocument();
    expect(screen.getByText('Scene 1 suffix note.')).toBeInTheDocument();

    // Scene 1 prefix appears before prose, and suffix appears after prose
    const scenePrefixEl = screen.getByText('Scene 1 prefix note.');
    const sceneProseEl = screen.getByText(story.turns[0].prose[0]);
    const sceneSuffixEl = screen.getByText('Scene 1 suffix note.');
    expect(
      scenePrefixEl.compareDocumentPosition(sceneProseEl) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      sceneProseEl.compareDocumentPosition(sceneSuffixEl) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Edit Story Author Notes
    fireEvent.click(screen.getByTestId('story-author-notes-btn'));
    fireEvent.change(screen.getByLabelText(/Beginning Author's Note \(Prefix\)/i), {
      target: { value: 'Updated story opener.' },
    });
    fireEvent.change(screen.getByLabelText(/Ending Author's Note \(Suffix\)/i), {
      target: { value: 'Updated story ending.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Story Notes/i }));
    expect(onUpdateStoryNotes).toHaveBeenCalledWith({
      prefixNote: 'Updated story opener.',
      suffixNote: 'Updated story ending.',
    });

    // Edit Scene 1 prefix & suffix notes via SceneInlineEditor
    fireEvent.click(
      screen.getByRole('button', { name: /Edit scene 1 prompt or output/i }),
    );
    fireEvent.change(
      screen.getByLabelText(/Beginning Author's Note \(Prefix, optional\)/i),
      { target: { value: 'Revised scene 1 prefix.' } },
    );
    fireEvent.change(
      screen.getByLabelText(/Ending Author's Note \(Suffix, optional\)/i),
      { target: { value: 'Revised scene 1 suffix.' } },
    );
    fireEvent.click(screen.getAllByRole('button', { name: /Save Changes/i })[0]);
    expect(onCorrectTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        id: story.turns[0].id,
        prefixNote: 'Revised scene 1 prefix.',
        suffixNote: 'Revised scene 1 suffix.',
      }),
    );

    // Switch to Chapters mode and edit Chapter Author Notes
    rerender(<StoryWorkspace {...commonProps} displayMode="chapters" />);
    fireEvent.click(screen.getByRole('button', { name: /Chapter Notes/i }));
    fireEvent.change(screen.getByLabelText(/Chapter Beginning Note \(Prefix\)/i), {
      target: { value: 'Revised chapter 1 prefix.' },
    });
    fireEvent.change(screen.getByLabelText(/Chapter Ending Note \(Suffix\)/i), {
      target: { value: 'Revised chapter 1 suffix.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Chapter Notes/i }));
    expect(onUpdateChapters).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'chap-1',
        prefixNote: 'Revised chapter 1 prefix.',
        suffixNote: 'Revised chapter 1 suffix.',
      }),
    ]);
  });

  it('locks background window scrolling and isolates scroll inside open modal dialogs', () => {
    resetModalScrollLockForTests();
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    const story = makeTwoSceneStory();

    const { rerender, unmount } = render(
      <StoryTagsModal
        isOpen={true}
        story={story}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const tagsDialog = screen.getByRole('dialog');
    expect(tagsDialog).toHaveClass('overflow-hidden', 'overscroll-contain');
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.style.overscrollBehavior).toBe('none');

    const scrollableForm = tagsDialog.querySelector('form');
    expect(scrollableForm).toHaveClass(
      'overflow-y-auto',
      'overscroll-contain',
      'flex-1',
      'min-h-0',
    );

    // Stacked modal keeps background locked until both close
    const settingsRender = render(
      <StudioSettingsModal
        isOpen={true}
        onClose={vi.fn()}
        modelConfig={baseModelConfig}
        onChangeModelConfig={vi.fn()}
        preferredVoice="Charon"
        onChangeVoice={vi.fn()}
        autoPlayNarration={false}
        onChangeAutoPlayNarration={vi.fn()}
        onOpenAccountSettings={vi.fn()}
      />,
    );

    rerender(
      <StoryTagsModal
        isOpen={false}
        story={story}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(document.body.style.overflow).toBe('hidden');

    settingsRender.unmount();
    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
    unmount();
  });
});

