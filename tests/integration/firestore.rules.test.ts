// @vitest-environment node
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const ROOT_DIR = process.cwd();

describe('Firestore security rules & blueprint contract', () => {
  const rulesText = fs.readFileSync(path.join(ROOT_DIR, 'firestore.rules'), 'utf8');
  const authCtxText = fs.readFileSync(
    path.join(ROOT_DIR, 'src/contexts/AuthContext.tsx'),
    'utf8',
  );
  const blueprint = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, 'firebase-blueprint.json'), 'utf8'),
  ) as {
    firestore: Record<string, unknown>;
    entities: {
      PublicStory: {
        properties: Record<string, unknown>;
      };
    };
  };

  it('enforces a global default deny-all fallback and verified email authentication', () => {
    expect(rulesText).toMatch(
      /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/,
    );
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
    expect(paths).toContain('/users/{userId}/collections/{collectionId}');
    expect(paths).toContain('/users/{userId}/subscriptions/{storyId}');

    expect(rulesText).toContain('match /users/{userId}');
    expect(rulesText).toContain('match /stories/{storyId}');
    expect(rulesText).toContain('match /sharedWorks/{shareId}');
    expect(rulesText).toContain('match /collaborations/{collabId}');
    expect(rulesText).toContain('match /members/{memberUid}');
    expect(rulesText).toContain('match /publicStories/{publicId}');
    expect(rulesText).toContain('match /kudos/{kudoId}');
    expect(rulesText).toContain('match /comments/{commentId}');
    expect(rulesText).toContain('match /collections/{collectionId}');
    expect(rulesText).toContain('match /subscriptions/{storyId}');
  });

  it('avoids expensive get()/exists() calls inside allow list rules', () => {
    const listLines = rulesText
      .split('\n')
      .filter((line) => line.includes('allow list:'));
    expect(listLines.length).toBeGreaterThanOrEqual(9);
    for (const line of listLines) {
      expect(line).not.toMatch(/\b(get|exists)\(/);
    }
  });

  it('restricts sharedWorks reads, collaboration membership, private story exclusion, anonymous kudos, and atomic kudos/comments', () => {
    expect(rulesText).toMatch(
      /match \/sharedWorks\/\{shareId\}[\s\S]*allow get: if isValidId\(shareId\);/,
    );
    expect(rulesText).toMatch(
      /collaborations\/\$\(collabId\)\/members\/\$\(request\.auth\.uid\)/,
    );
    expect(rulesText).toContain('existing().isPrivate == false');
    expect(rulesText).toContain('isValidAo3Tags');
    expect(rulesText).toContain('isAnonKudoToken');
    expect(rulesText).toContain(
      'existsAfter(/databases/$(database)/documents/publicStories/$(publicId)/kudos/$(request.auth.uid))',
    );
    expect(rulesText).toContain(
      'getAfter(/databases/$(database)/documents/publicStories/$(publicId)).data.kudosCount',
    );
    expect(rulesText).toContain(
      'getAfter(/databases/$(database)/documents/publicStories/$(publicId)).data.commentCount',
    );
  });

  it('ties publicStories commentCount increments/decrements atomically to matching comment writes', () => {
    // Must never allow standalone ['commentCount'] updates without lastCommentId + comment existence checks
    expect(rulesText).not.toMatch(
      /affectedKeys\(\)\.hasOnly\(\[\s*'commentCount'\s*\]\)/,
    );
    expect(rulesText).toContain(
      "affectedKeys().hasOnly(['commentCount', 'lastCommentId'])",
    );

    // Increment (+1) must require new comment doc created atomically by request.auth.uid
    expect(rulesText).toContain(
      '!exists(/databases/$(database)/documents/publicStories/$(publicId)/comments/$(incoming().lastCommentId))',
    );
    expect(rulesText).toContain(
      'existsAfter(/databases/$(database)/documents/publicStories/$(publicId)/comments/$(incoming().lastCommentId))',
    );
    expect(rulesText).toContain(
      'getAfter(/databases/$(database)/documents/publicStories/$(publicId)/comments/$(incoming().lastCommentId)).data.authorUid == request.auth.uid',
    );

    // Decrement (-1) must require existing comment doc deleted atomically by author or story owner
    expect(rulesText).toContain(
      'exists(/databases/$(database)/documents/publicStories/$(publicId)/comments/$(incoming().lastCommentId))',
    );
    expect(rulesText).toContain(
      '!existsAfter(/databases/$(database)/documents/publicStories/$(publicId)/comments/$(incoming().lastCommentId))',
    );
    expect(rulesText).toContain(
      'get(/databases/$(database)/documents/publicStories/$(publicId)/comments/$(incoming().lastCommentId)).data.authorUid == request.auth.uid',
    );

    // Comment create & delete rules must bind publicStories.lastCommentId symmetrically
    expect(rulesText.match(/getAfter\(\/databases\/\$\(database\)\/documents\/publicStories\/\$\(publicId\)\)\.data\.lastCommentId == commentId/g)).toHaveLength(2);

    // Blueprint and client WriteBatch calls must include lastCommentId
    expect(blueprint.entities.PublicStory.properties.lastCommentId).toBeTruthy();
    expect(authCtxText).toContain('lastCommentId: commentId');
    expect(authCtxText).toContain('lastCommentId: trimmedComment');
  });

  it('permits bounded prefixNote and suffixNote across stories, public stories, shared works, and collaborations', () => {
    expect(rulesText.match(/data\.prefixNote\.size\(\) <= 4000/g)).toHaveLength(4);
    expect(rulesText.match(/data\.suffixNote\.size\(\) <= 4000/g)).toHaveLength(4);
    expect(
      rulesText.match(/'prefixNote',\s*'suffixNote'/g)?.length,
    ).toBeGreaterThanOrEqual(8);

    const serializedBlueprint = JSON.stringify(blueprint);
    expect(serializedBlueprint).toContain('"prefixNote"');
    expect(serializedBlueprint).toContain('"suffixNote"');
  });
});
