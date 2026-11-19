import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  CharacterProfile,
  ContinuityAuditReport,
  CrossIndexCategory,
  CrossIndexEntry,
  DiscoveredModelOption,
  ModelConfig,
  ModelThinkingLevel,
  StoryChoice,
  StorySnapshot,
  StoryTurn,
  SupportedModelId,
  TtsVoiceName,
} from '../src/types/story.ts';

const DEFAULT_MODEL: SupportedModelId = 'gemini-4-hydrogen';

const PAID_ONLY_MODELS = new Set([
  'gemini-4-carbon',
  'gemini-4-argon',
  'gemini-3-pro-image',
  'gemini-nano-banana-2.1',
  'gemini-3.1-flash-lite-image',
  'gemini-omni-1.2-flash',
  'lyria-3-clip-preview',
  'lyria-3-pro-preview',
]);

const DEPRECATED_MODEL_RE =
  /^(?:models\/)?(?:gemini-1\.5|gemini-2\.0|gemini-pro(?:$|-)|embedding-|text-embedding-)/i;

const NON_NARRATIVE_MODEL_RE =
  /(?:-tts\b|transcribe|-live\b|-image\b|imagen|veo|omni|lyria|embedding|decision|robotics|computer-use|nano-banana|aqa|bisect|gemma)/i;

export const FALLBACK_MODEL_OPTIONS: DiscoveredModelOption[] = [
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen',
    description:
      'Balanced prose quality and multi-step Cross-Index continuity reasoning.',
    allowedThinkingLevels: ['LOW', 'MEDIUM', 'HIGH', 'XHIGH'],
    defaultThinking: 'HIGH',
    supportsThinkingLevel: true,
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    description:
      'Ultra-fast, lightweight narrative drafting and rapid character deduction.',
    allowedThinkingLevels: ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'],
    defaultThinking: 'LOW',
    supportsThinkingLevel: true,
  },
];

function isValidNarrativeModelId(id: string): boolean {
  const clean = id.replace(/^models\//, '').trim();
  if (!clean || !/^[a-z0-9._-]+$/i.test(clean)) return false;
  if (!clean.toLowerCase().startsWith('gemini-')) return false;
  if (DEPRECATED_MODEL_RE.test(clean)) return false;
  if (NON_NARRATIVE_MODEL_RE.test(clean)) return false;
  if (PAID_ONLY_MODELS.has(clean.toLowerCase())) return false;
  return true;
}

function resolveModelConfig(
  input?: Partial<ModelConfig>,
  fallbackThinking: ThinkingLevel = ThinkingLevel.MEDIUM,
): { model: SupportedModelId; thinkingLevel?: ThinkingLevel } {
  const requestedModel =
    typeof input?.model === 'string'
      ? input.model.replace(/^models\//, '').trim()
      : '';
  const model: SupportedModelId =
    requestedModel && isValidNarrativeModelId(requestedModel)
      ? requestedModel
      : DEFAULT_MODEL;

  const requested = input?.thinkingLevel;
  if (model === 'gemini-4-hydrogen') {
    switch (requested) {
      case 'LOW':
        return { model, thinkingLevel: ThinkingLevel.LOW };
      case 'MEDIUM':
        return { model, thinkingLevel: ThinkingLevel.MEDIUM };
      case 'HIGH':
        return { model, thinkingLevel: ThinkingLevel.HIGH };
      case 'XHIGH':
        return { model, thinkingLevel: ThinkingLevel.XHIGH };
      default:
        return {
          model,
          thinkingLevel:
            fallbackThinking === ThinkingLevel.MINIMAL
              ? ThinkingLevel.LOW
              : fallbackThinking,
        };
    }
  }

  if (model === 'gemini-3.1-flash-lite') {
    switch (requested) {
      case 'MINIMAL':
        return { model, thinkingLevel: ThinkingLevel.MINIMAL };
      case 'LOW':
        return { model, thinkingLevel: ThinkingLevel.LOW };
      case 'MEDIUM':
        return { model, thinkingLevel: ThinkingLevel.MEDIUM };
      case 'HIGH':
        return { model, thinkingLevel: ThinkingLevel.HIGH };
      case 'XHIGH':
        return { model, thinkingLevel: ThinkingLevel.HIGH };
      default:
        return { model, thinkingLevel: fallbackThinking };
    }
  }

  // Gemini 3 and Gemini 4 models support ThinkingLevel; earlier series do not use thinkingLevel.
  if (/^gemini-[34]/i.test(model)) {
    switch (requested) {
      case 'LOW':
        return { model, thinkingLevel: ThinkingLevel.LOW };
      case 'MEDIUM':
        return { model, thinkingLevel: ThinkingLevel.MEDIUM };
      case 'HIGH':
      case 'XHIGH':
        return { model, thinkingLevel: ThinkingLevel.HIGH };
      default:
        return {
          model,
          thinkingLevel:
            fallbackThinking === ThinkingLevel.MINIMAL ||
            fallbackThinking === ThinkingLevel.XHIGH
              ? ThinkingLevel.MEDIUM
              : fallbackThinking,
        };
    }
  }

  return { model, thinkingLevel: undefined };
}

export async function listAvailableModels(): Promise<{
  source: 'api' | 'default';
  models: DiscoveredModelOption[];
  totalDiscovered?: number;
  error?: string;
}> {
  if (!process.env.GEMINI_API_KEY) {
    return {
      source: 'default',
      models: FALLBACK_MODEL_OPTIONS,
    };
  }

  try {
    const ai = getClient();
    const pager = await ai.models.list({ config: { pageSize: 100 } });
    const discovered: DiscoveredModelOption[] = [];
    const seen = new Set<string>();
    let totalDiscovered = 0;

    const knownMap = new Map(FALLBACK_MODEL_OPTIONS.map((m) => [m.id, m]));

    for await (const item of pager) {
      totalDiscovered += 1;
      const rawName = item.name ?? '';
      const id = rawName.replace(/^models\//, '').trim();
      if (!id || seen.has(id)) continue;

      const actions = item.supportedActions ?? [];
      if (actions.length > 0 && !actions.includes('generateContent')) {
        continue;
      }

      if (!isValidNarrativeModelId(id)) {
        continue;
      }

      seen.add(id);
      const curated = knownMap.get(id);
      if (curated) {
        discovered.push({
          ...curated,
          inputTokenLimit: item.inputTokenLimit,
          outputTokenLimit: item.outputTokenLimit,
        });
      } else {
        const supportsThinkingLevel = /^gemini-[34]/i.test(id);
        const allowedThinkingLevels: ModelThinkingLevel[] = supportsThinkingLevel
          ? ['LOW', 'MEDIUM', 'HIGH']
          : ['MEDIUM'];
        discovered.push({
          id,
          label: item.displayName?.trim() || id,
          description:
            item.description?.trim() ||
            'Discovered via server GEMINI_API_KEY.',
          allowedThinkingLevels,
          defaultThinking: 'MEDIUM',
          supportsThinkingLevel,
          inputTokenLimit: item.inputTokenLimit,
          outputTokenLimit: item.outputTokenLimit,
        });
      }
    }

    if (discovered.length === 0) {
      return {
        source: 'api',
        models: FALLBACK_MODEL_OPTIONS,
        totalDiscovered,
      };
    }

    discovered.sort((a, b) => {
      const priority = (id: string) =>
        id === 'gemini-4-hydrogen' ? 0 : id === 'gemini-3.1-flash-lite' ? 1 : 2;
      const diff = priority(a.id) - priority(b.id);
      return diff !== 0 ? diff : a.label.localeCompare(b.label);
    });

    return {
      source: 'api',
      models: discovered,
      totalDiscovered,
    };
  } catch (err) {
    return {
      source: 'default',
      models: FALLBACK_MODEL_OPTIONS,
      error: formatGeminiError(err, 'Unable to query models from API key.'),
    };
  }
}

export function formatGeminiError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err || '');
  if (/API_KEY_INVALID|PERMISSION_DENIED|403|401/i.test(raw)) {
    return 'Gemini API key is missing or unauthorized. Check your GEMINI_API_KEY in Settings > Secrets.';
  }
  if (/RESOURCE_EXHAUSTED|429/i.test(raw)) {
    return 'Gemini API rate or quota limit reached (429). Retry shortly, switch to Gemini 3.1 Flash Lite, or check billing in Settings > Secrets.';
  }
  if (/NOT_FOUND|404/i.test(raw)) {
    return 'Requested Gemini model was not found. Switch to Gemini 4 Hydrogen or Gemini 3.1 Flash Lite in Model Settings.';
  }
  if (/ETIMEDOUT|ECONNRESET|timeout|timed out|504|DEADLINE_EXCEEDED/i.test(raw)) {
    return 'Upstream AI generation timed out. Please retry in a moment.';
  }
  if (/GEMINI_API_KEY is not configured/i.test(raw)) {
    return 'Server AI credentials are not configured.';
  }
  return fallback;
}

function getClient(apiVersion?: string): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add it in the AI Studio Settings > Secrets panel.',
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      ...(apiVersion ? { apiVersion } : {}),
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function safeParseJson<T>(raw: string | undefined, fallbackMsg: string): T {
  if (!raw || !raw.trim()) {
    throw new Error(fallbackMsg);
  }
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T;
      } catch {
        // Fall through to array check or error
      }
    }
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');
    if (firstBracket >= 0 && lastBracket > firstBracket) {
      try {
        return JSON.parse(cleaned.slice(firstBracket, lastBracket + 1)) as T;
      } catch {
        // Fall through to descriptive error
      }
    }
    throw new Error(fallbackMsg);
  }
}

