import http from 'http';
import type { Duplex } from 'stream';
import { WebSocket, WebSocketServer } from 'ws';
import {
  extractBearerToken,
  verifyCollabRoomMembership,
  verifyFirebaseIdToken,
} from './firebaseAuth.ts';
import type {
  CollabMembershipResult,
  VerifiedFirebaseUser,
} from './firebaseAuth.ts';
import { FixedWindowRateLimiter } from './rateLimit.ts';

export interface CollabRoomParticipant {
  clientId: string;
  displayName: string;
  role?: 'owner' | 'editor';
  joinedAt: number;
}

interface ConnectedSocket {
  ws: WebSocket;
  collabId: string;
  clientId: string;
  displayName: string;
  role: 'owner' | 'editor';
  joinedAt: number;
}

export interface CollabHubController {
  wss: WebSocketServer;
  getRoomParticipants: (collabId: string) => CollabRoomParticipant[];
  closeAll: () => Promise<void>;
}

export interface CollabHubOptions {
  verifyToken?: (token: string) => Promise<VerifiedFirebaseUser>;
  verifyMembership?: (params: {
    collabId: string;
    user: VerifiedFirebaseUser;
    idToken: string;
  }) => Promise<CollabMembershipResult | null>;
  maxPayloadBytes?: number;
  maxConnections?: number;
  maxConnectionsPerIp?: number;
  maxRoomConnections?: number;
  joinTimeoutMs?: number;
  joinRateLimiter?: FixedWindowRateLimiter;
  messageRateLimiter?: FixedWindowRateLimiter;
}

const VALID_ROOM_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
const DEFAULT_MAX_PAYLOAD_BYTES = 64 * 1024;
const DEFAULT_MAX_CONNECTIONS = 500;
const DEFAULT_MAX_CONNECTIONS_PER_IP = 20;
const DEFAULT_MAX_ROOM_CONNECTIONS = 50;
const DEFAULT_JOIN_TIMEOUT_MS = 10_000;

function getUpgradeClientIp(request: http.IncomingMessage): string {
  const fwd = request.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  return request.socket?.remoteAddress || 'unknown';
}

function sendErrorAndClose(
  ws: WebSocket,
  closeCode: number,
  code: string,
  error: string,
): void {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'room:error', code, error }));
    }
  } catch {
    // Ignore socket send errors on closing
  }
  try {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close(closeCode, error.slice(0, 120));
    }
  } catch {
    ws.terminate();
  }
}

