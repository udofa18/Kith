-- Let creators list and overwrite their own private product files (needed for upserts in Storage).
-- Buyers still cannot read them: downloads go through /api/payments/download, which returns a
-- short-lived signed URL after checking the purchase.
DROP POLICY IF EXISTS "kith owners read own private files" ON storage.objects;
CREATE POLICY "kith owners read own private files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'private_products'
    AND (storage.foldername(name))[1] = public.current_uid()
  );
