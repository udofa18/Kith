/**
 * Shared helpers for serverless functions. The leading underscore keeps Vercel
 * from deploying this folder as an endpoint.
 */
import admin from 'firebase-admin';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Verifying ID tokens only needs the project ID (public signing keys are fetched by the SDK).
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0475896362';
if (admin.apps.length === 0) admin.initializeApp({ projectId: PROJECT_ID });

/** Returns the caller's Firebase uid, or sends 401 and returns null. */
export async function requireUser(req: VercelRequest, res: VercelResponse): Promise<string | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Sign in required' });
    return null;
  }
  try {
    return (await admin.auth().verifyIdToken(header.slice(7))).uid;
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
    return null;
  }
}
