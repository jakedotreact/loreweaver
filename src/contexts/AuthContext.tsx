import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
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
  getDoc,
  getDocFromServer,
  getDocs,
  orderBy,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  isFirebaseConfigured,
  OperationType,
} from '../firebase';
import {
  CharacterProfile,
  CollaborationSession,
  CommentTargetType,
  ModelThinkingLevel,
  PublicStoryWork,
  SavePoint,
  SharedWork,
  ShareScope,
  StoryChapter,
  StoryComment,
  StoryProject,
  StorySubscription,
  StoryTags,
  StoryTurn,
  TtsVoiceName,
  UserCollection,
} from '../types/story';
import { countStoryWords, normalizeStoryTags } from '../utils/ao3Tags';
import {
  stripChaptersForCloud,
  stripSavePointsForCloud,
  stripTagsForCloud,
  stripTurnsForCloud,
  stripUndefinedDeep,
} from '../utils/cloudSanitize';
import { getPublicStoryIdForProject, resolveDisplayUsername } from '../utils/communityStore';

export interface UserSettings {
  uid: string;
  displayName: string;
  username?: string;
  email: string;
  photoURL?: string;
  preferredModel: string;
  thinkingLevel: ModelThinkingLevel;
  preferredVoice: TtsVoiceName;
  autoPlayNarration: boolean;
  allowedModels: string[];
  activeStoryId?: string;
}

export interface UserSettingsPatch {
  username?: string;
  preferredModel?: string;
  thinkingLevel?: ModelThinkingLevel;
  preferredVoice?: TtsVoiceName;
  autoPlayNarration?: boolean;
  allowedModels?: string[];
  activeStoryId?: string;
}

export interface PublishShareInput {
  existingShareId?: string;
  scope: ShareScope;
  story: StoryProject;
  chapter?: StoryChapter;
  turn?: StoryTurn;
}

interface AuthContextValue {
  firebaseConfigured: boolean;
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
  findExistingShare: (
    sourceStoryId: string,
    scope: ShareScope,
    targetId: string,
  ) => Promise<SharedWork | null>;
  publishSharedWork: (input: PublishShareInput) => Promise<SharedWork>;
  fetchSharedWork: (shareId: string) => Promise<SharedWork | null>;
  revokeSharedWork: (shareId: string) => Promise<void>;
  findExistingCollaboration: (
    sourceStoryId: string,
  ) => Promise<CollaborationSession | null>;
  publishCollaboration: (
    story: StoryProject,
    existingCollabId?: string,
  ) => Promise<CollaborationSession>;
  joinCollaboration: (collabId: string) => Promise<CollaborationSession | null>;
  subscribeCollaboration: (
    collabId: string,
    onData: (session: CollaborationSession | null) => void,
    onError: (message: string) => void,
  ) => () => void;
  pushCollaborationUpdate: (collabId: string, story: StoryProject) => Promise<void>;
  revokeCollaboration: (collabId: string) => Promise<void>;
  listPublicStories: () => Promise<PublicStoryWork[]>;
  fetchPublicStory: (publicId: string) => Promise<PublicStoryWork | null>;
  syncPublicStoryListing: (story: StoryProject) => Promise<PublicStoryWork | null>;
  listStoryComments: (publicId: string) => Promise<StoryComment[]>;
  addStoryComment: (
    publicId: string,
    payload: {
      body: string;
      targetType?: CommentTargetType;
      targetId?: string;
      targetLabel?: string;
      chapterOrSceneLabel?: string;
      parentCommentId?: string;
    },
  ) => Promise<StoryComment>;
  deleteStoryComment: (publicId: string, commentId: string) => Promise<void>;
  hasUserGivenKudo: (publicId: string, anonToken?: string) => Promise<boolean>;
  giveStoryKudo: (
    publicId: string,
    options?: { anonymous?: boolean; anonToken?: string },
  ) => Promise<number>;
  loadCollections: () => Promise<UserCollection[]>;
  upsertCollection: (collectionItem: UserCollection) => Promise<void>;
  deleteCollection: (collectionId: string) => Promise<void>;
  loadSubscriptions: () => Promise<StorySubscription[]>;
  upsertSubscription: (subscription: StorySubscription) => Promise<void>;
  deleteSubscription: (storyId: string) => Promise<void>;
  clearAuthError: () => void;
  clearSyncError: () => void;
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

const VALID_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

const FIREBASE_KEY_MISSING_MSG =
  'Firebase web API key is cleared for rotation. Add your restricted VITE_FIREBASE_API_KEY in .env.local.';

const AuthContext = createContext<AuthContextValue | null>(null);

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128);
  return cleaned || `id-${Date.now()}`;
}

function generatePrefixedId(prefix: string): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let suffix = '';
  for (let i = 0; i < bytes.length; i += 1) {
    suffix += alphabet[bytes[i] % alphabet.length];
  }
  return `${prefix}-${suffix}`;
}

function timestampToMs(val: unknown): number {
  if (val instanceof Timestamp) {
    return val.toMillis();
  }
  if (
    val &&
    typeof val === 'object' &&
    'toMillis' in val &&
    typeof (val as { toMillis?: unknown }).toMillis === 'function'
  ) {
    return (val as { toMillis: () => number }).toMillis();
  }
  return Date.now();
}

function parseSharedWorkDoc(id: string, data: Record<string, unknown>): SharedWork | null {
  if (
    typeof data.storyTitle !== 'string' ||
    typeof data.workTitle !== 'string' ||
    !Array.isArray(data.turns) ||
    data.turns.length === 0
  ) {
    return null;
  }
  const rawScope = data.scope;
  const scope: ShareScope =
    rawScope === 'chapter' || rawScope === 'scene' ? rawScope : 'story';

  return {
    id: typeof data.id === 'string' && data.id ? data.id : id,
    ownerUid: String(data.ownerUid || ''),
    authorName: String(data.authorName || 'Anonymous Author'),
    scope,
    sourceStoryId: String(data.sourceStoryId || ''),
    targetId: String(data.targetId || ''),
    storyTitle: data.storyTitle,
    workTitle: data.workTitle,
    universe: String(data.universe || ''),
    setting: String(data.setting || ''),
    tone: String(data.tone || ''),
    premise: String(data.premise || ''),
    summary: String(data.summary || ''),
    turns: data.turns as StoryTurn[],
    chapters: Array.isArray(data.chapters) ? (data.chapters as StoryChapter[]) : [],
    characters: Array.isArray(data.characters)
      ? (data.characters as CharacterProfile[])
      : [],
    createdAtMs: timestampToMs(data.createdAt),
    updatedAtMs: timestampToMs(data.updatedAt),
  };
}

