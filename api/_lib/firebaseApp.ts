/**
 * Server-side Firebase Admin access (Auth, Firestore, Storage) for payments and downloads.
 * Uses a named app so it doesn't collide with other modules that initialise the default app.
 */
import admin from 'firebase-admin';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0475896362';
const BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'gen-lang-client-0475896362.firebasestorage.app';
const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'ai-studio-a6c9e366-2e98-4fcd-bf9b-04eac80f64b4';
const APP_NAME = 'kith-server';

export function firebaseApp(): admin.app.App {
  const existing = admin.apps.find(a => a?.name === APP_NAME);
  if (existing) return existing;
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  return admin.initializeApp(
    {
      credential: sa ? admin.credential.cert(JSON.parse(sa)) : admin.credential.applicationDefault(),
      projectId: PROJECT_ID,
      storageBucket: BUCKET,
    },
    APP_NAME,
  );
}

export function firestoreAdmin(): Firestore {
  return getFirestore(firebaseApp(), DATABASE_ID);
}

/** Returns the caller's Firebase uid, or null if the token is missing or invalid. */
export async function uidFromAuthHeader(authorization?: string): Promise<string | null> {
  if (!authorization?.startsWith('Bearer ')) return null;
  try {
    return (await firebaseApp().auth().verifyIdToken(authorization.slice(7))).uid;
  } catch {
    return null;
  }
}
