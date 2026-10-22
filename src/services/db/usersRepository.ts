import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { getSupabase } from '../../supabase';
import { dualWrite, dualRead } from './utils';
import { firestoreUserToRow, supabaseUserToApp } from '../../lib/db-mappers';

export interface SyncUserInput {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  providerData: Array<{ providerId: string; email?: string | null; displayName?: string | null; photoURL?: string | null }>;
}

export class UsersRepository {
  async getById(uid: string): Promise<Record<string, unknown> | null> {
    return dualRead<Record<string, unknown> | null>(
      async () => {
        const snap = await getDoc(doc(db, 'users', uid));
        return snap.exists() ? { id: snap.id, ...snap.data() } : null;
      },
      async () => {
        const { data, error } = await getSupabase().from('users').select('*').eq('id', uid).maybeSingle();
        if (error) throw error;
        return data ? supabaseUserToApp(data as Record<string, unknown>) : null;
      },
      'users'
    );
  }

  async syncUser(user: SyncUserInput): Promise<void> {
    const providers = user.providerData.map((p) => p.providerId);
    const existing = await this.getById(user.uid);

    const baseUsername =
      user.email?.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';

    const firestoreData = existing
      ? {
          email: user.email || user.providerData?.[0]?.email || existing.email || null,
          displayName: user.displayName || user.providerData?.[0]?.displayName || existing.displayName || null,
          photoURL: user.photoURL || user.providerData?.[0]?.photoURL || existing.photoURL || null,
          providers,
          xp: existing.xp ?? 100,
          totalSales: existing.totalSales ?? 0,
          totalImpressions: existing.totalImpressions ?? 0,
          dailyGiftingRemaining: existing.dailyGiftingRemaining ?? 100,
          lastGiftingReset: existing.lastGiftingReset ?? new Date().toISOString(),
          onboardingCompleted: existing.onboardingCompleted ?? false,
          username: existing.username || baseUsername.slice(0, 30) + Math.floor(Math.random() * 1000),
          uid: user.uid,
        }
      : {
          uid: user.uid,
          email: user.email || user.providerData?.[0]?.email || null,
          username: baseUsername.slice(0, 30) + Math.floor(Math.random() * 1000),
          displayName: user.displayName || user.providerData?.[0]?.displayName || null,
          photoURL: user.photoURL || user.providerData?.[0]?.photoURL || null,
          onboardingCompleted: false,
          xp: 100,
          providers,
          totalSales: 0,
          totalImpressions: 0,
          dailyGiftingRemaining: 100,
          lastGiftingReset: new Date().toISOString(),
          createdAt: serverTimestamp(),
        };

    await dualWrite(
      () => setDoc(doc(db, 'users', user.uid), firestoreData, { merge: !existing }),
      async () => {
        const row = firestoreUserToRow(user.uid, {
          ...firestoreData,
          createdAt: existing?.createdAt || new Date().toISOString(),
        });
        const { error } = await getSupabase().from('users').upsert(row as never);
        if (error) throw error;
      },
      'syncUser'
    );
  }

  async completeOnboarding(uid: string, data: { username: string; interests: string[] }): Promise<void> {
    await dualWrite(
      () =>
        setDoc(
          doc(db, 'users', uid),
          { ...data, onboardingCompleted: true, xp: 250 },
          { merge: true }
        ),
      async () => {
        const { error } = await getSupabase()
          .from('users')
          .update({
            username: data.username,
            interests: data.interests,
            onboarding_completed: true,
            xp: 250,
            updated_at: new Date().toISOString(),
          })
          .eq('id', uid);
        if (error) throw error;
      },
      'completeOnboarding'
    );
  }

  async getTopByXp(limit: number): Promise<Record<string, unknown>[]> {
    return dualRead<Record<string, unknown>[]>(
      async () => {
        const { getDocs, collection, query, orderBy, limit: fbLimit } = await import('firebase/firestore');
        const snap = await getDocs(query(collection(db, 'users'), orderBy('xp', 'desc'), fbLimit(limit)));
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      },
      async () => {
        const { data, error } = await getSupabase()
          .from('users')
          .select('*')
          .order('xp', { ascending: false })
          .limit(limit);
        if (error) throw error;
        return (data || []).map((row) => supabaseUserToApp(row as Record<string, unknown>));
      },
      'users'
    );
  }
}

export const usersRepository = new UsersRepository();