export interface SeedCharacterInput {
  name: string;
  role?: 'Protagonist' | 'Companion' | 'Antagonist' | 'NPC';
  notes?: string;
  pros?: string[];
  flaws?: string[];
}

export interface DeduceUniverseInput {
  title?: string;
  universe: string;
  setting: string;
  tone: string;
  premise: string;
  seedCharacters?: SeedCharacterInput[];
}

interface RawUniverseResponse {
  title: string;
  characters: Array<{
    name: string;
    role: 'Protagonist' | 'Companion' | 'Antagonist' | 'NPC';
    origin: 'canon' | 'original';
    summary: string;
    pros: string[];
    flaws: string[];
    motivation: string;
    voiceAndMannerisms: string;
    status: string;
    location: string;
    inventory: string[];
    relationships: Array<{ targetName: string; relation: string }>;
    deducedFromContext: boolean;
  }>;
  crossIndex: Array<{
    category: CrossIndexCategory;
    title: string;
    detail: string;
    tags: string[];
    pinned: boolean;
  }>;
  openingTurn: {
    sceneTitle: string;
    location: string;
    inStoryTime: string;
    prose: string[];
    activeCharacters: string[];
    continuityNotes: string[];
    choices: Array<{
      label: string;
      intent: string;
      consequenceHint: string;
    }>;
  };
}

export async function deduceUniverseAndCast(
  input: DeduceUniverseInput,
  modelConfig?: Partial<ModelConfig>,
): Promise<StorySnapshot> {
  const ai = getClient();
  const { model, thinkingLevel } = resolveModelConfig(modelConfig, ThinkingLevel.MEDIUM);

  const seedDesc =
    input.seedCharacters && input.seedCharacters.length > 0
      ? JSON.stringify(input.seedCharacters, null, 2)
      : 'None explicitly provided. Deduce 3 to 4 iconic canon or contextually fitting characters for this universe and premise, including a clear Protagonist.';

  const prompt = `
Universe / Fictional Source: ${input.universe}
Setting & Era: ${input.setting}
Tone & Genre: ${input.tone}
Premise: ${input.premise}
Title Suggestion: ${input.title || '(Generate a fitting literary title)'}

User-Provided Seed Characters (respect any explicit traits/pros/flaws provided; deduce all missing traits, canon flaws, canon strengths, voice, inventory, and relationships from the universe context):
${seedDesc}

Tasks:
1. Build the cast of 3-5 characters. If the universe is an established fictional canon (e.g., Harry Potter, Dune, Star Wars, Sherlock Holmes, Lord of the Rings, etc.), faithfully use canon characters' authentic personality pros, flaws, speech habits, lore-accurate items, and relationships unless the user explicitly overrode them. If original, deduce compelling grounded traits fitting the setting and tone.
2. Build an initial Cross-Index of 5-7 essential lore anchors across categories ('world_rule', 'location', 'item', 'timeline', 'plot_thread') that prevent plotholes and enforce world consistency.
3. Write Opening Scene (Turn 1) in vivid, atmospheric literary prose (3-4 cohesive paragraphs), respecting all Cross-Index rules and character flaws/pros, ending on an immediate dramatic inflection point with 3-4 distinct, consequential player choices.
`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction:
        'You are a master interactive novelist, canon archivist, and continuity director. Generate rich literary prose free of clichés, faithfully honor fictional canon psychology (both strengths and flaws), and maintain a rigorous Cross-Index.',
      ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          characters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                role: { type: Type.STRING, enum: ['Protagonist', 'Companion', 'Antagonist', 'NPC'] },
                origin: { type: Type.STRING, enum: ['canon', 'original'] },
                summary: { type: Type.STRING },
                pros: { type: Type.ARRAY, items: { type: Type.STRING } },
                flaws: { type: Type.ARRAY, items: { type: Type.STRING } },
                motivation: { type: Type.STRING },
                voiceAndMannerisms: { type: Type.STRING },
                status: { type: Type.STRING },
                location: { type: Type.STRING },
                inventory: { type: Type.ARRAY, items: { type: Type.STRING } },
                relationships: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      targetName: { type: Type.STRING },
                      relation: { type: Type.STRING },
                    },
                    required: ['targetName', 'relation'],
                  },
                },
                deducedFromContext: { type: Type.BOOLEAN },
              },
              required: [
                'name',
                'role',
                'origin',
                'summary',
                'pros',
                'flaws',
                'motivation',
                'voiceAndMannerisms',
                'status',
                'location',
                'inventory',
                'relationships',
                'deducedFromContext',
              ],
            },
          },
          crossIndex: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                category: {
                  type: Type.STRING,
                  enum: ['world_rule', 'character_state', 'location', 'item', 'timeline', 'plot_thread'],
                },
                title: { type: Type.STRING },
                detail: { type: Type.STRING },
                tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                pinned: { type: Type.BOOLEAN },
              },
              required: ['category', 'title', 'detail', 'tags', 'pinned'],
            },
          },
          openingTurn: {
            type: Type.OBJECT,
            properties: {
              sceneTitle: { type: Type.STRING },
              location: { type: Type.STRING },
              inStoryTime: { type: Type.STRING },
              prose: { type: Type.ARRAY, items: { type: Type.STRING } },
              activeCharacters: { type: Type.ARRAY, items: { type: Type.STRING } },
              continuityNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
              choices: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    intent: { type: Type.STRING },
                    consequenceHint: { type: Type.STRING },
                  },
                  required: ['label', 'intent', 'consequenceHint'],
                },
              },
            },
            required: [
              'sceneTitle',
              'location',
              'inStoryTime',
              'prose',
              'activeCharacters',
              'continuityNotes',
              'choices',
            ],
          },
        },
        required: ['title', 'characters', 'crossIndex', 'openingTurn'],
      },
    },
  });

  const parsed = safeParseJson<RawUniverseResponse>(
    response.text,
    'Failed to generate universe and opening narrative.',
  );

  const characters: CharacterProfile[] = parsed.characters.map((c, idx) => ({
    id: `char-${Date.now()}-${idx}`,
    name: c.name,
    role: c.role,
    origin: c.origin,
    summary: c.summary,
    pros: c.pros,
    flaws: c.flaws,
    motivation: c.motivation,
    voiceAndMannerisms: c.voiceAndMannerisms,
    status: c.status,
    location: c.location,
    inventory: c.inventory,
    relationships: c.relationships,
    deducedFromContext: c.deducedFromContext,
  }));

  const protagonist =
    characters.find((c) => c.role === 'Protagonist') ?? characters[0];

  const crossIndex: CrossIndexEntry[] = parsed.crossIndex.map((entry, idx) => ({
    id: `ci-${Date.now()}-${idx}`,
    category: entry.category,
    title: entry.title,
    detail: entry.detail,
    tags: entry.tags,
    status: 'active',
    introducedAtTurn: 1,
    lastVerifiedTurn: 1,
    pinned: entry.pinned,
  }));

  const choices: StoryChoice[] = parsed.openingTurn.choices.map((ch, idx) => ({
    id: `choice-1-${idx}-${Date.now()}`,
    label: ch.label,
    intent: ch.intent,
    consequenceHint: ch.consequenceHint,
  }));

  const turn1: StoryTurn = {
    id: `turn-${Date.now()}-1`,
    turnNumber: 1,
    sceneTitle: parsed.openingTurn.sceneTitle,
    location: parsed.openingTurn.location,
    inStoryTime: parsed.openingTurn.inStoryTime,
    userAction: null,
    prose: parsed.openingTurn.prose,
    choices,
    selectedChoiceId: null,
    activeCharacters: parsed.openingTurn.activeCharacters,
    continuityNotes: parsed.openingTurn.continuityNotes,
    continuityWarning: null,
    timestamp: Date.now(),
  };

  return {
    title: input.title?.trim() || parsed.title,
    universe: input.universe,
    setting: input.setting,
    tone: input.tone,
    premise: input.premise,
    protagonistId: protagonist?.id ?? '',
    characters,
    crossIndex,
    turns: [turn1],
  };
}

