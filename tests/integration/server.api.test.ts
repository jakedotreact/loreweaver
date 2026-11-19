// @vitest-environment node
import http from 'http';
import { AddressInfo } from 'net';
import JSZip from 'jszip';
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

  it('imports .md and .docx files via POST /api/story/import-file and rejects bad formats or SSRF URLs', async () => {
    const mdBase64 = Buffer.from(
      '# Iron Lantern\n\n## Chapter 1: Arrival\n\nRain hammered the iron roof.',
      'utf8',
    ).toString('base64');

    const mdRes = await fetch(`${baseUrl}/api/story/import-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'iron-lantern.md',
        contentBase64: mdBase64,
        enrichWithAi: false,
      }),
    });
    expect(mdRes.status).toBe(200);
    const mdPayload = (await mdRes.json()) as {
      project: { title: string; turns: Array<{ prose: string[] }>; isPrivate: boolean };
      stats: { format: string; chapterCount: number };
    };
    expect(mdPayload.stats.format).toBe('md');
    expect(mdPayload.project.title).toBe('Iron Lantern');
    expect(mdPayload.project.isPrivate).toBe(true);
    expect(mdPayload.project.turns[0].prose[0]).toBe('Rain hammered the iron roof.');

    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello from Word.</w:t></w:r></w:p></w:body></w:document>`,
    );
    const docxBase64 = (await zip.generateAsync({ type: 'nodebuffer' })).toString('base64');

    const docxRes = await fetch(`${baseUrl}/api/story/import-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'draft.docx',
        contentBase64: docxBase64,
        enrichWithAi: false,
      }),
    });
    expect(docxRes.status).toBe(200);
    const docxPayload = (await docxRes.json()) as {
      project: { turns: Array<{ prose: string[] }> };
      stats: { format: string };
    };
    expect(docxPayload.stats.format).toBe('docx');
    expect(docxPayload.project.turns[0].prose[0]).toBe('Hello from Word.');

    const badExtRes = await fetch(`${baseUrl}/api/story/import-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'archive.exe',
        contentBase64: mdBase64,
      }),
    });
    expect(badExtRes.status).toBe(400);

    const ssrfRes = await fetch(`${baseUrl}/api/story/import-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'http://127.0.0.1:3000/api/health',
      }),
    });
    expect(ssrfRes.status).toBe(400);
  });

  it('returns structured 404 JSON for unknown /api routes', async () => {
    const res = await fetch(`${baseUrl}/api/non-existent-endpoint`);
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/not found/i);
  });
});

