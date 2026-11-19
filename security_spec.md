# Firestore Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Default-Deny Baseline**: Every path not explicitly matched is denied (`match /{document=**} { allow read, write: if false; }`).
2. **PII & Private Settings Isolation (`/users/{userId}`)**:
   - `userId` must match `request.auth.uid` with `request.auth.token.email_verified == true`.
   - Blanket `list` on `/users` is forbidden; only the single owner document `get`, `create`, `update` are permitted.
   - `uid` and `createdAt` are immutable once created (`incoming().uid == existing().uid` and `incoming().createdAt == existing().createdAt`).
   - `createdAt` on create and `updatedAt` on create/update must equal `request.time`.
   - `allowedModels` is bounded to `<= 20` items and type-checked when non-empty.
   - `autoPlayNarration`, when present, must be a strict boolean (`is bool`).
3. **Master Gate & Ownership on Stories (`/users/{userId}/stories/{storyId}`)**:
   - Reads and writes require `request.auth != null`, `request.auth.token.email_verified == true`, and `request.auth.uid == userId`.
   - Creating or updating a story requires parent `/users/{userId}` document ownership (`exists(/databases/$(database)/documents/users/$(userId))`), and `incoming().ownerUid == userId` + `incoming().id == storyId`.
   - `ownerUid`, `id`, and `createdAt` are immutable on update.
   - `list` queries explicitly enforce `resource.data.ownerUid == request.auth.uid`.
4. **Scoped Sharing Isolation (`/sharedWorks/{shareId}`)**:
   - Single-document `get` is permitted only with a valid `shareId`; blanket `list` is restricted strictly to `resource.data.ownerUid == request.auth.uid`.
   - No PII (`email`, `photoURL`) is permitted on `/sharedWorks/{shareId}`.
   - Creating, updating, or revoking (deleting) a share requires `isSignedIn()`, `ownerUid == request.auth.uid`, valid `scope in ['story', 'chapter', 'scene']`, non-empty `turns` list, and immutable `id`, `ownerUid`, `scope`, `sourceStoryId`, `targetId`, and `createdAt`.
5. **Multi-User Story Collaborations (`/collaborations/{collabId}` & `/collaborations/{collabId}/members/{memberUid}`)**:
   - Reading (`get`) or editing (`update`) a collaboration room requires `isSignedIn()` (`request.auth.token.email_verified == true`).
   - Blanket `list` on `/collaborations` is strictly enforced to `resource.data.ownerUid == request.auth.uid`; blanket `list` on `/members` is forbidden (`allow list: if false`).
   - Joining `/collaborations/{collabId}/members/{memberUid}` requires `memberUid == request.auth.uid`, parent room existence via `exists()`, `role in ['owner', 'editor']`, and restricts `role == 'owner'` strictly to the room creator verified via `get(/databases/.../collaborations/$(collabId)).data.ownerUid == request.auth.uid`.
   - Updating `/collaborations/{collabId}` requires either room ownership (`existing().ownerUid == request.auth.uid`) or verified membership in `/collaborations/{collabId}/members/$(request.auth.uid)`, plus `incoming().lastEditedByUid == request.auth.uid`, `incoming().updatedAt == request.time`, and immutable `id`, `ownerUid`, `sourceStoryId`, and `createdAt`.
6. **Public Story Index & Private Story Exclusion (`/publicStories/{publicId}`)**:
   - Any story with `isPrivate == true` is strictly excluded from public reads (`get`) and `list` queries (`existing().isPrivate == false || (isSignedIn() && existing().ownerUid == request.auth.uid)`), without calling `get()`/`exists()` inside `allow list`.
   - `tags` must conform to the bounded AO3 schema (`rating` enum, `warnings` list <= 6, `categories` list <= 6, `fandoms` <= 10, `relationships` <= 20, `characters` <= 30, `freeforms` <= 40).
   - Initial document creation enforces `kudosCount == 0`, `commentCount == 0`, `ownerUid == request.auth.uid`, and server timestamps.
7. **Atomic Kudos & Anonymous Kudos (`/publicStories/{publicId}/kudos/{kudoId}`)**:
   - Either keyed by `kudoId == request.auth.uid` (signed-in users, who may still opt into `isAnonymous: true`) OR keyed by an unguessable browser anonymous token `kudoId.matches('^anon_[a-zA-Z0-9_\\-]{8,64}$')` with `isAnonymous == true` and `uid == kudoId`.
   - Duplicate writes fail via `!exists(...)` and immutable `update`/`delete` denial (`if false`).
   - Creating a kudo requires parent `/publicStories/{publicId}` to have `isPrivate == false` and enforces `getAfter(/databases/.../publicStories/$(publicId)).data.kudosCount == get(...).data.kudosCount + 1`.
   - Incrementing `kudosCount` on `/publicStories/{publicId}` validates `+1` increment alongside atomic `!exists(...)` + `existsAfter(...)` on the corresponding `/kudos/{kudoId}` doc.