export interface DeduceCharacterInput {
  universe: string;
  setting: string;
  tone: string;
  premise: string;
  existingCharacters: Array<{ name: string; role: string; summary: string }>;
  name: string;
  role?: 'Protagonist' | 'Companion' | 'Antagonist' | 'NPC';
  notes?: string;
  existingPros?: string[];
  existingFlaws?: string[];
}

export async function deduceSingleCharacter(
  input: DeduceCharacterInput,
  modelConfig?: Partial<ModelConfig>,
): Promise<Omit<CharacterProfile, 'id'>> {
  const ai = getClient();
  const { model, thinkingLevel } = resolveModelConfig(modelConfig, ThinkingLevel.LOW);

  const prompt = `
Story Universe: ${input.universe}
Setting: ${input.setting}
Tone: ${input.tone}
Premise: ${input.premise}

Existing Cast:
${JSON.stringify(input.existingCharacters, null, 2)}

Target Character to Deduce / Complete:
Name: ${input.name}
Requested Role: ${input.role || 'Deduce appropriate role'}
User Notes / Context: ${input.notes || 'None provided — deduce entirely from fictional canon or story setting.'}
User-locked Pros: ${input.existingPros?.length ? input.existingPros.join('; ') : 'None (deduce 3 authentic pros)'}
User-locked Flaws: ${input.existingFlaws?.length ? input.existingFlaws.join('; ') : 'None (deduce 3 authentic flaws)'}

If "${input.name}" is a known canon character from "${input.universe}", faithfully preserve their canon strengths, flaws, mannerisms, relationships to the existing cast, and lore-accurate possessions. If original, invent cohesive traits grounded in the setting.
`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction:
        'You are a character psychologist and fictional canon archivist. Deduce complete, balanced character profiles with authentic flaws and strengths.',
      ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          role: { type: Type.STRING, enum: ['Protagonist', 'Companion', 'Antagonist', 'NPC'] },
          origin: { type: Type.STRING, enum: ['canon', 'original'] },
          summary: { type: Type.STRING },
          pros: { type: Type.ARRAY, items: { type: Type.STRING } },
          flaws: { type: Type.ARRAY, items: { type: Type.STRING } },
          motivation: { type: Type.STRING },
          voiceAndMannerisms: { type: Type.STRING },
          status: { type: Type.STRING },
          location: { type: Type.STRING },
          inventory: { type: Type.ARRAY, items: { type: Type.STRING } },
          relationships: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                targetName: { type: Type.STRING },
                relation: { type: Type.STRING },
              },
              required: ['targetName', 'relation'],
            },
          },
        },
        required: [
          'name',
          'role',
          'origin',
          'summary',
          'pros',
          'flaws',
          'motivation',
          'voiceAndMannerisms',
          'status',
          'location',
          'inventory',
          'relationships',
        ],
      },
    },
  });

  const parsed = safeParseJson<Omit<CharacterProfile, 'id' | 'deducedFromContext'>>(
    response.text,
    'Failed to deduce character profile.',
  );

  return {
    ...parsed,
    pros: input.existingPros?.length ? input.existingPros : parsed.pros,
    flaws: input.existingFlaws?.length ? input.existingFlaws : parsed.flaws,
    deducedFromContext: true,
  };
}

interface RawAdvanceResponse {
  sceneTitle: string;
  location: string;
  inStoryTime: string;
  prose: string[];
  activeCharacters: string[];
  continuityNotes: string[];
  continuityWarning: string | null;
  choices: Array<{
    label: string;
    intent: string;
    consequenceHint: string;
  }>;
  characterUpdates: Array<{
    name: string;
    status?: string;
    location?: string;
    inventoryAdd?: string[];
    inventoryRemove?: string[];
    relationshipUpdates?: Array<{ targetName: string; relation: string }>;
  }>;
  emergentCharacters: Array<{
    name: string;
    role: 'Companion' | 'Antagonist' | 'NPC';
    origin: 'canon' | 'emergent';
    summary: string;
    pros: string[];
    flaws: string[];
    motivation: string;
    voiceAndMannerisms: string;
    status: string;
    location: string;
    inventory: string[];
    relationships: Array<{ targetName: string; relation: string }>;
  }>;
  newCrossIndexEntries: Array<{
    category: CrossIndexCategory;
    title: string;
    detail: string;
    tags: string[];
    pinned: boolean;
  }>;
  updatedCrossIndexEntries: Array<{
    id: string;
    detail: string;
    status: 'active' | 'resolved' | 'conflict';
  }>;
  timelineSummary: string;
}

export interface AdvanceStoryResult {
  nextTurn: StoryTurn;
  updatedCharacters: CharacterProfile[];
  updatedCrossIndex: CrossIndexEntry[];
}

