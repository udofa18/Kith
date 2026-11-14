/**
 * Every HTTP endpoint lives in this one Express application.
 *
 * The local dev server (`server.ts`) mounts it directly, and the Vercel deployment exposes it
 * through the single catch-all function `api/[...route].ts`. Keeping one function matters on the
 * Hobby plan, which allows at most 12 Serverless Functions per deployment: one file per endpoint
 * (32 at the time of writing) fails the build with "No more than 12 Serverless Functions can be
 * added to a Deployment on the Hobby plan".
 */
import express, { type Request, type Response } from 'express';
import multer from 'multer';
import { fetchMetadata, validateUrl } from './unfurl.js';
import { issueLivekitToken } from './livekitToken.js';
import { endLiveSession } from './liveSession.js';
import { getLiveSessionInfo } from './liveSessionInfo.js';
import { handleLivekitWebhook } from './livekitWebhook.js';
import {
  listBanks,
  createPayoutAccount,
  createCheckout,
  getCheckoutOptions,
  getOrderStatus,
  cancelCommunityMembership,
  handlePaystackWebhook,
  handleStripeWebhook,
  startConnectOnboarding,
  getConnectStatus,
  getCreatorBalance,
  requestWithdrawal,
} from './payments.js';
import { createDownloadUrl } from './downloads.js';
import {
  getCommunityPaidMembers,
  getMyMemberships,
  getReceipt,
  reconcileCommunityMemberships,
} from './communityBilling.js';
import { ensureFirebaseRoleClaim } from './authClaims.js';
import { firebaseApp } from './firebaseApp.js';
import sitemapHandler from './handlers/sitemap.js';
import rssHandler from './handlers/rss.js';
import componentHandler from './handlers/component.js';
import { geminiHandlers } from './handlers/gemini/index.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit; Vercel's own request limit is much lower
  },
});

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. */
function cronDenied(req: Request): number | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === 'production' ? 503 : null;
  const auth = req.headers.authorization;
  const bearer = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const querySecret = typeof req.query.secret === 'string' ? req.query.secret : null;
  return bearer === secret || querySecret === secret ? null : 401;
}

function sendDenied(res: Response, denied: number) {
  res.status(denied).json({ error: denied === 401 ? 'Unauthorized' : 'CRON_SECRET is not configured' });
}

