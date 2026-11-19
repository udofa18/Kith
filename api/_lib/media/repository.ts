/**
 * Supabase-backed `feed_media` repository.
 *
 * The table is server-only: RLS lets a signed-in owner read their own rows, and all writes
 * go through the service role in the media endpoints. Paths are stored, not public URLs.
 */
import { supabaseAdmin } from '../supabaseAdmin.js';
import type {
  CreateFeedMediaInput,
  FeedMediaRepository,
  FeedMediaRow,
  ReadyFeedMediaPatch,
} from './types.js';
import type { FeedMediaStatus, FeedVariantName } from '../../../src/lib/media/config.js';
import type { FeedMediaVariants } from '../../../src/lib/media/types.js';

const TABLE = 'feed_media';

type Row = Record<string, unknown>;

function asVariants(value: unknown): FeedMediaVariants {
  if (!value || typeof value !== 'object') return {};
  const variants = value as Record<string, unknown>;
  const result: FeedMediaVariants = {};
  for (const [name, raw] of Object.entries(variants)) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    if (typeof item.path !== 'string') continue;
    const width = Number(item.width);
    const height = Number(item.height);
    const bytes = Number(item.bytes);
    if (!Number.isFinite(width) || !Number.isFinite(height)) continue;
    result[name as FeedVariantName] = {
      path: item.path,
      width,
      height,
      bytes: Number.isFinite(bytes) ? bytes : 0,
      mimeType: 'image/webp',
    };
  }
  return result;
}

function mapRow(row: Row): FeedMediaRow {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    postId: row.post_id ? String(row.post_id) : null,
    bucket: String(row.bucket || 'posts'),
    originalPath: String(row.original_path),
    mimeType: String(row.mime_type),
    bytes: Number(row.original_bytes) || 0,
    width: Number(row.width) || 0,
    height: Number(row.height) || 0,
    aspectRatio: Number(row.aspect_ratio) || 1,
    format: String(row.format || ''),
    hasAlpha: !!row.has_alpha,
    isAnimated: !!row.is_animated,
    status: String(row.status || 'pending') as FeedMediaStatus,
    variants: asVariants(row.variants),
    placeholder: row.placeholder ? String(row.placeholder) : null,
    error: row.error_message ? String(row.error_message) : null,
    attemptCount: Number(row.attempt_count) || 0,
    createdAt: row.created_at ? String(row.created_at) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

const SELECT = '*';

async function getByOriginalPath(
  userId: string,
  path: string,
): Promise<FeedMediaRow | null> {
  const { data, error } = await supabaseAdmin()
    .from(TABLE)
    .select(SELECT)
    .eq('user_id', userId)
    .eq('original_path', path)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(data as Row) : null;
}

export const supabaseFeedMediaRepository: FeedMediaRepository = {
  async getById(id) {
    const { data, error } = await supabaseAdmin()
      .from(TABLE)
      .select(SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data as Row) : null;
  },

  getByOriginalPath,

  async create(input: CreateFeedMediaInput) {
    const { data, error } = await supabaseAdmin()
      .from(TABLE)
      .upsert(
        {
          id: input.id,
          user_id: input.userId,
          bucket: input.bucket,
          original_path: input.originalPath,
          mime_type: input.mimeType,
          original_bytes: input.bytes,
          width: input.width,
          height: input.height,
          aspect_ratio: input.aspectRatio,
          format: input.format,
          has_alpha: input.hasAlpha,
          is_animated: input.isAnimated,
          status: 'pending',
          variants: {},
        },
        { onConflict: 'user_id,original_path', ignoreDuplicates: true },
      )
      .select(SELECT)
      .maybeSingle();
    if (error) throw error;
    if (data) return mapRow(data as Row);

    // Insert lost a race or the row already existed: return the canonical row.
    const existing = await getByOriginalPath(input.userId, input.originalPath);
    if (!existing) throw new Error('Could not create the media record');
    return existing;
  },

  async markProcessing(id, attemptCount) {
    const { data, error } = await supabaseAdmin()
      .from(TABLE)
      .update({
        status: 'processing',
        error_message: null,
        attempt_count: Math.max(0, attemptCount),
      })
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error) throw error;
    return mapRow(data as Row);
  },

  async markReady(id, patch: ReadyFeedMediaPatch) {
    const { data, error } = await supabaseAdmin()
      .from(TABLE)
      .update({
        status: 'ready',
        mime_type: patch.mimeType,
        original_bytes: patch.bytes,
        width: patch.width,
        height: patch.height,
        aspect_ratio: patch.aspectRatio,
        format: patch.format,
        has_alpha: patch.hasAlpha,
        is_animated: patch.isAnimated,
        variants: patch.variants,
        placeholder: patch.placeholder,
        error_message: null,
      })
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error) throw error;
    return mapRow(data as Row);
  },

  async markFailed(id, message) {
    const { data, error } = await supabaseAdmin()
      .from(TABLE)
      .update({ status: 'failed', error_message: message.slice(0, 500) })
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error) throw error;
    return mapRow(data as Row);
  },

  async attachToPost(mediaIds, userId, postId) {
    if (mediaIds.length === 0) return 0;
    const { data, error } = await supabaseAdmin()
      .from(TABLE)
      .update({ post_id: postId })
      .eq('user_id', userId)
      .in('id', mediaIds)
      .select('id');
    if (error) throw error;
    return data?.length ?? 0;
  },

  async listAbandoned(beforeIso) {
    const { data, error } = await supabaseAdmin()
      .from(TABLE)
      .select(SELECT)
      .in('status', ['pending', 'processing'])
      .is('post_id', null)
      .lt('created_at', beforeIso);
    if (error) throw error;
    return (data ?? []).map((row) => mapRow(row as Row));
  },

  async delete(id) {
    const { error } = await supabaseAdmin().from(TABLE).delete().eq('id', id);
    if (error) throw error;
  },
};