export async function advanceNarrative(
  snapshot: StorySnapshot,
  userAction: string,
  selectedChoiceId: string | null,
  modelConfig?: Partial<ModelConfig>,
): Promise<AdvanceStoryResult> {
  const ai = getClient();
  const { model, thinkingLevel } = resolveModelConfig(modelConfig, ThinkingLevel.HIGH);
  const nextTurnNumber = (snapshot.turns[snapshot.turns.length - 1]?.turnNumber ?? 0) + 1;

  // Keep full recent turns and condensed earlier turns for deep context without bloat
  const recentTurns = snapshot.turns.slice(-5).map((t) => ({
    turn: t.turnNumber,
    sceneTitle: t.sceneTitle,
    location: t.location,
    inStoryTime: t.inStoryTime,
    userAction: t.userAction,
    prose: t.prose.join('\n\n'),
  }));

  const earlierSummary =
    snapshot.turns.length > 5
      ? snapshot.turns
          .slice(0, -5)
          .map((t) => `Turn ${t.turnNumber} (${t.sceneTitle}): ${t.userAction ?? 'Opening'} -> ${t.prose[0]?.slice(0, 180)}...`)
          .join('\n')
      : 'None (story just began).';

  const prompt = `
UNIVERSE: ${snapshot.universe}
SETTING: ${snapshot.setting}
TONE: ${snapshot.tone}
PREMISE: ${snapshot.premise}

ACTIVE CHARACTER PROFILES (Honor their pros, flaws, voice, current locations, and inventories strictly):
${JSON.stringify(snapshot.characters, null, 2)}

ACTIVE CROSS-INDEX LORE LEDGER (MUST NOT BE CONTRADICTED):
${JSON.stringify(snapshot.crossIndex, null, 2)}

EARLIER CHAPTERS SUMMARY:
${earlierSummary}

RECENT SCENES:
${JSON.stringify(recentTurns, null, 2)}

USER'S CHOICE / ACTION FOR TURN ${nextTurnNumber}:
"${userAction}"

INSTRUCTIONS:
1. Continuity Check First: Verify whether the user's action aligns with the Cross-Index (locations, items held, magic/physics rules, character availability/status). If the user's freeform input attempts something impossible or contradictory to established lore, set "continuityWarning" explaining the constraint and weave a lore-faithful outcome or complication instead of breaking continuity. Otherwise set "continuityWarning" to null.
2. Write Turn ${nextTurnNumber} in 3-4 evocative, character-authentic paragraphs. Canon characters must behave according to their psychological flaws and strengths.
3. Provide 3-4 distinct, consequential branching choices reflecting different tactical, emotional, or moral approaches.
4. Return exact "characterUpdates" (status, location, inventory changes, relationship shifts) for existing cast members affected by this scene.
5. CRITICAL — Automatic Cast Addition: Every named character who appears, speaks, or participates in this scene (including any character introduced by the user's prompt/action or appearing in "activeCharacters") who is NOT already in ACTIVE CHARACTER PROFILES MUST be added to "emergentCharacters" with full canon-deduced or context-deduced pros, flaws, voice, motivation, status, current location, inventory, and relationships.
6. Return "newCrossIndexEntries" for newly established facts/locations/items/plot threads, "updatedCrossIndexEntries" (matching existing Cross-Index IDs) for evolved or resolved threads, and a concise 1-sentence "timelineSummary" for Turn ${nextTurnNumber}.
`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction:
        'You are an interactive narrative director and continuity guardian. Every scene must obey the Cross-Index, respect character flaws and inventories, and smoothly evolve the living story world.',
      ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          sceneTitle: { type: Type.STRING },
          location: { type: Type.STRING },
          inStoryTime: { type: Type.STRING },
          prose: { type: Type.ARRAY, items: { type: Type.STRING } },
          activeCharacters: { type: Type.ARRAY, items: { type: Type.STRING } },
          continuityNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
          continuityWarning: { type: Type.STRING, nullable: true },
          choices: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                intent: { type: Type.STRING },
                consequenceHint: { type: Type.STRING },
              },
              required: ['label', 'intent', 'consequenceHint'],
            },
          },
          characterUpdates: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                status: { type: Type.STRING },
                location: { type: Type.STRING },
                inventoryAdd: { type: Type.ARRAY, items: { type: Type.STRING } },
                inventoryRemove: { type: Type.ARRAY, items: { type: Type.STRING } },
                relationshipUpdates: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      targetName: { type: Type.STRING },
                      relation: { type: Type.STRING },
                    },
                    required: ['targetName', 'relation'],
                  },
                },
              },
              required: ['name'],
            },
          },
          emergentCharacters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                role: { type: Type.STRING, enum: ['Companion', 'Antagonist', 'NPC'] },
                origin: { type: Type.STRING, enum: ['canon', 'emergent'] },
                summary: { type: Type.STRING },
                pros: { type: Type.ARRAY, items: { type: Type.STRING } },
                flaws: { type: Type.ARRAY, items: { type: Type.STRING } },
                motivation: { type: Type.STRING },
                voiceAndMannerisms: { type: Type.STRING },
                status: { type: Type.STRING },
                location: { type: Type.STRING },
                inventory: { type: Type.ARRAY, items: { type: Type.STRING } },
                relationships: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      targetName: { type: Type.STRING },
                      relation: { type: Type.STRING },
                    },
                    required: ['targetName', 'relation'],
                  },
                },
              },
              required: [
                'name',
                'role',
                'origin',
                'summary',
                'pros',
                'flaws',
                'motivation',
                'voiceAndMannerisms',
                'status',
                'location',
                'inventory',
                'relationships',
              ],
            },
          },
          newCrossIndexEntries: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                category: {
                  type: Type.STRING,
                  enum: ['world_rule', 'character_state', 'location', 'item', 'timeline', 'plot_thread'],
                },
                title: { type: Type.STRING },
                detail: { type: Type.STRING },
                tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                pinned: { type: Type.BOOLEAN },
              },
              required: ['category', 'title', 'detail', 'tags', 'pinned'],
            },
          },
          updatedCrossIndexEntries: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                detail: { type: Type.STRING },
                status: { type: Type.STRING, enum: ['active', 'resolved', 'conflict'] },
              },
              required: ['id', 'detail', 'status'],
            },
          },
          timelineSummary: { type: Type.STRING },
        },
        required: [
          'sceneTitle',
          'location',
          'inStoryTime',
          'prose',
          'activeCharacters',
          'continuityNotes',
          'choices',
          'characterUpdates',
          'emergentCharacters',
          'newCrossIndexEntries',
          'updatedCrossIndexEntries',
          'timelineSummary',
        ],
      },
    },
  });

  const parsed = safeParseJson<RawAdvanceResponse>(
    response.text,
    'Failed to advance narrative turn.',
  );

  // Apply character updates
  const charMap = new Map<string, CharacterProfile>();
  for (const c of snapshot.characters) {
    charMap.set(c.name.toLowerCase(), { ...c });
  }

  for (const upd of parsed.characterUpdates ?? []) {
    const existing = charMap.get(upd.name.toLowerCase());
    if (existing) {
      let nextInv = [...existing.inventory];
      if (upd.inventoryRemove?.length) {
        const removeSet = new Set(upd.inventoryRemove.map((i) => i.toLowerCase()));
        nextInv = nextInv.filter((item) => !removeSet.has(item.toLowerCase()));
      }
      if (upd.inventoryAdd?.length) {
        for (const item of upd.inventoryAdd) {
          if (!nextInv.some((x) => x.toLowerCase() === item.toLowerCase())) {
            nextInv.push(item);
          }
        }
      }
      const nextRels = [...existing.relationships];
      for (const rel of upd.relationshipUpdates ?? []) {
        const idx = nextRels.findIndex(
          (r) => r.targetName.toLowerCase() === rel.targetName.toLowerCase(),
        );
        if (idx >= 0) {
          nextRels[idx] = rel;
        } else {
          nextRels.push(rel);
        }
      }

      charMap.set(upd.name.toLowerCase(), {
        ...existing,
        status: upd.status || existing.status,
        location: upd.location || existing.location,
        inventory: nextInv,
        relationships: nextRels,
      });
    }
  }

  // Register newly introduced canon/emergent characters
  for (const em of parsed.emergentCharacters ?? []) {
    if (!charMap.has(em.name.toLowerCase())) {
      charMap.set(em.name.toLowerCase(), {
        id: `char-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: em.name,
        role: em.role,
        origin: em.origin,
        summary: em.summary,
        pros: em.pros,
        flaws: em.flaws,
        motivation: em.motivation,
        voiceAndMannerisms: em.voiceAndMannerisms,
        status: em.status,
        location: em.location,
        inventory: em.inventory,
        relationships: em.relationships,
        deducedFromContext: true,
      });
    }
  }

  // Fallback guarantee: if any named character in activeCharacters is still missing from charMap,
  // deduce their profile automatically from the universe and scene context.
  const missingActiveNames = (parsed.activeCharacters ?? []).filter((rawName) => {
    const clean = rawName.trim().toLowerCase();
    if (!clean || clean === 'narrator' || clean === 'unknown') return false;
    if (charMap.has(clean)) return false;
    // Also check if clean is a single-token match of an existing full name (e.g. "Harry" -> "Harry Potter")
    for (const existingKey of charMap.keys()) {
      if (existingKey.includes(clean) || clean.includes(existingKey)) {
        return false;
      }
    }
    return true;
  });

  if (missingActiveNames.length > 0) {
    const existingSummaries = Array.from(charMap.values()).map((c) => ({
      name: c.name,
      role: c.role,
      summary: c.summary,
    }));

    const deducedExtras = await Promise.all(
      missingActiveNames.slice(0, 3).map(async (charName) => {
        try {
          const deduced = await deduceSingleCharacter({
            universe: snapshot.universe,
            setting: snapshot.setting,
            tone: snapshot.tone,
            premise: snapshot.premise,
            existingCharacters: existingSummaries,
            name: charName.trim(),
            role: 'NPC',
            notes: `Appeared in Scene ${nextTurnNumber} (${parsed.sceneTitle}) at ${parsed.location}.`,
          }, modelConfig);
          return deduced;
        } catch {
          return null;
        }
      }),
    );

    for (const extra of deducedExtras) {
      if (extra && !charMap.has(extra.name.toLowerCase())) {
        charMap.set(extra.name.toLowerCase(), {
          ...extra,
          id: `char-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        });
      }
    }
  }

  // Apply Cross-Index updates
  const crossMap = new Map<string, CrossIndexEntry>();
  for (const entry of snapshot.crossIndex) {
    crossMap.set(entry.id, { ...entry });
  }

  for (const upd of parsed.updatedCrossIndexEntries ?? []) {
    const existing = crossMap.get(upd.id);
    if (existing) {
      crossMap.set(upd.id, {
        ...existing,
        detail: upd.detail,
        status: upd.status,
        lastVerifiedTurn: nextTurnNumber,
      });
    }
  }

  const now = Date.now();
  const addedEntries: CrossIndexEntry[] = (parsed.newCrossIndexEntries ?? []).map(
    (entry, idx) => ({
      id: `ci-${now}-${idx}`,
      category: entry.category,
      title: entry.title,
      detail: entry.detail,
      tags: entry.tags,
      status: 'active',
      introducedAtTurn: nextTurnNumber,
      lastVerifiedTurn: nextTurnNumber,
      pinned: entry.pinned,
    }),
  );

  // Add chronological timeline entry for this turn
  if (parsed.timelineSummary) {
    addedEntries.push({
      id: `ci-tl-${now}`,
      category: 'timeline',
      title: `Turn ${String(nextTurnNumber).padStart(2, '0')} · ${parsed.sceneTitle}`,
      detail: `${parsed.inStoryTime} (${parsed.location}): ${parsed.timelineSummary}`,
      tags: ['chronology', `turn-${nextTurnNumber}`],
      status: 'active',
      introducedAtTurn: nextTurnNumber,
      lastVerifiedTurn: nextTurnNumber,
      pinned: false,
    });
  }

  const nextTurn: StoryTurn = {
    id: `turn-${now}-${nextTurnNumber}`,
    turnNumber: nextTurnNumber,
    sceneTitle: parsed.sceneTitle,
    location: parsed.location,
    inStoryTime: parsed.inStoryTime,
    userAction,
    prose: parsed.prose,
    choices: parsed.choices.map((ch, idx) => ({
      id: `choice-${nextTurnNumber}-${idx}-${now}`,
      label: ch.label,
      intent: ch.intent,
      consequenceHint: ch.consequenceHint,
    })),
    selectedChoiceId,
    activeCharacters: parsed.activeCharacters,
    continuityNotes: parsed.continuityNotes,
    continuityWarning: parsed.continuityWarning || null,
    timestamp: now,
  };

  return {
    nextTurn,
    updatedCharacters: Array.from(charMap.values()),
    updatedCrossIndex: [...Array.from(crossMap.values()), ...addedEntries],
  };
}

