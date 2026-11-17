# Firestore Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Default-Deny Baseline**: Every path not explicitly matched is denied (`match /{document=**} { allow read, write: if false; }`).
2. **PII & Private Settings Isolation (`/users/{userId}`)**:
   - `userId` must match `request.auth.uid` with `request.auth.token.email_verified == true`.
   - Blanket `list` on `/users` is forbidden; only the single owner document `get`, `create`, `update` are permitted.
   - `uid` and `createdAt` are immutable once created (`incoming().uid == existing().uid` and `incoming().createdAt == existing().createdAt`).
   - `createdAt` on create and `updatedAt` on create/update must equal `request.time`.
   - `allowedModels` is bounded to `<= 20` items and type-checked when non-empty.
3. **Master Gate & Ownership on Stories (`/users/{userId}/stories/{storyId}`)**:
   - Reads and writes require `request.auth != null`, `request.auth.token.email_verified == true`, and `request.auth.uid == userId`.
   - Creating or updating a story requires parent `/users/{userId}` document ownership (`exists(/databases/$(database)/documents/users/$(userId))`), and `incoming().ownerUid == userId` + `incoming().id == storyId`.
   - `ownerUid`, `id`, and `createdAt` are immutable on update.
   - `list` queries explicitly enforce `resource.data.ownerUid == request.auth.uid`.

## 2. Adversarial "Dirty Dozen" Payloads (Must All Return PERMISSION_DENIED)
1. **Unauthenticated read on `/users/uid123`**: `request.auth == null` -> DENIED.
2. **Unverified email write on `/users/uid123`**: `email_verified == false` -> DENIED.
3. **Cross-user PII read on `/users/otherUid` by `uid123`**: `request.auth.uid != userId` -> DENIED.
4. **Cross-user story read/list on `/users/otherUid/stories`**: `request.auth.uid != userId` -> DENIED.
5. **Blanket list query on `/users` collection**: no `allow list` rule -> DENIED.
6. **UID spoofing on `/users/uid123` create**: payload `{ uid: "otherUid", ... }` -> DENIED.
7. **Shadow ghost field on `/users/uid123` create/update**: payload `{ ..., isAdmin: true }` -> DENIED (`hasOnly` rejection).
8. **Invalid `thinkingLevel` enum on `/users/uid123`**: payload `{ ..., thinkingLevel: "TURBO" }` -> DENIED.
9. **Client-forged `createdAt` / `updatedAt` timestamp**: payload `{ ..., updatedAt: 1700000000 }` -> DENIED (`!= request.time`).
10. **Oversized `allowedModels` array (> 20 items) or invalid string length (`preferredModel` > 100 chars)** -> DENIED.
11. **Mutating immutable `uid` or `createdAt` during `/users/uid123` update** -> DENIED.
12. **Poisoned document ID `/users/uid123/stories/bad$id!with/spaces`** -> DENIED (`isValidId` regex failure).
