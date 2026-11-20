import type {
  CrossIndexEntry,
  ModelConfig,
  StorySnapshot,
  StoryTurn,
  TtsVoiceName,
} from '../src/types/story.ts';
import type { SeedCharacterInput } from './storyAgent.ts';

export type CharacterRole = 'Protagonist' | 'Companion' | 'Antagonist' | 'NPC';

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; status?: number };

const VALID_THINKING_LEVELS = new Set(['MINIMAL', 'LOW', 'MEDIUM', 'HIGH', 'XHIGH']);
const VALID_VOICES = new Set<TtsVoiceName>(['Kore', 'Charon', 'Fenrir', 'Puck', 'Zephyr']);
const VALID_ROLES = new Set<CharacterRole>([
  'Protagonist',
  'Companion',
  'Antagonist',
  'NPC',
]);
const MODEL_ID_RE = /^[a-z0-9._-]{1,100}$/i;
const ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

export const MAX_SNAPSHOT_JSON_BYTES = 1_800_000;
export const MAX_PREMISE_CHARS = 32_000;
export const MAX_ACTION_CHARS = 12_000;
export const MAX_TTS_TEXT_CHARS = 20_000;
export const MAX_AUDIO_BASE64_CHARS = 14_000_000;
export const MAX_FILE_BASE64_CHARS = 14_500_000;
export const MAX_IMPORT_URL_CHARS = 2048;

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function readOptionalBoundedString(
  val: unknown,
  fieldName: string,
  maxLength: number,
): ValidationResult<string | undefined> {
  if (val === undefined || val === null) {
    return { ok: true, value: undefined };
  }
  if (typeof val !== 'string') {
    return { ok: false, error: `${fieldName} must be a string.` };
  }
  const trimmed = val.trim();
  if (trimmed.length > maxLength) {
    return {
      ok: false,
      error: `${fieldName} exceeds the maximum length of ${maxLength} characters.`,
    };
  }
  return { ok: true, value: trimmed || undefined };
}

function readRequiredBoundedString(
  val: unknown,
  fieldName: string,
  maxLength: number,
): ValidationResult<string> {
  if (typeof val !== 'string' || !val.trim()) {
    return { ok: false, error: `${fieldName} is required.` };
  }
  const trimmed = val.trim();
  if (trimmed.length > maxLength) {
    return {
      ok: false,
      error: `${fieldName} exceeds the maximum length of ${maxLength} characters.`,
    };
  }
  return { ok: true, value: trimmed };
}