function parseCollaborationDoc(
  id: string,
  data: Record<string, unknown>,
): CollaborationSession | null {
  if (
    typeof data.title !== 'string' ||
    !Array.isArray(data.turns) ||
    data.turns.length === 0
  ) {
    return null;
  }
  const collabId = typeof data.id === 'string' && data.id ? data.id : id;
  const sourceStoryId = String(data.sourceStoryId || collabId);
  const project: StoryProject = {
    id: sourceStoryId,
    title: data.title,
    universe: String(data.universe || ''),
    setting: String(data.setting || ''),
    tone: String(data.tone || ''),
    premise: String(data.premise || ''),
    protagonistId: String(data.protagonistId || ''),
    turns: data.turns as StoryTurn[],
    characters: Array.isArray(data.characters)
      ? (data.characters as CharacterProfile[])
      : [],
    crossIndex: Array.isArray(data.crossIndex) ? data.crossIndex : [],
    chapters: Array.isArray(data.chapters) ? (data.chapters as StoryChapter[]) : [],
    savePoints: Array.isArray(data.savePoints) ? (data.savePoints as SavePoint[]) : [],
    collabId,
    updatedAt:
      typeof data.clientUpdatedAt === 'number'
        ? data.clientUpdatedAt
        : timestampToMs(data.updatedAt),
  };

  return {
    id: collabId,
    ownerUid: String(data.ownerUid || ''),
    ownerName: String(data.ownerName || 'Folio & Canon Author'),
    sourceStoryId,
    project,
    lastEditedByUid: String(data.lastEditedByUid || data.ownerUid || ''),
    lastEditedByName: String(
      data.lastEditedByName || data.ownerName || 'Collaborator',
    ),
    createdAtMs: timestampToMs(data.createdAt),
    updatedAtMs: timestampToMs(data.updatedAt),
  };
}

function parsePublicStoryDoc(
  id: string,
  data: Record<string, unknown>,
): PublicStoryWork | null {
  if (
    typeof data.title !== 'string' ||
    !Array.isArray(data.turns) ||
    data.turns.length === 0
  ) {
    return null;
  }
  const universe = String(data.universe || '');
  const tone = String(data.tone || '');
  const characters = Array.isArray(data.characters)
    ? (data.characters as CharacterProfile[])
    : [];
  const rawTags =
    data.tags && typeof data.tags === 'object'
      ? (data.tags as Partial<StoryTags>)
      : undefined;
  const tags = normalizeStoryTags(rawTags, {
    universe,
    tone,
    characters,
  });
  const turns = data.turns as StoryTurn[];
  return {
    id: typeof data.id === 'string' && data.id ? data.id : id,
    ownerUid: String(data.ownerUid || ''),
    sourceStoryId: String(data.sourceStoryId || ''),
    authorName: String(data.authorName || 'Folio & Canon Author'),
    title: data.title,
    universe,
    setting: String(data.setting || ''),
    tone,
    premise: String(data.premise || ''),
    isPrivate: Boolean(data.isPrivate),
    tags,
    turns,
    chapters: Array.isArray(data.chapters) ? (data.chapters as StoryChapter[]) : [],
    characters,
    wordCount:
      typeof data.wordCount === 'number'
        ? data.wordCount
        : countStoryWords(turns),
    kudosCount: typeof data.kudosCount === 'number' ? data.kudosCount : 0,
    commentCount: typeof data.commentCount === 'number' ? data.commentCount : 0,
    createdAtMs: timestampToMs(data.createdAt),
    updatedAtMs: timestampToMs(data.updatedAt),
  };
}

function parseStoryCommentDoc(
  id: string,
  data: Record<string, unknown>,
): StoryComment | null {
  if (typeof data.body !== 'string' || !data.body.trim()) {
    return null;
  }
  const rawType = data.targetType;
  const targetType: CommentTargetType =
    rawType === 'chapter' || rawType === 'scene' ? rawType : 'story';
  const storyId = String(data.storyId || '');
  return {
    id: typeof data.id === 'string' && data.id ? data.id : id,
    storyId,
    authorUid: String(data.authorUid || ''),
    authorName: String(data.authorName || 'Reader'),
    body: data.body,
    targetType,
    targetId:
      typeof data.targetId === 'string' && data.targetId ? data.targetId : storyId,
    targetLabel:
      typeof data.targetLabel === 'string' && data.targetLabel
        ? data.targetLabel
        : typeof data.chapterOrSceneLabel === 'string' && data.chapterOrSceneLabel
          ? data.chapterOrSceneLabel
          : undefined,
    chapterOrSceneLabel:
      typeof data.chapterOrSceneLabel === 'string' && data.chapterOrSceneLabel
        ? data.chapterOrSceneLabel
        : undefined,
    parentCommentId:
      typeof data.parentCommentId === 'string' && data.parentCommentId
        ? data.parentCommentId
        : undefined,
    storyIsPrivate: Boolean(data.storyIsPrivate),
    createdAtMs: timestampToMs(data.createdAt),
    updatedAtMs: timestampToMs(data.updatedAt),
  };
}

