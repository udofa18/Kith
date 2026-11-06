-- Supabase Storage buckets for app uploads.
--
-- Files used to live in Firebase Storage. The folder in the old path decides the bucket:
--   avatars/<uid>/...            → avatars
--   posts/<uid>/...              → posts
--   products/<uid>/...           → products
--   previews/<uid>/...           → previews
--   editor/<uid>/...             → editor
--   article_covers/<uid>/...     → article_covers
--   statuses/<uid>/...           → statuses
--   messages/<uid>/...           → messages
--   events/<uid>/...             → events
--   communities/...              → communities
--   channels/...                 → channels
--   private_products/<uid>/...   → private_products (paid files, server-signed URLs only)
--
-- Public buckets are readable by anyone with the URL (same as the old Firebase rules).
-- Writes are limited to the uploader's own folder.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('avatars', 'avatars', true, 52428800),
  ('posts', 'posts', true, 52428800),
  ('products', 'products', true, 52428800),
  ('previews', 'previews', true, 52428800),
  ('editor', 'editor', true, 52428800),
  ('article_covers', 'article_covers', true, 52428800),
  ('statuses', 'statuses', true, 52428800),
  ('messages', 'messages', true, 52428800),
  ('events', 'events', true, 52428800),
  ('communities', 'communities', true, 52428800),
  ('channels', 'channels', true, 52428800),
  ('private_products', 'private_products', false, 52428800)
ON CONFLICT (id) DO NOTHING;

-- Anyone may read the public buckets (public URLs do not need this, but listing does).
DROP POLICY IF EXISTS "kith public buckets are readable" ON storage.objects;
CREATE POLICY "kith public buckets are readable" ON storage.objects
  FOR SELECT
  USING (
    bucket_id IN (
      'avatars', 'posts', 'products', 'previews', 'editor', 'article_covers',
      'statuses', 'messages', 'events', 'communities', 'channels'
    )
  );

-- Uploads: signed-in users only, into their own top-level folder.
-- Communities and channels keep their nested ids in the path, so they get a looser check.
DROP POLICY IF EXISTS "kith uploads to own folder" ON storage.objects;
CREATE POLICY "kith uploads to own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN (
      'avatars', 'posts', 'products', 'previews', 'editor', 'article_covers',
      'statuses', 'messages', 'events', 'communities', 'channels', 'private_products'
    )
    AND (
      (storage.foldername(name))[1] = public.current_uid()
      OR bucket_id IN ('communities', 'channels')
    )
  );

DROP POLICY IF EXISTS "kith updates own files" ON storage.objects;
CREATE POLICY "kith updates own files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN (
      'avatars', 'posts', 'products', 'previews', 'editor', 'article_covers',
      'statuses', 'messages', 'events', 'communities', 'channels', 'private_products'
    )
    AND (
      (storage.foldername(name))[1] = public.current_uid()
      OR bucket_id IN ('communities', 'channels')
    )
  )
  WITH CHECK (
    bucket_id IN (
      'avatars', 'posts', 'products', 'previews', 'editor', 'article_covers',
      'statuses', 'messages', 'events', 'communities', 'channels', 'private_products'
    )
    AND (
      (storage.foldername(name))[1] = public.current_uid()
      OR bucket_id IN ('communities', 'channels')
    )
  );

DROP POLICY IF EXISTS "kith deletes own files" ON storage.objects;
CREATE POLICY "kith deletes own files" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN (
      'avatars', 'posts', 'products', 'previews', 'editor', 'article_covers',
      'statuses', 'messages', 'events', 'communities', 'channels', 'private_products'
    )
    AND (
      (storage.foldername(name))[1] = public.current_uid()
      OR bucket_id IN ('communities', 'channels')
    )
  );