8. **Hierarchical Reader Comments (`/publicStories/{publicId}/comments/{commentId}`)**:
   - Creating a comment requires parent `/publicStories/{publicId}` to have `isPrivate == false`, `incoming().authorUid == request.auth.uid`, valid `targetType in ['story', 'chapter', 'scene']`, `targetId`, `body` length `1..4000`, `storyIsPrivate == false`, `getAfter(.../publicStories/$(publicId)).data.commentCount == get(...).data.commentCount + 1`, and `getAfter(...).data.lastCommentId == commentId`.
   - Updating `commentCount` on `/publicStories/{publicId}` requires `lastCommentId` alongside `!exists(...)` + `existsAfter(...)` (authored by `request.auth.uid`) for `+1` increments, and `exists(...)` + `!existsAfter(...)` (authorized by comment author or story owner) for `-1` decrements.
   - Only `authorUid` can update a comment's `body` + `updatedAt`; either `authorUid` or the public story `ownerUid` can delete a comment (requiring atomic `commentCount - 1` and `lastCommentId == commentId`).
9. **User Collections & Story Subscriptions (`/users/{userId}/collections/{collectionId}` & `/users/{userId}/subscriptions/{storyId}`)**:
   - Strictly isolated under `/users/{userId}` with `isOwner(userId)` (`email_verified == true`), parent user doc existence verified on create/update, and `list` restricted by `existing().ownerUid == request.auth.uid`.

## 2. Adversarial "Dirty Dozen+" Payloads (Must All Return PERMISSION_DENIED)
1. **Unauthenticated read on `/users/uid123`**: `request.auth == null` -> DENIED.
2. **Unverified email write on `/users/uid123`**: `email_verified == false` -> DENIED.
3. **Cross-user PII read on `/users/otherUid` by `uid123`**: `request.auth.uid != userId` -> DENIED.
4. **Cross-user story/collection/subscription read/list on `/users/otherUid/*`**: `request.auth.uid != userId` -> DENIED.
5. **Blanket list query on `/users` collection**: no `allow list` rule -> DENIED.
6. **UID spoofing on `/users/uid123` create**: payload `{ uid: "otherUid", ... }` -> DENIED.
7. **Shadow ghost field on `/users/uid123` create/update**: payload `{ ..., isAdmin: true }` -> DENIED (`hasOnly` rejection).
8. **Invalid `thinkingLevel` enum or non-boolean `autoPlayNarration` on `/users/uid123`**: payload `{ ..., thinkingLevel: "TURBO" }` or `{ ..., autoPlayNarration: "yes" }` -> DENIED.
9. **Client-forged `createdAt` / `updatedAt` timestamp**: payload `{ ..., updatedAt: 1700000000 }` -> DENIED (`!= request.time`).
10. **Oversized `allowedModels` array (> 20 items) or invalid string length (`preferredModel` > 100 chars, `username` > 40 chars)** -> DENIED.
11. **Mutating immutable `uid` or `createdAt` during `/users/uid123` update** -> DENIED.
12. **Poisoned document ID `/users/uid123/stories/bad$id!with/spaces`** -> DENIED (`isValidId` regex failure).
13. **Cross-user hijack or blanket list on `/sharedWorks`**: creating with `ownerUid != request.auth.uid`, updating/deleting another author's `shareId`, or running `list` without `where('ownerUid', '==', auth.uid)` -> DENIED.
14. **Collaboration privilege escalation or unauthorized write**: joining `/collaborations/{collabId}/members/{uid}` with `role: "owner"` when not `ownerUid`, writing another user's `lastEditedByUid`, or updating `/collaborations/{collabId}` without a `members/{uid}` entry -> DENIED.
15. **Reading or listing a private story via `/publicStories`**: requesting `get` or `list` matching `isPrivate: true` as another user or unauthenticated reader -> DENIED.
16. **Inflating `kudosCount` or skipping batch write**: updating `kudosCount` by `+10`, creating `/kudos/{otherUid}`, supplying a malformed `anon_` token, or writing `/kudos/{kudoId}` without incrementing `kudosCount` in the same `WriteBatch` -> DENIED.
17. **Commenting/kudoing on a private story or spoofing comment author**: creating a comment with `authorUid != request.auth.uid`, invalid `targetType`, or targeting a `publicStories` doc with `isPrivate == true` -> DENIED.
18. **Deleting another reader's comment without being the story owner**: non-owner/non-author calling `delete` on `/publicStories/{publicId}/comments/{commentId}` -> DENIED.
19. **Stand-alone `commentCount` +/-1 mutation without paired comment create/delete**: updating `commentCount` (or `commentCount` + `lastCommentId`) on `/publicStories/{publicId}` without atomically creating/deleting `/comments/{lastCommentId}` in the same `WriteBatch` -> DENIED.
