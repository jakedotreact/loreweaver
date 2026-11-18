// @vitest-environment node
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const ROOT_DIR = process.cwd();

describe('Firestore security rules & blueprint contract', () => {
  const rulesText = fs.readFileSync(path.join(ROOT_DIR, 'firestore.rules'), 'utf8');
  const blueprint = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, 'firebase-blueprint.json'), 'utf8'),
  ) as {
    firestore: Record<string, unknown>;
  };

  it('enforces a global default deny-all fallback and verified email authentication', () => {
    expect(rulesText).toMatch(/match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/);
    expect(rulesText).toContain('request.auth.token.email_verified == true');
  });

  it('covers every collection declared in firebase-blueprint.json', () => {
    const paths = Object.keys(blueprint.firestore);
    expect(paths).toContain('/users/{userId}');
    expect(paths).toContain('/users/{userId}/stories/{storyId}');
    expect(paths).toContain('/sharedWorks/{shareId}');
    expect(paths).toContain('/collaborations/{collabId}');
    expect(paths).toContain('/collaborations/{collabId}/members/{memberUid}');
    expect(paths).toContain('/publicStories/{publicId}');
    expect(paths).toContain('/publicStories/{publicId}/kudos/{kudoId}');
    expect(paths).toContain('/publicStories/{publicId}/comments/{commentId}');

    expect(rulesText).toContain('match /users/{userId}');
    expect(rulesText).toContain('match /stories/{storyId}');
    expect(rulesText).toContain('match /sharedWorks/{shareId}');
    expect(rulesText).toContain('match /collaborations/{collabId}');
    expect(rulesText).toContain('match /members/{memberUid}');
    expect(rulesText).toContain('match /publicStories/{publicId}');
    expect(rulesText).toContain('match /kudos/{kudoId}');
    expect(rulesText).toContain('match /comments/{commentId}');
  });

  it('avoids expensive get()/exists() calls inside allow list rules', () => {
    const listLines = rulesText
      .split('\n')
      .filter((line) => line.includes('allow list:'));
    expect(listLines.length).toBeGreaterThanOrEqual(7);
    for (const line of listLines) {
      expect(line).not.toMatch(/\b(get|exists)\(/);
    }
  });

  it('restricts sharedWorks reads, collaboration membership, private story exclusion, and atomic kudos/comments', () => {
    expect(rulesText).toMatch(/match \/sharedWorks\/\{shareId\}[\s\S]*allow get: if isValidId\(shareId\);/);
    expect(rulesText).toMatch(
      /collaborations\/\$\(collabId\)\/members\/\$\(request\.auth\.uid\)/,
    );
    expect(rulesText).toContain('existing().isPrivate == false');
    expect(rulesText).toContain('isValidAo3Tags');
    expect(rulesText).toContain('existsAfter(/databases/$(database)/documents/publicStories/$(publicId)/kudos/$(request.auth.uid))');
    expect(rulesText).toContain('getAfter(/databases/$(database)/documents/publicStories/$(publicId)).data.kudosCount');
    expect(rulesText).toContain('getAfter(/databases/$(database)/documents/publicStories/$(publicId)).data.commentCount');
  });
});
