// @vitest-environment node
import crypto from 'crypto';
import http from 'http';
import { AddressInfo } from 'net';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../../server/apiApp';
import { verifyFirebaseIdToken } from '../../server/firebaseAuth';
import { ConcurrencyLimiter, FixedWindowRateLimiter } from '../../server/rateLimit';

const TEST_PROJECT_ID = 'gen-lang-client-0202913361';
const TEST_KID = 'test-key-1';
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function toBase64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function mintTestFirebaseIdToken(opts: {
  uid: string;
  email?: string;
  name?: string;
  expOffsetSec?: number;
  aud?: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(
    JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: TEST_KID }),
  );
  const payload = toBase64Url(
    JSON.stringify({
      iss: `https://securetoken.google.com/${TEST_PROJECT_ID}`,
      aud: opts.aud ?? TEST_PROJECT_ID,
      auth_time: now - 30,
      user_id: opts.uid,
      sub: opts.uid,
      iat: now - 10,
      exp: now + (opts.expOffsetSec ?? 3600),
      email: opts.email ?? `${opts.uid}@example.com`,
      email_verified: true,
      name: opts.name ?? 'Test Author',
    }),
  );
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  signer.end();
  const signature = toBase64Url(signer.sign(privateKey));
  return `${header}.${payload}.${signature}`;
}