export async function auditContinuity(
  snapshot: StorySnapshot,
  modelConfig?: Partial<ModelConfig>,
): Promise<ContinuityAuditReport> {
  const ai = getClient();
  const { model, thinkingLevel } = resolveModelConfig(modelConfig, ThinkingLevel.MEDIUM);

  const prompt = `
Perform a strict continuity and plothole audit on this story universe.

UNIVERSE: ${snapshot.universe}
SETTING: ${snapshot.setting}
CHARACTERS:
${JSON.stringify(snapshot.characters, null, 2)}

CROSS-INDEX LORE LEDGER:
${JSON.stringify(snapshot.crossIndex, null, 2)}

NARRATIVE TURNS:
${JSON.stringify(
  snapshot.turns.map((t) => ({
    turn: t.turnNumber,
    sceneTitle: t.sceneTitle,
    location: t.location,
    inStoryTime: t.inStoryTime,
    userAction: t.userAction,
    prose: t.prose.join(' '),
  })),
  null,
  2,
)}

Check for:
1. Item & inventory consistency (items used without being held, or lost items reappearing).
2. Spatial & timeline consistency (characters teleporting without travel, conflicting timestamps).
3. Canon / world-rule adherence (magic laws, physics, character psychology consistency).
4. Open plot threads that risk becoming forgotten loose ends.
Return a crisp summary and concrete findings.
`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction:
        'You are a meticulous continuity editor auditing a narrative manuscript against its Cross-Index and character sheets.',
      ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          findings: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                severity: { type: Type.STRING, enum: ['verified', 'warning', 'contradiction'] },
                title: { type: Type.STRING },
                explanation: { type: Type.STRING },
                suggestedFix: { type: Type.STRING },
                affectedEntryId: { type: Type.STRING },
              },
              required: ['severity', 'title', 'explanation'],
            },
          },
        },
        required: ['summary', 'findings'],
      },
    },
  });

  const parsed = safeParseJson<{
    summary: string;
    findings: ContinuityAuditReport['findings'];
  }>(response.text, 'Failed to run continuity audit.');

  return {
    checkedAt: Date.now(),
    summary: parsed.summary,
    findings: parsed.findings,
  };
}

export interface RewriteSceneInput {
  snapshot: StorySnapshot;
  targetTurnId: string;
  correctionInstruction: string;
  editedFields?: {
    sceneTitle?: string;
    location?: string;
    inStoryTime?: string;
    userAction?: string | null;
    activeCharacters?: string[];
    continuityWarning?: string | null;
    draftProse?: string[];
  };
  newLoreCorrection?: Omit<CrossIndexEntry, 'id'>;
}

export interface RewriteSceneResult {
  rewrittenTurn: StoryTurn;
  updatedCharacters: CharacterProfile[];
  updatedCrossIndex: CrossIndexEntry[];
}

interface RawRewriteResponse {
  sceneTitle: string;
  location: string;
  inStoryTime: string;
  userAction: string | null;
  prose: string[];
  activeCharacters: string[];
  continuityNotes: string[];
  continuityWarning: string | null;
  choices: Array<{
    label: string;
    intent: string;
    consequenceHint: string;
  }>;
  characterUpdates: Array<{
    name: string;
    status?: string;
    location?: string;
    inventoryAdd?: string[];
    inventoryRemove?: string[];
    relationshipUpdates?: Array<{ targetName: string; relation: string }>;
  }>;
  emergentCharacters: Array<{
    name: string;
    role: 'Companion' | 'Antagonist' | 'NPC';
    origin: 'canon' | 'emergent';
    summary: string;
    pros: string[];
    flaws: string[];
    motivation: string;
    voiceAndMannerisms: string;
    status: string;
    location: string;
    inventory: string[];
    relationships: Array<{ targetName: string; relation: string }>;
  }>;
  updatedCrossIndexEntries: Array<{
    id: string;
    detail: string;
    status: 'active' | 'resolved' | 'conflict';
  }>;
  newCrossIndexEntries: Array<{
    category: CrossIndexCategory;
    title: string;
    detail: string;
    tags: string[];
    pinned: boolean;
  }>;
}

