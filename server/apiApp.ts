import crypto from 'crypto';
import express from 'express';
import {
  extractBearerToken,
  verifyFirebaseIdToken,
} from './firebaseAuth.ts';
import type { VerifiedFirebaseUser } from './firebaseAuth.ts';
import { ConcurrencyLimiter, FixedWindowRateLimiter } from './rateLimit.ts';
import {
  advanceNarrative,
  auditContinuity,
  deduceSingleCharacter,
  deduceUniverseAndCast,
  enrichImportedStory,
  formatGeminiError,
  generateIllustrationPrompt,
  listAvailableModels,
  rewriteSceneRetroactively,
  synthesizeNarrativeSpeech,
  transcribeDictation,
} from './storyAgent.ts';
import {
  importStoryFromFileBuffer,
  importStoryFromUrl,
} from './storyImporter.ts';
import {
  validateAdvanceBody,
  validateAuditBody,
  validateDeduceCharacterBody,
  validateDeduceUniverseBody,
  validateIllustrationPromptBody,
  validateImportFileBody,
  validateImportUrlBody,
  validateRewriteSceneBody,
  validateTranscribeBody,
  validateTtsBody,
} from './validation.ts';

interface RequestWithSecurity extends express.Request {
  requestId?: string;
  authUser?: VerifiedFirebaseUser;
}

export interface ApiHandlers {
  listAvailableModels: typeof listAvailableModels;
  deduceUniverseAndCast: typeof deduceUniverseAndCast;
  deduceSingleCharacter: typeof deduceSingleCharacter;
  advanceNarrative: typeof advanceNarrative;
  auditContinuity: typeof auditContinuity;
  rewriteSceneRetroactively: typeof rewriteSceneRetroactively;
  synthesizeNarrativeSpeech: typeof synthesizeNarrativeSpeech;
  transcribeDictation: typeof transcribeDictation;
  generateIllustrationPrompt: typeof generateIllustrationPrompt;
  enrichImportedStory: typeof enrichImportedStory;
  importStoryFromFileBuffer: typeof importStoryFromFileBuffer;
  importStoryFromUrl: typeof importStoryFromUrl;
}

export interface ApiAppOptions {
  verifyToken?: (token: string) => Promise<VerifiedFirebaseUser>;
  standardRateLimiter?: FixedWindowRateLimiter;
  heavyRateLimiter?: FixedWindowRateLimiter;
  ipRateLimiter?: FixedWindowRateLimiter;
  concurrencyLimiter?: ConcurrencyLimiter;
  logger?: (entry: Record<string, unknown>) => void;
  handlers?: Partial<ApiHandlers>;
}

const DEFAULT_HANDLERS: ApiHandlers = {
  listAvailableModels,
  deduceUniverseAndCast,
  deduceSingleCharacter,
  advanceNarrative,
  auditContinuity,
  rewriteSceneRetroactively,
  synthesizeNarrativeSpeech,
  transcribeDictation,
  generateIllustrationPrompt,
  enrichImportedStory,
  importStoryFromFileBuffer,
  importStoryFromUrl,
};

function redactSensitiveText(input: string): string {
  return input
    .replace(/AIza[0-9A-Za-z_-]{15,}/g, '[REDACTED_API_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(
      /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g,
      '[REDACTED_PRIVATE_KEY]',
    );
}

function defaultLogger(entry: Record<string, unknown>): void {
  console.error(JSON.stringify(entry));
}

