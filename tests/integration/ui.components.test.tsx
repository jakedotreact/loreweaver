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
import { StoryWorkspace } from '../../src/components/StoryWorkspace';
import { UNIVERSE_TEMPLATES } from '../../src/data/presets';
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
      />,
    );

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
});
