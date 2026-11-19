/**
 * Supabase Storage adapter for the media pipeline. Uses the server-only service role,
 * so the browser never receives credentials capable of writing variants.
 */
import { supabaseAdmin } from '../supabaseAdmin.js';
import { FEED_MEDIA_BUCKET } from '../../../src/lib/media/config.js';
import type { MediaStorage } from './types.js';

/** Variant paths are content-stable; the original path contains a unique media id. */
export const IMMUTABLE_CACHE = '31536000, immutable';

function encodedPath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function createSupabaseMediaStorage(bucket = FEED_MEDIA_BUCKET): MediaStorage {
  return {
    async download(path) {
      const { data, error } = await supabaseAdmin().storage.from(bucket).download(path);
      if (error) throw error;
      if (!data) throw new Error('The uploaded image could not be found');
      return Buffer.from(await data.arrayBuffer());
    },

    async upload(path, data, contentType, cacheControl = IMMUTABLE_CACHE) {
      const { error } = await supabaseAdmin()
        .storage.from(bucket)
        .upload(path, data, {
          contentType,
          cacheControl,
          upsert: true,
        });
      if (error) throw error;
    },

    async remove(paths) {
      const unique = [...new Set(paths.filter(Boolean))];
      if (unique.length === 0) return;
      const { error } = await supabaseAdmin().storage.from(bucket).remove(unique);
      if (error) throw error;
    },

    publicUrl(path) {
      const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
      if (!base) throw new Error('Supabase is not configured');
      return `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath(path)}`;
    },
  };
}