async function startTempServer(app: ReturnType<typeof createApiApp>) {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

describe('server Express API integration', () => {
  let server: http.Server;
  let baseUrl = '';
  let validToken = '';
  const serverLogs: Array<Record<string, unknown>> = [];

  beforeAll(async () => {
    validToken = mintTestFirebaseIdToken({ uid: 'user-author-1' });
    const app = createApiApp({
      verifyToken: (token) =>
        verifyFirebaseIdToken(token, {
          projectId: TEST_PROJECT_ID,
          getPublicCerts: async () => ({ [TEST_KID]: publicKey }),
        }),
      logger: (entry) => {
        serverLogs.push(entry);
      },
      handlers: {
        deduceUniverseAndCast: async (input) => ({
          title: input.title || 'Sample Story',
          universe: input.universe,
          setting: input.setting,
          tone: input.tone,
          premise: input.premise,
          protagonistId: 'char-1',
          turns: [],
          characters: [],
          crossIndex: [],
        }),
      },
    });
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('serves GET /api/health, /api/config, and /api/models without exposing secret keys', async () => {
    const healthRes = await fetch(`${baseUrl}/api/health`);
    expect(healthRes.status).toBe(200);
    expect(await healthRes.json()).toEqual({ ok: true });

    const configRes = await fetch(`${baseUrl}/api/config`);
    expect(configRes.status).toBe(200);
    const configRaw = await configRes.text();
    const config = JSON.parse(configRaw) as {
      hasServerApiKey: boolean;
      availableModels: string[];
    };
    expect(typeof config.hasServerApiKey).toBe('boolean');
    expect(config.availableModels.length).toBeGreaterThan(0);
    expect(configRaw).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);

    const modelsRes = await fetch(`${baseUrl}/api/models`);
    expect(modelsRes.status).toBe(200);
  });

  it('allows anonymous authors on /api/story/* routes while still rejecting invalid or expired Bearer tokens', async () => {
    const anonDeduce = await fetch(`${baseUrl}/api/story/deduce-universe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Anonymous Chronicle',
        universe: 'Original Fantasy',
        setting: 'Cloudspire',
        premise: 'An unnamed chronicler lights the beacon.',
      }),
    });
    expect(anonDeduce.status).toBe(200);
    const anonPayload = (await anonDeduce.json()) as { snapshot: { title: string } };
    expect(anonPayload.snapshot.title).toBe('Anonymous Chronicle');

    const mdBase64 = Buffer.from(
      '# Guest Draft\n\n## Chapter 1\n\nFog rolled over the quay.',
      'utf8',
    ).toString('base64');
    const anonImport = await fetch(`${baseUrl}/api/story/import-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'guest-draft.md',
        contentBase64: mdBase64,
        enrichWithAi: false,
      }),
    });
    expect(anonImport.status).toBe(200);

    const expiredToken = mintTestFirebaseIdToken({
      uid: 'user-author-1',
      expOffsetSec: -120,
    });
    const expiredRes = await fetch(`${baseUrl}/api/story/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${expiredToken}`,
      },
      body: JSON.stringify({ text: 'Hello' }),
    });
    expect(expiredRes.status).toBe(401);
    expect(((await expiredRes.json()) as { code: string }).code).toBe('token_expired');

    const badTokenRes = await fetch(`${baseUrl}/api/story/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer not.a.valid.jwt',
      },
      body: JSON.stringify({ text: 'Hello' }),
    });
    expect(badTokenRes.status).toBe(401);
  });

  it('validates route schemas, field bounds, voices, and oversized payloads cleanly', async () => {
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${validToken}`,
    };

    const deduceMissing = await fetch(`${baseUrl}/api/story/deduce-universe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ universe: 'Clockwork' }),
    });
    expect(deduceMissing.status).toBe(400);

    const badVoice = await fetch(`${baseUrl}/api/story/tts`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ text: 'Read this line.', voiceName: 'HackerVoice' }),
    });
    expect(badVoice.status).toBe(400);

    const badMime = await fetch(`${baseUrl}/api/story/transcribe`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ audioBase64: 'SGVsbG8=', mimeType: 'text/html' }),
    });
    expect(badMime.status).toBe(400);

    const hugeUniverseRes = await fetch(`${baseUrl}/api/story/deduce-universe`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        universe: 'U',
        setting: 'S',
        premise: 'x'.repeat(600_000),
      }),
    });
    expect(hugeUniverseRes.status).toBe(413);
    expect(((await hugeUniverseRes.json()) as { code: string }).code).toBe('payload_too_large');

    const deduceOk = await fetch(`${baseUrl}/api/story/deduce-universe`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'Harbor Light',
        universe: 'Clockwork',
        setting: 'Pier 4',
        premise: 'A missing chronometer.',
      }),
    });
    expect(deduceOk.status).toBe(200);
  });

  it('imports .md and .docx files without requiring login and rejects bad formats or SSRF URLs', async () => {
    const authHeaders = {
      'Content-Type': 'application/json',
    };
    const mdBase64 = Buffer.from(
      '# Iron Lantern\n\n## Chapter 1: Arrival\n\nRain hammered the iron roof.',
      'utf8',
    ).toString('base64');

    const mdRes = await fetch(`${baseUrl}/api/story/import-file`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        filename: 'iron-lantern.md',
        contentBase64: mdBase64,
        enrichWithAi: false,
      }),
    });
    expect(mdRes.status).toBe(200);
    const mdPayload = (await mdRes.json()) as {
      project: { title: string; turns: Array<{ prose: string[] }>; isPrivate: boolean };
      stats: { format: string };
    };
    expect(mdPayload.stats.format).toBe('md');
    expect(mdPayload.project.title).toBe('Iron Lantern');
    expect(mdPayload.project.isPrivate).toBe(true);

    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello from Word.</w:t></w:r></w:p></w:body></w:document>`,
    );
    const docxBase64 = (await zip.generateAsync({ type: 'nodebuffer' })).toString('base64');

    const docxRes = await fetch(`${baseUrl}/api/story/import-file`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        filename: 'draft.docx',
        contentBase64: docxBase64,
        enrichWithAi: false,
      }),
    });
    expect(docxRes.status).toBe(200);

    const badExtRes = await fetch(`${baseUrl}/api/story/import-file`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        filename: 'archive.exe',
        contentBase64: mdBase64,
      }),
    });
    expect(badExtRes.status).toBe(400);

    const ssrfRes = await fetch(`${baseUrl}/api/story/import-url`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        url: 'http://127.0.0.1:3000/api/health',
      }),
    });
    expect(ssrfRes.status).toBe(400);
  });

  it('enforces per-user rate limits and concurrency limits with 429 + Retry-After', async () => {
    let releaseSlowCall!: () => void;
    const slowGate = new Promise<void>((resolve) => {
      releaseSlowCall = resolve;
    });

    const app = createApiApp({
      verifyToken: (token) =>
        verifyFirebaseIdToken(token, {
          projectId: TEST_PROJECT_ID,
          getPublicCerts: async () => ({ [TEST_KID]: publicKey }),
        }),
      standardRateLimiter: new FixedWindowRateLimiter(3, 60_000),
      concurrencyLimiter: new ConcurrencyLimiter(1),
      handlers: {
        deduceUniverseAndCast: async (input) => {
          await slowGate;
          return {
            title: input.title || 'Slow Story',
            universe: input.universe,
            setting: input.setting,
            tone: input.tone,
            premise: input.premise,
            protagonistId: 'char-1',
            turns: [],
            characters: [],
            crossIndex: [],
          };
        },
      },
    });

    const temp = await startTempServer(app);
    try {
      const token = mintTestFirebaseIdToken({ uid: 'rate-user-1' });
      const reqInit = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          universe: 'Arcadia',
          setting: 'Observatory',
          premise: 'A comet approaches.',
        }),
      };

      // Concurrent 2nd request triggers concurrency limit (429) while 1st is in flight
      const p1 = fetch(`${temp.baseUrl}/api/story/deduce-universe`, reqInit);
      await new Promise((r) => setTimeout(r, 40));
      const concurrentRes = await fetch(`${temp.baseUrl}/api/story/deduce-universe`, reqInit);
      expect(concurrentRes.status).toBe(429);
      expect(concurrentRes.headers.get('retry-after')).toBeTruthy();
      expect(((await concurrentRes.json()) as { code: string }).code).toBe(
        'concurrency_limited',
      );

      releaseSlowCall();
      expect((await p1).status).toBe(200);

      // Next request consumes 3rd window slot; 4th triggers rate limit (429)
      const thirdRes = await fetch(`${temp.baseUrl}/api/story/deduce-universe`, reqInit);
      expect(thirdRes.status).toBe(200);

      const fourthRes = await fetch(`${temp.baseUrl}/api/story/deduce-universe`, reqInit);
      expect(fourthRes.status).toBe(429);
      expect(fourthRes.headers.get('retry-after')).toBeTruthy();
      expect(((await fourthRes.json()) as { code: string }).code).toBe('rate_limited');
    } finally {
      releaseSlowCall();
      await temp.close();
    }
  });

  it('logs detailed server errors with requestId while never leaking stack traces, secrets, or internal diagnostics to clients', async () => {
    const capturedLogs: Array<Record<string, unknown>> = [];
    const syntheticKey = 'AIza' + 'SySyntheticLeakTest9876543210';
    const app = createApiApp({
      verifyToken: (token) =>
        verifyFirebaseIdToken(token, {
          projectId: TEST_PROJECT_ID,
          getPublicCerts: async () => ({ [TEST_KID]: publicKey }),
        }),
      logger: (entry) => capturedLogs.push(entry),
      handlers: {
        auditContinuity: async () => {
          throw new Error(
            `Upstream failure at db-primary.internal:5432 with key ${syntheticKey}`,
          );
        },
        importStoryFromUrl: async () => {
          throw new Error(
            `ENOENT: /var/run/secrets/sa-key.json leaked key ${syntheticKey}`,
          );
        },
      },
    });

    const temp = await startTempServer(app);
    try {
      const token = mintTestFirebaseIdToken({ uid: 'log-user-1' });
      const auditRes = await fetch(`${temp.baseUrl}/api/story/audit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          snapshot: {
            title: 'Test',
            universe: 'U',
            setting: 'S',
            tone: 'T',
            premise: 'P',
            protagonistId: 'c1',
            turns: [{ id: 't1', sceneNumber: 1 }],
            characters: [],
            crossIndex: [],
          },
        }),
      });

      expect(auditRes.status).toBe(500);
      const auditText = await auditRes.text();
      const auditJson = JSON.parse(auditText) as {
        error: string;
        code: string;
        requestId: string;
      };
      expect(auditJson.requestId).toBe(auditRes.headers.get('x-request-id'));
      expect(auditJson.code).toBe('internal_error');
      expect(auditJson.error).toBe('Failed to audit story continuity.');
      expect(auditText).not.toContain('db-primary.internal');
      expect(auditText).not.toContain(syntheticKey);

      const urlErrRes = await fetch(`${temp.baseUrl}/api/story/import-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url: 'https://example.com/story.txt' }),
      });
      expect(urlErrRes.status).toBe(500);
      const urlErrText = await urlErrRes.text();
      expect(urlErrText).not.toContain('/var/run/secrets');
      expect(urlErrText).not.toContain(syntheticKey);

      expect(capturedLogs.length).toBeGreaterThanOrEqual(2);
      expect(String(capturedLogs[0].message)).not.toContain(syntheticKey);
      expect(String(capturedLogs[0].message)).toContain('[REDACTED_API_KEY]');
    } finally {
      await temp.close();
    }
  });

  it('returns structured 404 JSON with requestId for unknown /api routes', async () => {
    const res = await fetch(`${baseUrl}/api/non-existent-endpoint`);
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string; code: string; requestId: string };
    expect(data.error).toMatch(/not found/i);
    expect(data.code).toBe('not_found');
    expect(data.requestId).toBeTruthy();
  });

  it('sets Retry-After, emits TTS quota guidance, and logs 429 throttling at warn level on /api/story/tts', async () => {
    const logs: Array<Record<string, unknown>> = [];
    const { UpstreamQuotaError } = await import('../../server/storyAgent');

    const app = createApiApp({
      logger: (entry) => logs.push(entry),
      handlers: {
        synthesizeNarrativeSpeech: async () => {
          throw new UpstreamQuotaError('RESOURCE_EXHAUSTED 429', 75);
        },
      },
    });

    const temp = await startTempServer(app);
    try {
      const res = await fetch(`${temp.baseUrl}/api/story/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'The silver pendulum swung twice before midnight.',
          voiceName: 'Charon',
        }),
      });

      expect(res.status).toBe(429);
      expect(res.headers.get('retry-after')).toBe('75');
      const json = (await res.json()) as { error: string; code: string; requestId: string };
      expect(json.code).toBe('upstream_rate_limited');
      expect(json.error).toMatch(/Text-to-Speech/i);
      expect(json.requestId).toBeTruthy();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('warn');
      expect(logs[0].stack).toBeUndefined();
    } finally {
      await temp.close();
    }
  });

  it('accepts multi-paragraph premises over 4000 chars on /api/story/advance and rejects abusive >32000 char premises', async () => {
    const app = createApiApp({
      handlers: {
        advanceNarrative: async (snapshot) => ({
          nextTurn: {
            id: 'turn-2',
            turnNumber: 2,
            sceneTitle: 'Scene 2',
            location: 'Harbor',
            inStoryTime: 'Night',
            activeCharacters: [],
            userAction: 'Continue',
            prose: [`Continued from ${snapshot.premise.length}-char premise.`],
            continuityNotes: [],
            continuityWarning: null,
            selectedChoiceId: null,
            timestamp: Date.now(),
            choices: [],
          },
          updatedCharacters: snapshot.characters,
          updatedCrossIndex: snapshot.crossIndex,
        }),
      },
    });

    const temp = await startTempServer(app);
    try {
      const richPremise = 'Chronicle detail. '.repeat(350).trim(); // ~6300 chars (> 4000, < 32000)
      expect(richPremise.length).toBeGreaterThan(4000);

      const okRes = await fetch(`${temp.baseUrl}/api/story/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshot: {
            title: 'Rich Premise Chronicle',
            universe: 'Original Fiction',
            setting: 'Cloudspire',
            tone: 'Literary Fiction',
            premise: richPremise,
            protagonistId: 'c1',
            turns: [{ id: 't1', turnNumber: 1 }],
            characters: [],
            crossIndex: [],
          },
          userAction: 'Step onto the pier.',
        }),
      });
      expect(okRes.status).toBe(200);

      const tooHugeRes = await fetch(`${temp.baseUrl}/api/story/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshot: {
            title: 'Oversized Premise',
            universe: 'Original Fiction',
            setting: 'Cloudspire',
            tone: 'Literary Fiction',
            premise: 'a'.repeat(32_500),
            protagonistId: 'c1',
            turns: [{ id: 't1', turnNumber: 1 }],
            characters: [],
            crossIndex: [],
          },
          userAction: 'Step onto the pier.',
        }),
      });
      expect(tooHugeRes.status).toBe(400);
      expect(((await tooHugeRes.json()) as { error: string }).error).toMatch(/32000/);
    } finally {
      await temp.close();
    }
  });
});
