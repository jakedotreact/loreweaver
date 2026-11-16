import { useEffect, useState } from 'react';
import { ChaptersView } from './components/ChaptersView';
import { CharactersView } from './components/CharactersView';
import { CrossIndexView } from './components/CrossIndexView';
import { HtmlExportModal } from './components/HtmlExportModal';
import { NewStoryModal, NewStoryModalMode } from './components/NewStoryModal';
import { SavePointsView } from './components/SavePointsView';
import { RewriteCorrectionPayload } from './components/SceneCorrectionModal';
import { StoryWorkspace } from './components/StoryWorkspace';
import { TopNav, WorkspaceTab } from './components/TopNav';
import { UNIVERSE_TEMPLATES } from './data/presets';
import { useNarrativeSpeech } from './hooks/useNarrativeSpeech';
import { postJson } from './utils/api';
import {
  CharacterProfile,
  ContinuityAuditReport,
  CrossIndexEntry,
  ModelConfig,
  SavePoint,
  StoryChapter,
  StoryProject,
  StorySnapshot,
  StoryTurn,
} from './types/story';

const LEGACY_STORAGE_KEY = 'folio-canon-active-project-v1';
const LIBRARY_STORAGE_KEY = 'folio-canon-stories-v1';
const ACTIVE_STORY_ID_KEY = 'folio-canon-active-story-id-v1';
const MODEL_CONFIG_KEY = 'folio-canon-model-config-v1';

function loadInitialModelConfig(): ModelConfig {
  try {
    const raw = localStorage.getItem(MODEL_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ModelConfig;
      if (
        parsed &&
        (parsed.model === 'gemini-4-hydrogen' || parsed.model === 'gemini-3.1-flash-lite')
      ) {
        return parsed;
      }
    }
  } catch {
    // Fallback to default model config
  }
  return { model: 'gemini-4-hydrogen', thinkingLevel: 'HIGH' };
}

function isValidProject(candidate: unknown): candidate is StoryProject {
  if (!candidate || typeof candidate !== 'object') return false;
  const p = candidate as Partial<StoryProject>;
  return Boolean(
    p.title &&
      Array.isArray(p.turns) &&
      p.turns.length > 0 &&
      Array.isArray(p.characters) &&
      Array.isArray(p.crossIndex),
  );
}