export async function rewriteSceneRetroactively(
  input: RewriteSceneInput,
  modelConfig?: Partial<ModelConfig>,
): Promise<RewriteSceneResult> {
  const ai = getClient();
  const { model, thinkingLevel } = resolveModelConfig(modelConfig, ThinkingLevel.HIGH);

  const targetIndex = input.snapshot.turns.findIndex(
    (t) => t.id === input.targetTurnId,
  );
  if (targetIndex < 0) {
    throw new Error('Target scene could not be found in the story.');
  }

  const targetTurn = input.snapshot.turns[targetIndex];
  const precedingTurns = input.snapshot.turns.slice(0, targetIndex).map((t) => ({
    turn: t.turnNumber,
    sceneTitle: t.sceneTitle,
    location: t.location,
    inStoryTime: t.inStoryTime,
    userAction: t.userAction,
    prose: t.prose.join('\n\n'),
  }));
  const subsequentTurns = input.snapshot.turns.slice(targetIndex + 1).map((t) => ({
    turn: t.turnNumber,
    sceneTitle: t.sceneTitle,
    location: t.location,
    inStoryTime: t.inStoryTime,
    userAction: t.userAction,
    summary: t.prose.join(' ').slice(0, 400),
  }));

  const effectiveCrossIndex: CrossIndexEntry[] = input.newLoreCorrection
    ? [
        {
          id: `ci-${Date.now()}-manual`,
          ...input.newLoreCorrection,
        },
        ...input.snapshot.crossIndex,
      ]
    : [...input.snapshot.crossIndex];

  const edited = input.editedFields ?? {};
  const prompt = `
UNIVERSE: ${input.snapshot.universe}
SETTING: ${input.snapshot.setting}
TONE: ${input.snapshot.tone}
PREMISE: ${input.snapshot.premise}

ACTIVE CHARACTER PROFILES:
${JSON.stringify(input.snapshot.characters, null, 2)}

ACTIVE CROSS-INDEX LORE LEDGER (MUST BE OBEYED):
${JSON.stringify(effectiveCrossIndex, null, 2)}

PRECEDING SCENES (BEFORE SCENE ${targetTurn.turnNumber}):
${precedingTurns.length > 0 ? JSON.stringify(precedingTurns, null, 2) : 'None (this is the opening scene).'}

ORIGINAL SCENE ${targetTurn.turnNumber} BEING RETROACTIVELY CORRECTED:
${JSON.stringify(
  {
    turnNumber: targetTurn.turnNumber,
    sceneTitle: targetTurn.sceneTitle,
    location: targetTurn.location,
    inStoryTime: targetTurn.inStoryTime,
    userAction: targetTurn.userAction,
    prose: targetTurn.prose,
    activeCharacters: targetTurn.activeCharacters,
    choices: targetTurn.choices,
    selectedChoiceId: targetTurn.selectedChoiceId,
    continuityWarning: targetTurn.continuityWarning,
  },
  null,
  2,
)}

SUBSEQUENT SCENES (AFTER SCENE ${targetTurn.turnNumber}):
${subsequentTurns.length > 0 ? JSON.stringify(subsequentTurns, null, 2) : 'None (this is currently the latest scene).'}

AUTHOR'S MANUAL CORRECTION REQUEST:
- Correction / Rewrite Instructions: ${input.correctionInstruction || 'Apply the edited metadata/lore constraints below and rewrite the scene cleanly to eliminate inconsistencies.'}
- Requested Metadata / Field Overrides (honor these if changed from the original):
${JSON.stringify(
  {
    sceneTitle: edited.sceneTitle ?? targetTurn.sceneTitle,
    location: edited.location ?? targetTurn.location,
    inStoryTime: edited.inStoryTime ?? targetTurn.inStoryTime,
    userAction: edited.userAction !== undefined ? edited.userAction : targetTurn.userAction,
    activeCharacters: edited.activeCharacters ?? targetTurn.activeCharacters,
    continuityWarning:
      edited.continuityWarning !== undefined
        ? edited.continuityWarning
        : targetTurn.continuityWarning,
    authorDraftProse: edited.draftProse,
  },
  null,
  2,
)}
${
  input.newLoreCorrection
    ? `\nNEW PINNED CROSS-INDEX RULE FROM AUTHOR:\n${JSON.stringify(input.newLoreCorrection, null, 2)}`
    : ''
}

INSTRUCTIONS:
1. Retroactively rewrite Scene ${targetTurn.turnNumber} in 3-4 vivid, cohesive literary paragraphs so it fully satisfies the author's correction instructions, any overridden metadata/draft edits, all Cross-Index lore, and canon character psychology.
2. Preserve continuity with PRECEDING SCENES. If SUBSEQUENT SCENES exist, ensure this rewritten scene bridges cleanly into the next turn's action/premise without breaking the chain (or note any downstream conflict in "continuityWarning" if a later scene would need adjustment; otherwise set "continuityWarning" to null).
3. If the original scene already had a selected choice (${targetTurn.selectedChoiceId ? 'yes, keep choices compatible with the chosen direction' : 'no choice selected yet'}), provide 3-4 fitting choices (preserving or refining the original intent).
4. List every named character participating in the rewritten scene in "activeCharacters", and include any newly introduced characters in "emergentCharacters" with complete deduced traits.
5. Update affected Cross-Index entries ("updatedCrossIndexEntries") or add newly clarified facts ("newCrossIndexEntries") if helpful, and include concise "continuityNotes" recording the correction.
`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction:
        'You are a meticulous narrative editor and continuity director performing a retroactive scene rewrite. Seamlessly weave the author’s manual correction into literary prose while honoring all Cross-Index rules and character voices.',
      ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          sceneTitle: { type: Type.STRING },
          location: { type: Type.STRING },
          inStoryTime: { type: Type.STRING },
          userAction: { type: Type.STRING, nullable: true },
          prose: { type: Type.ARRAY, items: { type: Type.STRING } },
          activeCharacters: { type: Type.ARRAY, items: { type: Type.STRING } },
          continuityNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
          continuityWarning: { type: Type.STRING, nullable: true },
          choices: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                intent: { type: Type.STRING },
                consequenceHint: { type: Type.STRING },
              },
              required: ['label', 'intent', 'consequenceHint'],
            },
          },
          characterUpdates: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                status: { type: Type.STRING },
                location: { type: Type.STRING },
                inventoryAdd: { type: Type.ARRAY, items: { type: Type.STRING } },
                inventoryRemove: { type: Type.ARRAY, items: { type: Type.STRING } },
                relationshipUpdates: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      targetName: { type: Type.STRING },
                      relation: { type: Type.STRING },
                    },
                    required: ['targetName', 'relation'],
                  },
                },
              },
              required: ['name'],
            },
          },
          emergentCharacters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                role: { type: Type.STRING, enum: ['Companion', 'Antagonist', 'NPC'] },
                origin: { type: Type.STRING, enum: ['canon', 'emergent'] },
                summary: { type: Type.STRING },
                pros: { type: Type.ARRAY, items: { type: Type.STRING } },
                flaws: { type: Type.ARRAY, items: { type: Type.STRING } },
                motivation: { type: Type.STRING },
                voiceAndMannerisms: { type: Type.STRING },
                status: { type: Type.STRING },
                location: { type: Type.STRING },
                inventory: { type: Type.ARRAY, items: { type: Type.STRING } },
                relationships: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      targetName: { type: Type.STRING },
                      relation: { type: Type.STRING },
                    },
                    required: ['targetName', 'relation'],
                  },
                },
              },
              required: [
                'name',
                'role',
                'origin',
                'summary',
                'pros',
                'flaws',
                'motivation',
                'voiceAndMannerisms',
                'status',
                'location',
                'inventory',
                'relationships',
              ],
            },
          },
          updatedCrossIndexEntries: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                detail: { type: Type.STRING },
                status: { type: Type.STRING, enum: ['active', 'resolved', 'conflict'] },
              },
              required: ['id', 'detail', 'status'],
            },
          },
          newCrossIndexEntries: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                category: {
                  type: Type.STRING,
                  enum: ['world_rule', 'character_state', 'location', 'item', 'timeline', 'plot_thread'],
                },
                title: { type: Type.STRING },
                detail: { type: Type.STRING },
                tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                pinned: { type: Type.BOOLEAN },
              },
              required: ['category', 'title', 'detail', 'tags', 'pinned'],
            },
          },
        },
        required: [
          'sceneTitle',
          'location',
          'inStoryTime',
          'prose',
          'activeCharacters',
          'continuityNotes',
          'choices',
          'characterUpdates',
          'emergentCharacters',
          'updatedCrossIndexEntries',
          'newCrossIndexEntries',
        ],
      },
    },
  });

  const parsed = safeParseJson<RawRewriteResponse>(
    response.text,
    'Failed to rewrite scene retroactively.',
  );

  // Apply character updates & emergent cast additions
  const charMap = new Map<string, CharacterProfile>();
  for (const c of input.snapshot.characters) {
    charMap.set(c.name.toLowerCase(), { ...c });
  }

  for (const upd of parsed.characterUpdates ?? []) {
    const existing = charMap.get(upd.name.toLowerCase());
    if (existing) {
      let nextInv = [...existing.inventory];
      if (upd.inventoryRemove?.length) {
        const removeSet = new Set(upd.inventoryRemove.map((i) => i.toLowerCase()));
        nextInv = nextInv.filter((item) => !removeSet.has(item.toLowerCase()));
      }
      if (upd.inventoryAdd?.length) {
        for (const item of upd.inventoryAdd) {
          if (!nextInv.some((x) => x.toLowerCase() === item.toLowerCase())) {
            nextInv.push(item);
          }
        }
      }
      const nextRels = [...existing.relationships];
      for (const rel of upd.relationshipUpdates ?? []) {
        const idx = nextRels.findIndex(
          (r) => r.targetName.toLowerCase() === rel.targetName.toLowerCase(),
        );
        if (idx >= 0) {
          nextRels[idx] = rel;
        } else {
          nextRels.push(rel);
        }
      }
      charMap.set(upd.name.toLowerCase(), {
        ...existing,
        status: upd.status || existing.status,
        location: upd.location || existing.location,
        inventory: nextInv,
        relationships: nextRels,
      });
    }
  }

  for (const em of parsed.emergentCharacters ?? []) {
    if (!charMap.has(em.name.toLowerCase())) {
      charMap.set(em.name.toLowerCase(), {
        id: `char-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: em.name,
        role: em.role,
        origin: em.origin,
        summary: em.summary,
        pros: em.pros,
        flaws: em.flaws,
        motivation: em.motivation,
        voiceAndMannerisms: em.voiceAndMannerisms,
        status: em.status,
        location: em.location,
        inventory: em.inventory,
        relationships: em.relationships,
        deducedFromContext: true,
      });
    }
  }

  // Fallback deduction for any active character not yet in charMap
  const missingActiveNames = (parsed.activeCharacters ?? []).filter((rawName) => {
    const clean = rawName.trim().toLowerCase();
    if (!clean || clean === 'narrator' || clean === 'unknown') return false;
    if (charMap.has(clean)) return false;
    for (const existingKey of charMap.keys()) {
      if (existingKey.includes(clean) || clean.includes(existingKey)) {
        return false;
      }
    }
    return true;
  });

  if (missingActiveNames.length > 0) {
    const existingSummaries = Array.from(charMap.values()).map((c) => ({
      name: c.name,
      role: c.role,
      summary: c.summary,
    }));

    const deducedExtras = await Promise.all(
      missingActiveNames.slice(0, 3).map(async (charName) => {
        try {
          return await deduceSingleCharacter(
            {
              universe: input.snapshot.universe,
              setting: input.snapshot.setting,
              tone: input.snapshot.tone,
              premise: input.snapshot.premise,
              existingCharacters: existingSummaries,
              name: charName.trim(),
              role: 'NPC',
              notes: `Appeared in rewritten Scene ${targetTurn.turnNumber} (${parsed.sceneTitle}) at ${parsed.location}.`,
            },
            modelConfig,
          );
        } catch {
          return null;
        }
      }),
    );

    for (const extra of deducedExtras) {
      if (extra && !charMap.has(extra.name.toLowerCase())) {
        charMap.set(extra.name.toLowerCase(), {
          ...extra,
          id: `char-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        });
      }
    }
  }

  // Apply Cross-Index updates
  const crossMap = new Map<string, CrossIndexEntry>();
  for (const entry of effectiveCrossIndex) {
    crossMap.set(entry.id, { ...entry });
  }

  for (const upd of parsed.updatedCrossIndexEntries ?? []) {
    const existing = crossMap.get(upd.id);
    if (existing) {
      crossMap.set(upd.id, {
        ...existing,
        detail: upd.detail,
        status: upd.status,
        lastVerifiedTurn: targetTurn.turnNumber,
      });
    }
  }

  const now = Date.now();
  const addedEntries: CrossIndexEntry[] = (parsed.newCrossIndexEntries ?? []).map(
    (entry, idx) => ({
      id: `ci-${now}-rw-${idx}`,
      category: entry.category,
      title: entry.title,
      detail: entry.detail,
      tags: entry.tags,
      status: 'active',
      introducedAtTurn: targetTurn.turnNumber,
      lastVerifiedTurn: targetTurn.turnNumber,
      pinned: entry.pinned,
    }),
  );

  // Preserve original choice IDs if a choice was already selected so history stays linked
  const nextChoices: StoryChoice[] =
    targetTurn.selectedChoiceId && targetTurn.choices.length > 0
      ? targetTurn.choices
      : (parsed.choices?.length ? parsed.choices : targetTurn.choices).map((ch, idx) => ({
          id: `choice-${targetTurn.turnNumber}-${idx}-${now}`,
          label: ch.label,
          intent: ch.intent,
          consequenceHint: ch.consequenceHint,
        }));

  const nextNotes = [...(parsed.continuityNotes ?? [])];
  if (input.correctionInstruction.trim()) {
    nextNotes.unshift(`Retroactive rewrite: ${input.correctionInstruction.trim()}`);
  } else {
    nextNotes.unshift('Retroactively rewritten from manual correction');
  }

  const rewrittenTurn: StoryTurn = {
    ...targetTurn,
    sceneTitle: parsed.sceneTitle || targetTurn.sceneTitle,
    location: parsed.location || targetTurn.location,
    inStoryTime: parsed.inStoryTime || targetTurn.inStoryTime,
    userAction:
      targetTurn.turnNumber === 1
        ? null
        : parsed.userAction !== undefined
          ? parsed.userAction
          : targetTurn.userAction,
    prose: parsed.prose?.length ? parsed.prose : targetTurn.prose,
    choices: nextChoices,
    activeCharacters: parsed.activeCharacters?.length
      ? parsed.activeCharacters
      : targetTurn.activeCharacters,
    continuityNotes: nextNotes,
    continuityWarning: parsed.continuityWarning || null,
    timestamp: now,
  };

  return {
    rewrittenTurn,
    updatedCharacters: Array.from(charMap.values()),
    updatedCrossIndex: [...Array.from(crossMap.values()), ...addedEntries],
  };
}