export function validateModelConfigInput(
  raw: unknown,
): ValidationResult<Partial<ModelConfig> | undefined> {
  if (raw === undefined || raw === null) {
    return { ok: true, value: undefined };
  }
  if (!isPlainObject(raw)) {
    return { ok: false, error: 'modelConfig must be an object.' };
  }

  const out: Partial<ModelConfig> = {};
  if (raw.model !== undefined) {
    if (typeof raw.model !== 'string' || !MODEL_ID_RE.test(raw.model.replace(/^models\//, '').trim())) {
      return { ok: false, error: 'modelConfig.model is invalid.' };
    }
    out.model = raw.model.trim();
  }
  if (raw.thinkingLevel !== undefined) {
    if (typeof raw.thinkingLevel !== 'string' || !VALID_THINKING_LEVELS.has(raw.thinkingLevel)) {
      return { ok: false, error: 'modelConfig.thinkingLevel is invalid.' };
    }
    out.thinkingLevel = raw.thinkingLevel as ModelConfig['thinkingLevel'];
  }
  return { ok: true, value: out };
}

export function validateStorySnapshotInput(
  raw: unknown,
  requireTurns = false,
): ValidationResult<StorySnapshot> {
  if (!isPlainObject(raw)) {
    return { ok: false, error: 'Story snapshot is required and must be an object.' };
  }

  const serializedLen = Buffer.byteLength(JSON.stringify(raw), 'utf8');
  if (serializedLen > MAX_SNAPSHOT_JSON_BYTES) {
    return {
      ok: false,
      error: 'Story snapshot exceeds the maximum payload size.',
      status: 413,
    };
  }

  const titleCheck = readOptionalBoundedString(raw.title, 'snapshot.title', 200);
  if (!titleCheck.ok) return titleCheck;
  const universeCheck = readOptionalBoundedString(raw.universe, 'snapshot.universe', 200);
  if (!universeCheck.ok) return universeCheck;
  const settingCheck = readOptionalBoundedString(raw.setting, 'snapshot.setting', 400);
  if (!settingCheck.ok) return settingCheck;
  const toneCheck = readOptionalBoundedString(raw.tone, 'snapshot.tone', 200);
  if (!toneCheck.ok) return toneCheck;
  const premiseCheck = readOptionalBoundedString(
    raw.premise,
    'snapshot.premise',
    MAX_PREMISE_CHARS,
  );
  if (!premiseCheck.ok) return premiseCheck;

  if (!Array.isArray(raw.turns)) {
    return { ok: false, error: 'snapshot.turns must be an array.' };
  }
  if (requireTurns && raw.turns.length === 0) {
    return { ok: false, error: 'snapshot.turns must contain at least one scene.' };
  }
  if (raw.turns.length > 200) {
    return { ok: false, error: 'snapshot.turns exceeds the 200-scene limit.' };
  }

  if (!Array.isArray(raw.characters) || raw.characters.length > 100) {
    return { ok: false, error: 'snapshot.characters must be an array of at most 100 entries.' };
  }
  if (!Array.isArray(raw.crossIndex) || raw.crossIndex.length > 300) {
    return { ok: false, error: 'snapshot.crossIndex must be an array of at most 300 entries.' };
  }
  if (raw.chapters !== undefined && (!Array.isArray(raw.chapters) || raw.chapters.length > 100)) {
    return { ok: false, error: 'snapshot.chapters must be an array of at most 100 entries.' };
  }

  return { ok: true, value: raw as unknown as StorySnapshot };
}

export function validateDeduceUniverseBody(raw: unknown) {
  if (!isPlainObject(raw)) {
    return { ok: false as const, error: 'Invalid request body.' };
  }
  const universe = readRequiredBoundedString(raw.universe, 'Universe', 200);
  if (!universe.ok) return universe;
  const setting = readRequiredBoundedString(raw.setting, 'Setting', 400);
  if (!setting.ok) return setting;
  const premise = readRequiredBoundedString(raw.premise, 'Premise', MAX_PREMISE_CHARS);
  if (!premise.ok) return premise;
  const title = readOptionalBoundedString(raw.title, 'Title', 200);
  if (!title.ok) return title;
  const tone = readOptionalBoundedString(raw.tone, 'Tone', 200);
  if (!tone.ok) return tone;

  let seedCharacters: SeedCharacterInput[] | undefined;
  if (raw.seedCharacters !== undefined && raw.seedCharacters !== null) {
    if (!Array.isArray(raw.seedCharacters) || raw.seedCharacters.length > 12) {
      return {
        ok: false as const,
        error: 'seedCharacters must be an array of at most 12 entries.',
      };
    }
    const parsedSeeds: SeedCharacterInput[] = [];
    for (const item of raw.seedCharacters) {
      if (!isPlainObject(item)) {
        return { ok: false as const, error: 'Each seed character must be an object.' };
      }
      const seedName = readRequiredBoundedString(item.name, 'Seed character name', 120);
      if (!seedName.ok) return seedName;
      let seedRole: CharacterRole | undefined;
      if (item.role !== undefined && item.role !== null) {
        if (typeof item.role !== 'string' || !VALID_ROLES.has(item.role as CharacterRole)) {
          return { ok: false as const, error: 'Invalid seed character role.' };
        }
        seedRole = item.role as CharacterRole;
      }
      const seedNotes = readOptionalBoundedString(item.notes, 'Seed character notes', 1000);
      if (!seedNotes.ok) return seedNotes;
      parsedSeeds.push({
        name: seedName.value,
        role: seedRole,
        notes: seedNotes.value,
        pros: Array.isArray(item.pros)
          ? item.pros.filter((p): p is string => typeof p === 'string').slice(0, 15)
          : undefined,
        flaws: Array.isArray(item.flaws)
          ? item.flaws.filter((f): f is string => typeof f === 'string').slice(0, 15)
          : undefined,
      });
    }
    seedCharacters = parsedSeeds;
  }

  const modelConfig = validateModelConfigInput(raw.modelConfig);
  if (!modelConfig.ok) return modelConfig;

  return {
    ok: true as const,
    value: {
      title: title.value,
      universe: universe.value,
      setting: setting.value,
      tone: tone.value || 'Character-Driven Literary Fiction',
      premise: premise.value,
      seedCharacters,
      modelConfig: modelConfig.value,
    },
  };
}

export function validateDeduceCharacterBody(raw: unknown) {
  if (!isPlainObject(raw)) {
    return { ok: false as const, error: 'Invalid request body.' };
  }
  const universe = readRequiredBoundedString(raw.universe, 'Universe', 200);
  if (!universe.ok) return universe;
  const name = readRequiredBoundedString(raw.name, 'Character name', 120);
  if (!name.ok) return name;
  const setting = readOptionalBoundedString(raw.setting, 'Setting', 400);
  if (!setting.ok) return setting;
  const tone = readOptionalBoundedString(raw.tone, 'Tone', 200);
  if (!tone.ok) return tone;
  const premise = readOptionalBoundedString(raw.premise, 'Premise', MAX_PREMISE_CHARS);
  if (!premise.ok) return premise;

  let role: CharacterRole | undefined;
  if (raw.role !== undefined && raw.role !== null && raw.role !== '') {
    if (typeof raw.role !== 'string' || !VALID_ROLES.has(raw.role as CharacterRole)) {
      return { ok: false as const, error: 'role must be Protagonist, Companion, Antagonist, or NPC.' };
    }
    role = raw.role as CharacterRole;
  }

  const notes = readOptionalBoundedString(raw.notes, 'Notes', 4000);
  if (!notes.ok) return notes;

  if (raw.existingCharacters !== undefined && (!Array.isArray(raw.existingCharacters) || raw.existingCharacters.length > 100)) {
    return { ok: false as const, error: 'existingCharacters must be an array of at most 100 entries.' };
  }
  if (raw.existingPros !== undefined && (!Array.isArray(raw.existingPros) || raw.existingPros.length > 30)) {
    return { ok: false as const, error: 'existingPros must be an array of at most 30 entries.' };
  }
  if (raw.existingFlaws !== undefined && (!Array.isArray(raw.existingFlaws) || raw.existingFlaws.length > 30)) {
    return { ok: false as const, error: 'existingFlaws must be an array of at most 30 entries.' };
  }

  const modelConfig = validateModelConfigInput(raw.modelConfig);
  if (!modelConfig.ok) return modelConfig;

  return {
    ok: true as const,
    value: {
      universe: universe.value,
      setting: setting.value || '',
      tone: tone.value || '',
      premise: premise.value || '',
      existingCharacters: Array.isArray(raw.existingCharacters) ? raw.existingCharacters : [],
      name: name.value,
      role,
      notes: notes.value,
      existingPros: Array.isArray(raw.existingPros) ? raw.existingPros : undefined,
      existingFlaws: Array.isArray(raw.existingFlaws) ? raw.existingFlaws : undefined,
      modelConfig: modelConfig.value,
    },
  };
}

export function validateAdvanceBody(raw: unknown) {
  if (!isPlainObject(raw)) {
    return { ok: false as const, error: 'Invalid request body.' };
  }
  const snapshot = validateStorySnapshotInput(raw.snapshot, true);
  if (!snapshot.ok) return snapshot;
  const userAction = readRequiredBoundedString(
    raw.userAction,
    'User action',
    MAX_ACTION_CHARS,
  );
  if (!userAction.ok) return userAction;
  const selectedChoiceId = readOptionalBoundedString(
    raw.selectedChoiceId,
    'selectedChoiceId',
    128,
  );
  if (!selectedChoiceId.ok) return selectedChoiceId;
  const modelConfig = validateModelConfigInput(raw.modelConfig);
  if (!modelConfig.ok) return modelConfig;

  return {
    ok: true as const,
    value: {
      snapshot: snapshot.value,
      userAction: userAction.value,
      selectedChoiceId: selectedChoiceId.value ?? null,
      modelConfig: modelConfig.value,
    },
  };
}

export function validateAuditBody(raw: unknown) {
  if (!isPlainObject(raw)) {
    return { ok: false as const, error: 'Invalid request body.' };
  }
  const snapshot = validateStorySnapshotInput(raw.snapshot, true);
  if (!snapshot.ok) return snapshot;
  const modelConfig = validateModelConfigInput(raw.modelConfig);
  if (!modelConfig.ok) return modelConfig;

  return {
    ok: true as const,
    value: {
      snapshot: snapshot.value,
      modelConfig: modelConfig.value,
    },
  };
}

export function validateRewriteSceneBody(raw: unknown) {
  if (!isPlainObject(raw)) {
    return { ok: false as const, error: 'Invalid request body.' };
  }
  const snapshot = validateStorySnapshotInput(raw.snapshot, true);
  if (!snapshot.ok) return snapshot;
  const targetTurnId = readRequiredBoundedString(raw.targetTurnId, 'targetTurnId', 128);
  if (!targetTurnId.ok) return targetTurnId;
  if (!ID_RE.test(targetTurnId.value)) {
    return { ok: false as const, error: 'targetTurnId format is invalid.' };
  }
  const correctionInstruction = readOptionalBoundedString(
    raw.correctionInstruction,
    'correctionInstruction',
    MAX_ACTION_CHARS,
  );
  if (!correctionInstruction.ok) return correctionInstruction;
  const modelConfig = validateModelConfigInput(raw.modelConfig);
  if (!modelConfig.ok) return modelConfig;

  if (raw.editedFields !== undefined && !isPlainObject(raw.editedFields)) {
    return { ok: false as const, error: 'editedFields must be an object.' };
  }
  if (raw.newLoreCorrection !== undefined && !isPlainObject(raw.newLoreCorrection)) {
    return { ok: false as const, error: 'newLoreCorrection must be an object.' };
  }

  return {
    ok: true as const,
    value: {
      snapshot: snapshot.value,
      targetTurnId: targetTurnId.value,
      correctionInstruction: correctionInstruction.value || '',
      editedFields: raw.editedFields as Partial<StoryTurn> | undefined,
      newLoreCorrection: raw.newLoreCorrection as
        | Omit<CrossIndexEntry, 'id'>
        | undefined,
      modelConfig: modelConfig.value,
    },
  };
}

export function validateTtsBody(raw: unknown) {
  if (!isPlainObject(raw)) {
    return { ok: false as const, error: 'Invalid request body.' };
  }
  const text = readRequiredBoundedString(raw.text, 'Narrative text', MAX_TTS_TEXT_CHARS);
  if (!text.ok) return text;
  const tone = readOptionalBoundedString(raw.tone, 'tone', 200);
  if (!tone.ok) return tone;

  let voiceName: TtsVoiceName | undefined;
  if (raw.voiceName !== undefined && raw.voiceName !== null) {
    if (typeof raw.voiceName !== 'string' || !VALID_VOICES.has(raw.voiceName as TtsVoiceName)) {
      return { ok: false as const, error: 'voiceName must be a supported narrator voice.' };
    }
    voiceName = raw.voiceName as TtsVoiceName;
  }

  return {
    ok: true as const,
    value: {
      text: text.value,
      tone: tone.value,
      voiceName,
    },
  };
}

export function validateTranscribeBody(raw: unknown) {
  if (!isPlainObject(raw)) {
    return { ok: false as const, error: 'Invalid request body.' };
  }
  if (typeof raw.audioBase64 !== 'string' || !raw.audioBase64.trim()) {
    return { ok: false as const, error: 'Audio data is required for transcription.' };
  }
  if (raw.audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
    return {
      ok: false as const,
      error: 'Audio payload exceeds the maximum allowed size.',
      status: 413,
    };
  }
  const mimeTypeRaw =
    typeof raw.mimeType === 'string' && raw.mimeType.trim()
      ? raw.mimeType.trim().toLowerCase().slice(0, 80)
      : 'audio/webm';
  if (!mimeTypeRaw.startsWith('audio/')) {
    return { ok: false as const, error: 'mimeType must be an audio/* media type.' };
  }
  const contextHint = readOptionalBoundedString(raw.contextHint, 'contextHint', 500);
  if (!contextHint.ok) return contextHint;

  return {
    ok: true as const,
    value: {
      audioBase64: raw.audioBase64,
      mimeType: mimeTypeRaw,
      contextHint: contextHint.value,
    },
  };
}

export function validateIllustrationPromptBody(raw: unknown) {
  if (!isPlainObject(raw)) {
    return { ok: false as const, error: 'Invalid request body.' };
  }
  const snapshot = validateStorySnapshotInput(raw.snapshot, true);
  if (!snapshot.ok) return snapshot;

  const targetKind = raw.targetKind;
  if (targetKind !== 'scene' && targetKind !== 'chapter') {
    return {
      ok: false as const,
      error: 'Story snapshot and target kind ("scene" or "chapter") are required.',
    };
  }
  const turnId = readOptionalBoundedString(raw.turnId, 'turnId', 128);
  if (!turnId.ok) return turnId;
  const chapterId = readOptionalBoundedString(raw.chapterId, 'chapterId', 128);
  if (!chapterId.ok) return chapterId;

  if (targetKind === 'scene' && !turnId.value) {
    return { ok: false as const, error: 'Target scene ID is required.' };
  }
  if (targetKind === 'chapter' && !chapterId.value) {
    return { ok: false as const, error: 'Target chapter ID is required.' };
  }

  const stylePreference = readOptionalBoundedString(
    raw.stylePreference,
    'stylePreference',
    500,
  );
  if (!stylePreference.ok) return stylePreference;
  const modelConfig = validateModelConfigInput(raw.modelConfig);
  if (!modelConfig.ok) return modelConfig;

  return {
    ok: true as const,
    value: {
      snapshot: snapshot.value,
      targetKind: targetKind as 'scene' | 'chapter',
      turnId: turnId.value,
      chapterId: chapterId.value,
      stylePreference: stylePreference.value,
      modelConfig: modelConfig.value,
    },
  };
}

export function validateImportFileBody(raw: unknown) {
  if (!isPlainObject(raw)) {
    return { ok: false as const, error: 'Invalid request body.' };
  }
  const filename = readRequiredBoundedString(raw.filename, 'Filename', 255);
  if (!filename.ok) return filename;

  if (typeof raw.contentBase64 !== 'string' || !raw.contentBase64.trim()) {
    return { ok: false as const, error: 'File content is required for story import.' };
  }
  if (raw.contentBase64.length > MAX_FILE_BASE64_CHARS) {
    return {
      ok: false as const,
      error: 'Uploaded file exceeds the 10 MB size limit.',
      status: 413,
    };
  }

  const mimeType = readOptionalBoundedString(raw.mimeType, 'mimeType', 160);
  if (!mimeType.ok) return mimeType;
  const title = readOptionalBoundedString(raw.title, 'title', 200);
  if (!title.ok) return title;
  const universe = readOptionalBoundedString(raw.universe, 'universe', 200);
  if (!universe.ok) return universe;
  const setting = readOptionalBoundedString(raw.setting, 'setting', 400);
  if (!setting.ok) return setting;
  const tone = readOptionalBoundedString(raw.tone, 'tone', 200);
  if (!tone.ok) return tone;
  const modelConfig = validateModelConfigInput(raw.modelConfig);
  if (!modelConfig.ok) return modelConfig;

  return {
    ok: true as const,
    value: {
      filename: filename.value,
      mimeType: mimeType.value,
      contentBase64: raw.contentBase64,
      title: title.value,
      universe: universe.value,
      setting: setting.value,
      tone: tone.value,
      isPrivate: typeof raw.isPrivate === 'boolean' ? raw.isPrivate : true,
      enrichWithAi: raw.enrichWithAi,
      modelConfig: modelConfig.value,
    },
  };
}

export function validateImportUrlBody(raw: unknown) {
  if (!isPlainObject(raw)) {
    return { ok: false as const, error: 'Invalid request body.' };
  }
  const url = readRequiredBoundedString(raw.url, 'URL', MAX_IMPORT_URL_CHARS);
  if (!url.ok) return url;
  if (!/^https?:\/\//i.test(url.value)) {
    return { ok: false as const, error: 'Only http:// and https:// URLs are supported for story import.' };
  }

  const title = readOptionalBoundedString(raw.title, 'title', 200);
  if (!title.ok) return title;
  const universe = readOptionalBoundedString(raw.universe, 'universe', 200);
  if (!universe.ok) return universe;
  const setting = readOptionalBoundedString(raw.setting, 'setting', 400);
  if (!setting.ok) return setting;
  const tone = readOptionalBoundedString(raw.tone, 'tone', 200);
  if (!tone.ok) return tone;
  const modelConfig = validateModelConfigInput(raw.modelConfig);
  if (!modelConfig.ok) return modelConfig;

  return {
    ok: true as const,
    value: {
      url: url.value,
      title: title.value,
      universe: universe.value,
      setting: setting.value,
      tone: tone.value,
      isPrivate: typeof raw.isPrivate === 'boolean' ? raw.isPrivate : true,
      enrichWithAi: raw.enrichWithAi,
      modelConfig: modelConfig.value,
    },
  };
}
