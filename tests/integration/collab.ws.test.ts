// @vitest-environment node
import http from 'http';
import { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { attachCollabWebSocket, CollabHubController } from '../../server/collabHub';

interface Packet {
  type: string;
  collabId?: string;
  participants?: Array<{ clientId: string; displayName: string }>;
  displayName?: string;
  summary?: string;
  updatedAtMs?: number;
}

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

describe('collaboration WebSocket hub integration', () => {
  let server: http.Server;
  let hub: CollabHubController;
  let wsUrl = '';

  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      res.statusCode = 404;
      res.end();
    });
    hub = attachCollabWebSocket(server);
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

  it('broadcasts presence and activity within a room while isolating other rooms', async () => {
    const c1 = await connectSocket(wsUrl);
    const c2 = await connectSocket(wsUrl);
    const c3 = await connectSocket(wsUrl);

    try {
      const c1Joined = nextMessage(
        c1,
        (p) => p.type === 'room:presence' && (p.participants?.length ?? 0) === 1,
      );
      c1.send(
        JSON.stringify({
          type: 'join',
          collabId: 'room_alpha',
          clientId: 'client-1',
          displayName: 'Alice',
        }),
      );
      await c1Joined;

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
          clientId: 'client-2',
          displayName: 'Bob',
        }),
      );

      const [p1, p2] = await Promise.all([bothPresentOnC1, bothPresentOnC2]);
      expect(p1.participants?.map((u) => u.displayName).sort()).toEqual(['Alice', 'Bob']);
      expect(p2.participants?.map((u) => u.displayName).sort()).toEqual(['Alice', 'Bob']);

      // Separate room must stay isolated
      const c3Joined = nextMessage(
        c3,
        (p) => p.type === 'room:presence' && p.collabId === 'room_beta',
      );
      c3.send(
        JSON.stringify({
          type: 'join',
          collabId: 'room_beta',
          clientId: 'client-3',
          displayName: 'Charlie',
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
      expect(activity.displayName).toBe('Alice');
      expect(activity.summary).toBe('Added Scene 04');

      await new Promise((r) => setTimeout(r, 60));
      expect(c3SawAlphaActivity).toBe(false);

      // Disconnect Bob -> Alice receives updated presence with 1 participant
      const c1SeesLeave = nextMessage(
        c1,
        (p) => p.type === 'room:presence' && (p.participants?.length ?? 0) === 1,
      );
      c2.close();
      const leftPresence = await c1SeesLeave;
      expect(leftPresence.participants?.[0]?.displayName).toBe('Alice');
    } finally {
      c1.terminate();
      c2.terminate();
      c3.terminate();
    }
  });
});
