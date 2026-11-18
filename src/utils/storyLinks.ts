export interface RouteLinkState {
  shareId: string | null;
  collabId: string | null;
  storyId: string | null;
}

export function buildShareUrl(origin: string, shareId: string): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  return `${cleanOrigin}/?share=${encodeURIComponent(shareId.trim())}`;
}

export function buildCollabUrl(origin: string, collabId: string): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  return `${cleanOrigin}/?collab=${encodeURIComponent(collabId.trim())}`;
}

export function buildPublicStoryUrl(origin: string, storyId: string): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  return `${cleanOrigin}/?story=${encodeURIComponent(storyId.trim())}`;
}

export function parseRouteLinks(search: string): RouteLinkState {
  try {
    const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
    const shareRaw = params.get('share')?.trim() || '';
    const collabRaw = params.get('collab')?.trim() || '';
    const storyRaw = params.get('story')?.trim() || '';
    return {
      shareId: shareRaw || null,
      collabId: collabRaw || null,
      storyId: storyRaw || null,
    };
  } catch {
    return { shareId: null, collabId: null, storyId: null };
  }
}