export function attachCollabWebSocket(
  httpServer: http.Server,
  options: CollabHubOptions = {},
): CollabHubController {
  const maxPayloadBytes = options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
  const maxConnections = options.maxConnections ?? DEFAULT_MAX_CONNECTIONS;
  const maxConnectionsPerIp =
    options.maxConnectionsPerIp ?? DEFAULT_MAX_CONNECTIONS_PER_IP;
  const maxRoomConnections =
    options.maxRoomConnections ?? DEFAULT_MAX_ROOM_CONNECTIONS;
  const joinTimeoutMs = options.joinTimeoutMs ?? DEFAULT_JOIN_TIMEOUT_MS;

  const verifyToken = options.verifyToken ?? verifyFirebaseIdToken;
  const verifyMembership =
    options.verifyMembership ??
    ((params) =>
      verifyCollabRoomMembership({
        collabId: params.collabId,
        user: params.user,
        idToken: params.idToken,
      }));

  const joinRateLimiter =
    options.joinRateLimiter ?? new FixedWindowRateLimiter(12, 60_000);
  const messageRateLimiter =
    options.messageRateLimiter ?? new FixedWindowRateLimiter(60, 10_000);

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: maxPayloadBytes,
  });

  const rooms = new Map<string, Map<WebSocket, ConnectedSocket>>();
  const connectionsByIp = new Map<string, number>();

  const getRoomParticipants = (collabId: string): CollabRoomParticipant[] => {
    const room = rooms.get(collabId);
    if (!room) return [];
    const uniqueByClient = new Map<string, CollabRoomParticipant>();
    for (const entry of room.values()) {
      if (!uniqueByClient.has(entry.clientId)) {
        uniqueByClient.set(entry.clientId, {
          clientId: entry.clientId,
          displayName: entry.displayName,
          role: entry.role,
          joinedAt: entry.joinedAt,
        });
      }
    }
    return Array.from(uniqueByClient.values());
  };

  const broadcastToRoom = (
    collabId: string,
    payload: Record<string, unknown>,
    excludeWs?: WebSocket,
  ) => {
    const room = rooms.get(collabId);
    if (!room) return;
    const encoded = JSON.stringify(payload);
    for (const [sock] of room.entries()) {
      if (excludeWs && sock === excludeWs) continue;
      if (sock.readyState === WebSocket.OPEN) {
        sock.send(encoded);
      }
    }
  };

  const leaveRoom = (ws: WebSocket, current: ConnectedSocket | null) => {
    if (!current) return null;
    const room = rooms.get(current.collabId);
    if (room) {
      room.delete(ws);
      if (room.size === 0) {
        rooms.delete(current.collabId);
      } else {
        broadcastToRoom(current.collabId, {
          type: 'room:presence',
          collabId: current.collabId,
          participants: getRoomParticipants(current.collabId),
        });
      }
    }
    return null;
  };

  const onUpgrade = (
    request: http.IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => {
    try {
      const reqUrl = new URL(request.url || '/', 'http://localhost');
      if (reqUrl.pathname !== '/ws/collab') {
        return;
      }

      if (wss.clients.size >= maxConnections) {
        socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }

      const clientIp = getUpgradeClientIp(request);
      const currentForIp = connectionsByIp.get(clientIp) ?? 0;
      if (currentForIp >= maxConnectionsPerIp) {
        socket.write('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } catch {
      socket.destroy();
    }
  };

  httpServer.on('upgrade', onUpgrade);

  wss.on('connection', (ws, request) => {
    const clientIp = getUpgradeClientIp(request);
    connectionsByIp.set(clientIp, (connectionsByIp.get(clientIp) ?? 0) + 1);
    const headerToken = extractBearerToken(request.headers.authorization);

    let activeConn: ConnectedSocket | null = null;
    let joinInProgress = false;
    let closed = false;

    const releaseIpCount = () => {
      if (closed) return;
      closed = true;
      const latest = connectionsByIp.get(clientIp) ?? 1;
      if (latest <= 1) {
        connectionsByIp.delete(clientIp);
      } else {
        connectionsByIp.set(clientIp, latest - 1);
      }
    };

    const unauthTimer = setTimeout(() => {
      if (!activeConn && !closed) {
        sendErrorAndClose(
          ws,
          4401,
          'unauthorized',
          'Authentication required to join collaboration room.',
        );
      }
    }, joinTimeoutMs);
    unauthTimer.unref?.();

    const handleMessage = async (rawData: unknown) => {
      if (closed) return;

      const rawText = String(rawData);
      if (Buffer.byteLength(rawText, 'utf8') > maxPayloadBytes) {
        sendErrorAndClose(
          ws,
          1009,
          'payload_too_large',
          'WebSocket message exceeds size limit.',
        );
        return;
      }

      let msg: Record<string, unknown>;
      try {
        const parsed = JSON.parse(rawText);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          return;
        }
        msg = parsed as Record<string, unknown>;
      } catch {
        return;
      }

      const msgType = typeof msg.type === 'string' ? msg.type : '';

      if (msgType === 'join') {
        if (joinInProgress) return;
        const joinDecision = joinRateLimiter.consume(`ws-join:${clientIp}`);
        if (!joinDecision.allowed) {
          sendErrorAndClose(
            ws,
            4429,
            'rate_limited',
            'Too many collaboration join attempts.',
          );
          return;
        }

        const collabId =
          typeof msg.collabId === 'string' ? msg.collabId.trim() : '';
        const suppliedToken =
          typeof msg.idToken === 'string' && msg.idToken.trim()
            ? msg.idToken.trim()
            : headerToken;

        if (!VALID_ROOM_ID_RE.test(collabId)) {
          sendErrorAndClose(
            ws,
            4400,
            'invalid_room',
            'Invalid collaboration room ID.',
          );
          return;
        }

        if (!suppliedToken) {
          sendErrorAndClose(
            ws,
            4401,
            'unauthorized',
            'Firebase authentication token is required.',
          );
          return;
        }

        joinInProgress = true;
        try {
          const verifiedUser = await verifyToken(suppliedToken);
          const membership = await verifyMembership({
            collabId,
            user: verifiedUser,
            idToken: suppliedToken,
          });

          if (!membership || !membership.authorized) {
            sendErrorAndClose(
              ws,
              4403,
              'forbidden',
              'You are not an authorized member of this collaboration room.',
            );
            return;
          }

          if (closed || ws.readyState !== WebSocket.OPEN) {
            return;
          }

          const existingRoom = rooms.get(collabId);
          if (
            existingRoom &&
            existingRoom.size >= maxRoomConnections &&
            !existingRoom.has(ws)
          ) {
            sendErrorAndClose(
              ws,
              4429,
              'room_full',
              'Collaboration room connection limit reached.',
            );
            return;
          }

          if (activeConn && activeConn.collabId !== collabId) {
            activeConn = leaveRoom(ws, activeConn);
          }

          if (!rooms.has(collabId)) {
            rooms.set(collabId, new Map());
          }
          const room = rooms.get(collabId)!;

          // Strictly assign participant identity & displayName from verified data
          const authoritativeDisplayName =
            membership.displayName.trim().slice(0, 120) || 'Collaborator';
          activeConn = {
            ws,
            collabId,
            clientId: verifiedUser.uid,
            displayName: authoritativeDisplayName,
            role: membership.role,
            joinedAt: Date.now(),
          };
          clearTimeout(unauthTimer);
          room.set(ws, activeConn);

          broadcastToRoom(collabId, {
            type: 'room:presence',
            collabId,
            participants: getRoomParticipants(collabId),
          });
        } catch {
          sendErrorAndClose(
            ws,
            4401,
            'unauthorized',
            'Invalid or expired authentication token.',
          );
        } finally {
          joinInProgress = false;
        }
        return;
      }

      if (!activeConn) {
        sendErrorAndClose(
          ws,
          4401,
          'unauthorized',
          'Authenticate and join a room before sending collaboration events.',
        );
        return;
      }

      const rateKey = `ws-msg:${activeConn.clientId}:${activeConn.collabId}`;
      const msgDecision = messageRateLimiter.consume(rateKey);
      if (!msgDecision.allowed) {
        sendErrorAndClose(
          ws,
          4429,
          'rate_limited',
          'Collaboration message rate limit exceeded.',
        );
        return;
      }

      if (msgType === 'room:activity') {
        const summary =
          typeof msg.summary === 'string' ? msg.summary.trim().slice(0, 200) : '';
        if (!summary) return;
        broadcastToRoom(
          activeConn.collabId,
          {
            type: 'room:activity',
            collabId: activeConn.collabId,
            clientId: activeConn.clientId,
            displayName: activeConn.displayName,
            summary,
            timestamp: Date.now(),
          },
          ws,
        );
        return;
      }

      if (msgType === 'room:sync') {
        const updatedAtMs =
          typeof msg.updatedAtMs === 'number' && Number.isFinite(msg.updatedAtMs)
            ? msg.updatedAtMs
            : Date.now();
        broadcastToRoom(
          activeConn.collabId,
          {
            type: 'room:sync',
            collabId: activeConn.collabId,
            clientId: activeConn.clientId,
            displayName: activeConn.displayName,
            updatedAtMs,
          },
          ws,
        );
      }
    };

    ws.on('message', (rawData) => {
      void handleMessage(rawData);
    });

    ws.on('close', () => {
      clearTimeout(unauthTimer);
      activeConn = leaveRoom(ws, activeConn);
      releaseIpCount();
    });

    ws.on('error', () => {
      clearTimeout(unauthTimer);
      activeConn = leaveRoom(ws, activeConn);
      releaseIpCount();
    });
  });

  const closeAll = () =>
    new Promise<void>((resolve) => {
      httpServer.off('upgrade', onUpgrade);
      for (const client of wss.clients) {
        client.terminate();
      }
      rooms.clear();
      connectionsByIp.clear();
      wss.close(() => resolve());
    });

  return { wss, getRoomParticipants, closeAll };
}
