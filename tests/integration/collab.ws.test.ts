// @vitest-environment node
import crypto from 'crypto';
import http from 'http';
import { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { attachCollabWebSocket, CollabHubController } from '../../server/collabHub';
import { verifyFirebaseIdToken } from '../../server/firebaseAuth';
import { FixedWindowRateLimiter } from '../../server/rateLimit';

const TEST_PROJECT_ID = 'gen-lang-client-0202913361';
const TEST_KID = 'ws-test-key-1';
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

function mintToken(uid: string, name: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(
    JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: TEST_KID }),
  );
  const payload = toBase64Url(
    JSON.stringify({
      iss: `https://securetoken.google.com/${TEST_PROJECT_ID}`,
      aud: TEST_PROJECT_ID,
      auth_time: now - 10,
      user_id: uid,
      sub: uid,
      iat: now - 10,
      exp: now + 3600,
      email: `${uid}@example.com`,
      email_verified: true,
      name,
    }),
  );
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  signer.end();
  return `${header}.${payload}.${toBase64Url(signer.sign(privateKey))}`;
}

interface Packet {
  type: string;
  collabId?: string;
  clientId?: string;
  participants?: Array<{ clientId: string; displayName: string; role?: string }>;
  displayName?: string;
  summary?: string;
  updatedAtMs?: number;
  code?: string;
  error?: string;
}

const MEMBERSHIP_TABLE: Record<
  string,
  Record<string, { authorized: true; role: 'owner' | 'editor'; displayName: string }>
> = {
  room_alpha: {
    'uid-alice': { authorized: true, role: 'owner', displayName: 'Verified Alice' },
    'uid-bob': { authorized: true, role: 'editor', displayName: 'Verified Bob' },
  },
  room_beta: {
    'uid-charlie': { authorized: true, role: 'owner', displayName: 'Verified Charlie' },
  },
};

function connectSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function nextMessage(
  ws: WebSocket,
  predicate: (pkt: Packet) => boolean,
  timeoutMs = 3000,
): Promise<Packet> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMsg);
      reject(new Error('Timed out waiting for WebSocket message'));
    }, timeoutMs);

    const onMsg = (raw: unknown) => {
      const parsed = JSON.parse(String(raw)) as Packet;
      if (predicate(parsed)) {
        clearTimeout(timer);
        ws.off('message', onMsg);
        resolve(parsed);
      }
    };
    ws.on('message', onMsg);
  });
}