const VALID_TTS_VOICES: ReadonlySet<TtsVoiceName> = new Set([
  'Kore',
  'Charon',
  'Fenrir',
  'Puck',
  'Zephyr',
]);

function splitTextForTts(text: string, maxChunkChars = 2200): string[] {
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if (para.length > maxChunkChars) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      const sentences = para.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [para];
      let sentBuf = '';
      for (const s of sentences) {
        if ((sentBuf + ' ' + s).trim().length > maxChunkChars && sentBuf) {
          chunks.push(sentBuf.trim());
          sentBuf = s.trim();
        } else {
          sentBuf = sentBuf ? `${sentBuf} ${s.trim()}` : s.trim();
        }
      }
      if (sentBuf) chunks.push(sentBuf.trim());
      continue;
    }

    if ((current + '\n\n' + para).trim().length > maxChunkChars && current) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

function extractWavPcm(wavBuf: Buffer): {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  pcm: Buffer;
} {
  if (wavBuf.length < 44 || wavBuf.toString('ascii', 0, 4) !== 'RIFF') {
    return { sampleRate: 24000, channels: 1, bitsPerSample: 16, pcm: wavBuf };
  }

  let sampleRate = 24000;
  let channels = 1;
  let bitsPerSample = 16;
  let offset = 12;

  while (offset + 8 <= wavBuf.length) {
    const chunkId = wavBuf.toString('ascii', offset, offset + 4);
    const chunkSize = wavBuf.readUInt32LE(offset + 4);
    const bodyStart = offset + 8;

    if (chunkId === 'fmt ' && bodyStart + 16 <= wavBuf.length) {
      channels = wavBuf.readUInt16LE(bodyStart + 2);
      sampleRate = wavBuf.readUInt32LE(bodyStart + 4);
      bitsPerSample = wavBuf.readUInt16LE(bodyStart + 14);
    } else if (chunkId === 'data') {
      const dataEnd = Math.min(wavBuf.length, bodyStart + chunkSize);
      return {
        sampleRate,
        channels,
        bitsPerSample,
        pcm: wavBuf.subarray(bodyStart, dataEnd),
      };
    }

    offset = bodyStart + chunkSize + (chunkSize % 2);
  }

  return { sampleRate, channels, bitsPerSample, pcm: wavBuf.subarray(44) };
}

function mergeWavBuffers(buffers: Buffer[]): Buffer {
  if (buffers.length === 1) return buffers[0];

  const extracted = buffers.map(extractWavPcm);
  const { sampleRate, channels, bitsPerSample } = extracted[0];
  const pcmTotal = Buffer.concat(extracted.map((e) => e.pcm));
  const dataSize = pcmTotal.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE((sampleRate * channels * bitsPerSample) / 8, 28);
  header.writeUInt16LE((channels * bitsPerSample) / 8, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmTotal]);
}

export interface SynthesizeSpeechInput {
  text: string;
  tone?: string;
  voiceName?: string;
}

export async function synthesizeNarrativeSpeech(
  input: SynthesizeSpeechInput,
): Promise<{ audioBase64: string; mimeType: 'audio/wav' }> {
  const cleanText = input.text.trim();
  if (!cleanText) {
    throw new Error('No narrative text provided to synthesize.');
  }

  const voice: TtsVoiceName = VALID_TTS_VOICES.has(input.voiceName as TtsVoiceName)
    ? (input.voiceName as TtsVoiceName)
    : 'Charon';

  const ai = getClient('v1beta');
  const chunks = splitTextForTts(cleanText, 2200);
  const styleHint = input.tone
    ? `Expressive literary audiobook narrator matching tone: ${input.tone}`
    : 'Warm, expressive literary audiobook narrator with clear pacing';

  const wavClips: Buffer[] = [];

  for (const chunkText of chunks) {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: chunkText,
              speechMetadata: {
                style: styleHint,
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    });

    let foundAudio: string | undefined;
    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        foundAudio = part.inlineData.data;
        break;
      }
    }

    if (!foundAudio) {
      throw new Error('TTS model did not return audio data.');
    }

    wavClips.push(Buffer.from(foundAudio, 'base64'));
  }

  const finalWav = mergeWavBuffers(wavClips);
  return {
    audioBase64: finalWav.toString('base64'),
    mimeType: 'audio/wav',
  };
}

export interface TranscribeAudioInput {
  audioBase64: string;
  mimeType: string;
  contextHint?: string;
}

export async function transcribeDictation(
  input: TranscribeAudioInput,
): Promise<{ text: string }> {
  const cleanBase64 = input.audioBase64.trim();
  if (!cleanBase64) {
    throw new Error('No audio recording was received.');
  }

  const normalizedMime = input.mimeType.split(';')[0].trim() || 'audio/webm';
  const ai = getClient('v1beta');

  const promptText = 'Transcribe this audio.';

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-transcribe',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: normalizedMime,
            data: cleanBase64,
          },
        },
        {
          text: promptText,
        },
      ],
    },
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const transcribedPartsText = parts
    .map((p) => {
      const partWithAudio = p as {
        text?: string;
        audioTranscription?: { text?: string };
      };
      return partWithAudio.audioTranscription?.text ?? partWithAudio.text ?? '';
    })
    .join(' ')
    .trim();

  const text = (transcribedPartsText || response.text || '').trim();
  if (!text) {
    throw new Error('No speech was detected in the recording.');
  }

  return { text };
}

export interface GenerateIllustrationPromptInput {
  snapshot: StorySnapshot;
  targetKind: 'scene' | 'chapter';
  turnId?: string;
  chapterId?: string;
  stylePreference?: string;
}

export interface IllustrationPromptResult {
  prompt: string;
  caption: string;
  artStyle: string;
  continuityChecklist: string[];
}

