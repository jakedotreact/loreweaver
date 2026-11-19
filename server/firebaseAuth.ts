import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface VerifiedFirebaseUser {
  uid: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
}

export interface FirebaseAuthVerificationError extends Error {
  status: number;
  code: string;
}

function makeAuthError(
  message: string,
  status = 401,
  code = 'unauthorized',
): FirebaseAuthVerificationError {
  const err = new Error(message) as FirebaseAuthVerificationError;
  err.status = status;
  err.code = code;
  return err;
}

interface FirebaseRuntimeConfig {
  projectId: string;
  firestoreDatabaseId: string;
}

const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const VALID_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

let cachedRuntimeConfig: FirebaseRuntimeConfig | null = null;

export function getFirebaseServerConfig(): FirebaseRuntimeConfig {
  if (cachedRuntimeConfig) return cachedRuntimeConfig;

  let fileProjectId = '';
  let fileDatabaseId = '(default)';
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
        projectId?: string;
        firestoreDatabaseId?: string;
      };
      fileProjectId = (parsed.projectId || '').trim();
      fileDatabaseId = (parsed.firestoreDatabaseId || '(default)').trim() || '(default)';
    }
  } catch {
    // Fallback to environment variables below
  }

  const projectId = (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    fileProjectId
  ).trim();
  const firestoreDatabaseId =
    (
      process.env.FIREBASE_FIRESTORE_DATABASE_ID ||
      process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
      fileDatabaseId
    ).trim() || '(default)';

  cachedRuntimeConfig = { projectId, firestoreDatabaseId };
  return cachedRuntimeConfig;
}

let cachedCerts: { certs: Record<string, string>; expiresAtMs: number } | null = null;
let inFlightCertFetch: Promise<Record<string, string>> | null = null;

async function fetchGooglePublicCerts(
  fetchImpl: typeof fetch = fetch,
  forceRefresh = false,
): Promise<Record<string, string>> {
  const now = Date.now();
  if (!forceRefresh && cachedCerts && now < cachedCerts.expiresAtMs) {
    return cachedCerts.certs;
  }

  if (inFlightCertFetch && !forceRefresh) {
    return inFlightCertFetch;
  }

  inFlightCertFetch = (async () => {
    const res = await fetchImpl(GOOGLE_CERTS_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw makeAuthError('Authentication key provider unavailable.', 503, 'auth_unavailable');
    }
    const certs = (await res.json()) as Record<string, string>;
    const cacheControl = res.headers.get('cache-control') || '';
    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
    const maxAgeSec = maxAgeMatch ? Number.parseInt(maxAgeMatch[1], 10) : 3600;
    const ttlMs = Math.max(60, Math.min(86400, maxAgeSec)) * 1000;
    cachedCerts = { certs, expiresAtMs: Date.now() + ttlMs };
    return certs;
  })();

  try {
    return await inFlightCertFetch;
  } finally {
    inFlightCertFetch = null;
  }
}

function decodeBase64UrlJson<T>(segment: string): T {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as T;
}