export function formatReadableFirestoreError(err: unknown): string {
  if (err instanceof Error) {
    try {
      const parsed = JSON.parse(err.message) as { error?: string; path?: string };
      if (parsed && typeof parsed.error === 'string') {
        return parsed.error;
      }
    } catch {
      // Fall back to plain Error.message
    }
    return err.message;
  }
  return 'Firestore operation failed.';
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const userDocEnsuredUidRef = useRef<string | null>(null);
  const ensureUserDocPromiseRef = useRef<Promise<void> | null>(null);

  const ensureUserDocumentExists = useCallback(async (targetUser: User) => {
    if (!db) return;
    if (userDocEnsuredUidRef.current === targetUser.uid) {
      return;
    }
    if (ensureUserDocPromiseRef.current) {
      await ensureUserDocPromiseRef.current;
      return;
    }

    const firestore = db;
    const userPath = `users/${targetUser.uid}`;
    const userRef = doc(firestore, 'users', targetUser.uid);

    const run = (async () => {
      try {
        const serverSnap = await getDocFromServer(userRef);
        if (serverSnap.exists()) {
          userDocEnsuredUidRef.current = targetUser.uid;
          return;
        }
      } catch {
        const localOrServerSnap = await getDoc(userRef).catch(() => null);
        if (localOrServerSnap?.exists()) {
          userDocEnsuredUidRef.current = targetUser.uid;
          return;
        }
      }

      const initialPayload: Record<string, unknown> = {
        uid: targetUser.uid,
        displayName: (targetUser.displayName || targetUser.email || 'Author').slice(0, 120),
        email: (targetUser.email || '').slice(0, 254),
        preferredModel: 'gemini-4-hydrogen',
        thinkingLevel: 'HIGH',
        preferredVoice: 'Charon',
        autoPlayNarration: false,
        allowedModels: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (targetUser.photoURL) {
        initialPayload.photoURL = targetUser.photoURL.slice(0, 500);
      }

      try {
        await setDoc(userRef, initialPayload);
        userDocEnsuredUidRef.current = targetUser.uid;
      } catch (err) {
        setSyncError('Failed to initialize account settings in Firestore.');
        handleFirestoreError(err, OperationType.CREATE, userPath);
      }
    })();

    ensureUserDocPromiseRef.current = run;
    try {
      await run;
    } finally {
      ensureUserDocPromiseRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setAuthReady(true);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        userDocEnsuredUidRef.current = null;
        ensureUserDocPromiseRef.current = null;
        setUserSettings(null);
        setSettingsLoaded(false);
        setSyncError(null);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady || !user || !db) return;
    const userPath = `users/${user.uid}`;
    const userRef = doc(db, 'users', user.uid);
    let cancelled = false;

    const unsubscribe = onSnapshot(
      userRef,
      (snap) => {
        if (cancelled) return;
        if (snap.exists()) {
          if (!snap.metadata.hasPendingWrites) {
            userDocEnsuredUidRef.current = user.uid;
          }
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
            username:
              typeof data.username === 'string' && data.username.trim()
                ? data.username.trim().slice(0, 40)
                : undefined,
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
            autoPlayNarration:
              typeof data.autoPlayNarration === 'boolean'
                ? data.autoPlayNarration
                : false,
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
          void ensureUserDocumentExists(user).catch(() => {});
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
  }, [authReady, user, ensureUserDocumentExists]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    if (!isFirebaseConfigured || !auth) {
      setAuthError(FIREBASE_KEY_MISSING_MSG);
      return;
    }
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
    if (!auth) return;
    await signOut(auth);
  }, []);

  const updateUserSettings = useCallback(
    async (patch: UserSettingsPatch) => {
      if (!auth?.currentUser || !db) return;
      await ensureUserDocumentExists(auth.currentUser);
      const currentUser = auth.currentUser;
      const uid = currentUser.uid;
      const userPath = `users/${uid}`;
      const userRef = doc(db, 'users', uid);

      const updateFields: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      };

      if (typeof patch.username === 'string' && patch.username.trim()) {
        updateFields.username = patch.username.trim().slice(0, 40);
      }
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
      if (typeof patch.autoPlayNarration === 'boolean') {
        updateFields.autoPlayNarration = patch.autoPlayNarration;
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

      if (currentUser.displayName) {
        updateFields.displayName = currentUser.displayName.slice(0, 120);
      }
      if (currentUser.email) {
        updateFields.email = currentUser.email.slice(0, 254);
      }
      if (currentUser.photoURL) {
        updateFields.photoURL = currentUser.photoURL.slice(0, 500);
      }

      try {
        await updateDoc(userRef, updateFields);
        setSyncError(null);
      } catch (err) {
        setSyncError('Could not save settings to Firestore.');
        handleFirestoreError(err, OperationType.UPDATE, userPath);
      }
    },
    [ensureUserDocumentExists],
  );

  const loadCloudStories = useCallback(async (): Promise<StoryProject[]> => {
    if (!auth?.currentUser || !db) return [];
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
            shareId: typeof d.shareId === 'string' && d.shareId ? d.shareId : undefined,
            collabId: typeof d.collabId === 'string' && d.collabId ? d.collabId : undefined,
            publicStoryId:
              typeof d.publicStoryId === 'string' && d.publicStoryId
                ? d.publicStoryId
                : undefined,
            isPrivate: typeof d.isPrivate === 'boolean' ? d.isPrivate : false,
            tags:
              d.tags && typeof d.tags === 'object'
                ? normalizeStoryTags(d.tags as Partial<StoryTags>, {
                    universe: String(d.universe || ''),
                    tone: String(d.tone || ''),
                    characters: d.characters,
                  })
                : undefined,
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

  const syncStoryToCloud = useCallback(
    async (story: StoryProject) => {
      if (!auth?.currentUser || !db) return;
      await ensureUserDocumentExists(auth.currentUser);
      const uid = auth.currentUser.uid;
      const safeId = sanitizeId(story.id);
      const docPath = `users/${uid}/stories/${safeId}`;
      const storyRef = doc(db, 'users', uid, 'stories', safeId);

      const baseTurns = stripTurnsForCloud(story.turns);
      const baseChapters = stripChaptersForCloud(story.chapters ?? []);
      let baseSavePoints = stripSavePointsForCloud(story.savePoints ?? []);
      const safeCharacters = stripUndefinedDeep(story.characters.slice(0, 100));
      const safeCrossIndex = stripUndefinedDeep(story.crossIndex.slice(0, 300));
      const safeTags = stripTagsForCloud(story.tags, story);

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
          characters: safeCharacters,
          crossIndex: safeCrossIndex,
          chapters: baseChapters,
          savePoints: baseSavePoints,
          isPrivate: story.isPrivate === true,
          tags: safeTags,
          clientUpdatedAt:
            typeof story.updatedAt === 'number' ? story.updatedAt : Date.now(),
          updatedAt: serverTimestamp(),
        };
        if (story.shareId && VALID_ID_RE.test(story.shareId)) {
          core.shareId = story.shareId;
        }
        if (story.collabId && VALID_ID_RE.test(story.collabId)) {
          core.collabId = story.collabId;
        }
        if (story.publicStoryId && VALID_ID_RE.test(story.publicStoryId)) {
          core.publicStoryId = story.publicStoryId;
        }
        if (!isUpdate) {
          core.createdAt = serverTimestamp();
        }
        return core;
      };

      while (
        baseSavePoints.length > 0 &&
        JSON.stringify(buildPayload(false)).length > 780_000
      ) {
        baseSavePoints = baseSavePoints.slice(0, Math.floor(baseSavePoints.length / 2));
      }

      try {
        const existingSnap = await getDoc(storyRef);

        if (existingSnap.exists()) {
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
    },
    [ensureUserDocumentExists],
  );

  const deleteStoryFromCloud = useCallback(async (storyId: string) => {
    if (!auth?.currentUser || !db) return;
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

  const findExistingShare = useCallback(
    async (
      sourceStoryId: string,
      scope: ShareScope,
      targetId: string,
    ): Promise<SharedWork | null> => {
      if (!auth?.currentUser || !db) return null;
      const uid = auth.currentUser.uid;
      const safeSourceId = sanitizeId(sourceStoryId);
      const colPath = 'sharedWorks';
      try {
        const q = query(
          collection(db, 'sharedWorks'),
          where('ownerUid', '==', uid),
        );
        const snap = await getDocs(q);
        for (const docSnap of snap.docs) {
          const parsed = parseSharedWorkDoc(docSnap.id, docSnap.data());
          if (
            parsed &&
            parsed.sourceStoryId === safeSourceId &&
            parsed.scope === scope &&
            parsed.targetId === targetId
          ) {
            return parsed;
          }
        }
        return null;
      } catch (err) {
        setSyncError('Failed to check existing shared links in Firestore.');
        handleFirestoreError(err, OperationType.LIST, colPath);
      }
    },
    [],
  );

  const publishSharedWork = useCallback(
    async (input: PublishShareInput): Promise<SharedWork> => {
      if (!isFirebaseConfigured || !db) {
        throw new Error(FIREBASE_KEY_MISSING_MSG);
      }
      if (!auth?.currentUser) {
        throw new Error('Please sign in with Google to create a shareable Firestore link.');
      }
      await ensureUserDocumentExists(auth.currentUser);
      const currentUser = auth.currentUser;
      const uid = currentUser.uid;
      const safeSourceStoryId = sanitizeId(input.story.id);

      let targetId = '';
      let workTitle = (input.story.title || 'Untitled Story').slice(0, 200);
      let summary = '';
      let rawTurns: StoryTurn[] = input.story.turns;
      let rawChapters: StoryChapter[] = input.story.chapters ?? [];

      if (input.scope === 'chapter') {
        if (!input.chapter) {
          throw new Error('No chapter selected to share.');
        }
        targetId = input.chapter.id.slice(0, 128);
        workTitle = `Chapter ${String(input.chapter.chapterNumber).padStart(2, '0')} — ${input.chapter.title}`.slice(0, 200);
        summary = (input.chapter.summary || '').slice(0, 1000);
        const turnMap = new Map(input.story.turns.map((t) => [t.id, t]));
        const chapterTurns = input.chapter.turnIds
          .map((id) => turnMap.get(id))
          .filter((t): t is StoryTurn => Boolean(t));
        if (chapterTurns.length === 0) {
          throw new Error('This chapter has no scenes to share yet.');
        }
        rawTurns = chapterTurns;
        rawChapters = [input.chapter];
      } else if (input.scope === 'scene') {
        if (!input.turn) {
          throw new Error('No scene selected to share.');
        }
        targetId = input.turn.id.slice(0, 128);
        workTitle = `Scene ${String(input.turn.turnNumber).padStart(2, '0')} — ${input.turn.sceneTitle}`.slice(0, 200);
        rawTurns = [input.turn];
        rawChapters = [];
      }

      const shareId =
        input.existingShareId && VALID_ID_RE.test(input.existingShareId)
          ? input.existingShareId
          : generatePrefixedId('sh');
      const docPath = `sharedWorks/${shareId}`;
      const shareRef = doc(db, 'sharedWorks', shareId);

      const safeTurns = stripTurnsForCloud(rawTurns);
      const safeChapters = stripChaptersForCloud(rawChapters);
      const safeCharacters = stripUndefinedDeep(
        input.story.characters.slice(0, 100),
      );
      const authorName = (
        currentUser.displayName ||
        userSettings?.displayName ||
        'Folio & Canon Author'
      )
        .trim()
        .slice(0, 120) || 'Folio & Canon Author';

      try {
        const existingSnap = await getDoc(shareRef);
        const isUpdate =
          existingSnap.exists() &&
          existingSnap.data()?.ownerUid === uid;

        if (isUpdate) {
          await updateDoc(shareRef, {
            authorName,
            storyTitle: (input.story.title || 'Untitled Story').slice(0, 200),
            workTitle,
            universe: (input.story.universe || '').slice(0, 200),
            setting: (input.story.setting || '').slice(0, 400),
            tone: (input.story.tone || '').slice(0, 200),
            premise: (input.story.premise || '').slice(0, 4000),
            summary,
            turns: safeTurns,
            chapters: safeChapters,
            characters: safeCharacters,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(shareRef, {
            id: shareId,
            ownerUid: uid,
            authorName,
            scope: input.scope,
            sourceStoryId: safeSourceStoryId,
            targetId,
            storyTitle: (input.story.title || 'Untitled Story').slice(0, 200),
            workTitle,
            universe: (input.story.universe || '').slice(0, 200),
            setting: (input.story.setting || '').slice(0, 400),
            tone: (input.story.tone || '').slice(0, 200),
            premise: (input.story.premise || '').slice(0, 4000),
            summary,
            turns: safeTurns,
            chapters: safeChapters,
            characters: safeCharacters,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        setSyncError(null);
        const now = Date.now();
        return {
          id: shareId,
          ownerUid: uid,
          authorName,
          scope: input.scope,
          sourceStoryId: safeSourceStoryId,
          targetId,
          storyTitle: (input.story.title || 'Untitled Story').slice(0, 200),
          workTitle,
          universe: (input.story.universe || '').slice(0, 200),
          setting: (input.story.setting || '').slice(0, 400),
          tone: (input.story.tone || '').slice(0, 200),
          premise: (input.story.premise || '').slice(0, 4000),
          summary,
          turns: safeTurns,
          chapters: safeChapters,
          characters: safeCharacters,
          createdAtMs: isUpdate
            ? timestampToMs(existingSnap.data()?.createdAt)
            : now,
          updatedAtMs: now,
        };
      } catch (err) {
        setSyncError('Failed to publish share link to Firestore.');
        handleFirestoreError(err, OperationType.WRITE, docPath);
      }
    },
    [ensureUserDocumentExists, userSettings?.displayName],
  );

  const fetchSharedWork = useCallback(
    async (shareId: string): Promise<SharedWork | null> => {
      if (!isFirebaseConfigured || !db) {
        throw new Error(FIREBASE_KEY_MISSING_MSG);
      }
      const trimmed = shareId.trim();
      if (!VALID_ID_RE.test(trimmed)) {
        return null;
      }
      const docPath = `sharedWorks/${trimmed}`;
      try {
        const snap = await getDoc(doc(db, 'sharedWorks', trimmed));
        if (!snap.exists()) return null;
        return parseSharedWorkDoc(snap.id, snap.data());
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, docPath);
      }
    },
    [],
  );

  const revokeSharedWork = useCallback(async (shareId: string) => {
    if (!auth?.currentUser || !db) return;
    const trimmed = shareId.trim();
    if (!VALID_ID_RE.test(trimmed)) return;
    const docPath = `sharedWorks/${trimmed}`;
    try {
      await deleteDoc(doc(db, 'sharedWorks', trimmed));
      setSyncError(null);
    } catch (err) {
      setSyncError('Failed to revoke shared link in Firestore.');
      handleFirestoreError(err, OperationType.DELETE, docPath);
    }
  }, []);

  const findExistingCollaboration = useCallback(
    async (sourceStoryId: string): Promise<CollaborationSession | null> => {
      if (!auth?.currentUser || !db) return null;
      const uid = auth.currentUser.uid;
      const safeSourceId = sanitizeId(sourceStoryId);
      const colPath = 'collaborations';
      try {
        const q = query(
          collection(db, 'collaborations'),
          where('ownerUid', '==', uid),
        );
        const snap = await getDocs(q);
        for (const docSnap of snap.docs) {
          const parsed = parseCollaborationDoc(docSnap.id, docSnap.data());
          if (parsed && parsed.sourceStoryId === safeSourceId) {
            return parsed;
          }
        }
        return null;
      } catch (err) {
        setSyncError('Failed to check collaboration link in Firestore.');
        handleFirestoreError(err, OperationType.LIST, colPath);
      }
    },
    [],
  );

  const publishCollaboration = useCallback(
    async (
      story: StoryProject,
      existingCollabId?: string,
    ): Promise<CollaborationSession> => {
      if (!isFirebaseConfigured || !db) {
        throw new Error(FIREBASE_KEY_MISSING_MSG);
      }
      if (!auth?.currentUser) {
        throw new Error('Please sign in with Google to create a collaboration link.');
      }
      await ensureUserDocumentExists(auth.currentUser);
      const currentUser = auth.currentUser;
      const uid = currentUser.uid;
      const safeSourceStoryId = sanitizeId(story.id);
      const collabId =
        existingCollabId && VALID_ID_RE.test(existingCollabId)
          ? existingCollabId
          : story.collabId && VALID_ID_RE.test(story.collabId)
            ? story.collabId
            : generatePrefixedId('co');

      const docPath = `collaborations/${collabId}`;
      const collabRef = doc(db, 'collaborations', collabId);
      const memberRef = doc(db, 'collaborations', collabId, 'members', uid);

      const safeTurns = stripTurnsForCloud(story.turns);
      const safeChapters = stripChaptersForCloud(story.chapters ?? []);
      let safeSavePoints = stripSavePointsForCloud(story.savePoints ?? []);
      const safeCharacters = stripUndefinedDeep(story.characters.slice(0, 100));
      const safeCrossIndex = stripUndefinedDeep(story.crossIndex.slice(0, 300));
      const ownerName =
        (
          currentUser.displayName ||
          userSettings?.displayName ||
          'Folio & Canon Author'
        )
          .trim()
          .slice(0, 120) || 'Folio & Canon Author';
      const clientUpdatedAt =
        typeof story.updatedAt === 'number' ? story.updatedAt : Date.now();

      while (
        safeSavePoints.length > 0 &&
        JSON.stringify({
          turns: safeTurns,
          chapters: safeChapters,
          savePoints: safeSavePoints,
        }).length > 760_000
      ) {
        safeSavePoints = safeSavePoints.slice(0, Math.floor(safeSavePoints.length / 2));
      }

      try {
        const existingSnap = await getDoc(collabRef);
        const isUpdate = existingSnap.exists();

        if (isUpdate) {
          await updateDoc(collabRef, {
            ownerName,
            title: (story.title || 'Untitled Story').slice(0, 200),
            universe: (story.universe || '').slice(0, 200),
            setting: (story.setting || '').slice(0, 400),
            tone: (story.tone || '').slice(0, 200),
            premise: (story.premise || '').slice(0, 4000),
            protagonistId: (story.protagonistId || '').slice(0, 128),
            turns: safeTurns,
            characters: safeCharacters,
            crossIndex: safeCrossIndex,
            chapters: safeChapters,
            savePoints: safeSavePoints,
            lastEditedByUid: uid,
            lastEditedByName: ownerName,
            clientUpdatedAt,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(collabRef, {
            id: collabId,
            ownerUid: uid,
            ownerName,
            sourceStoryId: safeSourceStoryId,
            title: (story.title || 'Untitled Story').slice(0, 200),
            universe: (story.universe || '').slice(0, 200),
            setting: (story.setting || '').slice(0, 400),
            tone: (story.tone || '').slice(0, 200),
            premise: (story.premise || '').slice(0, 4000),
            protagonistId: (story.protagonistId || '').slice(0, 128),
            turns: safeTurns,
            characters: safeCharacters,
            crossIndex: safeCrossIndex,
            chapters: safeChapters,
            savePoints: safeSavePoints,
            lastEditedByUid: uid,
            lastEditedByName: ownerName,
            clientUpdatedAt,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        const memberSnap = await getDoc(memberRef);
        if (!memberSnap.exists()) {
          await setDoc(memberRef, {
            uid,
            displayName: ownerName,
            role: 'owner',
            joinedAt: serverTimestamp(),
          });
        }

        setSyncError(null);
        const now = Date.now();
        return {
          id: collabId,
          ownerUid: uid,
          ownerName,
          sourceStoryId: safeSourceStoryId,
          project: {
            ...story,
            collabId,
            turns: safeTurns,
            chapters: safeChapters,
            savePoints: safeSavePoints,
            characters: safeCharacters,
            crossIndex: safeCrossIndex,
            updatedAt: clientUpdatedAt,
          },
          lastEditedByUid: uid,
          lastEditedByName: ownerName,
          createdAtMs: isUpdate
            ? timestampToMs(existingSnap.data()?.createdAt)
            : now,
          updatedAtMs: now,
        };
      } catch (err) {
        setSyncError('Failed to publish collaboration room in Firestore.');
        handleFirestoreError(err, OperationType.WRITE, docPath);
      }
    },
    [ensureUserDocumentExists, userSettings?.displayName],
  );

  const joinCollaboration = useCallback(
    async (collabId: string): Promise<CollaborationSession | null> => {
      if (!isFirebaseConfigured || !db) {
        throw new Error(FIREBASE_KEY_MISSING_MSG);
      }
      if (!auth?.currentUser) {
        throw new Error('Sign in with Google to join and co-author this story.');
      }
      const trimmed = collabId.trim();
      if (!VALID_ID_RE.test(trimmed)) return null;
      await ensureUserDocumentExists(auth.currentUser);
      const currentUser = auth.currentUser;
      const uid = currentUser.uid;
      const docPath = `collaborations/${trimmed}`;
      const collabRef = doc(db, 'collaborations', trimmed);
      try {
        const snap = await getDoc(collabRef);
        if (!snap.exists()) return null;
        const parsed = parseCollaborationDoc(snap.id, snap.data());
        if (!parsed) return null;

        const memberRef = doc(db, 'collaborations', trimmed, 'members', uid);
        const memberSnap = await getDoc(memberRef);
        if (!memberSnap.exists()) {
          const displayName = (
            currentUser.displayName ||
            userSettings?.displayName ||
            'Collaborator'
          )
            .trim()
            .slice(0, 120) || 'Collaborator';
          await setDoc(memberRef, {
            uid,
            displayName,
            role: parsed.ownerUid === uid ? 'owner' : 'editor',
            joinedAt: serverTimestamp(),
          });
        }

        setSyncError(null);
        return parsed;
      } catch (err) {
        setSyncError('Unable to open collaboration room in Firestore.');
        handleFirestoreError(err, OperationType.GET, docPath);
      }
    },
    [ensureUserDocumentExists, userSettings?.displayName],
  );

  const subscribeCollaboration = useCallback(
    (
      collabId: string,
      onData: (session: CollaborationSession | null) => void,
      onError: (message: string) => void,
    ): (() => void) => {
      const trimmed = collabId.trim();
      if (!isFirebaseConfigured || !db || !auth?.currentUser || !VALID_ID_RE.test(trimmed)) {
        return () => {};
      }
      const docPath = `collaborations/${trimmed}`;
      const collabRef = doc(db, 'collaborations', trimmed);
      return onSnapshot(
        collabRef,
        (snap) => {
          if (!snap.exists()) {
            onData(null);
            return;
          }
          onData(parseCollaborationDoc(snap.id, snap.data()));
        },
        (err) => {
          onError(formatReadableFirestoreError(err));
          handleFirestoreError(err, OperationType.GET, docPath);
        },
      );
    },
    [],
  );

  const pushCollaborationUpdate = useCallback(
    async (collabId: string, story: StoryProject) => {
      if (!isFirebaseConfigured || !db || !auth?.currentUser) return;
      const trimmed = collabId.trim();
      if (!VALID_ID_RE.test(trimmed)) return;
      await ensureUserDocumentExists(auth.currentUser);
      const currentUser = auth.currentUser;
      const uid = currentUser.uid;
      const docPath = `collaborations/${trimmed}`;
      const collabRef = doc(db, 'collaborations', trimmed);

      const safeTurns = stripTurnsForCloud(story.turns);
      const safeChapters = stripChaptersForCloud(story.chapters ?? []);
      let safeSavePoints = stripSavePointsForCloud(story.savePoints ?? []);
      const safeCharacters = stripUndefinedDeep(story.characters.slice(0, 100));
      const safeCrossIndex = stripUndefinedDeep(story.crossIndex.slice(0, 300));
      const editorName = (
        currentUser.displayName ||
        userSettings?.displayName ||
        'Collaborator'
      )
        .trim()
        .slice(0, 120) || 'Collaborator';

      while (
        safeSavePoints.length > 0 &&
        JSON.stringify({
          turns: safeTurns,
          chapters: safeChapters,
          savePoints: safeSavePoints,
        }).length > 760_000
      ) {
        safeSavePoints = safeSavePoints.slice(0, Math.floor(safeSavePoints.length / 2));
      }

      try {
        await updateDoc(collabRef, {
          title: (story.title || 'Untitled Story').slice(0, 200),
          universe: (story.universe || '').slice(0, 200),
          setting: (story.setting || '').slice(0, 400),
          tone: (story.tone || '').slice(0, 200),
          premise: (story.premise || '').slice(0, 4000),
          protagonistId: (story.protagonistId || '').slice(0, 128),
          turns: safeTurns,
          characters: safeCharacters,
          crossIndex: safeCrossIndex,
          chapters: safeChapters,
          savePoints: safeSavePoints,
          lastEditedByUid: uid,
          lastEditedByName: editorName,
          clientUpdatedAt:
            typeof story.updatedAt === 'number' ? story.updatedAt : Date.now(),
          updatedAt: serverTimestamp(),
        });
        setSyncError(null);
      } catch (err) {
        setSyncError('Failed to save collaborative update to Firestore.');
        handleFirestoreError(err, OperationType.UPDATE, docPath);
      }
    },
    [ensureUserDocumentExists, userSettings?.displayName],
  );

  const revokeCollaboration = useCallback(async (collabId: string) => {
    if (!auth?.currentUser || !db) return;
    const trimmed = collabId.trim();
    if (!VALID_ID_RE.test(trimmed)) return;
    const docPath = `collaborations/${trimmed}`;
    try {
      await deleteDoc(doc(db, 'collaborations', trimmed));
      setSyncError(null);
    } catch (err) {
      setSyncError('Failed to revoke collaboration link in Firestore.');
      handleFirestoreError(err, OperationType.DELETE, docPath);
    }
  }, []);

  const listPublicStories = useCallback(async (): Promise<PublicStoryWork[]> => {
    if (!isFirebaseConfigured || !db) return [];
    const colPath = 'publicStories';
    try {
      const q = query(
        collection(db, 'publicStories'),
        where('isPrivate', '==', false),
      );
      const snap = await getDocs(q);
      const works: PublicStoryWork[] = [];
      for (const docSnap of snap.docs) {
        const parsed = parsePublicStoryDoc(docSnap.id, docSnap.data());
        if (parsed && parsed.isPrivate !== true) {
          works.push(parsed);
        }
      }
      return works.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, colPath);
    }
  }, []);

  const fetchPublicStory = useCallback(
    async (publicId: string): Promise<PublicStoryWork | null> => {
      if (!isFirebaseConfigured || !db) return null;
      const trimmed = publicId.trim();
      if (!VALID_ID_RE.test(trimmed)) return null;
      const docPath = `publicStories/${trimmed}`;
      try {
        const snap = await getDoc(doc(db, 'publicStories', trimmed));
        if (!snap.exists()) return null;
        return parsePublicStoryDoc(snap.id, snap.data());
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, docPath);
      }
    },
    [],
  );

  const syncPublicStoryListing = useCallback(
    async (story: StoryProject): Promise<PublicStoryWork | null> => {
      if (!isFirebaseConfigured || !db || !auth?.currentUser) return null;
      await ensureUserDocumentExists(auth.currentUser);
      const currentUser = auth.currentUser;
      const uid = currentUser.uid;
      const publicId = sanitizeId(getPublicStoryIdForProject(story));
      const docPath = `publicStories/${publicId}`;
      const pubRef = doc(db, 'publicStories', publicId);

      const safeTurns = stripTurnsForCloud(story.turns);
      const safeChapters = stripChaptersForCloud(story.chapters ?? []);
      const safeCharacters = stripUndefinedDeep(story.characters.slice(0, 100));
      const safeTags = stripTagsForCloud(story.tags, story);
      const wordCount = countStoryWords(safeTurns);
      const authorName = resolveDisplayUsername({
        customUsername: userSettings?.username,
        oauthDisplayName: currentUser.displayName || userSettings?.displayName,
        fallback: 'Folio & Canon Author',
      });

      try {
        const existingSnap = await getDoc(pubRef);
        const isUpdate = existingSnap.exists();
        const isPrivate = story.isPrivate === true;

        if (isUpdate) {
          if (existingSnap.data()?.ownerUid !== uid) {
            return null;
          }
          await updateDoc(pubRef, {
            authorName,
            title: (story.title || 'Untitled Story').slice(0, 200),
            universe: (story.universe || '').slice(0, 200),
            setting: (story.setting || '').slice(0, 400),
            tone: (story.tone || '').slice(0, 200),
            premise: (story.premise || '').slice(0, 4000),
            isPrivate,
            tags: safeTags,
            turns: safeTurns,
            chapters: safeChapters,
            characters: safeCharacters,
            wordCount,
            updatedAt: serverTimestamp(),
          });
          const data = existingSnap.data();
          return {
            id: publicId,
            ownerUid: uid,
            sourceStoryId: sanitizeId(story.id),
            authorName,
            title: (story.title || 'Untitled Story').slice(0, 200),
            universe: (story.universe || '').slice(0, 200),
            setting: (story.setting || '').slice(0, 400),
            tone: (story.tone || '').slice(0, 200),
            premise: (story.premise || '').slice(0, 4000),
            isPrivate,
            tags: safeTags,
            turns: safeTurns,
            chapters: safeChapters,
            characters: safeCharacters,
            wordCount,
            kudosCount: typeof data.kudosCount === 'number' ? data.kudosCount : 0,
            commentCount: typeof data.commentCount === 'number' ? data.commentCount : 0,
            createdAtMs: timestampToMs(data.createdAt),
            updatedAtMs: Date.now(),
          };
        }

        if (isPrivate) {
          return null;
        }

        await setDoc(pubRef, {
          id: publicId,
          ownerUid: uid,
          sourceStoryId: sanitizeId(story.id),
          authorName,
          title: (story.title || 'Untitled Story').slice(0, 200),
          universe: (story.universe || '').slice(0, 200),
          setting: (story.setting || '').slice(0, 400),
          tone: (story.tone || '').slice(0, 200),
          premise: (story.premise || '').slice(0, 4000),
          isPrivate: false,
          tags: safeTags,
          turns: safeTurns,
          chapters: safeChapters,
          characters: safeCharacters,
          wordCount,
          kudosCount: 0,
          commentCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        const now = Date.now();
        return {
          id: publicId,
          ownerUid: uid,
          sourceStoryId: sanitizeId(story.id),
          authorName,
          title: (story.title || 'Untitled Story').slice(0, 200),
          universe: (story.universe || '').slice(0, 200),
          setting: (story.setting || '').slice(0, 400),
          tone: (story.tone || '').slice(0, 200),
          premise: (story.premise || '').slice(0, 4000),
          isPrivate: false,
          tags: safeTags,
          turns: safeTurns,
          chapters: safeChapters,
          characters: safeCharacters,
          wordCount,
          kudosCount: 0,
          commentCount: 0,
          createdAtMs: now,
          updatedAtMs: now,
        };
      } catch (err) {
        setSyncError('Failed to update public Story Index listing in Firestore.');
        handleFirestoreError(err, OperationType.WRITE, docPath);
      }
    },
    [ensureUserDocumentExists, userSettings?.displayName, userSettings?.username],
  );

  const listStoryComments = useCallback(
    async (publicId: string): Promise<StoryComment[]> => {
      if (!isFirebaseConfigured || !db) return [];
      const trimmed = publicId.trim();
      if (!VALID_ID_RE.test(trimmed)) return [];
      const colPath = `publicStories/${trimmed}/comments`;
      try {
        const q = query(
          collection(db, 'publicStories', trimmed, 'comments'),
          where('storyIsPrivate', '==', false),
          orderBy('createdAt', 'asc'),
        );
        const snap = await getDocs(q);
        const list: StoryComment[] = [];
        for (const docSnap of snap.docs) {
          const parsed = parseStoryCommentDoc(docSnap.id, docSnap.data());
          if (parsed) list.push(parsed);
        }
        return list;
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, colPath);
      }
    },
    [],
  );

  const addStoryComment = useCallback(
    async (
      publicId: string,
      payload: {
        body: string;
        targetType?: CommentTargetType;
        targetId?: string;
        targetLabel?: string;
        chapterOrSceneLabel?: string;
        parentCommentId?: string;
      },
    ): Promise<StoryComment> => {
      if (!isFirebaseConfigured || !db) {
        throw new Error(FIREBASE_KEY_MISSING_MSG);
      }
      if (!auth?.currentUser) {
        throw new Error('Sign in with Google to post a comment in Firestore.');
      }
      const trimmedId = publicId.trim();
      if (!VALID_ID_RE.test(trimmedId)) {
        throw new Error('Invalid story identifier.');
      }
      const cleanBody = payload.body.trim().slice(0, 4000);
      if (!cleanBody) {
        throw new Error('Comment body cannot be empty.');
      }

      await ensureUserDocumentExists(auth.currentUser);
      const currentUser = auth.currentUser;
      const uid = currentUser.uid;
      const authorName = resolveDisplayUsername({
        customUsername: userSettings?.username,
        oauthDisplayName: currentUser.displayName || userSettings?.displayName,
        fallback: 'Reader',
      });

      const targetType: CommentTargetType =
        payload.targetType === 'chapter' || payload.targetType === 'scene'
          ? payload.targetType
          : 'story';
      const targetId = (payload.targetId || trimmedId).trim().slice(0, 128);
      const label = (payload.targetLabel || payload.chapterOrSceneLabel || '').trim().slice(0, 160);

      const storyRef = doc(db, 'publicStories', trimmedId);
      const commentId = generatePrefixedId('cmt');
      const commentRef = doc(db, 'publicStories', trimmedId, 'comments', commentId);
      const docPath = `publicStories/${trimmedId}/comments/${commentId}`;

      try {
        const storySnap = await getDoc(storyRef);
        if (!storySnap.exists()) {
          throw new Error('Story is not published in Firestore yet.');
        }
        const storyData = storySnap.data();
        if (storyData.isPrivate === true) {
          throw new Error('Private stories do not accept public comments.');
        }
        const currentCount =
          typeof storyData.commentCount === 'number' ? storyData.commentCount : 0;

        const batch = writeBatch(db);
        const commentPayload: Record<string, unknown> = {
          id: commentId,
          storyId: trimmedId,
          authorUid: uid,
          authorName,
          body: cleanBody,
          targetType,
          targetId,
          storyIsPrivate: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (label) {
          commentPayload.targetLabel = label;
          commentPayload.chapterOrSceneLabel = label;
        }
        if (
          payload.parentCommentId &&
          VALID_ID_RE.test(payload.parentCommentId.trim())
        ) {
          commentPayload.parentCommentId = payload.parentCommentId.trim();
        }
        batch.set(commentRef, commentPayload);
        batch.update(storyRef, { commentCount: currentCount + 1 });
        await batch.commit();

        const now = Date.now();
        return {
          id: commentId,
          storyId: trimmedId,
          authorUid: uid,
          authorName,
          body: cleanBody,
          targetType,
          targetId,
          targetLabel: label || undefined,
          chapterOrSceneLabel: label || undefined,
          parentCommentId: payload.parentCommentId?.trim() || undefined,
          storyIsPrivate: false,
          createdAtMs: now,
          updatedAtMs: now,
        };
      } catch (err) {
        setSyncError('Failed to post comment in Firestore.');
        handleFirestoreError(err, OperationType.CREATE, docPath);
      }
    },
    [ensureUserDocumentExists, userSettings?.displayName, userSettings?.username],
  );

  const deleteStoryComment = useCallback(
    async (publicId: string, commentId: string) => {
      if (!isFirebaseConfigured || !db || !auth?.currentUser) return;
      const trimmedStory = publicId.trim();
      const trimmedComment = commentId.trim();
      if (!VALID_ID_RE.test(trimmedStory) || !VALID_ID_RE.test(trimmedComment)) {
        return;
      }
      const storyRef = doc(db, 'publicStories', trimmedStory);
      const commentRef = doc(db, 'publicStories', trimmedStory, 'comments', trimmedComment);
      const docPath = `publicStories/${trimmedStory}/comments/${trimmedComment}`;
      try {
        const storySnap = await getDoc(storyRef);
        const currentCount =
          storySnap.exists() && typeof storySnap.data().commentCount === 'number'
            ? storySnap.data().commentCount
            : 1;
        const batch = writeBatch(db);
        batch.delete(commentRef);
        batch.update(storyRef, { commentCount: Math.max(0, currentCount - 1) });
        await batch.commit();
      } catch (err) {
        setSyncError('Failed to delete comment in Firestore.');
        handleFirestoreError(err, OperationType.DELETE, docPath);
      }
    },
    [],
  );

  const hasUserGivenKudo = useCallback(
    async (publicId: string, anonToken?: string): Promise<boolean> => {
      if (!isFirebaseConfigured || !db) return false;
      const trimmed = publicId.trim();
      if (!VALID_ID_RE.test(trimmed)) return false;
      const key = auth?.currentUser?.uid || anonToken;
      if (!key || !VALID_ID_RE.test(key)) return false;
      try {
        const kudoSnap = await getDoc(
          doc(db, 'publicStories', trimmed, 'kudos', key),
        );
        return kudoSnap.exists();
      } catch {
        return false;
      }
    },
    [],
  );

  const giveStoryKudo = useCallback(
    async (
      publicId: string,
      options?: { anonymous?: boolean; anonToken?: string },
    ): Promise<number> => {
      if (!isFirebaseConfigured || !db) {
        throw new Error(FIREBASE_KEY_MISSING_MSG);
      }
      const trimmed = publicId.trim();
      if (!VALID_ID_RE.test(trimmed)) {
        throw new Error('Invalid story identifier.');
      }

      const currentUser = auth?.currentUser ?? null;
      const useAnonymousToken = !currentUser;
      const isAnonymous = Boolean(options?.anonymous || useAnonymousToken);

      let kudoId = '';
      if (currentUser) {
        await ensureUserDocumentExists(currentUser);
        kudoId = currentUser.uid;
      } else if (
        options?.anonToken &&
        /^anon_[a-zA-Z0-9_-]{8,64}$/.test(options.anonToken)
      ) {
        kudoId = options.anonToken;
      } else {
        throw new Error('Anonymous kudo token missing.');
      }

      const displayName = isAnonymous
        ? 'Anonymous Reader'
        : resolveDisplayUsername({
            customUsername: userSettings?.username,
            oauthDisplayName: currentUser?.displayName || userSettings?.displayName,
            fallback: 'Reader',
          });

      const storyRef = doc(db, 'publicStories', trimmed);
      const kudoRef = doc(db, 'publicStories', trimmed, 'kudos', kudoId);
      const docPath = `publicStories/${trimmed}/kudos/${kudoId}`;

      try {
        const [storySnap, kudoSnap] = await Promise.all([
          getDoc(storyRef),
          getDoc(kudoRef),
        ]);
        if (!storySnap.exists()) {
          throw new Error('Story is not published in Firestore yet.');
        }
        const currentCount =
          typeof storySnap.data().kudosCount === 'number'
            ? storySnap.data().kudosCount
            : 0;
        if (kudoSnap.exists()) {
          return currentCount;
        }
        if (storySnap.data().isPrivate === true) {
          throw new Error('Private stories do not accept public kudos.');
        }
        const nextCount = currentCount + 1;
        const batch = writeBatch(db);
        batch.set(kudoRef, {
          uid: kudoId,
          displayName,
          isAnonymous,
          storyIsPrivate: false,
          createdAt: serverTimestamp(),
        });
        batch.update(
          storyRef,
          useAnonymousToken
            ? { kudosCount: nextCount, lastKudoId: kudoId }
            : { kudosCount: nextCount },
        );
        await batch.commit();
        return nextCount;
      } catch (err) {
        setSyncError('Failed to record kudos in Firestore.');
        handleFirestoreError(err, OperationType.WRITE, docPath);
      }
    },
    [ensureUserDocumentExists, userSettings?.displayName, userSettings?.username],
  );

  const loadCollections = useCallback(async (): Promise<UserCollection[]> => {
    if (!isFirebaseConfigured || !db || !auth?.currentUser) return [];
    const uid = auth.currentUser.uid;
    const colPath = `users/${uid}/collections`;
    try {
      const q = query(
        collection(db, 'users', uid, 'collections'),
        where('ownerUid', '==', uid),
      );
      const snap = await getDocs(q);
      const list: UserCollection[] = [];
      for (const docSnap of snap.docs) {
        const d = docSnap.data();
        if (typeof d.name === 'string' && d.name.trim()) {
          list.push({
            id: String(d.id || docSnap.id),
            ownerUid: uid,
            name: d.name,
            description: String(d.description || ''),
            isPrivate: Boolean(d.isPrivate),
            storyIds: Array.isArray(d.storyIds)
              ? d.storyIds.filter((s): s is string => typeof s === 'string')
              : [],
            createdAtMs: timestampToMs(d.createdAt),
            updatedAtMs: timestampToMs(d.updatedAt),
          });
        }
      }
      return list.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, colPath);
    }
  }, []);

  const upsertCollection = useCallback(
    async (colItem: UserCollection) => {
      if (!isFirebaseConfigured || !db || !auth?.currentUser) return;
      await ensureUserDocumentExists(auth.currentUser);
      const uid = auth.currentUser.uid;
      const safeId = sanitizeId(colItem.id);
      const docPath = `users/${uid}/collections/${safeId}`;
      const colRef = doc(db, 'users', uid, 'collections', safeId);
      const cleanStoryIds = Array.from(new Set(colItem.storyIds)).slice(0, 200);
      try {
        const existingSnap = await getDoc(colRef);
        if (existingSnap.exists()) {
          await updateDoc(colRef, {
            name: colItem.name.trim().slice(0, 100) || 'Untitled Collection',
            description: colItem.description.trim().slice(0, 500),
            isPrivate: colItem.isPrivate,
            storyIds: cleanStoryIds,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(colRef, {
            id: safeId,
            ownerUid: uid,
            name: colItem.name.trim().slice(0, 100) || 'Untitled Collection',
            description: colItem.description.trim().slice(0, 500),
            isPrivate: colItem.isPrivate,
            storyIds: cleanStoryIds,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, docPath);
      }
    },
    [ensureUserDocumentExists],
  );

  const deleteCollection = useCallback(async (collectionId: string) => {
    if (!isFirebaseConfigured || !db || !auth?.currentUser) return;
    const uid = auth.currentUser.uid;
    const safeId = sanitizeId(collectionId);
    const docPath = `users/${uid}/collections/${safeId}`;
    try {
      await deleteDoc(doc(db, 'users', uid, 'collections', safeId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, docPath);
    }
  }, []);

  const loadSubscriptions = useCallback(async (): Promise<StorySubscription[]> => {
    if (!isFirebaseConfigured || !db || !auth?.currentUser) return [];
    const uid = auth.currentUser.uid;
    const colPath = `users/${uid}/subscriptions`;
    try {
      const q = query(
        collection(db, 'users', uid, 'subscriptions'),
        where('ownerUid', '==', uid),
      );
      const snap = await getDocs(q);
      const list: StorySubscription[] = [];
      for (const docSnap of snap.docs) {
        const d = docSnap.data();
        if (typeof d.storyTitle === 'string' && d.storyTitle.trim()) {
          list.push({
            storyId: String(d.storyId || docSnap.id),
            storyTitle: d.storyTitle,
            authorName: String(d.authorName || 'Author'),
            lastSeenTurnCount:
              typeof d.lastSeenTurnCount === 'number' ? d.lastSeenTurnCount : 0,
            lastSeenChapterCount:
              typeof d.lastSeenChapterCount === 'number' ? d.lastSeenChapterCount : 0,
            subscribedAtMs: timestampToMs(d.createdAt),
            updatedAtMs: timestampToMs(d.updatedAt),
          });
        }
      }
      return list.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, colPath);
    }
  }, []);

  const upsertSubscription = useCallback(
    async (sub: StorySubscription) => {
      if (!isFirebaseConfigured || !db || !auth?.currentUser) return;
      await ensureUserDocumentExists(auth.currentUser);
      const uid = auth.currentUser.uid;
      const safeId = sanitizeId(sub.storyId);
      const docPath = `users/${uid}/subscriptions/${safeId}`;
      const subRef = doc(db, 'users', uid, 'subscriptions', safeId);
      try {
        const existingSnap = await getDoc(subRef);
        if (existingSnap.exists()) {
          await updateDoc(subRef, {
            storyTitle: sub.storyTitle.trim().slice(0, 200) || 'Untitled Story',
            authorName: sub.authorName.trim().slice(0, 120) || 'Author',
            lastSeenTurnCount: Math.max(0, Math.floor(sub.lastSeenTurnCount)),
            lastSeenChapterCount: Math.max(0, Math.floor(sub.lastSeenChapterCount)),
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(subRef, {
            storyId: safeId,
            ownerUid: uid,
            storyTitle: sub.storyTitle.trim().slice(0, 200) || 'Untitled Story',
            authorName: sub.authorName.trim().slice(0, 120) || 'Author',
            lastSeenTurnCount: Math.max(0, Math.floor(sub.lastSeenTurnCount)),
            lastSeenChapterCount: Math.max(0, Math.floor(sub.lastSeenChapterCount)),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, docPath);
      }
    },
    [ensureUserDocumentExists],
  );

  const deleteSubscription = useCallback(async (storyId: string) => {
    if (!isFirebaseConfigured || !db || !auth?.currentUser) return;
    const uid = auth.currentUser.uid;
    const safeId = sanitizeId(storyId);
    const docPath = `users/${uid}/subscriptions/${safeId}`;
    try {
      await deleteDoc(doc(db, 'users', uid, 'subscriptions', safeId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, docPath);
    }
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);
  const clearSyncError = useCallback(() => setSyncError(null), []);

  return (
    <AuthContext.Provider
      value={{
        firebaseConfigured: isFirebaseConfigured,
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
        findExistingShare,
        publishSharedWork,
        fetchSharedWork,
        revokeSharedWork,
        findExistingCollaboration,
        publishCollaboration,
        joinCollaboration,
        subscribeCollaboration,
        pushCollaborationUpdate,
        revokeCollaboration,
        listPublicStories,
        fetchPublicStory,
        syncPublicStoryListing,
        listStoryComments,
        addStoryComment,
        deleteStoryComment,
        hasUserGivenKudo,
        giveStoryKudo,
        loadCollections,
        upsertCollection,
        deleteCollection,
        loadSubscriptions,
        upsertSubscription,
        deleteSubscription,
        clearAuthError,
        clearSyncError,
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
