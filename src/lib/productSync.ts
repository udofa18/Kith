import { auth } from '../firebase';
import { supabase } from '../supabase';

export interface StoreProductInput {
  title: string;
  description?: string;
  productType: string;
  category?: string;
  tags?: string[];
  price: number;
  currency: 'NGN' | 'USD';
  previewImage?: string;
  fileUrl?: string;
  status?: 'draft' | 'published';
}

export interface LessonInput {
  /** Set for lessons that already exist in the database. */
  id?: string;
  section_title: string;
  title: string;
  content: string | null;
  duration_seconds: number | null;
  is_preview: boolean;
  position: number;
}

/**
 * Storage paths come from two generations of uploads:
 *   Firebase: .../o/<encoded storage path>?alt=media&token=...
 *   Supabase: supabase://<bucket>/<key> (private files) or .../object/public/<bucket>/<key>
 * Supabase paths keep the `supabase://` marker so the download API knows which backend to ask;
 * legacy Firebase paths stay as plain `<folder>/<key>`.
 */
function storagePathFromUrl(url?: string): string | null {
  if (!url) return null;
  const marker = url.match(/^supabase:\/\/([^/]+)\/(.+)$/);
  if (marker) return `supabase://${marker[1]}/${marker[2]}`;
  const publicUrl = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/([^?]+)/);
  if (publicUrl) return `supabase://${publicUrl[1]}/${decodeURIComponent(publicUrl[2])}`;
  const firebase = url.match(/\/o\/([^?]+)/);
  return firebase ? decodeURIComponent(firebase[1]) : null;
}

/**
 * Mirrors a product into Supabase so checkout and purchases can use it.
 * Uses the Firestore document id as the shared id. RLS only lets the creator write their own rows.
 */
export async function syncProductToStore(productId: string, input: StoreProductInput): Promise<void> {
  const user = auth.currentUser;
  if (!supabase || !user) throw new Error('Store is not available right now');

  const { error } = await supabase.from('products').upsert(
    {
      id: productId,
      creator_uid: user.uid,
      creator_name: user.displayName || 'Anonymous',
      title: input.title,
      description: input.description ?? '',
      product_type: input.productType,
      category: input.category ?? input.productType,
      tags: input.tags ?? [],
      price_cents: Math.round(Number(input.price) * 100),
      currency: input.currency,
      cover_url: input.previewImage?.startsWith('https://') ? input.previewImage : null,
      status: input.status ?? 'published',
    },
    { onConflict: 'id' },
  );
  if (error) throw new Error(error.message);

  const storagePath = storagePathFromUrl(input.fileUrl);
  if (storagePath) {
    const { error: deleteError } = await supabase.from('product_files').delete().eq('product_id', productId);
    if (deleteError) throw new Error(deleteError.message);
    const { error: fileError } = await supabase.from('product_files').insert({
      product_id: productId,
      storage_path: storagePath,
      file_name: storagePath.split('/').pop()?.replace(/^\d+_/, '') || 'download',
      position: 0,
    });
    if (fileError) throw new Error(fileError.message);
  }
}

/**
 * Saves the curriculum. Existing lessons keep their ids, so buyers' progress survives edits.
 * Lessons removed in the editor are deleted; their progress goes with them.
 */
export async function syncLessons(productId: string, lessons: LessonInput[], removedIds: string[]): Promise<void> {
  if (!supabase) throw new Error('Store is not available right now');

  if (removedIds.length > 0) {
    const { error } = await supabase.from('product_lessons').delete().in('id', removedIds).eq('product_id', productId);
    if (error) throw new Error(error.message);
  }

  const existing = lessons.filter(l => l.id).map(l => ({ ...l, product_id: productId }));
  const fresh = lessons.filter(l => !l.id).map(l => ({ ...l, product_id: productId }));

  if (existing.length > 0) {
    const { error } = await supabase.from('product_lessons').upsert(existing, { onConflict: 'id' });
    if (error) throw new Error(error.message);
  }
  if (fresh.length > 0) {
    const { error } = await supabase.from('product_lessons').insert(fresh);
    if (error) throw new Error(error.message);
  }
}

export async function loadLessons(productId: string): Promise<Array<LessonInput & { id: string }>> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('product_lessons')
    .select('id, section_title, title, content, duration_seconds, is_preview, position')
    .eq('product_id', productId)
    .order('position', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<LessonInput & { id: string }>;
}

/** True when the signed-in creator can take payments. Paid products need this before publishing. */
export async function hasPayoutAccount(): Promise<boolean> {
  const user = auth.currentUser;
  if (!supabase || !user) return false;
  const { data, error } = await supabase
    .from('creator_accounts')
    .select('payouts_enabled')
    .eq('user_id', user.uid)
    .maybeSingle();
  return !error && !!data?.payouts_enabled;
}