function getClientIp(req: express.Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function getRequestId(req: express.Request): string {
  return (req as RequestWithSecurity).requestId || 'unknown';
}

const SAFE_IMPORTER_MESSAGE_RE =
  /^(?:Filename is required|The uploaded file is empty|Uploaded file exceeds|Unsupported file format|Please enter a valid http|Only http:\/\/ and https:\/\/ URLs are supported|URLs with embedded credentials are not allowed|Local or internal network URLs are not allowed|Private or loopback IP addresses are not allowed|URL resolves to a restricted internal network address|Could not resolve story URL hostname|Remote story document exceeds|Fetching the story URL timed out|Unable to fetch story URL|Remote URL attempted an uninspectable redirect|Remote URL returned an invalid redirect target|Too many redirects while fetching story URL|URL returned HTTP \d{3}|The fetched URL returned an empty response|Could not extract readable|Corrupted or invalid \.(?:docx|odt) document|No readable text found|Invalid base64)/i;

function classifyAiError(err: unknown): {
  status: number;
  code: string;
} {
  const raw = err instanceof Error ? err.message : String(err || '');
  if (/RESOURCE_EXHAUSTED|429/i.test(raw)) {
    return { status: 429, code: 'upstream_rate_limited' };
  }
  if (/ETIMEDOUT|ECONNRESET|timeout|timed out|504|DEADLINE_EXCEEDED/i.test(raw)) {
    return { status: 504, code: 'upstream_timeout' };
  }
  if (/API_KEY_INVALID|PERMISSION_DENIED|403|401|GEMINI_API_KEY/i.test(raw)) {
    return { status: 502, code: 'upstream_auth_error' };
  }
  if (/NOT_FOUND|404/i.test(raw)) {
    return { status: 502, code: 'upstream_model_not_found' };
  }
  return { status: 500, code: 'internal_error' };
}

export function createApiApp(options: ApiAppOptions = {}): express.Express {
  const app = express();
  const verifyToken = options.verifyToken ?? verifyFirebaseIdToken;
  const standardRateLimiter =
    options.standardRateLimiter ?? new FixedWindowRateLimiter(60, 60_000);
  const heavyRateLimiter =
    options.heavyRateLimiter ?? new FixedWindowRateLimiter(20, 60_000);
  const ipRateLimiter =
    options.ipRateLimiter ?? new FixedWindowRateLimiter(120, 60_000);
  const concurrencyLimiter =
    options.concurrencyLimiter ?? new ConcurrencyLimiter(4);
  const logger = options.logger ?? defaultLogger;
  const handlers: ApiHandlers = {
    ...DEFAULT_HANDLERS,
    ...(options.handlers ?? {}),
  };

  const jsonSmall = express.json({ limit: '512kb' });
  const jsonSnapshot = express.json({ limit: '2mb' });
  const jsonBinary = express.json({ limit: '16mb' });

  app.use((req, res, next) => {
    const requestId = crypto.randomUUID();
    (req as RequestWithSecurity).requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  });

  const logServerError = (
    req: express.Request,
    status: number,
    code: string,
    err: unknown,
  ) => {
    const rawMsg = err instanceof Error ? err.message : String(err || 'Unknown error');
    const rawStack = err instanceof Error ? err.stack : undefined;
    logger({
      level: 'error',
      timestamp: new Date().toISOString(),
      requestId: getRequestId(req),
      method: req.method,
      path: req.originalUrl,
      uid: (req as RequestWithSecurity).authUser?.uid ?? null,
      status,
      code,
      message: redactSensitiveText(rawMsg),
      ...(rawStack ? { stack: redactSensitiveText(rawStack).slice(0, 1500) } : {}),
    });
  };

  const requireAuth: express.RequestHandler = async (req, res, next) => {
    const requestId = getRequestId(req);
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({
        error: 'Authentication is required to use story AI and import endpoints.',
        code: 'unauthorized',
        requestId,
      });
    }

    try {
      const user = await verifyToken(token);
      (req as RequestWithSecurity).authUser = user;
      return next();
    } catch (err) {
      const errObj = err as { status?: number; code?: string };
      const status =
        typeof errObj?.status === 'number' && errObj.status >= 400 && errObj.status < 600
          ? errObj.status
          : 401;
      const code = typeof errObj?.code === 'string' ? errObj.code : 'unauthorized';
      logServerError(req, status, code, err);
      const publicMsg =
        status === 503
          ? 'Authentication verification service is temporarily unavailable.'
          : 'Invalid or expired authentication token.';
      return res.status(status).json({
        error: publicMsg,
        code,
        requestId,
      });
    }
  };

  const applyRateLimits = (heavy: boolean): express.RequestHandler => {
    return (req, res, next) => {
      const requestId = getRequestId(req);
      const clientIp = getClientIp(req);
      const ipDecision = ipRateLimiter.consume(`ip:${clientIp}`);
      if (!ipDecision.allowed) {
        res.setHeader('Retry-After', String(ipDecision.retryAfterSeconds));
        return res.status(429).json({
          error: 'Too many requests from this network address. Please retry shortly.',
          code: 'rate_limited',
          requestId,
        });
      }

      const uid = (req as RequestWithSecurity).authUser?.uid ?? `anon:${clientIp}`;
      const limiter = heavy ? heavyRateLimiter : standardRateLimiter;
      const userDecision = limiter.consume(`${heavy ? 'heavy' : 'std'}:${uid}`);
      if (!userDecision.allowed) {
        res.setHeader('Retry-After', String(userDecision.retryAfterSeconds));
        return res.status(429).json({
          error: 'Rate limit exceeded for your account. Please retry shortly.',
          code: 'rate_limited',
          requestId,
        });
      }

      return next();
    };
  };

  const withConcurrency = async (
    req: express.Request,
    res: express.Response,
    fn: () => Promise<unknown>,
  ) => {
    const requestId = getRequestId(req);
    const uid = (req as RequestWithSecurity).authUser?.uid ?? getClientIp(req);
    const release = concurrencyLimiter.tryAcquire(`uid:${uid}`);
    if (!release) {
      res.setHeader('Retry-After', '2');
      return res.status(429).json({
        error: 'Too many concurrent operations in progress. Please wait for one to finish.',
        code: 'concurrency_limited',
        requestId,
      });
    }
    try {
      return await fn();
    } finally {
      release();
    }
  };

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/config', async (_req, res) => {
    const discovered = await handlers.listAvailableModels();
    res.json({
      hasServerApiKey: Boolean(process.env.GEMINI_API_KEY),
      availableModels: discovered.models.map((m) => m.id),
      models: discovered.models,
      source: discovered.source,
    });
  });

  app.get('/api/models', async (_req, res) => {
    const discovered = await handlers.listAvailableModels();
    res.json(discovered);
  });

  app.post(
    '/api/story/deduce-universe',
    requireAuth,
    applyRateLimits(false),
    jsonSmall,
    async (req, res) => {
      const requestId = getRequestId(req);
      const checked = validateDeduceUniverseBody(req.body);
      if (!checked.ok) {
        return res.status(checked.status ?? 400).json({
          error: checked.error,
          code: checked.status === 413 ? 'payload_too_large' : 'invalid_request',
          requestId,
        });
      }

      return withConcurrency(req, res, async () => {
        try {
          const snapshot = await handlers.deduceUniverseAndCast(
            {
              title: checked.value.title,
              universe: checked.value.universe,
              setting: checked.value.setting,
              tone: checked.value.tone,
              premise: checked.value.premise,
              seedCharacters: checked.value.seedCharacters,
            },
            checked.value.modelConfig,
          );
          return res.json({ snapshot });
        } catch (err) {
          const { status, code } = classifyAiError(err);
          logServerError(req, status, code, err);
          return res.status(status).json({
            error: formatGeminiError(err, 'Failed to initialize story universe.'),
            code,
            requestId,
          });
        }
      });
    },
  );

  app.post(
    '/api/story/deduce-character',
    requireAuth,
    applyRateLimits(false),
    jsonSnapshot,
    async (req, res) => {
      const requestId = getRequestId(req);
      const checked = validateDeduceCharacterBody(req.body);
      if (!checked.ok) {
        return res.status(checked.status ?? 400).json({
          error: checked.error,
          code: checked.status === 413 ? 'payload_too_large' : 'invalid_request',
          requestId,
        });
      }

      return withConcurrency(req, res, async () => {
        try {
          const character = await handlers.deduceSingleCharacter(
            {
              universe: checked.value.universe,
              setting: checked.value.setting,
              tone: checked.value.tone,
              premise: checked.value.premise,
              existingCharacters: checked.value.existingCharacters,
              name: checked.value.name,
              role: checked.value.role,
              notes: checked.value.notes,
              existingPros: checked.value.existingPros,
              existingFlaws: checked.value.existingFlaws,
            },
            checked.value.modelConfig,
          );
          return res.json({ character });
        } catch (err) {
          const { status, code } = classifyAiError(err);
          logServerError(req, status, code, err);
          return res.status(status).json({
            error: formatGeminiError(err, 'Failed to deduce character profile.'),
            code,
            requestId,
          });
        }
      });
    },
  );

  app.post(
    '/api/story/advance',
    requireAuth,
    applyRateLimits(false),
    jsonSnapshot,
    async (req, res) => {
      const requestId = getRequestId(req);
      const checked = validateAdvanceBody(req.body);
      if (!checked.ok) {
        return res.status(checked.status ?? 400).json({
          error: checked.error,
          code: checked.status === 413 ? 'payload_too_large' : 'invalid_request',
          requestId,
        });
      }

      return withConcurrency(req, res, async () => {
        try {
          const result = await handlers.advanceNarrative(
            checked.value.snapshot,
            checked.value.userAction,
            checked.value.selectedChoiceId,
            checked.value.modelConfig,
          );
          return res.json(result);
        } catch (err) {
          const { status, code } = classifyAiError(err);
          logServerError(req, status, code, err);
          return res.status(status).json({
            error: formatGeminiError(err, 'Failed to advance narrative.'),
            code,
            requestId,
          });
        }
      });
    },
  );

  app.post(
    '/api/story/audit',
    requireAuth,
    applyRateLimits(false),
    jsonSnapshot,
    async (req, res) => {
      const requestId = getRequestId(req);
      const checked = validateAuditBody(req.body);
      if (!checked.ok) {
        return res.status(checked.status ?? 400).json({
          error: checked.error,
          code: checked.status === 413 ? 'payload_too_large' : 'invalid_request',
          requestId,
        });
      }

      return withConcurrency(req, res, async () => {
        try {
          const report = await handlers.auditContinuity(
            checked.value.snapshot,
            checked.value.modelConfig,
          );
          return res.json({ report });
        } catch (err) {
          const { status, code } = classifyAiError(err);
          logServerError(req, status, code, err);
          return res.status(status).json({
            error: formatGeminiError(err, 'Failed to audit story continuity.'),
            code,
            requestId,
          });
        }
      });
    },
  );

  app.post(
    '/api/story/rewrite-scene',
    requireAuth,
    applyRateLimits(false),
    jsonSnapshot,
    async (req, res) => {
      const requestId = getRequestId(req);
      const checked = validateRewriteSceneBody(req.body);
      if (!checked.ok) {
        return res.status(checked.status ?? 400).json({
          error: checked.error,
          code: checked.status === 413 ? 'payload_too_large' : 'invalid_request',
          requestId,
        });
      }

      return withConcurrency(req, res, async () => {
        try {
          const result = await handlers.rewriteSceneRetroactively(
            {
              snapshot: checked.value.snapshot,
              targetTurnId: checked.value.targetTurnId,
              correctionInstruction: checked.value.correctionInstruction,
              editedFields: checked.value.editedFields,
              newLoreCorrection: checked.value.newLoreCorrection,
            },
            checked.value.modelConfig,
          );
          return res.json(result);
        } catch (err) {
          const { status, code } = classifyAiError(err);
          logServerError(req, status, code, err);
          return res.status(status).json({
            error: formatGeminiError(err, 'Failed to rewrite scene retroactively.'),
            code,
            requestId,
          });
        }
      });
    },
  );

  app.post(
    '/api/story/tts',
    requireAuth,
    applyRateLimits(true),
    jsonSmall,
    async (req, res) => {
      const requestId = getRequestId(req);
      const checked = validateTtsBody(req.body);
      if (!checked.ok) {
        return res.status(checked.status ?? 400).json({
          error: checked.error,
          code: checked.status === 413 ? 'payload_too_large' : 'invalid_request',
          requestId,
        });
      }

      return withConcurrency(req, res, async () => {
        try {
          const audio = await handlers.synthesizeNarrativeSpeech({
            text: checked.value.text,
            tone: checked.value.tone,
            voiceName: checked.value.voiceName,
          });
          return res.json(audio);
        } catch (err) {
          const { status, code } = classifyAiError(err);
          logServerError(req, status, code, err);
          return res.status(status).json({
            error: formatGeminiError(err, 'Failed to synthesize speech audio.'),
            code,
            requestId,
          });
        }
      });
    },
  );

  app.post(
    '/api/story/transcribe',
    requireAuth,
    applyRateLimits(true),
    jsonBinary,
    async (req, res) => {
      const requestId = getRequestId(req);
      const checked = validateTranscribeBody(req.body);
      if (!checked.ok) {
        return res.status(checked.status ?? 400).json({
          error: checked.error,
          code: checked.status === 413 ? 'payload_too_large' : 'invalid_request',
          requestId,
        });
      }

      return withConcurrency(req, res, async () => {
        try {
          const result = await handlers.transcribeDictation({
            audioBase64: checked.value.audioBase64,
            mimeType: checked.value.mimeType,
            contextHint: checked.value.contextHint,
          });
          return res.json(result);
        } catch (err) {
          const { status, code } = classifyAiError(err);
          logServerError(req, status, code, err);
          return res.status(status).json({
            error: formatGeminiError(err, 'Failed to transcribe speech.'),
            code,
            requestId,
          });
        }
      });
    },
  );

  app.post(
    '/api/story/illustration-prompt',
    requireAuth,
    applyRateLimits(false),
    jsonSnapshot,
    async (req, res) => {
      const requestId = getRequestId(req);
      const checked = validateIllustrationPromptBody(req.body);
      if (!checked.ok) {
        return res.status(checked.status ?? 400).json({
          error: checked.error,
          code: checked.status === 413 ? 'payload_too_large' : 'invalid_request',
          requestId,
        });
      }

      return withConcurrency(req, res, async () => {
        try {
          const result = await handlers.generateIllustrationPrompt(
            {
              snapshot: checked.value.snapshot,
              targetKind: checked.value.targetKind,
              turnId: checked.value.turnId,
              chapterId: checked.value.chapterId,
              stylePreference: checked.value.stylePreference,
            },
            checked.value.modelConfig,
          );
          return res.json({ result });
        } catch (err) {
          const { status, code } = classifyAiError(err);
          logServerError(req, status, code, err);
          return res.status(status).json({
            error: formatGeminiError(err, 'Failed to generate illustration prompt.'),
            code,
            requestId,
          });
        }
      });
    },
  );

  app.post(
    '/api/story/import-file',
    requireAuth,
    applyRateLimits(true),
    jsonBinary,
    async (req, res) => {
      const requestId = getRequestId(req);
      const checked = validateImportFileBody(req.body);
      if (!checked.ok) {
        return res.status(checked.status ?? 400).json({
          error: checked.error,
          code: checked.status === 413 ? 'payload_too_large' : 'invalid_request',
          requestId,
        });
      }

      return withConcurrency(req, res, async () => {
        try {
          const cleanBase64 = checked.value.contentBase64.includes(',')
            ? checked.value.contentBase64.split(',').pop() || ''
            : checked.value.contentBase64;
          const buffer = Buffer.from(cleanBase64, 'base64');

          const shouldEnrich =
            checked.value.enrichWithAi !== false && Boolean(process.env.GEMINI_API_KEY);
          const result = await handlers.importStoryFromFileBuffer({
            filename: checked.value.filename,
            mimeType: checked.value.mimeType,
            buffer,
            options: {
              title: checked.value.title,
              universe: checked.value.universe,
              setting: checked.value.setting,
              tone: checked.value.tone,
              isPrivate: checked.value.isPrivate,
              enrichWithAi: shouldEnrich,
              modelConfig: checked.value.modelConfig,
              enricher: shouldEnrich ? handlers.enrichImportedStory : undefined,
            },
          });
          return res.json(result);
        } catch (err) {
          const rawMsg = err instanceof Error ? err.message : '';
          const isSafeClientErr = SAFE_IMPORTER_MESSAGE_RE.test(rawMsg);
          const status = isSafeClientErr ? 400 : 500;
          const code = isSafeClientErr ? 'import_validation_failed' : 'import_failed';
          logServerError(req, status, code, err);
          return res.status(status).json({
            error: isSafeClientErr ? rawMsg : 'Failed to import story document.',
            code,
            requestId,
          });
        }
      });
    },
  );

  app.post(
    '/api/story/import-url',
    requireAuth,
    applyRateLimits(true),
    jsonSmall,
    async (req, res) => {
      const requestId = getRequestId(req);
      const checked = validateImportUrlBody(req.body);
      if (!checked.ok) {
        return res.status(checked.status ?? 400).json({
          error: checked.error,
          code: checked.status === 413 ? 'payload_too_large' : 'invalid_request',
          requestId,
        });
      }

      return withConcurrency(req, res, async () => {
        try {
          const shouldEnrich =
            checked.value.enrichWithAi !== false && Boolean(process.env.GEMINI_API_KEY);
          const result = await handlers.importStoryFromUrl({
            url: checked.value.url,
            options: {
              title: checked.value.title,
              universe: checked.value.universe,
              setting: checked.value.setting,
              tone: checked.value.tone,
              isPrivate: checked.value.isPrivate,
              enrichWithAi: shouldEnrich,
              modelConfig: checked.value.modelConfig,
              enricher: shouldEnrich ? handlers.enrichImportedStory : undefined,
            },
          });
          return res.json(result);
        } catch (err) {
          const rawMsg = err instanceof Error ? err.message : '';
          const isSafeClientErr = SAFE_IMPORTER_MESSAGE_RE.test(rawMsg);
          const status = isSafeClientErr ? 400 : 500;
          const code = isSafeClientErr ? 'import_validation_failed' : 'import_failed';
          logServerError(req, status, code, err);
          return res.status(status).json({
            error: isSafeClientErr ? rawMsg : 'Failed to import story from URL.',
            code,
            requestId,
          });
        }
      });
    },
  );

  app.use('/api', (req, res) => {
    return res.status(404).json({
      error: 'API endpoint not found.',
      code: 'not_found',
      requestId: getRequestId(req),
    });
  });

  app.use(
    (
      err: unknown,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (req.originalUrl.startsWith('/api') || req.path.startsWith('/api')) {
        const requestId = getRequestId(req);
        const errObj =
          typeof err === 'object' && err !== null
            ? (err as { status?: unknown; statusCode?: unknown; type?: unknown })
            : null;
        if (errObj?.type === 'entity.too.large' || errObj?.status === 413) {
          logServerError(req, 413, 'payload_too_large', err);
          return res.status(413).json({
            error: 'Request payload exceeds the maximum allowed size.',
            code: 'payload_too_large',
            requestId,
          });
        }
        if (errObj?.type === 'entity.parse.failed') {
          logServerError(req, 400, 'invalid_json', err);
          return res.status(400).json({
            error: 'Request body must be valid JSON.',
            code: 'invalid_json',
            requestId,
          });
        }
        logServerError(req, 500, 'internal_error', err);
        return res.status(500).json({
          error: 'An unexpected internal error occurred.',
          code: 'internal_error',
          requestId,
        });
      }
      return next(err);
    },
  );

  return app;
}
