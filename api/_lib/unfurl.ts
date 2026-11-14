/**
 * Shared link-preview logic for `/api/unfurl`, served by the single Vercel function
 * (api/_lib/apiApp.ts) and by server.ts in local development.
 *
 * Sites that hide their metadata from crawlers (YouTube, X, TikTok, Vimeo) are read through their
 * public oEmbed endpoints. Everything else is fetched directly: redirects are followed by hand so
 * every hop is checked against private addresses, and only the start of the page is downloaded.
 */
import * as cheerio from 'cheerio';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface LinkMetadata {
  url: string;
  title: string;
  description: string;
  image: string;
  siteName: string;
}

const USER_AGENT = 'Mozilla/5.0 (compatible; KithBot/1.0; +https://kith.app) facebookexternalhit/1.1';
const TIMEOUT_MS = 6000;
const MAX_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 4;

const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });

// ---------------------------------------------------------------- SSRF protection

const PRIVATE_HOST = /^(localhost|metadata\.google\.internal|.*\.local|.*\.internal)$/i;

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::') return true;
    if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return true;
    const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateIp(mapped[1]) : false;
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/** Only public http(s) URLs may be fetched. Synchronous check; see `assertPublic` for DNS. */
export function validateUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (PRIVATE_HOST.test(host)) return null;
    if (isIP(host) && isPrivateIp(host)) return null;
    if (url.port && !['80', '443'].includes(url.port)) return null;
    return url;
  } catch {
    return null;
  }
}

/** Resolves the hostname and rejects it if any address is private (blocks DNS tricks). */
async function assertPublic(url: URL) {
  if (!validateUrl(url.href)) throw httpError('Blocked address', 400);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return;
  const addresses = await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw httpError('Unknown host', 502);
  if (addresses.some(a => isPrivateIp(a.address))) throw httpError('Blocked address', 400);
}

async function safeFetch(start: URL, accept: string): Promise<{ res: Response; url: URL }> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': USER_AGENT, Accept: accept, 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url);
      continue;
    }
    return { res, url };
  }
  throw httpError('Too many redirects', 502);
}

/** Reads the body up to MAX_BYTES, stopping early once </head> has arrived. */
async function readHead(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let html = '';
  let bytes = 0;
  while (bytes < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    html += decoder.decode(value, { stream: true });
    if (/<\/head>/i.test(html)) break;
  }
  reader.cancel().catch(() => undefined);
  return html;
}

// ---------------------------------------------------------------- oEmbed providers

interface OEmbed {
  title?: string;
  author_name?: string;
  provider_name?: string;
  thumbnail_url?: string;
  html?: string;
}

const OEMBED: { match: RegExp; endpoint: (u: string) => string }[] = [
  { match: /(^|\.)(youtube\.com|youtu\.be)$/i, endpoint: u => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u)}` },
  { match: /(^|\.)(x\.com|twitter\.com)$/i, endpoint: u => `https://publish.twitter.com/oembed?omit_script=1&url=${encodeURIComponent(u)}` },
  { match: /(^|\.)tiktok\.com$/i, endpoint: u => `https://www.tiktok.com/oembed?url=${encodeURIComponent(u)}` },
  { match: /(^|\.)vimeo\.com$/i, endpoint: u => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(u)}` },
];

async function fromOEmbed(url: URL): Promise<LinkMetadata | null> {
  const provider = OEMBED.find(p => p.match.test(url.hostname));
  if (!provider) return null;
  const res = await fetch(provider.endpoint(url.href), {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null);
  if (!res?.ok) return null;
  const data = (await res.json().catch(() => null)) as OEmbed | null;
  if (!data) return null;

  const isX = /x\.com|twitter\.com/i.test(url.hostname);
  // X returns the post as HTML; its first paragraph is the text.
  const postText = isX && data.html ? cheerio.load(data.html)('p').first().text().trim() : '';
  const site = isX ? 'X' : data.provider_name || url.hostname.replace(/^www\./, '');

  return {
    url: url.href,
    title: (isX ? `${data.author_name ?? 'Post'} on X` : data.title || data.author_name || '').slice(0, 300),
    description: (isX ? postText : data.author_name ? `${data.author_name} · ${site}` : '').slice(0, 500),
    image: youtubeThumb(url) || data.thumbnail_url || '',
    siteName: site,
  };
}

/** Higher-resolution YouTube thumbnail than oEmbed's default. */
function youtubeThumb(url: URL): string {
  if (!/(youtube\.com|youtu\.be)$/i.test(url.hostname)) return '';
  const id = url.hostname.includes('youtu.be') ? url.pathname.slice(1) : url.searchParams.get('v') || url.pathname.match(/\/(shorts|embed|live)\/([\w-]+)/)?.[2];
  return id && /^[\w-]{6,}$/.test(id) ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '';
}

// ---------------------------------------------------------------- HTML metadata

/** Resolves relative og:image paths ("/img.png", "//cdn...") against the page URL. */
const absolute = (value: string | undefined, base: URL) => {
  if (!value) return '';
  try {
    const u = new URL(value.trim(), base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
};

export async function fetchMetadata(url: URL): Promise<LinkMetadata> {
  const embedded = await fromOEmbed(url);
  if (embedded?.title) return embedded;

  const { res, url: finalUrl } = await safeFetch(url, 'text/html,application/xhtml+xml');
  if (res.status === 429) throw httpError('Rate limited', 429);
  if (res.status >= 400) throw httpError(`Status ${res.status}`, 502);
  const type = res.headers.get('content-type') || '';

  // Direct links to images get the image itself as the preview.
  if (type.startsWith('image/')) {
    res.body?.cancel().catch(() => undefined);
    return { url: url.href, title: decodeURIComponent(finalUrl.pathname.split('/').pop() || finalUrl.hostname), description: '', image: finalUrl.href, siteName: finalUrl.hostname.replace(/^www\./, '') };
  }
  if (!type.includes('html')) {
    res.body?.cancel().catch(() => undefined);
    throw httpError('Not a web page', 502);
  }

  const $ = cheerio.load(await readHead(res));
  const meta = (...selectors: string[]) => {
    for (const s of selectors) {
      const v = $(s).attr('content')?.trim();
      if (v) return v;
    }
    return '';
  };

  return {
    url: url.href,
    title: (meta('meta[property="og:title"]', 'meta[name="twitter:title"]') || $('title').first().text()).replace(/\s+/g, ' ').trim().slice(0, 300),
    description: meta('meta[property="og:description"]', 'meta[name="twitter:description"]', 'meta[name="description"]').replace(/\s+/g, ' ').slice(0, 500),
    image: absolute(meta('meta[property="og:image"]', 'meta[property="og:image:url"]', 'meta[name="twitter:image"]', 'meta[name="twitter:image:src"]'), finalUrl),
    siteName: meta('meta[property="og:site_name"]') || finalUrl.hostname.replace(/^www\./, ''),
  };
}
