import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';

export interface CollabRoomParticipant {
  clientId: string;
  displayName: string;
  joinedAt: number;
}

interface ConnectedSocket {
  ws: WebSocket;
  collabId: string;
  clientId: string;
  displayName: string;
  joinedAt: number;
}

export interface CollabHubController {
  wss: WebSocketServer;
  getRoomParticipants: (collabId: string) => CollabRoomParticipant[];
  closeAll: () => Promise<void>;
}

const VALID_ROOM_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

export function attachCollabWebSocket(
  httpServer: http.Server,
): CollabHubController {
  const wss = new WebSocketServer({ noServer: true });
  const rooms = new Map<string, Map<WebSocket, ConnectedSocket>>();

  const getRoomParticipants = (collabId: string): CollabRoomParticipant[] => {
    const room = rooms.get(collabId);
    if (!room) return [];
    const uniqueByClient = new Map<string, CollabRoomParticipant>();
    for (const entry of room.values()) {
      if (!uniqueByClient.has(entry.clientId)) {
        uniqueByClient.set(entry.clientId, {
          clientId: entry.clientId,
          displayName: entry.displayName,
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
    socket: import('stream').Duplex,
    head: Buffer,
  ) => {
    try {
      const reqUrl = new URL(request.url || '/', 'http://localhost');
      if (reqUrl.pathname !== '/ws/collab') {
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

  wss.on('connection', (ws) => {
    let activeConn: ConnectedSocket | null = null;

    ws.on('message', (rawData) => {
      try {
        const msg = JSON.parse(String(rawData)) as Record<string, unknown>;
        const msgType = typeof msg.type === 'string' ? msg.type : '';

        if (msgType === 'join') {
          const collabId =
            typeof msg.collabId === 'string' ? msg.collabId.trim() : '';
          const clientId =
            typeof msg.clientId === 'string' ? msg.clientId.trim().slice(0, 128) : '';
          const displayName =
            typeof msg.displayName === 'string' && msg.displayName.trim()
              ? msg.displayName.trim().slice(0, 120)
              : 'Collaborator';

          if (!VALID_ROOM_ID_RE.test(collabId) || !clientId) {
            return;
          }

          if (activeConn && activeConn.collabId !== collabId) {
            activeConn = leaveRoom(ws, activeConn);
          }

          if (!rooms.has(collabId)) {
            rooms.set(collabId, new Map());
          }
          const room = rooms.get(collabId)!;
          activeConn = {
            ws,
            collabId,
            clientId,
            displayName,
            joinedAt: Date.now(),
          };
          room.set(ws, activeConn);

          broadcastToRoom(collabId, {
            type: 'room:presence',
            collabId,
            participants: getRoomParticipants(collabId),
          });
          return;
        }

        if (!activeConn) return;

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
          broadcastToRoom(
            activeConn.collabId,
            {
              type: 'room:sync',
              collabId: activeConn.collabId,
              clientId: activeConn.clientId,
              displayName: activeConn.displayName,
              updatedAtMs:
                typeof msg.updatedAtMs === 'number' ? msg.updatedAtMs : Date.now(),
            },
            ws,
          );
        }
      } catch {
        // Ignore malformed WebSocket messages
      }
    });

    ws.on('close', () => {
      activeConn = leaveRoom(ws, activeConn);
    });

    ws.on('error', () => {
      activeConn = leaveRoom(ws, activeConn);
    });
  });

  const closeAll = () =>
    new Promise<void>((resolve) => {
      httpServer.off('upgrade', onUpgrade);
      for (const client of wss.clients) {
        client.terminate();
      }
      rooms.clear();
      wss.close(() => resolve());
    });

  return { wss, getRoomParticipants, closeAll };
}
