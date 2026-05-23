import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { AccessToken, TrackSource } from 'livekit-server-sdk';
import admin from 'firebase-admin';
import fs from 'fs';
import * as cheerio from 'cheerio';
import axios from 'axios';
import multer from 'multer';

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

  // LiveKit Token Endpoint
  app.post('/api/livekit-token', async (req, res) => {
    const { eventId, userId, username, photoURL } = req.body;

    if (!eventId || !userId || !username) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      const apiKey = process.env.LIVEKIT_API_KEY;
      const apiSecret = process.env.LIVEKIT_API_SECRET;

      if (!apiKey || !apiSecret) {
        console.error('LiveKit credentials missing from environment variables');
        return res.status(500).json({ 
          error: 'LiveKit credentials not configured. Please add LIVEKIT_API_KEY and LIVEKIT_API_SECRET to your environment variables.' 
        });
      }

      const at = new AccessToken(apiKey, apiSecret, {
        identity: userId,
        name: username,
        metadata: JSON.stringify({ avatar: photoURL || '' }),
      });

      at.addGrant({
        roomJoin: true,
        room: eventId,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        canUpdateOwnMetadata: true,
        canPublishSources: [TrackSource.CAMERA, TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
      });

      res.json({ token: await at.toJwt() });
    } catch (error: any) {
      console.error('Error generating token:', error);
      res.status(500).json({ 
        error: 'Failed to generate LiveKit token',
        details: error.message
      });
    }
  });

  // Simple in-memory cache for unfurl results
  const unfurlCache = new Map<string, { data: any, timestamp: number }>();
  const pendingUnfurls = new Map<string, Promise<any>>();
  const CACHE_TTL = 1000 * 60 * 60; // 1 hour

  // URL Unfurl Endpoint
  app.get('/api/unfurl', async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Check cache
    const cached = unfurlCache.get(url);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json(cached.data);
    }

    // Check if there's already a pending request for this URL
    if (pendingUnfurls.has(url)) {
      try {
        const data = await pendingUnfurls.get(url);
        return res.json(data);
      } catch (error) {
        // If the pending request failed, we'll try again below
      }
    }

    // Create a new promise for this unfurl
    const unfurlPromise = (async () => {
      try {
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Bot/1.0; +http://example.com/bot)',
          },
          timeout: 5000,
          validateStatus: (status) => status < 500,
        });

        if (response.status === 429) {
          throw new Error('429');
        }

        if (response.status >= 400) {
          throw new Error(`Status ${response.status}`);
        }

        const $ = cheerio.load(response.data);
        const metadata = {
          title: $('meta[property="og:title"]').attr('content') || $('title').text() || url,
          description: $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '',
          image: $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content') || '',
          siteName: $('meta[property="og:site_name"]').attr('content') || new URL(url).hostname,
          url: url,
        };

        // Store in cache
        unfurlCache.set(url, { data: metadata, timestamp: Date.now() });
        return metadata;
      } catch (error: any) {
        // Return a fallback object so we don't keep retrying failed URLs immediately
        const fallback = { url, title: url, description: 'Link Preview' };
        unfurlCache.set(url, { data: fallback, timestamp: Date.now() });
        throw error;
      } finally {
        // Remove from pending map
        pendingUnfurls.delete(url);
      }
    })();

    pendingUnfurls.set(url, unfurlPromise);

    try {
      const data = await unfurlPromise;
      res.json(data);
    } catch (error: any) {
      if (error.message === '429') {
        return res.status(429).json({ 
          error: 'Too many requests to this domain. Please try again later.',
          url: url,
          title: url
        });
      }
      res.status(500).json({ 
        error: 'Failed to unfurl URL',
        url: url,
        title: url
      });
    }
  });

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
