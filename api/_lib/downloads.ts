/**
 * Secure product downloads, shared by api/payments/download.ts (Vercel) and server.ts (local dev).
 *
 * Paid files live in the private Supabase Storage bucket `private_products`, which clients cannot read.
 * This module checks that the caller owns the product or has a completed purchase, then returns a
 * short-lived signed URL. Files uploaded before the Supabase migration fall back to Firebase Storage.
 * Only the file name and the URL leave the server.
 */
import { supabaseAdmin } from './supabaseAdmin.js';
import { firebaseApp, uidFromAuthHeader } from './firebaseApp.js';

const URL_TTL_MS = 5 * 60_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface DownloadResult {
  status: number;
  body: Record<string, unknown>;
}
const fail = (status: number, error: string): DownloadResult => ({ status, body: { error } });

export async function createDownloadUrl(
  productId: string,
  fileId: string | undefined,
  authorization?: string,
): Promise<DownloadResult> {
  const uid = await uidFromAuthHeader(authorization);
  if (!uid) return fail(401, 'Sign in required');
  if (!/^[\w-]{1,128}$/.test(productId)) return fail(400, 'Invalid product');
  if (fileId !== undefined && !UUID_RE.test(fileId)) return fail(400, 'Invalid file');

  try {
    const db = supabaseAdmin();

    const { data: product, error: productError } = await db
      .from('products')
      .select('creator_uid')
      .eq('id', productId)
      .maybeSingle();
    if (productError) throw productError;
    if (!product) return fail(404, 'Product not found');

    if (product.creator_uid !== uid) {
      const { data: purchase, error: purchaseError } = await db
        .from('purchases')
        .select('id')
        .eq('buyer_id', uid)
        .eq('product_id', productId)
        .eq('status', 'completed')
        .maybeSingle();
      if (purchaseError) throw purchaseError;
      if (!purchase) return fail(403, 'Buy this product to download it');
    }

    let query = db
      .from('product_files')
      .select('id, storage_path, file_name')
      .eq('product_id', productId)
      .order('position', { ascending: true })
      .limit(1);
    if (fileId) query = query.eq('id', fileId);
    const { data: files, error: filesError } = await query;
    if (filesError) throw filesError;
    const file = files?.[0];
    if (!file) return fail(404, 'This product has no downloadable file');

    let url: string;
    if (file.storage_path.startsWith('supabase://')) {
      const bucketAndKey = file.storage_path.slice('supabase://'.length);
      const slash = bucketAndKey.indexOf('/');
      const bucket = slash === -1 ? '' : bucketAndKey.slice(0, slash);
      const key = slash === -1 ? '' : bucketAndKey.slice(slash + 1);
      // Only the creator's own paid folder is downloadable, even if a bad path was saved.
      if (bucket !== 'private_products' || !key.startsWith(`${product.creator_uid}/`)) {
        return fail(403, 'This file is not available for download');
      }
      const { data, error } = await db.storage
        .from(bucket)
        .createSignedUrl(key, URL_TTL_MS / 1000, { download: file.file_name.replace(/[^\w.\- ]/g, '_') });
      if (error) throw error;
      url = data.signedUrl;
    } else {
      if (!file.storage_path.startsWith(`private_products/${product.creator_uid}/`)) {
        return fail(403, 'This file is not available for download');
      }
      // Files uploaded before the Supabase migration still live in Firebase Storage.
      const [legacyUrl] = await firebaseApp()
        .storage()
        .bucket()
        .file(file.storage_path)
        .getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + URL_TTL_MS,
          responseDisposition: `attachment; filename="${file.file_name.replace(/[^\w.\- ]/g, '_')}"`,
        });
      url = legacyUrl;
    }

    return { status: 200, body: { url, fileName: file.file_name, expiresInSeconds: URL_TTL_MS / 1000 } };
  } catch (e) {
    console.error('Download error:', e);
    return fail(500, 'Download failed. Please try again.');
  }
}