export function createApiApp() {
  const app = express();
  app.disable('x-powered-by');

  // Must be registered before express.json(): these signatures cover the raw bytes.
  app.post('/api/payments/paystack-webhook', express.raw({ type: '*/*' }), async (req, res) => {
    const current = req.headers['paystack-signature'];
    const legacy = req.headers['x-paystack-signature'];
    const { status, body } = await handlePaystackWebhook(req.body as Buffer, {
      paystackSignature: Array.isArray(current) ? current[0] : current,
      legacySignature: Array.isArray(legacy) ? legacy[0] : legacy,
    });
    res.status(status).json(body);
  });

  app.post('/api/payments/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['stripe-signature'];
    const { status, body } = await handleStripeWebhook(
      req.body as Buffer,
      typeof signature === 'string' ? signature : undefined,
    );
    res.status(status).json(body);
  });

  // LiveKit signs the exact raw bytes, so register before express.json() as well.
  app.post('/api/livekit/webhook', express.raw({ type: '*/*' }), async (req, res) => {
    const authorization = req.headers.authorization;
    const { status, body } = await handleLivekitWebhook(
      req.body as Buffer,
      Array.isArray(authorization) ? authorization[0] : authorization,
    );
    res.status(status).json(body);
  });

  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { type, userId, fileName } = req.body;
      if (!userId || !type) {
        return res.status(400).json({ error: 'Missing userId or type' });
      }

      const bucket = firebaseApp().storage().bucket();
      const fileId = Math.random().toString(36).substring(7);
      const destination = `products/${userId}/${type}_${fileId}_${fileName || req.file.originalname}`;
      const file = bucket.file(destination);

      console.log(`[STORAGE] Uploading ${req.file.size} bytes to ${bucket.name}/${destination}`);

      await file.save(req.file.buffer, {
        metadata: {
          contentType: req.file.mimetype,
          cacheControl: 'public, max-age=31536000',
        },
        resumable: false,
      });

      // Avoid getSignedUrl: ADC without a private key cannot sign. The bucket serves public reads.
      const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(destination)}?alt=media`;
      res.json({ url: publicUrl });
    } catch (error: any) {
      console.error('CRITICAL Upload error full:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      res.status(500).json({
        error: 'Upload failed',
        details: error.message || 'Check server logs for GaxiosError details',
        code: error.code || 'NO_CODE',
      });
    }
  });

  app.post('/api/livekit-token', async (req, res) => {
    try {
      const { status, body } = await issueLivekitToken(req.body, req.headers.authorization);
      res.status(status).json(body);
    } catch (error: any) {
      console.error('Error generating token:', error);
      res.status(500).json({ error: 'Failed to generate LiveKit token' });
    }
  });

  app.get('/api/live-session/info', async (req, res) => {
    const eventId = typeof req.query.eventId === 'string' ? req.query.eventId : '';
    try {
      const { status, body } = await getLiveSessionInfo(eventId, req.headers.authorization);
      res.status(status).json(body);
    } catch (error) {
      console.error('Error reading live session info:', error);
      res.status(500).json({ error: 'Failed to read the live session' });
    }
  });

  app.post('/api/live-session/end', async (req, res) => {
    try {
      const { status, body } = await endLiveSession(req.body, req.headers.authorization);
      res.status(status).json(body);
    } catch (error: any) {
      console.error('Error ending live session:', error);
      res.status(500).json({ error: 'Failed to end the live session' });
    }
  });

  // Supabase third-party auth needs the Firebase role claim on new accounts.
  app.post('/api/auth/role-claim', async (req, res) => {
    const { status, body } = await ensureFirebaseRoleClaim(req.headers.authorization);
    res.status(status).json(body);
  });

  // Creator marketplace payments.
  app.get('/api/payments/banks', async (_req, res) => {
    const { status, body } = await listBanks();
    res.status(status).json(body);
  });
  app.post('/api/payments/payout-account', async (req, res) => {
    const { status, body } = await createPayoutAccount(req.body, req.headers.authorization);
    res.status(status).json(body);
  });
  app.post('/api/payments/checkout-options', async (req, res) => {
    const { status, body } = await getCheckoutOptions(req.body, req.headers.authorization);
    res.status(status).json(body);
  });
  app.post('/api/payments/checkout', async (req, res) => {
    const { status, body } = await createCheckout(req.body, req.headers.authorization);
    res.status(status).json(body);
  });
  app.post('/api/payments/connect-onboard', async (req, res) => {
    const { status, body } = await startConnectOnboarding(req.body, req.headers.authorization);
    res.status(status).json(body);
  });
  app.get('/api/payments/connect-status', async (req, res) => {
    const { status, body } = await getConnectStatus(req.headers.authorization);
    res.status(status).json(body);
  });
  app.get('/api/payments/balance', async (req, res) => {
    const { status, body } = await getCreatorBalance(req.headers.authorization);
    res.status(status).json(body);
  });
  app.post('/api/payments/withdraw', async (req, res) => {
    const { status, body } = await requestWithdrawal(req.body, req.headers.authorization);
    res.status(status).json(body);
  });
  app.get('/api/payments/order', async (req, res) => {
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    const { status, body } = await getOrderStatus(id, req.headers.authorization);
    res.status(status).json(body);
  });
  app.post('/api/payments/cancel-membership', async (req, res) => {
    const { status, body } = await cancelCommunityMembership(req.body, req.headers.authorization);
    res.status(status).json(body);
  });
  app.get('/api/payments/community/subscriptions', async (req, res) => {
    const communityId = typeof req.query.communityId === 'string' ? req.query.communityId : '';
    const { status, body } = await getCommunityPaidMembers(communityId, req.headers.authorization);
    res.status(status).json(body);
  });
  app.get('/api/payments/community/billing', async (req, res) => {
    const { status, body } = await getMyMemberships(req.headers.authorization);
    res.status(status).json(body);
  });
  app.get('/api/payments/receipt', async (req, res) => {
    const orderId = typeof req.query.orderId === 'string' ? req.query.orderId : '';
    const { status, body } = await getReceipt(orderId, req.headers.authorization);
    res.status(status).json(body);
  });
  app.get('/api/payments/community/reconcile', async (req, res) => {
    const denied = cronDenied(req);
    if (denied) return sendDenied(res, denied);
    const { status, body } = await reconcileCommunityMemberships();
    res.status(status).json(body);
  });
  app.post('/api/payments/community/reconcile', async (req, res) => {
    const denied = cronDenied(req);
    if (denied) return sendDenied(res, denied);
    const { status, body } = await reconcileCommunityMemberships();
    res.status(status).json(body);
  });
  app.get('/api/payments/download', async (req, res) => {
    const productId = typeof req.query.productId === 'string' ? req.query.productId : '';
    const fileId = typeof req.query.fileId === 'string' ? req.query.fileId : undefined;
    const { status, body } = await createDownloadUrl(productId, fileId, req.headers.authorization);
    res.status(status).json(body);
  });

  // Simple in-memory cache for unfurl results (per function instance).
  const unfurlCache = new Map<string, { data: any; timestamp: number }>();
  const pendingUnfurls = new Map<string, Promise<any>>();
  const CACHE_TTL = 1000 * 60 * 60; // 1 hour

  app.get('/api/unfurl', async (req, res) => {
    const url = typeof req.query.url === 'string' ? validateUrl(req.query.url) : null;
    if (!url) return res.status(400).json({ error: 'A public http(s) URL is required' });

    const cached = unfurlCache.get(url.href);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data ? res.json(cached.data) : res.status(502).json({ error: 'Failed to unfurl URL' });
    }

    let pending = pendingUnfurls.get(url.href);
    if (!pending) {
      pending = fetchMetadata(url)
        .then(data => {
          unfurlCache.set(url.href, { data, timestamp: Date.now() });
          return data;
        })
        // Remember failures briefly so a broken link isn't refetched on every render.
        .catch(error => {
          unfurlCache.set(url.href, { data: null, timestamp: Date.now() });
          throw error;
        })
        .finally(() => pendingUnfurls.delete(url.href));
      pendingUnfurls.set(url.href, pending);
    }

    try {
      res.json(await pending);
    } catch (error: any) {
      res.status(error.status === 429 ? 429 : 502).json({ error: 'Failed to unfurl URL' });
    }
  });

  app.post('/api/gemini/:fn', async (req, res) => {
    const handler = geminiHandlers[req.params.fn];
    if (!handler) return res.status(404).json({ error: 'Not found' });
    await handler(req as any, res as any);
  });

  app.get('/api/components/:slug', async (req, res) => {
    await componentHandler(req as any, res as any);
  });

  // The same handlers serve the Vercel rewrites for /sitemap.xml and /rss.xml.
  app.get('/api/sitemap', (req, res) => sitemapHandler(req as any, res as any));
  app.get('/api/rss', (req, res) => rssHandler(req as any, res as any));
  app.get('/sitemap.xml', (req, res) => sitemapHandler(req as any, res as any));
  app.get('/rss.xml', (req, res) => rssHandler(req as any, res as any));

  // Unknown API paths must stay JSON instead of falling through to the SPA.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}