function decodeBase64UrlBuffer(segment: string): Buffer {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

export interface VerifyFirebaseTokenOptions {
  projectId?: string;
  nowSeconds?: () => number;
  getPublicCerts?: (forceRefresh?: boolean) => Promise<Record<string, string>>;
}

export async function verifyFirebaseIdToken(
  token: string,
  options: VerifyFirebaseTokenOptions = {},
): Promise<VerifiedFirebaseUser> {
  if (!token || typeof token !== 'string') {
    throw makeAuthError('Authentication token is required.', 401, 'unauthorized');
  }

  const trimmed = token.trim();
  const parts = trimmed.split('.');
  if (parts.length !== 3 || parts.some((p) => !p)) {
    throw makeAuthError('Invalid authentication token format.', 401, 'unauthorized');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  let header: { alg?: unknown; kid?: unknown; typ?: unknown };
  let payload: Record<string, unknown>;
  try {
    header = decodeBase64UrlJson(encodedHeader);
    payload = decodeBase64UrlJson(encodedPayload);
  } catch {
    throw makeAuthError('Invalid authentication token encoding.', 401, 'unauthorized');
  }

  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid.trim()) {
    throw makeAuthError('Unsupported authentication token signature.', 401, 'unauthorized');
  }

  const projectId = (options.projectId || getFirebaseServerConfig().projectId).trim();
  if (!projectId) {
    throw makeAuthError('Firebase authentication project is not configured.', 503, 'auth_unconfigured');
  }

  const getCerts =
    options.getPublicCerts ?? ((force = false) => fetchGooglePublicCerts(fetch, force));
  let certs = await getCerts(false);
  let certPem = certs[header.kid];
  if (!certPem) {
    certs = await getCerts(true);
    certPem = certs[header.kid];
  }
  if (!certPem || typeof certPem !== 'string') {
    throw makeAuthError('Unrecognized authentication key identifier.', 401, 'unauthorized');
  }

  let signatureValid = false;
  try {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${encodedHeader}.${encodedPayload}`);
    verifier.end();
    signatureValid = verifier.verify(certPem, decodeBase64UrlBuffer(encodedSignature));
  } catch {
    signatureValid = false;
  }

  if (!signatureValid) {
    throw makeAuthError('Invalid authentication token signature.', 401, 'unauthorized');
  }

  const nowSec = options.nowSeconds ? options.nowSeconds() : Math.floor(Date.now() / 1000);
  const exp = typeof payload.exp === 'number' ? payload.exp : Number.NaN;
  const iat = typeof payload.iat === 'number' ? payload.iat : Number.NaN;
  const authTime =
    typeof payload.auth_time === 'number' ? payload.auth_time : Number.NaN;

  if (!Number.isFinite(exp) || exp <= nowSec) {
    throw makeAuthError('Authentication token has expired.', 401, 'token_expired');
  }
  if (!Number.isFinite(iat) || iat > nowSec + 60) {
    throw makeAuthError('Authentication token issue time is invalid.', 401, 'unauthorized');
  }
  if (Number.isFinite(authTime) && authTime > nowSec + 60) {
    throw makeAuthError('Authentication time is invalid.', 401, 'unauthorized');
  }

  if (payload.aud !== projectId) {
    throw makeAuthError('Authentication token audience mismatch.', 401, 'unauthorized');
  }

  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  if (payload.iss !== expectedIssuer) {
    throw makeAuthError('Authentication token issuer mismatch.', 401, 'unauthorized');
  }

  const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
  if (!sub || !VALID_ID_RE.test(sub)) {
    throw makeAuthError('Authentication token subject is invalid.', 401, 'unauthorized');
  }

  return {
    uid: sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === 'string' ? payload.name : undefined,
  };
}

export function extractBearerToken(authHeader: string | string[] | undefined): string | null {
  if (!authHeader) return null;
  const value = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (typeof value !== 'string') return null;
  const match = value.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1].trim() : null;
}

export interface CollabMembershipResult {
  authorized: boolean;
  role: 'owner' | 'editor';
  displayName: string;
}

interface FirestoreStringField {
  stringValue?: string;
}

interface FirestoreDocResponse {
  fields?: Record<string, FirestoreStringField | undefined>;
}

export async function verifyCollabRoomMembership(params: {
  collabId: string;
  user: VerifiedFirebaseUser;
  idToken: string;
  projectId?: string;
  firestoreDatabaseId?: string;
  fetchImpl?: typeof fetch;
}): Promise<CollabMembershipResult | null> {
  const { collabId, user, idToken } = params;
  if (!VALID_ID_RE.test(collabId) || !VALID_ID_RE.test(user.uid)) {
    return null;
  }

  const cfg = getFirebaseServerConfig();
  const projectId = (params.projectId || cfg.projectId).trim();
  const databaseId = (params.firestoreDatabaseId || cfg.firestoreDatabaseId || '(default)').trim();
  if (!projectId) {
    return null;
  }

  const doFetch = params.fetchImpl ?? fetch;
  const docBase = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents/collaborations/${encodeURIComponent(collabId)}`;

  const fallbackName =
    (user.name && user.name.trim()) ||
    (user.email ? user.email.split('@')[0] : '') ||
    'Collaborator';

  // Verify room existence and check ownerUid or explicit member ledger document using caller's ID token
  const roomRes = await doFetch(docBase, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
      Accept: 'application/json',
    },
  });

  if (!roomRes.ok) {
    return null;
  }

  const roomDoc = (await roomRes.json()) as FirestoreDocResponse;
  const ownerUid = roomDoc.fields?.ownerUid?.stringValue?.trim() || '';
  const ownerName = roomDoc.fields?.ownerName?.stringValue?.trim() || '';

  const memberUrl = `${docBase}/members/${encodeURIComponent(user.uid)}`;
  const memberRes = await doFetch(memberUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
      Accept: 'application/json',
    },
  });

  if (memberRes.ok) {
    const memberDoc = (await memberRes.json()) as FirestoreDocResponse;
    const memberDisplayName =
      memberDoc.fields?.displayName?.stringValue?.trim() || fallbackName;
    const rawRole = memberDoc.fields?.role?.stringValue;
    const role: 'owner' | 'editor' =
      rawRole === 'owner' || ownerUid === user.uid ? 'owner' : 'editor';
    return {
      authorized: true,
      role,
      displayName: memberDisplayName.slice(0, 120),
    };
  }

  if (ownerUid && ownerUid === user.uid) {
    return {
      authorized: true,
      role: 'owner',
      displayName: (ownerName || fallbackName).slice(0, 120),
    };
  }

  return null;
}
