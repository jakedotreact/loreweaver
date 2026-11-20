import { FirebaseApp, initializeApp } from 'firebase/app';
import { Auth, getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  doc,
  Firestore,
  getDocFromServer,
  getFirestore,
} from 'firebase/firestore';
const optionalConfigModules = import.meta.glob('../firebase-applet-config.json', {
  eager: true,
});

interface FirebaseAppletConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
}

const rawConfigModule = optionalConfigModules['../firebase-applet-config.json'] as
  | { default?: Partial<FirebaseAppletConfig> }
  | Partial<FirebaseAppletConfig>
  | undefined;

const fileConfig: Partial<FirebaseAppletConfig> =
  rawConfigModule && typeof rawConfigModule === 'object' && 'default' in rawConfigModule
    ? rawConfigModule.default ?? {}
    : (rawConfigModule as Partial<FirebaseAppletConfig> | undefined) ?? {};

const resolvedConfig: FirebaseAppletConfig = {
  projectId:
    import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() || fileConfig.projectId || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim() || fileConfig.appId || '',
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim() || fileConfig.apiKey || '',
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() || fileConfig.authDomain || '',
  firestoreDatabaseId:
    import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID?.trim() ||
    fileConfig.firestoreDatabaseId ||
    '(default)',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim() ||
    fileConfig.storageBucket ||
    '',
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() ||
    fileConfig.messagingSenderId ||
    '',
  measurementId: fileConfig.measurementId || '',
};

export const isFirebaseConfigured = Boolean(
  resolvedConfig.apiKey &&
    resolvedConfig.projectId &&
    resolvedConfig.appId &&
    !resolvedConfig.apiKey.startsWith('YOUR_'),
);

let appInstance: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;

if (isFirebaseConfigured) {
  appInstance = initializeApp(resolvedConfig);
  dbInstance = getFirestore(
    appInstance,
    resolvedConfig.firestoreDatabaseId || '(default)',
  );
  authInstance = getAuth(appInstance);
}

export const db = dbInstance;
export const auth = authInstance;
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

async function testConnection() {
  if (!dbInstance) return;
  try {
    await getDocFromServer(doc(dbInstance, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: Array<{
      providerId?: string | null;
      email?: string | null;
    }>;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: authInstance?.currentUser?.uid,
      email: authInstance?.currentUser?.email,
      emailVerified: authInstance?.currentUser?.emailVerified,
      isAnonymous: authInstance?.currentUser?.isAnonymous,
      tenantId: authInstance?.currentUser?.tenantId,
      providerInfo:
        authInstance?.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
