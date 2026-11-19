import { describe, expect, it } from 'vitest';
import {
  buildCollabUrl,
  buildShareUrl,
  parseRouteLinks,
} from '../../src/utils/storyLinks';

describe('storyLinks utilities', () => {
  it('builds canonical share and collaboration URLs without duplicate slashes', () => {
    expect(buildShareUrl('https://studio.example.com/', ' share-abc ')).toBe(
      'https://studio.example.com/?share=share-abc',
    );
    expect(buildCollabUrl('https://studio.example.com///', 'collab-xyz')).toBe(
      'https://studio.example.com/?collab=collab-xyz',
    );
  });

  it('encodes special characters safely in share and collab URLs', () => {
    expect(buildCollabUrl('https://app.test', 'room 1+2')).toBe(
      'https://app.test/?collab=room%201%2B2',
    );
  });

  it('parses shareId, collabId, and storyId from query strings reliably', () => {
    expect(parseRouteLinks('?share=s123')).toEqual({
      shareId: 's123',
      collabId: null,
      storyId: null,
    });
    expect(parseRouteLinks('collab=c456')).toEqual({
      shareId: null,
      collabId: 'c456',
      storyId: null,
    });
    expect(parseRouteLinks('?story=pub-hp-1')).toEqual({
      shareId: null,
      collabId: null,
      storyId: 'pub-hp-1',
    });
    expect(parseRouteLinks('?share=  &collab=room-9')).toEqual({
      shareId: null,
      collabId: 'room-9',
      storyId: null,
    });
    expect(parseRouteLinks('')).toEqual({
      shareId: null,
      collabId: null,
      storyId: null,
    });
  });
});
