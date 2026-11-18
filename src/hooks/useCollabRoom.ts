import { useCallback, useEffect, useRef, useState } from 'react';
import { CollabParticipant } from '../types/story';

interface UseCollabRoomOptions {
  collabId: string | null;
  clientId: string;
  displayName: string;
  enabled: boolean;
}

export function useCollabRoom({
  collabId,
  clientId,
  displayName,
  enabled,
}: UseCollabRoomOptions) {
  const [participants, setParticipants] = useState<CollabParticipant[]>([]);
  const [lastActivity, setLastActivity] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled || !collabId) {
      setParticipants([]);
      setLastActivity(null);
      setConnected(false);
      return;
    }

    let closed = false;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (closed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/collab`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (closed) {
          ws.close();
          return;
        }
        setConnected(true);
        ws.send(
          JSON.stringify({
            type: 'join',
            collabId,
            clientId,
            displayName,
          }),
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as Record<string, unknown>;
          if (msg.collabId !== collabId) return;

          if (msg.type === 'room:presence' && Array.isArray(msg.participants)) {
            setParticipants(msg.participants as CollabParticipant[]);
          } else if (msg.type === 'room:activity' && typeof msg.summary === 'string') {
            const who =
              typeof msg.displayName === 'string' ? msg.displayName : 'Collaborator';
            setLastActivity(`${who}: ${msg.summary}`);
          }
        } catch {
          // Ignore malformed WS packets
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!closed) {
          reconnectTimer = window.setTimeout(connect, 2500);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [collabId, clientId, displayName, enabled]);

  const sendActivity = useCallback((summary: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'room:activity', summary }));
  }, []);

  return {
    connected,
    participants,
    lastActivity,
    sendActivity,
  };
}
