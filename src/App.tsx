import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  LogIn,
  Share2,
  Users,
  X,
} from 'lucide-react';
import { AccountSettingsModal } from './components/AccountSettingsModal';
import { ChaptersView } from './components/ChaptersView';
import { CharactersView } from './components/CharactersView';
import { CollaborationModal } from './components/CollaborationModal';
import { CrossIndexView } from './components/CrossIndexView';
import { HtmlExportModal } from './components/HtmlExportModal';
import { LandingPage } from './components/LandingPage';
import { NewStoryModal, NewStoryModalMode } from './components/NewStoryModal';
import { PublicStoryView } from './components/PublicStoryView';
import { SavePointsView } from './components/SavePointsView';
import { RewriteCorrectionPayload } from './components/SceneCorrectionModal';
import { ShareModal, ShareTarget } from './components/ShareModal';
import { SharedWorkView } from './components/SharedWorkView';
import { StoryTagsModal } from './components/StoryTagsModal';
import { StoryWorkspace } from './components/StoryWorkspace';
import { StudioSettingsModal } from './components/StudioSettingsModal';
import { TopNav, WorkspaceTab } from './components/TopNav';
import { formatReadableFirestoreError, useAuth } from './contexts/AuthContext';
import { UNIVERSE_TEMPLATES } from './data/presets';
import { useCollabRoom } from './hooks/useCollabRoom';
import { TtsSpeechItem, useNarrativeSpeech } from './hooks/useNarrativeSpeech';
import { normalizeStoryTags } from './utils/ao3Tags';
import { postJson } from './utils/api';
import {
  buildMergedPublicStoryIndex,
  getPublicStoryIdForProject,
  loadLocalCommunityState,
  LocalCommunityState,
  saveLocalCommunityState,
} from './utils/communityStore';
import { buildCollabUrl, buildShareUrl, parseRouteLinks } from './utils/storyLinks';
import {
  CharacterProfile,
  CollaborationSession,
  ContinuityAuditReport,
  CrossIndexEntry,
  ModelConfig,
  PublicStoryWork,
  SavePoint,
  StoryChapter,
  StoryComment,
  StoryIllustration,
  StoryProject,
  StorySnapshot,
  StoryTags,
  StoryTurn,
  TtsVoiceName,
} from './types/story';

const LEGACY_STORAGE_KEY = 'folio-canon-active-project-v1';
const LIBRARY_STORAGE_KEY = 'folio-canon-stories-v1';
const ACTIVE_STORY_ID_KEY = 'folio-canon-active-story-id-v1';
const MODEL_CONFIG_KEY = 'folio-canon-model-config-v1';
const TTS_VOICE_KEY = 'folio-canon-tts-voice-v1';
const AUTO_PLAY_NARRATION_KEY = 'folio-canon-autoplay-narration-v1';

const VALID_TTS_VOICES: ReadonlySet<TtsVoiceName> = new Set([
  'Kore',
  'Charon',
  'Fenrir',
  'Puck',
  'Zephyr',
]);

function loadInitialVoice(): TtsVoiceName {
  try {
    const raw = localStorage.getItem(TTS_VOICE_KEY);
    if (raw && VALID_TTS_VOICES.has(raw as TtsVoiceName)) {
      return raw as TtsVoiceName;
    }
  } catch {
    // Ignore storage error
  }
  return 'Charon';
}

function loadInitialAutoPlay(): boolean {
  try {
    return localStorage.getItem(AUTO_PLAY_NARRATION_KEY) === 'true';
  } catch {
    return false;
  }
}

function getInitialRouteLinks(): {
  shareId: string | null;
  collabId: string | null;
  storyId: string | null;
} {
  try {
    return parseRouteLinks(window.location.search);
  } catch {
    return { shareId: null, collabId: null, storyId: null };
  }
}

function buildTurnSpeechItem(turn: StoryTurn, tone?: string): TtsSpeechItem {
  return {
    key: `scene:${turn.id}`,
    label: `Scene ${String(turn.turnNumber).padStart(2, '0')} — ${turn.sceneTitle}`,
    text: `Scene ${turn.turnNumber}: ${turn.sceneTitle}.\n\n${turn.prose.join('\n\n')}`,
    tone,
  };
}

