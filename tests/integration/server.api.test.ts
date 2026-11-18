// @vitest-environment node
import http from 'http';
import { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../../server/apiApp';

describe('server Express API integration', () => {
  let server: http.Server;
  let baseUrl = '';

  beforeAll(async () => {
    const app = createApiApp();
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

  it('serves GET /api/health with 200 ok', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data).toEqual({ ok: true });
  });

  it('serves GET /api/config and GET /api/models without exposing secret keys', async () => {
    const configRes = await fetch(`${baseUrl}/api/config`);
    expect(configRes.status).toBe(200);
    const configRaw = await configRes.text();
    const config = JSON.parse(configRaw) as {
      hasServerApiKey: boolean;
      availableModels: string[];
      models: Array<{ id: string; label: string }>;
    };

    expect(typeof config.hasServerApiKey).toBe('boolean');
    expect(Array.isArray(config.availableModels)).toBe(true);
    expect(config.availableModels.length).toBeGreaterThan(0);
    expect(configRaw).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);

    const modelsRes = await fetch(`${baseUrl}/api/models`);
    expect(modelsRes.status).toBe(200);
    const modelsData = (await modelsRes.json()) as {
      models: Array<{ id: string }>;
    };
    expect(modelsData.models.length).toBeGreaterThan(0);
  });

  it('validates required fields and returns 400 JSON errors on incomplete POST payloads', async () => {
    const deduceRes = await fetch(`${baseUrl}/api/story/deduce-universe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ universe: 'Clockwork' }),
    });
    expect(deduceRes.status).toBe(400);
    expect(((await deduceRes.json()) as { error: string }).error).toMatch(
      /required/i,
    );

    const advanceRes = await fetch(`${baseUrl}/api/story/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(advanceRes.status).toBe(400);

    const ttsRes = await fetch(`${baseUrl}/api/story/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voice: 'Charon' }),
    });
    expect(ttsRes.status).toBe(400);
  });

  it('returns structured 404 JSON for unknown /api routes', async () => {
    const res = await fetch(`${baseUrl}/api/non-existent-endpoint`);
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/not found/i);
  });
});