function waitForClose(ws: WebSocket, timeoutMs = 3000): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timed out waiting for WebSocket close'));
    }, timeoutMs);
    ws.once('close', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

describe('collaboration WebSocket hub integration', () => {
  let server: http.Server;
  let hub: CollabHubController;
  let wsUrl = '';

  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      res.statusCode = 404;
      res.end();
    });
    hub = attachCollabWebSocket(server, {
      maxPayloadBytes: 4096,
      messageRateLimiter: new FixedWindowRateLimiter(3, 10_000),
      verifyToken: (token) =>
        verifyFirebaseIdToken(token, {
          projectId: TEST_PROJECT_ID,
          getPublicCerts: async () => ({ [TEST_KID]: publicKey }),
        }),
      verifyMembership: async ({ collabId, user }) =>
        MEMBERSHIP_TABLE[collabId]?.[user.uid] ?? null,
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    wsUrl = `ws://127.0.0.1:${addr.port}/ws/collab`;
  });

  afterAll(async () => {
    await hub.closeAll();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('rejects unauthenticated clients, invalid tokens, and authenticated non-members from joining rooms', async () => {
    // 1. Missing token
    const noAuthWs = await connectSocket(wsUrl);
    const noAuthErr = nextMessage(noAuthWs, (p) => p.type === 'room:error');
    const noAuthClose = waitForClose(noAuthWs);
    noAuthWs.send(
      JSON.stringify({
        type: 'join',
        collabId: 'room_alpha',
        clientId: 'spoofed-id',
        displayName: 'Fake Alice',
      }),
    );
    expect((await noAuthErr).code).toBe('unauthorized');
    expect(await noAuthClose).toBe(4401);
    expect(hub.getRoomParticipants('room_alpha')).toHaveLength(0);

    // 2. Invalid/forged token
    const badTokenWs = await connectSocket(wsUrl);
    const badTokenErr = nextMessage(badTokenWs, (p) => p.type === 'room:error');
    const badTokenClose = waitForClose(badTokenWs);
    badTokenWs.send(
      JSON.stringify({
        type: 'join',
        collabId: 'room_alpha',
        idToken: 'forged.token.value',
      }),
    );
    expect((await badTokenErr).code).toBe('unauthorized');
    expect(await badTokenClose).toBe(4401);

    // 3. Authenticated user who is NOT a member of room_alpha
    const intruderToken = mintToken('uid-intruder', 'Intruder');
    const intruderWs = await connectSocket(wsUrl);
    const forbiddenErr = nextMessage(intruderWs, (p) => p.type === 'room:error');
    const forbiddenClose = waitForClose(intruderWs);
    intruderWs.send(
      JSON.stringify({
        type: 'join',
        collabId: 'room_alpha',
        idToken: intruderToken,
        clientId: 'uid-alice', // attempt impersonation
        displayName: 'Verified Alice',
      }),
    );
    expect((await forbiddenErr).code).toBe('forbidden');
    expect(await forbiddenClose).toBe(4403);
    expect(hub.getRoomParticipants('room_alpha')).toHaveLength(0);
  });

  it('derives authoritative participant identity/displayName, isolates rooms, and enforces payload/rate limits', async () => {
    const aliceToken = mintToken('uid-alice', 'JWT Alice');
    const bobToken = mintToken('uid-bob', 'JWT Bob');
    const charlieToken = mintToken('uid-charlie', 'JWT Charlie');

    const c1 = await connectSocket(wsUrl);
    const c2 = await connectSocket(wsUrl);
    const c3 = await connectSocket(wsUrl);

    try {
      // Alice tries passing spoofed clientId & displayName -> server must override with verified values
      const c1Joined = nextMessage(
        c1,
        (p) => p.type === 'room:presence' && (p.participants?.length ?? 0) === 1,
      );
      c1.send(
        JSON.stringify({
          type: 'join',
          collabId: 'room_alpha',
          idToken: aliceToken,
          clientId: 'spoofed-owner',
          displayName: 'Impersonator Name',
        }),
      );
      const firstPresence = await c1Joined;
      expect(firstPresence.participants?.[0]).toMatchObject({
        clientId: 'uid-alice',
        displayName: 'Verified Alice',
        role: 'owner',
      });

      const bothPresentOnC1 = nextMessage(
        c1,
        (p) => p.type === 'room:presence' && (p.participants?.length ?? 0) === 2,
      );
      const bothPresentOnC2 = nextMessage(
        c2,
        (p) => p.type === 'room:presence' && (p.participants?.length ?? 0) === 2,
      );
      c2.send(
        JSON.stringify({
          type: 'join',
          collabId: 'room_alpha',
          idToken: bobToken,
        }),
      );

      const [p1, p2] = await Promise.all([bothPresentOnC1, bothPresentOnC2]);
      expect(p1.participants?.map((u) => u.displayName).sort()).toEqual([
        'Verified Alice',
        'Verified Bob',
      ]);
      expect(p2.participants?.map((u) => u.clientId).sort()).toEqual([
        'uid-alice',
        'uid-bob',
      ]);

      // Separate room stays isolated
      const c3Joined = nextMessage(
        c3,
        (p) => p.type === 'room:presence' && p.collabId === 'room_beta',
      );
      c3.send(
        JSON.stringify({
          type: 'join',
          collabId: 'room_beta',
          idToken: charlieToken,
        }),
      );
      const p3 = await c3Joined;
      expect(p3.participants).toHaveLength(1);
      expect(hub.getRoomParticipants('room_alpha')).toHaveLength(2);
      expect(hub.getRoomParticipants('room_beta')).toHaveLength(1);

      let c3SawAlphaActivity = false;
      c3.on('message', (raw) => {
        const pkt = JSON.parse(String(raw)) as Packet;
        if (pkt.type === 'room:activity' && pkt.collabId === 'room_alpha') {
          c3SawAlphaActivity = true;
        }
      });

      const c2SawActivity = nextMessage(c2, (p) => p.type === 'room:activity');
      c1.send(
        JSON.stringify({
          type: 'room:activity',
          summary: 'Added Scene 04',
        }),
      );
      const activity = await c2SawActivity;
      expect(activity.clientId).toBe('uid-alice');
      expect(activity.displayName).toBe('Verified Alice');
      expect(activity.summary).toBe('Added Scene 04');

      await new Promise((r) => setTimeout(r, 60));
      expect(c3SawAlphaActivity).toBe(false);

      // Rate limit check on room_alpha (limit = 3 per 10s, Alice already sent 1)
      c1.send(JSON.stringify({ type: 'room:activity', summary: 'Msg 2' }));
      c1.send(JSON.stringify({ type: 'room:activity', summary: 'Msg 3' }));
      const rateErr = nextMessage(c1, (p) => p.type === 'room:error');
      const rateClose = waitForClose(c1);
      c1.send(JSON.stringify({ type: 'room:activity', summary: 'Msg 4 (over limit)' }));
      expect((await rateErr).code).toBe('rate_limited');
      expect(await rateClose).toBe(4429);

      // Oversized payload test on c3 (> maxPayloadBytes = 4096)
      const oversizeClose = waitForClose(c3);
      c3.send(
        JSON.stringify({
          type: 'room:activity',
          summary: 'x'.repeat(6000),
        }),
      );
      await oversizeClose;
    } finally {
      c1.terminate();
      c2.terminate();
      c3.terminate();
    }
  });
});
