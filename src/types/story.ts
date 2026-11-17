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

export interface StoryProject extends StorySnapshot {
  id: string;
  coverImage?: string;
  savePoints: SavePoint[];
  updatedAt: number;
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