export async function generateIllustrationPrompt(
  input: GenerateIllustrationPromptInput,
  modelConfig?: Partial<ModelConfig>,
): Promise<IllustrationPromptResult> {
  const ai = getClient();
  const { model, thinkingLevel } = resolveModelConfig(modelConfig, ThinkingLevel.LOW);

  let targetHeader = '';
  let targetNarrative = '';
  let activeCharNames: string[] = [];

  if (input.targetKind === 'scene') {
    const turn = input.snapshot.turns.find((t) => t.id === input.turnId);
    if (!turn) {
      throw new Error('Target scene could not be found in the story.');
    }
    targetHeader = `Scene ${turn.turnNumber}: ${turn.sceneTitle} | Location: ${turn.location} | Time: ${turn.inStoryTime}`;
    targetNarrative = [
      turn.userAction ? `Triggering Action: ${turn.userAction}` : '',
      turn.prose.join('\n\n'),
    ]
      .filter(Boolean)
      .join('\n\n');
    activeCharNames = turn.activeCharacters;
  } else {
    const chapter = (input.snapshot.chapters ?? []).find(
      (c) => c.id === input.chapterId,
    );
    if (!chapter) {
      throw new Error('Target chapter could not be found in the story.');
    }
    const turnMap = new Map(input.snapshot.turns.map((t) => [t.id, t]));
    const chTurns = chapter.turnIds
      .map((id) => turnMap.get(id))
      .filter((t): t is StoryTurn => Boolean(t));

    targetHeader = `Chapter ${chapter.chapterNumber}: ${chapter.title}${
      chapter.summary ? ` | Summary: ${chapter.summary}` : ''
    }`;
    targetNarrative = chTurns
      .map(
        (t) =>
          `[Scene ${t.turnNumber} — ${t.sceneTitle} (${t.location}, ${t.inStoryTime})]\n${t.prose.join('\n\n')}`,
      )
      .join('\n\n---\n\n');
    activeCharNames = Array.from(
      new Set(chTurns.flatMap((t) => t.activeCharacters)),
    );
  }

  const activeSet = new Set(activeCharNames.map((n) => n.trim().toLowerCase()));
  const relevantCharacters = input.snapshot.characters.filter((c) => {
    const lower = c.name.toLowerCase();
    for (const active of activeSet) {
      if (active === lower || lower.includes(active) || active.includes(lower)) {
        return true;
      }
    }
    return false;
  });

  const relevantLore = input.snapshot.crossIndex
    .filter((entry) => entry.status !== 'resolved')
    .slice(0, 12)
    .map((entry) => ({
      category: entry.category,
      title: entry.title,
      detail: entry.detail,
    }));

  const prompt = `
UNIVERSE: ${input.snapshot.universe}
SETTING: ${input.snapshot.setting}
TONE & GENRE: ${input.snapshot.tone}
REQUESTED ART STYLE PREFERENCE: ${input.stylePreference?.trim() || 'Match the literary tone and era of the universe'}

TARGET TO ILLUSTRATE (${input.targetKind.toUpperCase()}):
${targetHeader}

NARRATIVE TEXT:
${targetNarrative}

CHARACTERS PRESENT (honor exact physical traits, status, and inventory):
${JSON.stringify(
  relevantCharacters.map((c) => ({
    name: c.name,
    role: c.role,
    summary: c.summary,
    status: c.status,
    location: c.location,
    inventory: c.inventory,
  })),
  null,
  2,
)}

ACTIVE CROSS-INDEX CANON CONSTRAINTS (MUST NOT BE CONTRADICTED VISUALLY):
${JSON.stringify(relevantLore, null, 2)}

INSTRUCTIONS:
1. Craft a vivid, concrete "prompt" (1-2 rich paragraphs, ready to paste into any illustration generator or send to an artist) capturing the most evocative visual moment of this ${input.targetKind}: foreground/midground composition, lighting, weather/atmosphere, period architecture, character poses/expressions, clothing, and exact carried items. Avoid generic buzzwords like "masterpiece" or "8k".
2. Write a concise 1-sentence literary "caption" suitable for a book figure caption beneath the plate.
3. Specify "artStyle" summarizing the recommended medium, brushwork/line quality, and palette.
4. Provide 2-4 crisp "continuityChecklist" items naming concrete visual canon facts from the Cross-Index or character inventories that the artwork must get right.
`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction:
        'You are an editorial art director and fictional canon archivist creating faithful, visually specific book illustration briefs that strictly obey story continuity.',
      ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          prompt: { type: Type.STRING },
          caption: { type: Type.STRING },
          artStyle: { type: Type.STRING },
          continuityChecklist: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ['prompt', 'caption', 'artStyle', 'continuityChecklist'],
      },
    },
  });

  const parsed = safeParseJson<IllustrationPromptResult>(
    response.text,
    'Failed to generate canon illustration brief.',
  );

  return {
    prompt: parsed.prompt.trim(),
    caption: parsed.caption.trim(),
    artStyle: parsed.artStyle.trim(),
    continuityChecklist: (parsed.continuityChecklist ?? []).filter(Boolean),
  };
}

export interface ImportedStoryEnrichmentPayload {
  title?: string;
  universe?: string;
  setting?: string;
  tone?: string;
  premise?: string;
  characters: Array<{
    name: string;
    role: 'Protagonist' | 'Companion' | 'Antagonist' | 'NPC';
    origin: 'canon' | 'original';
    summary: string;
    pros: string[];
    flaws: string[];
    motivation: string;
    voiceAndMannerisms: string;
    status: string;
    location: string;
    inventory: string[];
    relationships: Array<{ targetName: string; relation: string }>;
  }>;
  crossIndex: Array<{
    category: CrossIndexCategory;
    title: string;
    detail: string;
    tags: string[];
    pinned: boolean;
  }>;
  tagsHint?: {
    fandoms?: string[];
    relationships?: string[];
    characters?: string[];
    freeforms?: string[];
  };
  continuationChoices?: Array<{
    label: string;
    intent: string;
    consequenceHint: string;
  }>;
}

export async function enrichImportedStory(
  excerpt: {
    title: string;
    author?: string;
    source: string;
    universeHint?: string;
    settingHint?: string;
    toneHint?: string;
    premiseHint?: string;
    sampleText: string;
  },
  modelConfig?: Partial<ModelConfig>,
): Promise<ImportedStoryEnrichmentPayload> {
  const ai = getClient();
  const { model, thinkingLevel } = resolveModelConfig(modelConfig, ThinkingLevel.LOW);

  const prompt = `
Imported Story Metadata:
Title: ${excerpt.title}
Author: ${excerpt.author || 'Unknown'}
Source: ${excerpt.source}
Universe Hint: ${excerpt.universeHint || '(Deduce from text)'}
Setting Hint: ${excerpt.settingHint || '(Deduce from text)'}
Tone Hint: ${excerpt.toneHint || '(Deduce from text)'}
Premise Hint: ${excerpt.premiseHint || '(Summarize concisely from excerpt)'}

Manuscript Excerpt:
${excerpt.sampleText}

Tasks:
1. Identify the story's universe/fandom (or "Original Fiction"), setting/era, literary tone, and a crisp 2-3 sentence premise summary.
2. Extract 2-6 key characters directly evidenced in the excerpt (including at least one Protagonist), detailing grounded strengths (pros), flaws, motivation, voice/mannerisms, current status, location, inventory, and relationships.
3. Extract 3-6 essential Cross-Index canon anchors ('world_rule', 'location', 'item', 'timeline', 'plot_thread') grounded strictly in the excerpt.
4. Suggest concise Archive-style fandoms, relationships (e.g. "A / B" or "A & B"), characters, and freeform trope tags.
5. Propose 3 actionable continuation choices for the very next scene after this excerpt ends.
`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction:
        'You are a literary archivist and continuity director. Analyze the provided story excerpt faithfully without inventing contradictory canon facts.',
      ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          universe: { type: Type.STRING },
          setting: { type: Type.STRING },
          tone: { type: Type.STRING },
          premise: { type: Type.STRING },
          characters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                role: {
                  type: Type.STRING,
                  enum: ['Protagonist', 'Companion', 'Antagonist', 'NPC'],
                },
                origin: { type: Type.STRING, enum: ['canon', 'original'] },
                summary: { type: Type.STRING },
                pros: { type: Type.ARRAY, items: { type: Type.STRING } },
                flaws: { type: Type.ARRAY, items: { type: Type.STRING } },
                motivation: { type: Type.STRING },
                voiceAndMannerisms: { type: Type.STRING },
                status: { type: Type.STRING },
                location: { type: Type.STRING },
                inventory: { type: Type.ARRAY, items: { type: Type.STRING } },
                relationships: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      targetName: { type: Type.STRING },
                      relation: { type: Type.STRING },
                    },
                    required: ['targetName', 'relation'],
                  },
                },
              },
              required: [
                'name',
                'role',
                'origin',
                'summary',
                'pros',
                'flaws',
                'motivation',
                'voiceAndMannerisms',
                'status',
                'location',
                'inventory',
                'relationships',
              ],
            },
          },
          crossIndex: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                category: {
                  type: Type.STRING,
                  enum: [
                    'world_rule',
                    'character_state',
                    'location',
                    'item',
                    'timeline',
                    'plot_thread',
                  ],
                },
                title: { type: Type.STRING },
                detail: { type: Type.STRING },
                tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                pinned: { type: Type.BOOLEAN },
              },
              required: ['category', 'title', 'detail', 'tags', 'pinned'],
            },
          },
          tagsHint: {
            type: Type.OBJECT,
            properties: {
              fandoms: { type: Type.ARRAY, items: { type: Type.STRING } },
              relationships: { type: Type.ARRAY, items: { type: Type.STRING } },
              characters: { type: Type.ARRAY, items: { type: Type.STRING } },
              freeforms: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
          },
          continuationChoices: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                intent: { type: Type.STRING },
                consequenceHint: { type: Type.STRING },
              },
              required: ['label', 'intent', 'consequenceHint'],
            },
          },
        },
        required: ['universe', 'setting', 'tone', 'premise', 'characters', 'crossIndex'],
      },
    },
  });

  const parsed = safeParseJson<ImportedStoryEnrichmentPayload>(
    response.text,
    'Failed to analyze imported manuscript.',
  );

  return parsed;
}