function normalizeProject(raw: StoryProject, usedIds?: Set<string>): StoryProject {
  let id =
    typeof raw.id === 'string' && raw.id.trim()
      ? raw.id.trim()
      : `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  if (usedIds) {
    while (usedIds.has(id)) {
      id = `${id}-${Math.random().toString(36).slice(2, 6)}`;
    }
    usedIds.add(id);
  }
  return {
    ...raw,
    id,
    chapters: raw.chapters ?? [],
    savePoints: raw.savePoints ?? [],
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  };
}

function loadInitialLibrary(): { stories: StoryProject[]; activeId: string } {
  const usedIds = new Set<string>();
  try {
    const rawLibrary = localStorage.getItem(LIBRARY_STORAGE_KEY);
    if (rawLibrary) {
      const parsedList = JSON.parse(rawLibrary) as unknown;
      if (Array.isArray(parsedList)) {
        const valid = parsedList
          .filter(isValidProject)
          .map((p) => normalizeProject(p, usedIds));
        if (valid.length > 0) {
          const savedActiveId = localStorage.getItem(ACTIVE_STORY_ID_KEY);
          const matched = valid.find((s) => s.id === savedActiveId);
          return {
            stories: valid,
            activeId: matched ? matched.id : valid[0].id,
          };
        }
      }
    }
  } catch {
    // Fall back to legacy single-story storage or starter preset
  }

  try {
    const rawLegacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (rawLegacy) {
      const parsed = JSON.parse(rawLegacy) as unknown;
      if (isValidProject(parsed)) {
        const migrated = normalizeProject(parsed, usedIds);
        return { stories: [migrated], activeId: migrated.id };
      }
    }
  } catch {
    // Fallback to starter template
  }

  const starter = normalizeProject(
    JSON.parse(JSON.stringify(UNIVERSE_TEMPLATES[0].starterProject)) as StoryProject,
    usedIds,
  );
  return { stories: [starter], activeId: starter.id };
}

function extractSnapshot(project: StoryProject): StorySnapshot {
  return {
    title: project.title,
    universe: project.universe,
    setting: project.setting,
    tone: project.tone,
    premise: project.premise,
    protagonistId: project.protagonistId,
    turns: JSON.parse(JSON.stringify(project.turns)),
    characters: JSON.parse(JSON.stringify(project.characters)),
    crossIndex: JSON.parse(JSON.stringify(project.crossIndex)),
    chapters: JSON.parse(JSON.stringify(project.chapters ?? [])),
  };
}

export default function App() {
  const [library, setLibrary] = useState<{ stories: StoryProject[]; activeId: string }>(
    loadInitialLibrary,
  );
  const project =
    library.stories.find((s) => s.id === library.activeId) ?? library.stories[0];

  const [modelConfig, setModelConfig] = useState<ModelConfig>(loadInitialModelConfig);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('story');
  const [isNewStoryOpen, setIsNewStoryOpen] = useState(false);
  const [newStoryInitialMode, setNewStoryInitialMode] =
    useState<NewStoryModalMode>('presets');
  const speech = useNarrativeSpeech();

  const [htmlExportOpen, setHtmlExportOpen] = useState(false);
  const [htmlExportChapterId, setHtmlExportChapterId] = useState<string | undefined>(undefined);

  const [isAdvancing, setIsAdvancing] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const [lastFailedAction, setLastFailedAction] = useState<{
    userAction: string;
    selectedChoiceId: string | null;
  } | null>(null);

  const [isRewritingScene, setIsRewritingScene] = useState(false);
  const [rewriteError, setRewriteError] = useState<string | null>(null);

  const [auditReport, setAuditReport] = useState<ContinuityAuditReport | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(library.stories));
      localStorage.setItem(ACTIVE_STORY_ID_KEY, library.activeId);
    } catch {
      // Ignore storage quota errors gracefully; ensure active story is still persisted
      try {
        const active =
          library.stories.find((s) => s.id === library.activeId) ?? library.stories[0];
        if (active) {
          localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(active));
        }
      } catch {
        // Ignore fallback quota error
      }
    }
  }, [library]);

  useEffect(() => {
    try {
      localStorage.setItem(MODEL_CONFIG_KEY, JSON.stringify(modelConfig));
    } catch {
      // Ignore storage quota errors gracefully
    }
  }, [modelConfig]);

  const updateProjectById = (
    targetId: string,
    updater: (prev: StoryProject) => StoryProject,
  ) => {
    setLibrary((prev) => ({
      ...prev,
      stories: prev.stories.map((s) => (s.id === targetId ? updater(s) : s)),
    }));
  };

  const handleOpenNewStoryModal = (initialMode: NewStoryModalMode = 'presets') => {
    setNewStoryInitialMode(initialMode);
    setIsNewStoryOpen(true);
  };

  const handleOpenHtmlExport = (chapterId?: string) => {
    setHtmlExportChapterId(chapterId);
    setHtmlExportOpen(true);
  };

  const handleCreateSavePoint = (label: string, sourceProject?: StoryProject) => {
    const target = sourceProject ?? project;
    const latestTurn = target.turns[target.turns.length - 1];
    const savePoint: SavePoint = {
      id: `sp-${Date.now()}`,
      label,
      createdAt: Date.now(),
      turnNumber: latestTurn?.turnNumber ?? 1,
      sceneTitle: latestTurn?.sceneTitle ?? 'Checkpoint',
      snapshot: extractSnapshot(target),
    };

    updateProjectById(target.id, (prev) => ({
      ...prev,
      savePoints: [savePoint, ...prev.savePoints],
      updatedAt: Date.now(),
    }));
  };

  const handleRestoreSavePoint = (saveId: string) => {
    const target = project.savePoints.find((sp) => sp.id === saveId);
    if (!target) return;
    const restored: StorySnapshot = JSON.parse(JSON.stringify(target.snapshot));
    updateProjectById(project.id, (prev) => ({
      ...prev,
      ...restored,
      chapters: restored.chapters ?? [],
      updatedAt: Date.now(),
    }));
    setAuditReport(null);
    setAdvanceError(null);
    setLastFailedAction(null);
    setActiveTab('story');
  };

  const handleDeleteSavePoint = (saveId: string) => {
    updateProjectById(project.id, (prev) => ({
      ...prev,
      savePoints: prev.savePoints.filter((sp) => sp.id !== saveId),
      updatedAt: Date.now(),
    }));
  };

  const handleAdvanceStory = async (userAction: string, selectedChoiceId: string | null) => {
    const targetProjectId = project.id;
    setAdvanceError(null);
    setLastFailedAction(null);
    setPendingPrompt(userAction);
    setIsAdvancing(true);

    try {
      const snapshot = extractSnapshot(project);
      const data = await postJson<{
        nextTurn: StoryTurn;
        updatedCharacters: CharacterProfile[];
        updatedCrossIndex: CrossIndexEntry[];
      }>('/api/story/advance', {
        snapshot,
        userAction,
        selectedChoiceId,
        modelConfig,
      });

      updateProjectById(targetProjectId, (prev) => {
        const updatedTurns = prev.turns.map((t, idx) =>
          idx === prev.turns.length - 1
            ? { ...t, selectedChoiceId }
            : t,
        );
        return {
          ...prev,
          turns: [...updatedTurns, data.nextTurn],
          characters: data.updatedCharacters,
          crossIndex: data.updatedCrossIndex,
          updatedAt: Date.now(),
        };
      });
      setLastFailedAction(null);
      setAuditReport(null);
    } catch (err) {
      setLastFailedAction({ userAction, selectedChoiceId });
      setAdvanceError(
        err instanceof Error ? err.message : 'Unable to generate next scene.',
      );
    } finally {
      setIsAdvancing(false);
      setPendingPrompt(null);
    }
  };

  const handleRetryAdvance = () => {
    if (!lastFailedAction || isAdvancing) return;
    void handleAdvanceStory(
      lastFailedAction.userAction,
      lastFailedAction.selectedChoiceId,
    );
  };

  const handleDismissAdvanceError = () => {
    setAdvanceError(null);
    setLastFailedAction(null);
  };

  const handleBranchFromTurn = (turnNumber: number) => {
    const latestTurn = project.turns[project.turns.length - 1];
    if (!latestTurn || turnNumber >= latestTurn.turnNumber) return;

    const autoSave: SavePoint = {
      id: `sp-auto-${Date.now()}`,
      label: `Auto-backup before branching from Scene ${String(turnNumber).padStart(2, '0')}`,
      createdAt: Date.now(),
      turnNumber: latestTurn.turnNumber,
      sceneTitle: latestTurn.sceneTitle,
      snapshot: extractSnapshot(project),
    };

    const truncatedTurns = project.turns
      .filter((t) => t.turnNumber <= turnNumber)
      .map((t, idx, arr) =>
        idx === arr.length - 1 ? { ...t, selectedChoiceId: null } : t,
      );

    const remainingTurnIds = new Set(truncatedTurns.map((t) => t.id));
    const trimmedChapters = (project.chapters ?? [])
      .map((ch) => ({
        ...ch,
        turnIds: ch.turnIds.filter((id) => remainingTurnIds.has(id)),
      }))
      .filter((ch) => ch.turnIds.length > 0)
      .map((ch, idx) => ({ ...ch, chapterNumber: idx + 1 }));

    const trimmedCrossIndex = project.crossIndex.filter(
      (entry) => entry.introducedAtTurn <= turnNumber,
    );

    updateProjectById(project.id, (prev) => ({
      ...prev,
      turns: truncatedTurns,
      chapters: trimmedChapters,
      crossIndex: trimmedCrossIndex,
      savePoints: [autoSave, ...prev.savePoints],
      updatedAt: Date.now(),
    }));
    setAuditReport(null);
    setAdvanceError(null);
    setLastFailedAction(null);
  };

  const handleUpdateChapters = (chapters: StoryChapter[]) => {
    updateProjectById(project.id, (prev) => ({
      ...prev,
      chapters,
      updatedAt: Date.now(),
    }));
  };

  const handleCorrectTurn = (
    updatedTurn: StoryTurn,
    newLoreCorrection?: Omit<CrossIndexEntry, 'id'>,
  ) => {
    updateProjectById(project.id, (prev) => {
      const nextTurns = prev.turns.map((t) =>
        t.id === updatedTurn.id ? updatedTurn : t,
      );
      const nextCrossIndex = newLoreCorrection
        ? [{ id: `ci-${Date.now()}`, ...newLoreCorrection }, ...prev.crossIndex]
        : prev.crossIndex;
      return {
        ...prev,
        turns: nextTurns,
        crossIndex: nextCrossIndex,
        updatedAt: Date.now(),
      };
    });
    setAuditReport(null);
  };

  const handleRewriteTurn = async (
    payload: RewriteCorrectionPayload,
  ): Promise<boolean> => {
    const targetProjectId = project.id;
    setRewriteError(null);
    setIsRewritingScene(true);
    try {
      const snapshot = extractSnapshot(project);
      const data = await postJson<{
        rewrittenTurn: StoryTurn;
        updatedCharacters?: CharacterProfile[];
        updatedCrossIndex?: CrossIndexEntry[];
      }>('/api/story/rewrite-scene', {
        snapshot,
        targetTurnId: payload.targetTurnId,
        correctionInstruction: payload.correctionInstruction,
        editedFields: payload.editedFields,
        newLoreCorrection: payload.newLoreCorrection,
        modelConfig,
      });

      updateProjectById(targetProjectId, (prev) => ({
        ...prev,
        turns: prev.turns.map((t) =>
          t.id === data.rewrittenTurn.id ? data.rewrittenTurn : t,
        ),
        characters: data.updatedCharacters ?? prev.characters,
        crossIndex: data.updatedCrossIndex ?? prev.crossIndex,
        updatedAt: Date.now(),
      }));
      setAuditReport(null);
      return true;
    } catch (err) {
      setRewriteError(
        err instanceof Error
          ? err.message
          : 'Unable to rewrite scene retroactively.',
      );
      return false;
    } finally {
      setIsRewritingScene(false);
    }
  };

  const handleUpsertCharacter = (character: CharacterProfile) => {
    updateProjectById(project.id, (prev) => {
      const exists = prev.characters.some((c) => c.id === character.id);
      const nextCharacters = exists
        ? prev.characters.map((c) => (c.id === character.id ? character : c))
        : [...prev.characters, character];
      return {
        ...prev,
        characters: nextCharacters,
        updatedAt: Date.now(),
      };
    });
  };

  const handleDeleteCharacter = (characterId: string) => {
    updateProjectById(project.id, (prev) => ({
      ...prev,
      characters: prev.characters.filter((c) => c.id !== characterId),
      updatedAt: Date.now(),
    }));
  };

  const handleUpsertCrossIndex = (entry: CrossIndexEntry) => {
    updateProjectById(project.id, (prev) => {
      const exists = prev.crossIndex.some((e) => e.id === entry.id);
      const nextEntries = exists
        ? prev.crossIndex.map((e) => (e.id === entry.id ? entry : e))
        : [entry, ...prev.crossIndex];
      return {
        ...prev,
        crossIndex: nextEntries,
        updatedAt: Date.now(),
      };
    });
  };

  const handleDeleteCrossIndex = (entryId: string) => {
    updateProjectById(project.id, (prev) => ({
      ...prev,
      crossIndex: prev.crossIndex.filter((e) => e.id !== entryId),
      updatedAt: Date.now(),
    }));
  };

  const handleTogglePinCrossIndex = (entryId: string) => {
    updateProjectById(project.id, (prev) => ({
      ...prev,
      crossIndex: prev.crossIndex.map((e) =>
        e.id === entryId ? { ...e, pinned: !e.pinned } : e,
      ),
      updatedAt: Date.now(),
    }));
  };

  const handleRunAudit = async () => {
    setIsAuditing(true);
    try {
      const data = await postJson<{ report: ContinuityAuditReport }>(
        '/api/story/audit',
        { snapshot: extractSnapshot(project), modelConfig },
      );
      setAuditReport(data.report);
    } catch (err) {
      setAuditReport({
        checkedAt: Date.now(),
        summary:
          err instanceof Error ? err.message : 'Unable to complete continuity audit.',
        findings: [],
      });
    } finally {
      setIsAuditing(false);
    }
  };

  const handleRunAuditAndOpen = () => {
    setActiveTab('cross-index');
    handleRunAudit();
  };

  const handleLoadNewProject = (newProj: StoryProject) => {
    speech.stop();
    setLibrary((prev) => {
      const usedIds = new Set(prev.stories.map((s) => s.id));
      const normalized = normalizeProject(newProj, usedIds);
      return {
        stories: [normalized, ...prev.stories],
        activeId: normalized.id,
      };
    });
    setAuditReport(null);
    setAdvanceError(null);
    setLastFailedAction(null);
    setRewriteError(null);
    setActiveTab('story');
  };

  const handleSelectStory = (storyId: string) => {
    if (storyId === project.id) {
      setActiveTab('story');
      return;
    }
    speech.stop();
    setLibrary((prev) => {
      const exists = prev.stories.some((s) => s.id === storyId);
      if (!exists) return prev;
      return {
        ...prev,
        activeId: storyId,
      };
    });
    setAuditReport(null);
    setAdvanceError(null);
    setLastFailedAction(null);
    setRewriteError(null);
    setActiveTab('story');
  };

  const handleDeleteStory = (storyId: string) => {
    setLibrary((prev) => {
      if (prev.stories.length <= 1) return prev;
      const remaining = prev.stories.filter((s) => s.id !== storyId);
      if (remaining.length === 0) return prev;
      const deletingActive = prev.activeId === storyId;
      if (deletingActive) {
        speech.stop();
      }
      return {
        stories: remaining,
        activeId: deletingActive ? remaining[0].id : prev.activeId,
      };
    });
    if (storyId === project.id) {
      setAuditReport(null);
      setAdvanceError(null);
      setLastFailedAction(null);
      setRewriteError(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FA] text-[#111827]">
      <TopNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenNewStory={() => handleOpenNewStoryModal('presets')}
      />

      <div className="flex-1">
        {activeTab === 'story' && (
          <StoryWorkspace
            project={project}
            storyCount={library.stories.length}
            onOpenStoriesLibrary={() => handleOpenNewStoryModal('library')}
            isAdvancing={isAdvancing}
            pendingPrompt={pendingPrompt}
            advanceError={advanceError}
            lastFailedAction={lastFailedAction}
            onAdvanceStory={handleAdvanceStory}
            onRetryAdvance={handleRetryAdvance}
            onDismissAdvanceError={handleDismissAdvanceError}
            onBranchFromTurn={handleBranchFromTurn}
            onCreateSavePoint={(label) => handleCreateSavePoint(label)}
            onRestoreSavePoint={handleRestoreSavePoint}
            onNavigateTab={setActiveTab}
            onRunAuditAndOpen={handleRunAuditAndOpen}
            onOpenHtmlExport={() => handleOpenHtmlExport()}
            onCorrectTurn={handleCorrectTurn}
            isRewritingScene={isRewritingScene}
            rewriteError={rewriteError}
            onRewriteTurn={handleRewriteTurn}
            modelConfig={modelConfig}
            onChangeModelConfig={setModelConfig}
            speech={speech}
          />
        )}

        {activeTab === 'chapters' && (
          <ChaptersView
            project={project}
            onUpdateChapters={handleUpdateChapters}
            onOpenHtmlExport={handleOpenHtmlExport}
            onOpenCrossIndex={() => setActiveTab('cross-index')}
            speech={speech}
          />
        )}

        {activeTab === 'characters' && (
          <CharactersView
            project={project}
            modelConfig={modelConfig}
            onUpsertCharacter={handleUpsertCharacter}
            onDeleteCharacter={handleDeleteCharacter}
          />
        )}

        {activeTab === 'cross-index' && (
          <CrossIndexView
            project={project}
            auditReport={auditReport}
            isAuditing={isAuditing}
            onRunAudit={handleRunAudit}
            onUpsertEntry={handleUpsertCrossIndex}
            onDeleteEntry={handleDeleteCrossIndex}
            onTogglePin={handleTogglePinCrossIndex}
          />
        )}

        {activeTab === 'save-points' && (
          <SavePointsView
            project={project}
            onCreateSavePoint={(label) => handleCreateSavePoint(label)}
            onRestoreSavePoint={handleRestoreSavePoint}
            onDeleteSavePoint={handleDeleteSavePoint}
            onImportProject={handleLoadNewProject}
            onOpenHtmlExport={() => handleOpenHtmlExport()}
          />
        )}
      </div>

      <NewStoryModal
        isOpen={isNewStoryOpen}
        initialMode={newStoryInitialMode}
        onClose={() => setIsNewStoryOpen(false)}
        onLoadProject={handleLoadNewProject}
        stories={library.stories}
        activeStoryId={project.id}
        onSelectStory={handleSelectStory}
        onDeleteStory={handleDeleteStory}
        modelConfig={modelConfig}
        onChangeModelConfig={setModelConfig}
      />

      <HtmlExportModal
        isOpen={htmlExportOpen}
        onClose={() => setHtmlExportOpen(false)}
        project={project}
        initialChapterId={htmlExportChapterId}
      />
    </div>
  );
}
