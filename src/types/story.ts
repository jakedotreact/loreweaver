export type CharacterRole = 'Protagonist' | 'Companion' | 'Antagonist' | 'NPC';

export type CharacterOrigin = 'canon' | 'original' | 'emergent';

export interface CharacterRelationship {
  targetName: string;
  relation: string;
}

export interface CharacterProfile {
  id: string;
  name: string;
  role: CharacterRole;
  origin: CharacterOrigin;
  summary: string;
  pros: string[];
  flaws: string[];
  motivation: string;
  voiceAndMannerisms: string;
  status: string;
  location: string;
  inventory: string[];
  relationships: CharacterRelationship[];
  deducedFromContext: boolean;
}

export type CrossIndexCategory =
  | 'world_rule'
  | 'character_state'
  | 'location'
  | 'item'
  | 'timeline'
  | 'plot_thread';

export type CrossIndexStatus = 'active' | 'resolved' | 'conflict';

export interface CrossIndexEntry {
  id: string;
  category: CrossIndexCategory;
  title: string;
  detail: string;
  tags: string[];
  status: CrossIndexStatus;
  introducedAtTurn: number;
  lastVerifiedTurn: number;
  pinned: boolean;
}

export interface StoryChoice {
  id: string;
  label: string;
  intent: string;
  consequenceHint: string;
}

export interface StoryIllustration {
  id: string;
  dataUrl: string;
  caption: string;
  promptUsed?: string;
  artStyle?: string;
  source: 'uploaded' | 'generated';
  createdAt: number;
}

export interface StoryTurn {
  id: string;
  turnNumber: number;
  sceneTitle: string;
  location: string;
  inStoryTime: string;
  userAction: string | null;
  prose: string[];
  choices: StoryChoice[];
  selectedChoiceId: string | null;
  activeCharacters: string[];
  continuityNotes: string[];
  continuityWarning: string | null;
  illustration?: StoryIllustration | null;
  timestamp: number;
}

export interface StoryChapter {
  id: string;
  chapterNumber: number;
  title: string;
  summary: string;
  turnIds: string[];
  illustration?: StoryIllustration | null;
  mergedAt: number;
}

export interface StorySnapshot {
  title: string;
  universe: string;
  setting: string;
  tone: string;
  premise: string;
  protagonistId: string;
  turns: StoryTurn[];
  characters: CharacterProfile[];
  crossIndex: CrossIndexEntry[];
  chapters?: StoryChapter[];
}

export interface SavePoint {
  id: string;
  label: string;
  createdAt: number;
  turnNumber: number;
  sceneTitle: string;
  snapshot: StorySnapshot;
}

export type Ao3Rating =
  | 'General Audiences'
  | 'Teen And Up Audiences'
  | 'Mature'
  | 'Explicit'
  | 'Not Rated';

export type Ao3Warning =
  | 'Creator Chose Not To Use Archive Warnings'
  | 'No Archive Warnings Apply'
  | 'Graphic Depictions Of Violence'
  | 'Major Character Death'
  | 'Rape/Non-Con'
  | 'Underage Sex';

export type Ao3Category = 'Gen' | 'F/F' | 'F/M' | 'M/M' | 'Multi' | 'Other';

export interface StoryTags {
  rating: Ao3Rating;
  warnings: Ao3Warning[];
  categories: Ao3Category[];
  fandoms: string[];
  relationships: string[];
  characters: string[];
  freeforms: string[];
}

export interface StoryProject extends StorySnapshot {
  id: string;
  coverImage?: string;
  savePoints: SavePoint[];
  shareId?: string;
  collabId?: string;
  publicStoryId?: string;
  isPrivate?: boolean;
  tags?: StoryTags;
  updatedAt: number;
}

export type StoryDisplayMode = 'scene' | 'chapters' | 'story';

export type CommentTargetType = 'story' | 'chapter' | 'scene';

export interface PublicStoryWork {
  id: string;
  ownerUid: string;
  sourceStoryId: string;
  authorName: string;
  title: string;
  universe: string;
  setting: string;
  tone: string;
  premise: string;
  coverImage?: string;
  isPrivate: boolean;
  tags: StoryTags;
  turns: StoryTurn[];
  chapters: StoryChapter[];
  characters: CharacterProfile[];
  wordCount: number;
  kudosCount: number;
  commentCount: number;
  isLocalSeed?: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface StoryComment {
  id: string;
  storyId: string;
  authorUid: string;
  authorName: string;
  body: string;
  targetType?: CommentTargetType;
  targetId?: string;
  targetLabel?: string;
  chapterOrSceneLabel?: string;
  parentCommentId?: string;
  storyIsPrivate: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface StoryKudoRecord {
  id: string;
  uid: string;
  displayName: string;
  isAnonymous: boolean;
  storyIsPrivate: boolean;
  createdAtMs: number;
}

export interface UserCollection {
  id: string;
  ownerUid: string;
  name: string;
  description: string;
  isPrivate: boolean;
  storyIds: string[];
  createdAtMs: number;
  updatedAtMs: number;
}

export interface StorySubscription {
  storyId: string;
  storyTitle: string;
  authorName: string;
  lastSeenTurnCount: number;
  lastSeenChapterCount: number;
  subscribedAtMs: number;
  updatedAtMs: number;
}

export interface ContinuityAuditFinding {
  severity: 'verified' | 'warning' | 'contradiction';
  title: string;
  explanation: string;
  suggestedFix?: string;
  affectedEntryId?: string;
}

export interface ContinuityAuditReport {
  checkedAt: number;
  summary: string;
  findings: ContinuityAuditFinding[];
}

export type SupportedModelId = string;

export type ModelThinkingLevel = 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH';

export interface ModelConfig {
  model: SupportedModelId;
  thinkingLevel: ModelThinkingLevel;
}

export interface DiscoveredModelOption {
  id: string;
  label: string;
  description: string;
  allowedThinkingLevels: ModelThinkingLevel[];
  defaultThinking: ModelThinkingLevel;
  supportsThinkingLevel: boolean;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
}

export type TtsVoiceName = 'Kore' | 'Charon' | 'Fenrir' | 'Puck' | 'Zephyr';

export type ShareScope = 'story' | 'chapter' | 'scene';

export interface SharedWork {
  id: string;
  ownerUid: string;
  authorName: string;
  scope: ShareScope;
  sourceStoryId: string;
  targetId: string;
  storyTitle: string;
  workTitle: string;
  universe: string;
  setting: string;
  tone: string;
  premise: string;
  summary: string;
  turns: StoryTurn[];
  chapters: StoryChapter[];
  characters: CharacterProfile[];
  createdAtMs: number;
  updatedAtMs: number;
}

export interface CollaborationSession {
  id: string;
  ownerUid: string;
  ownerName: string;
  sourceStoryId: string;
  project: StoryProject;
  lastEditedByUid: string;
  lastEditedByName: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface CollabParticipant {
  clientId: string;
  displayName: string;
  joinedAt: number;
}
