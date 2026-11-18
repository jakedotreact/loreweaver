import express from 'express';
import {
  advanceNarrative,
  auditContinuity,
  deduceSingleCharacter,
  deduceUniverseAndCast,
  formatGeminiError,
  generateIllustrationPrompt,
  listAvailableModels,
  rewriteSceneRetroactively,
  synthesizeNarrativeSpeech,
  transcribeDictation,
} from './storyAgent.ts';

export function createApiApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/config', async (_req, res) => {
    const discovered = await listAvailableModels();
    res.json({
      hasServerApiKey: Boolean(process.env.GEMINI_API_KEY),
      availableModels: discovered.models.map((m) => m.id),
      models: discovered.models,
      source: discovered.source,
    });
  });

  app.get('/api/models', async (_req, res) => {
    const discovered = await listAvailableModels();
    res.json(discovered);
  });

  app.post('/api/story/deduce-universe', async (req, res) => {
    try {
      const { title, universe, setting, tone, premise, seedCharacters, modelConfig } =
        req.body ?? {};
      if (!universe || !setting || !premise) {
        return res.status(400).json({
          error: 'Universe, setting, and premise are required to initialize a story.',
        });
      }
      const snapshot = await deduceUniverseAndCast(
        {
          title,
          universe,
          setting,
          tone: tone || 'Character-Driven Literary Fiction',
          premise,
          seedCharacters,
        },
        modelConfig,
      );
      return res.json({ snapshot });
    } catch (err) {
      return res.status(500).json({
        error: formatGeminiError(err, 'Failed to initialize story universe.'),
      });
    }
  });

  app.post('/api/story/deduce-character', async (req, res) => {
    try {
      const {
        universe,
        setting,
        tone,
        premise,
        existingCharacters,
        name,
        role,
        notes,
        existingPros,
        existingFlaws,
        modelConfig,
      } = req.body ?? {};
      if (!universe || !name) {
        return res.status(400).json({ error: 'Universe and character name are required.' });
      }
      const character = await deduceSingleCharacter(
        {
          universe,
          setting: setting || '',
          tone: tone || '',
          premise: premise || '',
          existingCharacters: existingCharacters || [],
          name,
          role,
          notes,
          existingPros,
          existingFlaws,
        },
        modelConfig,
      );
      return res.json({ character });
    } catch (err) {
      return res.status(500).json({
        error: formatGeminiError(err, 'Failed to deduce character profile.'),
      });
    }
  });

  app.post('/api/story/advance', async (req, res) => {
    try {
      const { snapshot, userAction, selectedChoiceId, modelConfig } = req.body ?? {};
      if (!snapshot || !userAction) {
        return res.status(400).json({ error: 'Story snapshot and user action are required.' });
      }
      const result = await advanceNarrative(
        snapshot,
        userAction,
        selectedChoiceId ?? null,
        modelConfig,
      );
      return res.json(result);
    } catch (err) {
      return res.status(500).json({
        error: formatGeminiError(err, 'Failed to advance narrative.'),
      });
    }
  });

  app.post('/api/story/audit', async (req, res) => {
    try {
      const { snapshot, modelConfig } = req.body ?? {};
      if (!snapshot) {
        return res.status(400).json({ error: 'Story snapshot is required.' });
      }
      const report = await auditContinuity(snapshot, modelConfig);
      return res.json({ report });
    } catch (err) {
      return res.status(500).json({
        error: formatGeminiError(err, 'Failed to audit story continuity.'),
      });
    }
  });

  app.post('/api/story/rewrite-scene', async (req, res) => {
    try {
      const {
        snapshot,
        targetTurnId,
        correctionInstruction,
        editedFields,
        newLoreCorrection,
        modelConfig,
      } = req.body ?? {};
      if (!snapshot || !targetTurnId) {
        return res.status(400).json({
          error: 'Story snapshot and target scene ID are required.',
        });
      }
      const result = await rewriteSceneRetroactively(
        {
          snapshot,
          targetTurnId,
          correctionInstruction: correctionInstruction || '',
          editedFields,
          newLoreCorrection,
        },
        modelConfig,
      );
      return res.json(result);
    } catch (err) {
      return res.status(500).json({
        error: formatGeminiError(err, 'Failed to rewrite scene retroactively.'),
      });
    }
  });

  app.post('/api/story/tts', async (req, res) => {
    try {
      const { text, tone, voiceName } = req.body ?? {};
      if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({
          error: 'Narrative text is required for speech synthesis.',
        });
      }
      const audio = await synthesizeNarrativeSpeech({ text, tone, voiceName });
      return res.json(audio);
    } catch (err) {
      return res.status(500).json({
        error: formatGeminiError(err, 'Failed to synthesize speech audio.'),
      });
    }
  });

  app.post('/api/story/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType, contextHint } = req.body ?? {};
      if (!audioBase64 || typeof audioBase64 !== 'string') {
        return res.status(400).json({
          error: 'Audio data is required for transcription.',
        });
      }
      const result = await transcribeDictation({
        audioBase64,
        mimeType: typeof mimeType === 'string' ? mimeType : 'audio/webm',
        contextHint: typeof contextHint === 'string' ? contextHint : undefined,
      });
      return res.json(result);
    } catch (err) {
      return res.status(500).json({
        error: formatGeminiError(err, 'Failed to transcribe speech.'),
      });
    }
  });

  app.post('/api/story/illustration-prompt', async (req, res) => {
    try {
      const {
        snapshot,
        targetKind,
        turnId,
        chapterId,
        stylePreference,
        modelConfig,
      } = req.body ?? {};
      if (!snapshot || (targetKind !== 'scene' && targetKind !== 'chapter')) {
        return res.status(400).json({
          error: 'Story snapshot and target kind ("scene" or "chapter") are required.',
        });
      }
      if (targetKind === 'scene' && !turnId) {
        return res.status(400).json({ error: 'Target scene ID is required.' });
      }
      if (targetKind === 'chapter' && !chapterId) {
        return res.status(400).json({ error: 'Target chapter ID is required.' });
      }
      const result = await generateIllustrationPrompt(
        {
          snapshot,
          targetKind,
          turnId,
          chapterId,
          stylePreference,
        },
        modelConfig,
      );
      return res.json({ result });
    } catch (err) {
      return res.status(500).json({
        error: formatGeminiError(err, 'Failed to generate illustration prompt.'),
      });
    }
  });

  app.use('/api', (_req, res) => {
    return res.status(404).json({ error: 'API endpoint not found.' });
  });

  app.use(
    (
      err: unknown,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (req.originalUrl.startsWith('/api') || req.path.startsWith('/api')) {
        const errObj =
          typeof err === 'object' && err !== null
            ? (err as { status?: unknown; statusCode?: unknown })
            : null;
        const status =
          typeof errObj?.status === 'number'
            ? errObj.status
            : typeof errObj?.statusCode === 'number'
              ? errObj.statusCode
              : 500;
        const message =
          err instanceof Error ? err.message : 'Unexpected server error.';
        return res.status(status).json({ error: message });
      }
      return next(err);
    },
  );

  return app;
}
