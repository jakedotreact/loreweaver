import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import {
  ModelThinkingLevel,
  SavePoint,
  StoryChapter,
  StoryIllustration,
  StoryProject,
  StoryTurn,
  TtsVoiceName,
} from '../types/story';

export interface UserSettings {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  preferredModel: string;
  thinkingLevel: ModelThinkingLevel;
  preferredVoice: TtsVoiceName;
  allowedModels: string[];
  activeStoryId?: string;
}

export interface UserSettingsPatch {
  preferredModel?: string;
  thinkingLevel?: ModelThinkingLevel;
  preferredVoice?: TtsVoiceName;
  allowedModels?: string[];
  activeStoryId?: string;
}

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  isSigningIn: boolean;
  authError: string | null;
  userSettings: UserSettings | null;
  settingsLoaded: boolean;
  syncError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  updateUserSettings: (patch: UserSettingsPatch) => Promise<void>;
  loadCloudStories: () => Promise<StoryProject[]>;
  syncStoryToCloud: (story: StoryProject) => Promise<void>;
  deleteStoryFromCloud: (storyId: string) => Promise<void>;
  clearAuthError: () => void;
}

const VALID_THINKING_LEVELS: ReadonlySet<ModelThinkingLevel> = new Set([
  'MINIMAL',
  'LOW',
  'MEDIUM',
  'HIGH',
  'XHIGH',
]);

const VALID_VOICES: ReadonlySet<TtsVoiceName> = new Set([
  'Kore',
  'Charon',
  'Fenrir',
  'Puck',
  'Zephyr',
]);

const AuthContext = createContext<AuthContextValue | null>(null);

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128);
  return cleaned || `id-${Date.now()}`;
}

function stripIllustrationDataUrl(
  ill?: StoryIllustration | null,
): StoryIllustration | null | undefined {
  if (!ill) return ill;
  // Firestore document rule: do not store raw binary/dataUrl images inside Firestore docs
  return {
    ...ill,
    dataUrl: ill.dataUrl.startsWith('data:') ? '' : ill.dataUrl.slice(0, 500),
  };
}

function stripTurnsForCloud(turns: StoryTurn[]): StoryTurn[] {
  return turns.slice(-200).map((t) => ({
    ...t,
    illustration: stripIllustrationDataUrl(t.illustration),
  }));
}

function stripChaptersForCloud(chapters: StoryChapter[] = []): StoryChapter[] {
  return chapters.slice(0, 100).map((ch) => ({
    ...ch,
    illustration: stripIllustrationDataUrl(ch.illustration),
  }));
}

