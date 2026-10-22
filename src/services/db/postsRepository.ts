import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit as fbLimit,
  doc,
  getDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { getSupabase } from '../../supabase';
import { dualRead } from './utils';
import { supabasePostToApp, camelToSnakeField } from '../../lib/db-mappers';
import { shouldReadCollectionFromSupabase } from '../../lib/database-config';

export class PostsRepository {
  async getPublicRecent(limitCount: number): Promise<Record<string, unknown>[]> {
    return dualRead<Record<string, unknown>[]>(
      async () => {
        const q = query(
          collection(db, 'posts'),
          where('visibility', '==', 'public'),
          orderBy('createdAt', 'desc'),
          fbLimit(limitCount)
        );
        const snap = await getDocs(q);
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      },
      async () => {
        const { data, error } = await getSupabase()
          .from('posts')
          .select('*')
          .eq('visibility', 'public')
          .order('created_at', { ascending: false })
          .limit(limitCount);
        if (error) throw error;
        return (data || []).map((row) => supabasePostToApp(row as Record<string, unknown>));
      },
      'posts'
    );
  }

  async getById(id: string): Promise<Record<string, unknown> | null> {
    const useSupabase = shouldReadCollectionFromSupabase('posts');

    if (useSupabase) {
      const { data, error } = await getSupabase().from('posts').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? supabasePostToApp(data as Record<string, unknown>) : null;
    }

    const snap = await getDoc(doc(db, 'posts', id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }
}

export class ContentRepository {
  async queryCollection(
    table: string,
    firestorePath: string,
    options: {
      filters?: Array<{ field: string; op: 'eq'; value: unknown }>;
      orderBy?: { field: string; desc?: boolean };
      limit?: number;
    } = {}
  ): Promise<Record<string, unknown>[]> {
    return dualRead(
      async () => {
        let q = query(collection(db, firestorePath));
        for (const f of options.filters || []) {
          q = query(q, where(f.field, '==', f.value));
        }
        if (options.orderBy) {
          q = query(q, orderBy(options.orderBy.field, options.orderBy.desc ? 'desc' : 'asc'));
        }
        if (options.limit) {
          q = query(q, fbLimit(options.limit));
        }
        const snap = await getDocs(q);
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      },
      async () => {
        let q = getSupabase().from(table).select('*');
        for (const f of options.filters || []) {
          q = q.eq(camelToSnakeField(f.field), f.value as string);
        }
        if (options.orderBy) {
          const col = camelToSnakeField(options.orderBy.field);
          q = q.order(col, { ascending: !options.orderBy.desc });
        }
        if (options.limit) q = q.limit(options.limit);
        const { data, error } = await q;
        if (error) throw error;
        return (data || []) as Record<string, unknown>[];
      },
      table
    );
  }
}

export const postsRepository = new PostsRepository();
export const contentRepository = new ContentRepository();
