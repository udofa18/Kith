import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Globe, Play } from 'lucide-react';

interface LinkMetadata {
  url: string;
  title: string;
  description: string;
  image: string;
  siteName: string;
}

const URL_RE = /(https?:\/\/[^\s<>"')\]]+)/;

/** First http(s) URL in a post, or null. */
export function firstUrl(text: string): string | null {
  return text.match(URL_RE)?.[1]?.replace(/[.,!?;:]+$/, '') ?? null;
}

/**
 * Preview card for the first link in a post or message. Fetched once per URL and shared across
 * cards; renders nothing while loading and a plain domain card if the page has no usable metadata.
 */
export default function LinkPreview({ url, enabled, compact = false }: { url: string; enabled: boolean; compact?: boolean }) {
  const [imageBroken, setImageBroken] = useState(false);
  const [playing, setPlaying] = useState(false);
  const videoId = compact ? null : youtubeId(url);
  const { data, status } = useQuery({
    queryKey: ['link-preview', url],
    enabled,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60,
    retry: false,
    queryFn: async (): Promise<LinkMetadata | null> => {
      const res = await fetch(`/api/unfurl?url=${encodeURIComponent(url)}`);
      return res.ok ? res.json() : null;
    },
  });

  const domain = (() => {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return data?.siteName || url; }
  })();

  if (!data || !data.title || data.title === url) {
    // The site gave us nothing usable: show a small card so the link still looks intentional.
    if (status === 'pending') return null;
    let path = '';
    try { const u = new URL(url); path = (u.pathname + u.search).replace(/\/$/, ''); } catch { /* keep empty */ }
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        onClick={e => e.stopPropagation()}
        className="mt-3 flex items-center gap-3 px-3 py-2.5 rounded-2xl border border-black/10 dark:border-white/10 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
      >
        <span className="w-9 h-9 shrink-0 rounded-xl bg-black/5 dark:bg-white/5 flex items-center justify-center"><Globe size={17} className="text-black/40 dark:text-white/40" /></span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold truncate">{domain}</span>
          {path.length > 1 && <span className="block text-xs text-black/50 dark:text-white/50 truncate">{path}</span>}
        </span>
      </a>
    );
  }
  const showImage = !!data.image && !imageBroken;

  // Small or text-only previews use a compact row; pages with an image get a large card.
  if (compact || !showImage) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        onClick={e => e.stopPropagation()}
        className="mt-3 flex items-stretch rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
      >
        <div className="w-24 shrink-0 bg-black/5 dark:bg-white/5 flex items-center justify-center">
          {showImage ? (
            <img src={data.image} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={() => setImageBroken(true)} />
          ) : (
            <Globe size={22} className="text-black/30 dark:text-white/30" />
          )}
        </div>
        <div className="min-w-0 flex-1 px-3 py-2.5">
          <p className="text-xs text-black/50 dark:text-white/50 truncate">{domain}</p>
          <p className="text-sm font-semibold leading-snug line-clamp-2">{data.title}</p>
          {data.description && <p className="text-xs text-black/50 dark:text-white/50 line-clamp-1 mt-0.5">{data.description}</p>}
        </div>
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={e => e.stopPropagation()}
      className="mt-3 block rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
    >
      {playing && videoId ? (
        <div className="aspect-video bg-black" onClick={e => e.preventDefault()}>
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
            title={data.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="w-full h-full"
          />
        </div>
      ) : (
        <div className={`relative ${videoId ? 'aspect-video' : 'aspect-[1.91/1]'} bg-black/5 dark:bg-white/5 overflow-hidden`}>
          <img src={data.image} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={() => setImageBroken(true)} />
          {videoId && (
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); setPlaying(true); }}
              aria-label="Play video"
              className="absolute inset-0 flex items-center justify-center bg-black/10 hover:bg-black/20 transition-colors"
            >
              <span className="w-14 h-14 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center" style={{ color: '#fff' }}>
                <Play size={24} fill="currentColor" className="ml-1" />
              </span>
            </button>
          )}
        </div>
      )}
      <div className="px-4 py-3 border-t border-black/10 dark:border-white/10">
        <p className="text-xs text-black/50 dark:text-white/50 truncate">{domain}</p>
        <p className="text-[15px] font-semibold leading-snug line-clamp-2">{data.title}</p>
        {data.description && <p className="text-sm text-black/60 dark:text-white/60 line-clamp-2 mt-0.5">{data.description}</p>}
      </div>
    </a>
  );
}

/** YouTube video id from watch, youtu.be, shorts or embed links. */
function youtubeId(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^(www|m)\./, '');
    const id = host === 'youtu.be' ? u.pathname.slice(1)
      : host === 'youtube.com' ? u.searchParams.get('v') || u.pathname.match(/\/(shorts|embed|live)\/([\w-]+)/)?.[2]
        : null;
    return id && /^[\w-]{6,}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
