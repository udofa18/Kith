import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import fs from 'fs';
import axios from 'axios';
import multer from 'multer';
import { fetchMetadata, validateUrl } from './api/_lib/unfurl';
import { issueLivekitToken } from './api/_lib/livekitToken';
import { endLiveSession } from './api/_lib/liveSession';
import { getLiveSessionInfo } from './api/_lib/liveSessionInfo';
import { handleLivekitWebhook } from './api/_lib/livekitWebhook';
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
} from './api/_lib/payments';
import { createDownloadUrl } from './api/_lib/downloads';
import {
  getCommunityPaidMembers,
  getMyMemberships,
  getReceipt,
  reconcileCommunityMemberships,
} from './api/_lib/communityBilling';
import { ensureFirebaseRoleClaim } from './api/_lib/authClaims';
import sitemapHandler from './api/sitemap';
import rssHandler from './api/rss';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure Multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit
  },
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Must be registered before express.json(): Paystack's signature covers the raw bytes.
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
    const { status, body } = await handleStripeWebhook(req.body as Buffer, typeof signature === 'string' ? signature : undefined);
    res.status(status).json(body);
  });

  // LiveKit signs the exact raw bytes, so register before express.json().
  app.post('/api/livekit/webhook', express.raw({ type: '*/*' }), async (req, res) => {
    const authorization = req.headers.authorization;
    const { status, body } = await handleLivekitWebhook(
      req.body as Buffer,
      Array.isArray(authorization) ? authorization[0] : authorization,
    );
    res.status(status).json(body);
  });

  app.use(express.json());

  let bucket: any = null;

  // Initialize Firebase Admin if config exists
  try {
    const firebaseConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(firebaseConfigPath)) {
      const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
      if (admin.apps.length === 0) {
        const bucketName = `${firebaseConfig.projectId}.appspot.com`;
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
          projectId: firebaseConfig.projectId,
          storageBucket: bucketName,
        });
        console.log('Firebase Admin initialized with alternative bucket:', bucketName);
      }
      bucket = admin.storage().bucket();
    }
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error);
  }

  // Upload Endpoint
  app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { type, userId, fileName } = req.body;
      if (!userId || !type) {
        return res.status(400).json({ error: 'Missing userId or type' });
      }

      if (!bucket) {
         // Try to initialize on demand if failed before
         try {
           const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
           const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
           const bucketName = `${config.projectId}.appspot.com`;
           bucket = admin.storage().bucket(bucketName);
         } catch (e) {
           console.error('Late bucket init failed:', e);
         }
      }

      if (!bucket) {
        return res.status(500).json({ error: 'Storage bucket not initialized. Ensure firebase-applet-config.json is valid.' });
      }

      const fileId = Math.random().toString(36).substring(7);
      const destination = `products/${userId}/${type}_${fileId}_${fileName || req.file.originalname}`;
      const file = bucket.file(destination);

      console.log(`[STORAGE] Uploading ${req.file.size} bytes to ${bucket.name}/${destination}`);

      await file.save(req.file.buffer, {
        metadata: {
          contentType: req.file.mimetype,
          cacheControl: 'public, max-age=31536000',
        },
        resumable: false
      });

      console.log('[STORAGE] Upload successful');

      // Generate the URL. We avoid getSignedUrl because ADC doesn't support it without a private key.
      // We rely on the bucket/rules being configured for public read, or we use the firebase format.
      const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(destination)}?alt=media`;
      
      res.json({ url: publicUrl });
    } catch (error: any) {
      console.error('CRITICAL Upload error full:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      res.status(500).json({ 
        error: 'Upload failed', 
        details: error.message || 'Check server logs for GaxiosError details',
        code: error.code || 'NO_CODE'
      });
    }
  });

  // LiveKit Token Endpoint (mirrors api/livekit-token.ts)
  app.post('/api/livekit-token', async (req, res) => {
    try {
      const { status, body } = await issueLivekitToken(req.body, req.headers.authorization);
      res.status(status).json(body);
    } catch (error: any) {
      console.error('Error generating token:', error);
      res.status(500).json({ error: 'Failed to generate LiveKit token' });
    }
  });


  // Public lobby information (mirrors api/live-session/info.ts)
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

  // Server-authoritative live-session ending (mirrors api/live-session/end.ts)
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

  // Creator marketplace payments (mirrors api/payments/*.ts)
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
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = req.headers.authorization;
      const bearer = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : null;
      const querySecret = typeof req.query.secret === 'string' ? req.query.secret : null;
      if (bearer !== secret && querySecret !== secret) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }
    const { status, body } = await reconcileCommunityMemberships();
    res.status(status).json(body);
  });
  app.post('/api/payments/community/reconcile', async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = req.headers.authorization;
      const bearer = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : null;
      if (bearer !== secret) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }
    const { status, body } = await reconcileCommunityMemberships();
    res.status(status).json(body);
  });
  app.get('/api/payments/download', async (req, res) => {
    const productId = typeof req.query.productId === 'string' ? req.query.productId : '';
    const fileId = typeof req.query.fileId === 'string' ? req.query.fileId : undefined;
    const { status, body } = await createDownloadUrl(productId, fileId, req.headers.authorization);
    res.status(status).json(body);
  });

  // Simple in-memory cache for unfurl results
  const unfurlCache = new Map<string, { data: any, timestamp: number }>();
  const pendingUnfurls = new Map<string, Promise<any>>();
  const CACHE_TTL = 1000 * 60 * 60; // 1 hour

  // URL Unfurl Endpoint (mirrors api/unfurl.ts; shared parsing in api/_lib/unfurl.ts)
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
        .then(data => { unfurlCache.set(url.href, { data, timestamp: Date.now() }); return data; })
        // Remember failures briefly so a broken link isn't refetched on every render.
        .catch(error => { unfurlCache.set(url.href, { data: null, timestamp: Date.now() }); throw error; })
        .finally(() => pendingUnfurls.delete(url.href));
      pendingUnfurls.set(url.href, pending);
    }

    try {
      res.json(await pending);
    } catch (error: any) {
      res.status(error.status === 429 ? 429 : 502).json({ error: 'Failed to unfurl URL' });
    }
  });

  // Serverless functions from /api/gemini, mounted for local dev (Vercel serves them in production).
  const GEMINI_FUNCTIONS = new Set(['suggest-hashtags', 'detect-language', 'digest', 'moderate', 'product-description']);
  app.post('/api/gemini/:fn', async (req, res) => {
    if (!GEMINI_FUNCTIONS.has(req.params.fn)) return res.status(404).json({ error: 'Not found' });
    const { default: handler } = await import(`./api/gemini/${req.params.fn}.ts`);
    return handler(req, res);
  });

  // Public content feeds. Vercel rewrites /sitemap.xml and /rss.xml to the same handlers.
  app.get('/sitemap.xml', (req, res) => sitemapHandler(req as any, res as any));
  app.get('/rss.xml', (req, res) => rssHandler(req as any, res as any));

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