function stripSavePointsForCloud(savePoints: SavePoint[] = []): SavePoint[] {
  return savePoints.slice(0, 50).map((sp) => ({
    ...sp,
    snapshot: {
      ...sp.snapshot,
      turns: stripTurnsForCloud(sp.snapshot.turns),
      chapters: stripChaptersForCloud(sp.snapshot.chapters ?? []),
    },
  }));
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setUserSettings(null);
        setSettingsLoaded(false);
        setSyncError(null);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;
    const userPath = `users/${user.uid}`;
    const userRef = doc(db, 'users', user.uid);
    let cancelled = false;

    const unsubscribe = onSnapshot(
      userRef,
      (snap) => {
        if (cancelled) return;
        if (snap.exists()) {
          const data = snap.data();
          const thinkingLevel = VALID_THINKING_LEVELS.has(
            data.thinkingLevel as ModelThinkingLevel,
          )
            ? (data.thinkingLevel as ModelThinkingLevel)
            : 'HIGH';
          const preferredVoice = VALID_VOICES.has(
            data.preferredVoice as TtsVoiceName,
          )
            ? (data.preferredVoice as TtsVoiceName)
            : 'Charon';

          setUserSettings({
            uid: String(data.uid || user.uid),
            displayName: String(data.displayName || user.displayName || 'Author'),
            email: String(data.email || user.email || ''),
            photoURL:
              typeof data.photoURL === 'string' && data.photoURL
                ? data.photoURL
                : undefined,
            preferredModel:
              typeof data.preferredModel === 'string' && data.preferredModel
                ? data.preferredModel
                : 'gemini-4-hydrogen',
            thinkingLevel,
            preferredVoice,
            allowedModels: Array.isArray(data.allowedModels)
              ? data.allowedModels.filter((m): m is string => typeof m === 'string').slice(0, 20)
              : [],
            activeStoryId:
              typeof data.activeStoryId === 'string' && data.activeStoryId
                ? data.activeStoryId
                : undefined,
          });
          setSettingsLoaded(true);
          setSyncError(null);
        } else {
          // Initialize user settings document on first sign-in
          const initialPayload: Record<string, unknown> = {
            uid: user.uid,
            displayName: (user.displayName || user.email || 'Author').slice(0, 120),
            email: (user.email || '').slice(0, 254),
            preferredModel: 'gemini-4-hydrogen',
            thinkingLevel: 'HIGH',
            preferredVoice: 'Charon',
            allowedModels: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          if (user.photoURL) {
            initialPayload.photoURL = user.photoURL.slice(0, 500);
          }
          setDoc(userRef, initialPayload).catch((err) => {
            setSyncError('Failed to initialize account settings in Firestore.');
            handleFirestoreError(err, OperationType.CREATE, userPath);
          });
        }
      },
      (err) => {
        setSyncError('Unable to sync account settings with Firestore.');
        handleFirestoreError(err, OperationType.GET, userPath);
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [authReady, user]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    setIsSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user') {
        setAuthError('Google sign-in popup was closed before finishing.');
      } else if (code === 'auth/popup-blocked') {
        setAuthError(
          'Browser blocked the Google OAuth popup. Allow popups for this site and retry.',
        );
      } else {
        setAuthError(
          err instanceof Error
            ? err.message
            : 'Unable to complete Google OAuth sign-in.',
        );
      }
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setAuthError(null);
    await signOut(auth);
  }, []);

  const updateUserSettings = useCallback(
    async (patch: UserSettingsPatch) => {
      if (!auth.currentUser) return;
      const uid = auth.currentUser.uid;
      const userPath = `users/${uid}`;
      const userRef = doc(db, 'users', uid);

      const updateFields: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      };

      if (typeof patch.preferredModel === 'string' && patch.preferredModel.trim()) {
        updateFields.preferredModel = patch.preferredModel.trim().slice(0, 100);
      }
      if (
        patch.thinkingLevel &&
        VALID_THINKING_LEVELS.has(patch.thinkingLevel)
      ) {
        updateFields.thinkingLevel = patch.thinkingLevel;
      }
      if (
        patch.preferredVoice &&
        VALID_VOICES.has(patch.preferredVoice)
      ) {
        updateFields.preferredVoice = patch.preferredVoice;
      }
      if (Array.isArray(patch.allowedModels)) {
        updateFields.allowedModels = Array.from(
          new Set(
            patch.allowedModels
              .map((m) => m.trim().slice(0, 100))
              .filter(Boolean),
          ),
        ).slice(0, 20);
      }
      if (typeof patch.activeStoryId === 'string' && patch.activeStoryId.trim()) {
        updateFields.activeStoryId = sanitizeId(patch.activeStoryId.trim());
      }

      if (auth.currentUser.displayName) {
        updateFields.displayName = auth.currentUser.displayName.slice(0, 120);
      }
      if (auth.currentUser.email) {
        updateFields.email = auth.currentUser.email.slice(0, 254);
      }
      if (auth.currentUser.photoURL) {
        updateFields.photoURL = auth.currentUser.photoURL.slice(0, 500);
      }

      try {
        await updateDoc(userRef, updateFields);
        setSyncError(null);
      } catch (err) {
        setSyncError('Could not save settings to Firestore.');
        handleFirestoreError(err, OperationType.UPDATE, userPath);
      }
    },
    [],
  );

  const loadCloudStories = useCallback(async (): Promise<StoryProject[]> => {
    if (!auth.currentUser) return [];
    const uid = auth.currentUser.uid;
    const colPath = `users/${uid}/stories`;
    try {
      const q = query(
        collection(db, 'users', uid, 'stories'),
        where('ownerUid', '==', uid),
      );
      const snap = await getDocs(q);
      const loaded: StoryProject[] = [];
      for (const docSnap of snap.docs) {
        const d = docSnap.data();
        if (
          typeof d.title === 'string' &&
          Array.isArray(d.turns) &&
          d.turns.length > 0 &&
          Array.isArray(d.characters) &&
          Array.isArray(d.crossIndex)
        ) {
          loaded.push({
            id: String(d.id || docSnap.id),
            title: d.title,
            universe: String(d.universe || ''),
            setting: String(d.setting || ''),
            tone: String(d.tone || ''),
            premise: String(d.premise || ''),
            protagonistId: String(d.protagonistId || ''),
            turns: d.turns as StoryTurn[],
            characters: d.characters,
            crossIndex: d.crossIndex,
            chapters: Array.isArray(d.chapters) ? d.chapters : [],
            savePoints: Array.isArray(d.savePoints) ? d.savePoints : [],
            updatedAt:
              typeof d.clientUpdatedAt === 'number'
                ? d.clientUpdatedAt
                : Date.now(),
          });
        }
      }
      return loaded;
    } catch (err) {
      setSyncError('Failed to load synced stories from Firestore.');
      handleFirestoreError(err, OperationType.LIST, colPath);
    }
  }, []);

  const syncStoryToCloud = useCallback(async (story: StoryProject) => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    const safeId = sanitizeId(story.id);
    const docPath = `users/${uid}/stories/${safeId}`;
    const storyRef = doc(db, 'users', uid, 'stories', safeId);

    const baseTurns = stripTurnsForCloud(story.turns);
    const baseChapters = stripChaptersForCloud(story.chapters ?? []);
    let baseSavePoints = stripSavePointsForCloud(story.savePoints ?? []);

    const buildPayload = (isUpdate: boolean) => {
      const core: Record<string, unknown> = {
        id: safeId,
        ownerUid: uid,
        title: (story.title || 'Untitled Story').slice(0, 200),
        universe: (story.universe || '').slice(0, 200),
        setting: (story.setting || '').slice(0, 400),
        tone: (story.tone || '').slice(0, 200),
        premise: (story.premise || '').slice(0, 4000),
        protagonistId: (story.protagonistId || '').slice(0, 128),
        turns: baseTurns,
        characters: story.characters.slice(0, 100),
        crossIndex: story.crossIndex.slice(0, 300),
        chapters: baseChapters,
        savePoints: baseSavePoints,
        clientUpdatedAt:
          typeof story.updatedAt === 'number' ? story.updatedAt : Date.now(),
        updatedAt: serverTimestamp(),
      };
      if (!isUpdate) {
        core.createdAt = serverTimestamp();
      }
      return core;
    };

    // Keep well within Firestore 1MB document limit by trimming old checkpoints if needed
    while (
      baseSavePoints.length > 0 &&
      JSON.stringify(buildPayload(false)).length > 780_000
    ) {
      baseSavePoints = baseSavePoints.slice(0, Math.floor(baseSavePoints.length / 2));
    }

    try {
      // Check existence or use update/create cleanly matching immutable createdAt rules
      const existingSnap = await getDocs(
        query(
          collection(db, 'users', uid, 'stories'),
          where('ownerUid', '==', uid),
        ),
      );
      const existsInCloud = existingSnap.docs.some((d) => d.id === safeId);

      if (existsInCloud) {
        const updatePayload = buildPayload(true);
        delete updatePayload.id;
        delete updatePayload.ownerUid;
        await updateDoc(storyRef, updatePayload);
      } else {
        await setDoc(storyRef, buildPayload(false));
      }
      setSyncError(null);
    } catch (err) {
      setSyncError('Failed to sync story updates to Firestore.');
      handleFirestoreError(err, OperationType.WRITE, docPath);
    }
  }, []);

  const deleteStoryFromCloud = useCallback(async (storyId: string) => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    const safeId = sanitizeId(storyId);
    const docPath = `users/${uid}/stories/${safeId}`;
    try {
      await deleteDoc(doc(db, 'users', uid, 'stories', safeId));
    } catch (err) {
      setSyncError('Failed to remove story from Firestore.');
      handleFirestoreError(err, OperationType.DELETE, docPath);
    }
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        isSigningIn,
        authError,
        userSettings,
        settingsLoaded,
        syncError,
        signInWithGoogle,
        signOutUser,
        updateUserSettings,
        loadCloudStories,
        syncStoryToCloud,
        deleteStoryFromCloud,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return ctx;
}