function loadInitialModelConfig(): ModelConfig {
  try {
    const raw = localStorage.getItem(MODEL_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ModelConfig;
      if (parsed && typeof parsed.model === 'string' && parsed.model.trim()) {
        return {
          model: parsed.model.trim(),
          thinkingLevel: parsed.thinkingLevel || 'HIGH',
        };
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
    isPrivate: raw.isPrivate === true,
    tags: normalizeStoryTags(raw.tags, raw),
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

function mergeLocalIllustrationsIntoCloud(
  cloudStory: StoryProject,
  localStory?: StoryProject,
): StoryProject {
  if (!localStory) return cloudStory;
  const localTurnIllMap = new Map<string, StoryIllustration>();
  for (const t of localStory.turns) {
    if (t.illustration?.dataUrl) {
      localTurnIllMap.set(t.id, t.illustration);
    }
  }
  const localChapterIllMap = new Map<string, StoryIllustration>();
  for (const ch of localStory.chapters ?? []) {
    if (ch.illustration?.dataUrl) {
      localChapterIllMap.set(ch.id, ch.illustration);
    }
  }
  return {
    ...cloudStory,
    turns: cloudStory.turns.map((t) => {
      if (t.illustration && !t.illustration.dataUrl) {
        const localIll = localTurnIllMap.get(t.id);
        if (localIll) return { ...t, illustration: localIll };
      }
      return t;
    }),
    chapters: (cloudStory.chapters ?? []).map((ch) => {
      if (ch.illustration && !ch.illustration.dataUrl) {
        const localIll = localChapterIllMap.get(ch.id);
        if (localIll) return { ...ch, illustration: localIll };
      }
      return ch;
    }),
  };
}

export default function App() {
  const {
    firebaseConfigured,
    user,
    isSigningIn,
    authError,
    signInWithGoogle,
    userSettings,
    settingsLoaded,
    updateUserSettings,
    loadCloudStories,
    syncStoryToCloud,
    deleteStoryFromCloud,
    joinCollaboration,
    subscribeCollaboration,
    pushCollaborationUpdate,
    listPublicStories,
    fetchPublicStory,
    syncPublicStoryListing,
    listStoryComments,
    addStoryComment,
    deleteStoryComment,
    hasUserGivenKudo,
    giveStoryKudo,
  } = useAuth();

  const [library, setLibrary] = useState<{ stories: StoryProject[]; activeId: string }>(
    loadInitialLibrary,
  );
  const project =
    library.stories.find((s) => s.id === library.activeId) ?? library.stories[0];

  const [modelConfig, setModelConfig] = useState<ModelConfig>(loadInitialModelConfig);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('discover');
  const [isNewStoryOpen, setIsNewStoryOpen] = useState(false);
  const [newStoryInitialMode, setNewStoryInitialMode] =
    useState<NewStoryModalMode>('presets');
  const [isStudioSettingsOpen, setIsStudioSettingsOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [tagsModalStory, setTagsModalStory] = useState<StoryProject | null>(null);

  const [communityState, setCommunityState] = useState<LocalCommunityState>(
    loadLocalCommunityState,
  );
  const [cloudPublicStories, setCloudPublicStories] = useState<PublicStoryWork[]>([]);
  const [selectedPublicStoryId, setSelectedPublicStoryId] = useState<string | null>(
    () => getInitialRouteLinks().storyId,
  );
  const [remotePublicStory, setRemotePublicStory] = useState<PublicStoryWork | null>(null);
  const [remoteCommentsByStory, setRemoteCommentsByStory] = useState<
    Record<string, StoryComment[]>
  >({});
  const [remoteKudosGiven, setRemoteKudosGiven] = useState<Record<string, boolean>>({});

  const [activeShareId, setActiveShareId] = useState<string | null>(
    () => getInitialRouteLinks().shareId,
  );
  const [activeCollabId, setActiveCollabId] = useState<string | null>(
    () => getInitialRouteLinks().collabId,
  );
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [collabTargetStory, setCollabTargetStory] = useState<StoryProject | null>(null);
  const [collabSession, setCollabSession] = useState<CollaborationSession | null>(null);
  const [collabLoading, setCollabLoading] = useState(false);
  const [collabError, setCollabError] = useState<string | null>(null);
  const [collabSyncError, setCollabSyncError] = useState<string | null>(null);
  const [copiedBannerLink, setCopiedBannerLink] = useState<'collab' | 'share' | null>(
    null,
  );

  const collabClientIdRef = useRef<string>(
    `tab-${Math.random().toString(36).slice(2, 10)}`,
  );
  const isRemoteCollabUpdateRef = useRef(false);
  const collabPushTimerRef = useRef<number | null>(null);

  useEffect(() => {
    saveLocalCommunityState(communityState);
  }, [communityState]);

  useEffect(() => {
    if (!firebaseConfigured) return;
    let cancelled = false;
    void listPublicStories()
      .then((works) => {
        if (!cancelled) {
          setCloudPublicStories(works.filter((w) => w.isPrivate !== true));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [firebaseConfigured, listPublicStories]);

  useEffect(() => {
    const onPopState = () => {
      const next = getInitialRouteLinks();
      setActiveShareId(next.shareId);
      setActiveCollabId(next.collabId);
      setSelectedPublicStoryId(next.storyId);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const openSharedPreview = useCallback((shareId: string) => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('collab');
      url.searchParams.set('share', shareId);
      window.history.pushState({}, '', url.toString());
    } catch {
      // Ignore history errors in restricted contexts
    }
    setShareTarget(null);
    setActiveCollabId(null);
    setActiveShareId(shareId);
  }, []);

  const exitSharedView = useCallback(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('share');
      window.history.pushState({}, '', url.toString());
    } catch {
      // Ignore history errors in restricted contexts
    }
    setActiveShareId(null);
  }, []);

  const openCollabRoom = useCallback((collabId: string) => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('share');
      url.searchParams.set('collab', collabId);
      window.history.pushState({}, '', url.toString());
    } catch {
      // Ignore history errors in restricted contexts
    }
    setCollabTargetStory(null);
    setShareTarget(null);
    setActiveShareId(null);
    setCollabError(null);
    setCollabSyncError(null);
    setActiveCollabId(collabId);
  }, []);

  const exitCollabRoom = useCallback(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('collab');
      window.history.pushState({}, '', url.toString());
    } catch {
      // Ignore history errors in restricted contexts
    }
    setActiveCollabId(null);
    setCollabSession(null);
    setCollabError(null);
    setCollabSyncError(null);
  }, []);

  const handleVoicePersist = useCallback(
    (nextVoice: TtsVoiceName) => {
      try {
        localStorage.setItem(TTS_VOICE_KEY, nextVoice);
      } catch {
        // Ignore storage error
      }
      if (user) {
        void updateUserSettings({ preferredVoice: nextVoice }).catch(() => {});
      }
    },
    [user, updateUserSettings],
  );

  const handleAutoPlayPersist = useCallback(
    (enabled: boolean) => {
      try {
        localStorage.setItem(AUTO_PLAY_NARRATION_KEY, String(enabled));
      } catch {
        // Ignore storage error
      }
      if (user) {
        void updateUserSettings({ autoPlayNarration: enabled }).catch(() => {});
      }
    },
    [user, updateUserSettings],
  );

  const speech = useNarrativeSpeech({
    initialVoice: loadInitialVoice(),
    initialAutoPlay: loadInitialAutoPlay(),
    onVoicePersist: handleVoicePersist,
    onAutoPlayPersist: handleAutoPlayPersist,
  });

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

  const hydratedUidRef = useRef<string | null>(null);
  const cloudSyncTimerRef = useRef<number | null>(null);

  // Hydrate persistent preferences and stories when user signs in via OAuth
  useEffect(() => {
    if (!user) {
      hydratedUidRef.current = null;
      return;
    }
    if (!settingsLoaded || !userSettings) return;

    const targetModel =
      userSettings.allowedModels.length > 0 &&
      !userSettings.allowedModels.includes(userSettings.preferredModel)
        ? userSettings.allowedModels[0]
        : userSettings.preferredModel;

    setModelConfig({
      model: targetModel,
      thinkingLevel: userSettings.thinkingLevel,
    });
    speech.setPreferredVoice(userSettings.preferredVoice);
    speech.hydrateAutoPlayOnReady(userSettings.autoPlayNarration);
    try {
      localStorage.setItem(TTS_VOICE_KEY, userSettings.preferredVoice);
      localStorage.setItem(
        AUTO_PLAY_NARRATION_KEY,
        String(userSettings.autoPlayNarration),
      );
    } catch {
      // Ignore storage error
    }

    if (hydratedUidRef.current === user.uid) return;
    hydratedUidRef.current = user.uid;

    void (async () => {
      try {
        const cloudStories = await loadCloudStories();
        if (cloudStories.length === 0) {
          // Seed cloud with local library on first login
          for (const localStory of library.stories) {
            await syncStoryToCloud(localStory);
          }
          await updateUserSettings({ activeStoryId: library.activeId });
          return;
        }

        setLibrary((prev) => {
          const localMap = new Map(prev.stories.map((s) => [s.id, s]));
          const mergedMap = new Map<string, StoryProject>();

          for (const cs of cloudStories) {
            const ls = localMap.get(cs.id);
            if (!ls || cs.updatedAt >= ls.updatedAt) {
              mergedMap.set(cs.id, mergeLocalIllustrationsIntoCloud(cs, ls));
            } else {
              mergedMap.set(ls.id, ls);
            }
          }
          for (const ls of prev.stories) {
            if (!mergedMap.has(ls.id)) {
              mergedMap.set(ls.id, ls);
            }
          }

          const mergedList = Array.from(mergedMap.values()).sort(
            (a, b) => b.updatedAt - a.updatedAt,
          );
          const preferredActive = userSettings.activeStoryId;
          const nextActiveId =
            preferredActive && mergedMap.has(preferredActive)
              ? preferredActive
              : mergedMap.has(prev.activeId)
                ? prev.activeId
                : mergedList[0].id;

          return { stories: mergedList, activeId: nextActiveId };
        });
      } catch {
        // Handled by AuthContext syncError / handleFirestoreError
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, settingsLoaded, userSettings]);

  const scheduleCloudStorySync = useCallback(
    (story: StoryProject) => {
      if (!user) return;
      if (cloudSyncTimerRef.current) {
        window.clearTimeout(cloudSyncTimerRef.current);
      }
      cloudSyncTimerRef.current = window.setTimeout(() => {
        void syncStoryToCloud(story).catch(() => {});
      }, 800);
    },
    [user, syncStoryToCloud],
  );

  const handlePersistNow = useCallback(
    async (
      scopeLabel?: string,
    ): Promise<{ ok: boolean; location: 'cloud' | 'local'; message: string }> => {
      const label = scopeLabel?.trim() || 'Story';
      try {
        localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(library.stories));
        localStorage.setItem(ACTIVE_STORY_ID_KEY, library.activeId);
      } catch {
        // Ignore local quota fallback; proceed to Firestore when signed in
      }

      if (!user) {
        return {
          ok: true,
          location: 'local',
          message: `${label} saved to browser storage. Sign in with Google to persist to Firestore.`,
        };
      }

      try {
        await syncStoryToCloud(project);
        await updateUserSettings({ activeStoryId: project.id });
        return {
          ok: true,
          location: 'cloud',
          message: `${label} persisted to Firestore & browser.`,
        };
      } catch (err) {
        return {
          ok: false,
          location: 'local',
          message: formatReadableFirestoreError(err),
        };
      }
    },
    [library.stories, library.activeId, project, syncStoryToCloud, updateUserSettings, user],
  );

  const handleChangeModelConfig = useCallback(
    (next: ModelConfig) => {
      setModelConfig(next);
      if (user) {
        void updateUserSettings({
          preferredModel: next.model,
          thinkingLevel: next.thinkingLevel,
        }).catch(() => {});
      }
    },
    [user, updateUserSettings],
  );

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

  // Always pre-compute narration in the background (prioritizing the latest scene first)
  useEffect(() => {
    if (!project || project.turns.length === 0) return;
    const orderedItems = [...project.turns]
      .reverse()
      .map((t) => buildTurnSpeechItem(t, project.tone));
    speech.precomputeItems(orderedItems);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, project.turns, project.tone, speech.voice, speech.precomputeItems]);

  const collabRoom = useCollabRoom({
    collabId: activeCollabId,
    clientId: collabClientIdRef.current,
    displayName: user?.displayName || user?.email?.split('@')[0] || 'Collaborator',
    enabled: Boolean(activeCollabId && user && collabSession),
  });

  useEffect(() => {
    if (!activeCollabId || !firebaseConfigured || !user) {
      setCollabSession(null);
      setCollabLoading(false);
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    setCollabLoading(true);
    setCollabError(null);
    setCollabSyncError(null);

    void (async () => {
      try {
        const joined = await joinCollaboration(activeCollabId);
        if (cancelled) return;
        if (!joined) {
          setCollabSession(null);
          setCollabError('This collaboration room was not found or has been revoked.');
          setCollabLoading(false);
          return;
        }
        setCollabSession(joined);
        setCollabLoading(false);

        unsubscribe = subscribeCollaboration(
          activeCollabId,
          (incoming) => {
            if (cancelled) return;
            if (!incoming) {
              setCollabSession(null);
              setCollabError('This collaboration room was revoked by the story owner.');
              return;
            }
            setCollabSession(incoming);
            isRemoteCollabUpdateRef.current = true;
            setLibrary((prev) => {
              const incomingStory = normalizeProject({
                ...incoming.project,
                collabId: incoming.id,
              });
              const existingLocal = prev.stories.find((s) => s.id === incomingStory.id);
              const merged = mergeLocalIllustrationsIntoCloud(incomingStory, existingLocal);
              const exists = Boolean(existingLocal);
              const nextStories = exists
                ? prev.stories.map((s) => (s.id === merged.id ? merged : s))
                : [merged, ...prev.stories];
              return {
                stories: nextStories,
                activeId: merged.id,
              };
            });
            queueMicrotask(() => {
              isRemoteCollabUpdateRef.current = false;
            });
          },
          (errMsg) => {
            if (!cancelled) {
              setCollabSyncError(errMsg);
            }
          },
        );
      } catch (err) {
        if (!cancelled) {
          setCollabError(formatReadableFirestoreError(err));
          setCollabLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [
    activeCollabId,
    firebaseConfigured,
    user,
    joinCollaboration,
    subscribeCollaboration,
  ]);

  const scheduleCollabPush = useCallback(
    (collabId: string, story: StoryProject) => {
      if (collabPushTimerRef.current) {
        window.clearTimeout(collabPushTimerRef.current);
      }
      collabPushTimerRef.current = window.setTimeout(() => {
        void pushCollaborationUpdate(collabId, story).catch((err) => {
          setCollabSyncError(formatReadableFirestoreError(err));
        });
        collabRoom.sendActivity(
          `Updated "${story.title}" (${story.turns.length} scenes)`,
        );
      }, 450);
    },
    [pushCollaborationUpdate, collabRoom],
  );

  const updateProjectById = (
    targetId: string,
    updater: (prev: StoryProject) => StoryProject,
  ) => {
    setLibrary((prev) => {
      const existingTarget = prev.stories.find((s) => s.id === targetId);
      const nextTarget = existingTarget ? updater(existingTarget) : null;
      const stories = nextTarget
        ? prev.stories.map((s) => (s.id === targetId ? nextTarget : s))
        : prev.stories;
      if (nextTarget) {
        scheduleCloudStorySync(nextTarget);
        if (
          !isRemoteCollabUpdateRef.current &&
          activeCollabId &&
          collabSession &&
          collabSession.project.id === nextTarget.id
        ) {
          scheduleCollabPush(activeCollabId, nextTarget);
        }
      }
      return {
        ...prev,
        stories,
      };
    });
  };

  const handleStoryLinkPatch = useCallback(
    (
      storyId: string,
      patch: { shareId?: string | null; collabId?: string | null },
    ) => {
      setLibrary((prev) => {
        let updatedTarget: StoryProject | null = null;
        const stories = prev.stories.map((s) => {
          if (s.id !== storyId) return s;
          const next: StoryProject = { ...s };
          if (patch.shareId !== undefined) {
            if (patch.shareId) {
              next.shareId = patch.shareId;
            } else {
              delete next.shareId;
            }
          }
          if (patch.collabId !== undefined) {
            if (patch.collabId) {
              next.collabId = patch.collabId;
            } else {
              delete next.collabId;
            }
          }
          updatedTarget = next;
          return next;
        });
        if (updatedTarget && user) {
          scheduleCloudStorySync(updatedTarget);
        }
        return {
          ...prev,
          stories,
        };
      });
      setCollabTargetStory((prev) => {
        if (!prev || prev.id !== storyId) return prev;
        const next: StoryProject = { ...prev };
        if (patch.shareId !== undefined) {
          if (patch.shareId) next.shareId = patch.shareId;
          else delete next.shareId;
        }
        if (patch.collabId !== undefined) {
          if (patch.collabId) next.collabId = patch.collabId;
          else delete next.collabId;
        }
        return next;
      });
    },
    [user, scheduleCloudStorySync],
  );

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
      void speech.precomputeAndMaybePlay(
        buildTurnSpeechItem(data.nextTurn, project.tone),
      );
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

  const handleSaveTurnIllustration = (
    turnId: string,
    illustration: StoryIllustration | null,
  ) => {
    updateProjectById(project.id, (prev) => ({
      ...prev,
      turns: prev.turns.map((t) =>
        t.id === turnId ? { ...t, illustration } : t,
      ),
      updatedAt: Date.now(),
    }));
  };

  const handleSaveChapterIllustration = (
    chapterId: string,
    illustration: StoryIllustration | null,
  ) => {
    updateProjectById(project.id, (prev) => ({
      ...prev,
      chapters: (prev.chapters ?? []).map((ch) =>
        ch.id === chapterId ? { ...ch, illustration } : ch,
      ),
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
      void speech.precomputeAndMaybePlay(
        buildTurnSpeechItem(data.rewrittenTurn, project.tone),
      );
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
    let createdNormalized: StoryProject | null = null;
    setLibrary((prev) => {
      const usedIds = new Set(prev.stories.map((s) => s.id));
      const normalized = normalizeProject(newProj, usedIds);
      createdNormalized = normalized;
      return {
        stories: [normalized, ...prev.stories],
        activeId: normalized.id,
      };
    });
    if (user && createdNormalized) {
      const projToSync = createdNormalized as StoryProject;
      void syncStoryToCloud(projToSync).catch(() => {});
      void updateUserSettings({ activeStoryId: projToSync.id }).catch(() => {});
    }
    setAuditReport(null);
    setAdvanceError(null);
    setLastFailedAction(null);
    setRewriteError(null);
    setActiveTab('story');
    if (newProj.turns.length === 1 && newProj.turns[0]) {
      void speech.precomputeAndMaybePlay(
        buildTurnSpeechItem(newProj.turns[0], newProj.tone),
      );
    }
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
    if (user) {
      void updateUserSettings({ activeStoryId: storyId }).catch(() => {});
    }
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
      const nextActiveId = deletingActive ? remaining[0].id : prev.activeId;
      if (user) {
        void deleteStoryFromCloud(storyId).catch(() => {});
        if (deletingActive) {
          void updateUserSettings({ activeStoryId: nextActiveId }).catch(() => {});
        }
      }
      return {
        stories: remaining,
        activeId: nextActiveId,
      };
    });
    if (storyId === project.id) {
      setAuditReport(null);
      setAdvanceError(null);
      setLastFailedAction(null);
      setRewriteError(null);
    }
  };

  const handleCopyBannerLink = (kind: 'collab' | 'share', url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedBannerLink(kind);
    window.setTimeout(() => setCopiedBannerLink(null), 1800);
  };

  const publicStoriesIndex = buildMergedPublicStoryIndex({
    localLibraryStories: library.stories,
    cloudPublicStories,
    communityState,
    currentAuthorUid: user?.uid,
    currentAuthorName: user?.displayName || undefined,
  });

  const privateDraftCount = library.stories.filter(
    (s) => s.isPrivate === true,
  ).length;

  const givenKudoSet = new Set<string>([
    ...communityState.givenKudoStoryIds,
    ...Object.entries(remoteKudosGiven)
      .filter(([, val]) => val)
      .map(([k]) => k),
  ]);

  const handleOpenPublicStory = (publicId: string) => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('share');
      url.searchParams.delete('collab');
      url.searchParams.set('story', publicId);
      window.history.pushState({}, '', url.toString());
    } catch {
      // Ignore history error
    }
    setSelectedPublicStoryId(publicId);
    setActiveTab('discover');
    if (firebaseConfigured) {
      void fetchPublicStory(publicId)
        .then((work) => {
          if (work && work.isPrivate !== true) {
            setRemotePublicStory(work);
          }
        })
        .catch(() => {});
      void listStoryComments(publicId)
        .then((cmts) => {
          if (cmts.length > 0) {
            setRemoteCommentsByStory((prev) => ({ ...prev, [publicId]: cmts }));
          }
        })
        .catch(() => {});
      if (user) {
        void hasUserGivenKudo(publicId)
          .then((given) => {
            if (given) {
              setRemoteKudosGiven((prev) => ({ ...prev, [publicId]: true }));
            }
          })
          .catch(() => {});
      }
    }
  };

  const handleExitPublicStory = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('story');
      window.history.pushState({}, '', url.toString());
    } catch {
      // Ignore history error
    }
    setSelectedPublicStoryId(null);
    setRemotePublicStory(null);
  };

  const handleSaveTagsAndVisibility = (
    storyId: string,
    updates: { isPrivate: boolean; tags: StoryTags },
  ) => {
    const targetStory = library.stories.find((s) => s.id === storyId);
    if (!targetStory) return;
    const publicStoryId = getPublicStoryIdForProject(targetStory);
    const updatedStory: StoryProject = {
      ...targetStory,
      isPrivate: updates.isPrivate,
      tags: normalizeStoryTags(updates.tags, targetStory),
      publicStoryId,
      updatedAt: Date.now(),
    };
    updateProjectById(storyId, () => updatedStory);

    if (firebaseConfigured && user) {
      void syncPublicStoryListing(updatedStory)
        .then((listing) => {
          if (!listing) return;
          setCloudPublicStories((prev) => {
            const without = prev.filter((w) => w.id !== listing.id);
            return listing.isPrivate ? without : [listing, ...without];
          });
        })
        .catch(() => {});
    }

    if (updates.isPrivate && selectedPublicStoryId === publicStoryId) {
      handleExitPublicStory();
    }
  };

  const handleGiveStoryKudo = async (publicId: string) => {
    if (givenKudoSet.has(publicId)) return;
    const targetStory =
      publicStoriesIndex.find((s) => s.id === publicId) ?? remotePublicStory;
    if (!targetStory || targetStory.isPrivate === true) return;

    const currentCount = targetStory.kudosCount;
    setCommunityState((prev) => {
      if (prev.givenKudoStoryIds.includes(publicId)) return prev;
      return {
        ...prev,
        givenKudoStoryIds: [...prev.givenKudoStoryIds, publicId],
        kudoCountsByStoryId: {
          ...prev.kudoCountsByStoryId,
          [publicId]: Math.max(prev.kudoCountsByStoryId[publicId] ?? 0, currentCount) + 1,
        },
      };
    });

    if (firebaseConfigured && user) {
      try {
        const nextCount = await giveStoryKudo(publicId);
        setRemoteKudosGiven((prev) => ({ ...prev, [publicId]: true }));
        setCloudPublicStories((prev) =>
          prev.map((w) =>
            w.id === publicId ? { ...w, kudosCount: nextCount } : w,
          ),
        );
      } catch {
        // Local kudo state already persisted seamlessly if remote work isn't seeded in Firestore
      }
    }
  };

  const handleAddStoryComment = async (
    publicId: string,
    payload: {
      body: string;
      authorName?: string;
      chapterOrSceneLabel?: string;
      parentCommentId?: string;
    },
  ) => {
    const cleanBody = payload.body.trim().slice(0, 4000);
    if (!cleanBody) return;

    if (firebaseConfigured && user) {
      try {
        const saved = await addStoryComment(publicId, payload);
        setRemoteCommentsByStory((prev) => ({
          ...prev,
          [publicId]: [...(prev[publicId] ?? []), saved],
        }));
        setCloudPublicStories((prev) =>
          prev.map((w) =>
            w.id === publicId ? { ...w, commentCount: w.commentCount + 1 } : w,
          ),
        );
        return;
      } catch {
        // Fall through to local persistence for curated/offline drafts
      }
    }

    const now = Date.now();
    const localComment: StoryComment = {
      id: `cmt-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      storyId: publicId,
      authorUid: user?.uid || 'local-reader',
      authorName:
        (payload.authorName?.trim() || user?.displayName || 'Reader').slice(0, 120),
      body: cleanBody,
      chapterOrSceneLabel: payload.chapterOrSceneLabel?.trim() || undefined,
      parentCommentId: payload.parentCommentId?.trim() || undefined,
      storyIsPrivate: false,
      createdAtMs: now,
      updatedAtMs: now,
    };

    setCommunityState((prev) => ({
      ...prev,
      commentsByStoryId: {
        ...prev.commentsByStoryId,
        [publicId]: [...(prev.commentsByStoryId[publicId] ?? []), localComment],
      },
    }));
  };

  const handleDeleteStoryComment = async (
    publicId: string,
    commentId: string,
  ) => {
    setCommunityState((prev) => ({
      ...prev,
      commentsByStoryId: {
        ...prev.commentsByStoryId,
        [publicId]: (prev.commentsByStoryId[publicId] ?? []).filter(
          (c) => c.id !== commentId,
        ),
      },
    }));
    setRemoteCommentsByStory((prev) => ({
      ...prev,
      [publicId]: (prev[publicId] ?? []).filter((c) => c.id !== commentId),
    }));
    if (firebaseConfigured && user) {
      await deleteStoryComment(publicId, commentId).catch(() => {});
    }
  };

  const activePublicStory =
    selectedPublicStoryId
      ? publicStoriesIndex.find((s) => s.id === selectedPublicStoryId) ??
        (remotePublicStory &&
        remotePublicStory.id === selectedPublicStoryId &&
        remotePublicStory.isPrivate !== true
          ? remotePublicStory
          : null)
      : null;

  const activePublicComments: StoryComment[] = (() => {
    if (!activePublicStory) return [];
    const localList = communityState.commentsByStoryId[activePublicStory.id] ?? [];
    const remoteList = remoteCommentsByStory[activePublicStory.id] ?? [];
    const merged = new Map<string, StoryComment>();
    for (const c of localList) merged.set(c.id, c);
    for (const c of remoteList) merged.set(c.id, c);
    return Array.from(merged.values()).sort((a, b) => a.createdAtMs - b.createdAtMs);
  })();

  if (activeShareId) {
    return (
      <SharedWorkView
        shareId={activeShareId}
        onExit={exitSharedView}
        onImportWork={(imported) => {
          handleLoadNewProject(imported);
          exitSharedView();
        }}
      />
    );
  }

  if (
    activeCollabId &&
    (!firebaseConfigured || !user || collabLoading || collabError || !collabSession)
  ) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] text-[#111827] flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-[#E5E7EB] rounded-lg p-7 shadow-sm space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Users className="w-5 h-5 text-[#1D4ED8] shrink-0" />
              <div>
                <h1 className="font-serif text-xl font-semibold text-[#111827]">
                  Collaborative Story Room
                </h1>
                <p className="text-xs text-[#6B7280] mt-0.5">
                  Co-authoring invite · {activeCollabId}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={exitCollabRoom}
              className="p-1.5 rounded-md text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6] cursor-pointer"
              aria-label="Leave collaboration room"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {!firebaseConfigured ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2.5 p-3.5 rounded-md bg-[#FFFBEB] border border-[#FDE68A] text-xs text-[#92400E] leading-relaxed">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Firebase configuration is inactive while rotating keys. Configure{' '}
                  <code className="font-mono">VITE_FIREBASE_*</code> in{' '}
                  <code className="font-mono">.env.local</code> to join live Firestore
                  collaboration rooms.
                </span>
              </div>
              <button
                type="button"
                onClick={exitCollabRoom}
                className="w-full px-4 py-2 rounded-md border border-[#E5E7EB] bg-white hover:bg-[#F9FAFB] text-sm font-medium text-[#374151] cursor-pointer"
              >
                Return to Local Studio
              </button>
            </div>
          ) : !user ? (
            <div className="space-y-3">
              <p className="text-sm text-[#4B5563] leading-relaxed">
                Sign in with your Google account to join this collaborative manuscript, sync
                edits live with co-authors, and preserve your changes.
              </p>
              {authError && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#B91C1C]">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => void signInWithGoogle()}
                  disabled={isSigningIn}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#111827] hover:bg-[#1F2937] text-white text-sm font-medium cursor-pointer disabled:opacity-50"
                >
                  {isSigningIn ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <LogIn className="w-4 h-4" />
                  )}
                  Sign in with Google
                </button>
                <button
                  type="button"
                  onClick={exitCollabRoom}
                  className="px-3.5 py-2 rounded-md border border-[#E5E7EB] bg-white hover:bg-[#F9FAFB] text-sm font-medium text-[#374151] cursor-pointer"
                >
                  Back to Studio
                </button>
              </div>
            </div>
          ) : collabLoading ? (
            <div className="py-6 flex items-center justify-center gap-2.5 text-sm text-[#4B5563]">
              <Loader2 className="w-4 h-4 animate-spin text-[#1D4ED8]" />
              Joining collaborative manuscript…
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-2.5 p-3.5 rounded-md bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#B91C1C] leading-relaxed">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{collabError || 'Unable to load collaboration room.'}</span>
              </div>
              <button
                type="button"
                onClick={exitCollabRoom}
                className="w-full px-4 py-2 rounded-md border border-[#E5E7EB] bg-white hover:bg-[#F9FAFB] text-sm font-medium text-[#374151] cursor-pointer"
              >
                Return to My Stories
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FA] text-[#111827]">
      <TopNav
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          if (tab !== 'discover' && selectedPublicStoryId) {
            handleExitPublicStory();
          }
        }}
        onOpenNewStory={() => handleOpenNewStoryModal('presets')}
        onOpenStudioSettings={() => setIsStudioSettingsOpen(true)}
        onOpenAccountSettings={() => setIsAccountModalOpen(true)}
      />

      {activeCollabId && collabSession && (
        <div className="bg-[#EFF6FF] border-b border-[#BFDBFE] px-4 sm:px-6 py-2">
          <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#1E3A8A]">
              <span className="inline-flex items-center gap-1.5 font-semibold whitespace-nowrap">
                <Users className="w-3.5 h-3.5 text-[#1D4ED8]" />
                Live Collaboration Room
              </span>
              <span className="text-[#93C5FD]">·</span>
              <span className="font-medium truncate max-w-[260px]">
                {collabSession.project.title}
              </span>
              <span className="text-[#93C5FD]">·</span>
              <span className="text-[#1D4ED8]">
                {collabRoom.participants.length > 0
                  ? `${collabRoom.participants.length} online (${collabRoom.participants
                      .map((p) => p.displayName)
                      .slice(0, 3)
                      .join(', ')})`
                  : `Host: ${collabSession.ownerName}`}
              </span>
              {(collabRoom.lastActivity || collabSession.lastEditedByName) && (
                <>
                  <span className="text-[#93C5FD]">·</span>
                  <span className="text-[#475569] truncate max-w-[280px]">
                    {collabRoom.lastActivity ||
                      `Last edit by ${collabSession.lastEditedByName}`}
                  </span>
                </>
              )}
              {collabSyncError && (
                <span className="text-[#B91C1C] font-medium">{collabSyncError}</span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() =>
                  handleCopyBannerLink(
                    'collab',
                    buildCollabUrl(window.location.origin, activeCollabId),
                  )
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#BFDBFE] bg-white hover:bg-[#DBEAFE]/40 text-xs font-medium text-[#1D4ED8] whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copiedBannerLink === 'collab' ? (
                  <>
                    <Check className="w-3 h-3 text-[#047857]" />
                    Collab Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    Copy Collab Link
                  </>
                )}
              </button>

              {project.shareId ? (
                <button
                  type="button"
                  onClick={() =>
                    handleCopyBannerLink(
                      'share',
                      buildShareUrl(window.location.origin, project.shareId!),
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#E5E7EB] bg-white hover:bg-[#F9FAFB] text-xs font-medium text-[#374151] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copiedBannerLink === 'share' ? (
                    <>
                      <Check className="w-3 h-3 text-[#047857]" />
                      Share Copied
                    </>
                  ) : (
                    <>
                      <Share2 className="w-3 h-3 text-[#6B7280]" />
                      Copy Share Link
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShareTarget({ scope: 'story', story: project })}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#E5E7EB] bg-white hover:bg-[#F9FAFB] text-xs font-medium text-[#374151] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Share2 className="w-3 h-3 text-[#6B7280]" />
                  Share Link
                </button>
              )}

              <button
                type="button"
                onClick={exitCollabRoom}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[#E5E7EB] bg-white hover:bg-[#F3F4F6] text-xs font-medium text-[#374151] whitespace-nowrap shrink-0 cursor-pointer"
              >
                Leave Room
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1">
        {activeTab === 'discover' &&
          (activePublicStory ? (
            <PublicStoryView
              story={activePublicStory}
              comments={activePublicComments}
              hasGivenKudo={givenKudoSet.has(activePublicStory.id)}
              currentReaderUid={user?.uid || 'local-reader'}
              currentReaderName={user?.displayName || 'Reader'}
              isOwner={
                Boolean(user && activePublicStory.ownerUid === user.uid) ||
                library.stories.some(
                  (ls) =>
                    ls.id === activePublicStory.sourceStoryId ||
                    getPublicStoryIdForProject(ls) === activePublicStory.id,
                )
              }
              onBackToIndex={handleExitPublicStory}
              onGiveKudo={handleGiveStoryKudo}
              onAddComment={handleAddStoryComment}
              onDeleteComment={handleDeleteStoryComment}
              onOpenInStudio={(forked) => {
                handleExitPublicStory();
                handleLoadNewProject(forked);
              }}
              onEditTagsAndVisibility={() => {
                const match = library.stories.find(
                  (ls) =>
                    ls.id === activePublicStory.sourceStoryId ||
                    getPublicStoryIdForProject(ls) === activePublicStory.id,
                );
                if (match) setTagsModalStory(match);
              }}
            />
          ) : (
            <LandingPage
              stories={publicStoriesIndex}
              privateDraftCount={privateDraftCount}
              givenKudoStoryIds={givenKudoSet}
              onOpenStory={handleOpenPublicStory}
              onEnterStudio={() => setActiveTab('story')}
              onOpenNewStory={() => handleOpenNewStoryModal('presets')}
            />
          ))}

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
            onUpdateTurnIllustration={handleSaveTurnIllustration}
            isRewritingScene={isRewritingScene}
            rewriteError={rewriteError}
            onRewriteTurn={handleRewriteTurn}
            modelConfig={modelConfig}
            onChangeModelConfig={handleChangeModelConfig}
            speech={speech}
            onPersistNow={handlePersistNow}
            onShareStory={() => setShareTarget({ scope: 'story', story: project })}
            onCollaborateStory={() => setCollabTargetStory(project)}
            onShareScene={(turn) =>
              setShareTarget({ scope: 'scene', story: project, turn })
            }
            onEditTagsAndVisibility={() => setTagsModalStory(project)}
          />
        )}

        {activeTab === 'chapters' && (
          <ChaptersView
            project={project}
            modelConfig={modelConfig}
            onUpdateChapters={handleUpdateChapters}
            onUpdateChapterIllustration={handleSaveChapterIllustration}
            onUpdateTurnIllustration={handleSaveTurnIllustration}
            onOpenHtmlExport={handleOpenHtmlExport}
            onOpenCrossIndex={() => setActiveTab('cross-index')}
            onCorrectTurn={handleCorrectTurn}
            speech={speech}
            onPersistNow={handlePersistNow}
            onShareStory={() => setShareTarget({ scope: 'story', story: project })}
            onCollaborateStory={() => setCollabTargetStory(project)}
            onShareChapter={(chapter, turns) =>
              setShareTarget({ scope: 'chapter', story: project, chapter, turns })
            }
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
        onEditStoryTags={(story) => {
          setIsNewStoryOpen(false);
          setTagsModalStory(story);
        }}
        onShareStory={(story) => {
          setIsNewStoryOpen(false);
          setShareTarget({ scope: 'story', story });
        }}
        onCollaborateStory={(story) => {
          setIsNewStoryOpen(false);
          setCollabTargetStory(story);
        }}
        modelConfig={modelConfig}
        onChangeModelConfig={handleChangeModelConfig}
      />

      <StoryTagsModal
        isOpen={Boolean(tagsModalStory)}
        story={tagsModalStory}
        onClose={() => setTagsModalStory(null)}
        onSave={handleSaveTagsAndVisibility}
      />

      <HtmlExportModal
        isOpen={htmlExportOpen}
        onClose={() => setHtmlExportOpen(false)}
        project={project}
        initialChapterId={htmlExportChapterId}
      />

      <StudioSettingsModal
        isOpen={isStudioSettingsOpen}
        onClose={() => setIsStudioSettingsOpen(false)}
        modelConfig={modelConfig}
        onChangeModelConfig={handleChangeModelConfig}
        preferredVoice={speech.voice}
        onChangeVoice={(nextVoice) => {
          void speech.changeVoice(nextVoice);
        }}
        autoPlayNarration={speech.autoPlayOnReady}
        onChangeAutoPlayNarration={speech.setAutoPlayOnReady}
        onOpenAccountSettings={() => setIsAccountModalOpen(true)}
      />

      <AccountSettingsModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        modelConfig={modelConfig}
        onChangeModelConfig={handleChangeModelConfig}
        preferredVoice={speech.voice}
        onChangeVoice={(nextVoice) => {
          void speech.changeVoice(nextVoice);
        }}
        autoPlayNarration={speech.autoPlayOnReady}
        onChangeAutoPlayNarration={speech.setAutoPlayOnReady}
      />

      <ShareModal
        target={shareTarget}
        onClose={() => setShareTarget(null)}
        onOpenSharedPreview={openSharedPreview}
        onShareIdChange={(storyId, shareId) =>
          handleStoryLinkPatch(storyId, { shareId: shareId ?? null })
        }
        onOpenCollaborateStory={(story) => {
          setShareTarget(null);
          setCollabTargetStory(story);
        }}
      />

      <CollaborationModal
        story={collabTargetStory}
        onClose={() => setCollabTargetStory(null)}
        onCollabIdChange={(storyId, collabId) =>
          handleStoryLinkPatch(storyId, { collabId: collabId ?? null })
        }
        onOpenCollabRoom={openCollabRoom}
        onOpenShareStory={(story) => {
          setCollabTargetStory(null);
          setShareTarget({ scope: 'story', story });
        }}
      />
    </div>
  );
}
