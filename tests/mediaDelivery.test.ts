import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FeedImage from '../src/components/media/FeedImage';
import PostMedia from '../src/components/post/PostMedia';
import {
  buildFeedImageSources,
  feedImageAspectRatio,
  publicStorageUrl,
  selectFeedVariant,
  supabaseImageTransformsEnabled,
  supabaseTransformUrl,
} from '../src/lib/media/delivery';
import type { FeedMediaVariants } from '../src/lib/media/types';

const MEDIA_ID = '123e4567-e89b-42d3-a456-426614174000';
const path = (name: string) => `user-1/feed-media/${MEDIA_ID}/variants/${name}.webp`;

const variants: FeedMediaVariants = {
  thumbnail: { path: path('thumbnail'), width: 320, height: 160, bytes: 200, mimeType: 'image/webp' },
  'feed-640': { path: path('feed-640'), width: 640, height: 320, bytes: 400, mimeType: 'image/webp' },
  'feed-960': { path: path('feed-960'), width: 960, height: 480, bytes: 800, mimeType: 'image/webp' },
  'feed-1600': { path: path('feed-1600'), width: 1600, height: 800, bytes: 1600, mimeType: 'image/webp' },
};

const image = {
  type: 'image' as const,
  url: 'https://demo.supabase.co/storage/v1/object/public/posts/user-1/original.jpg',
  path: `user-1/feed-media/${MEDIA_ID}/original.jpg`,
  mediaId: MEDIA_ID,
  width: 2000,
  height: 1000,
  aspectRatio: 2,
  status: 'ready' as const,
  variants,
  placeholder: 'data:image/webp;base64,AAAA',
};

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://demo.supabase.co');
  vi.stubEnv('VITE_SUPABASE_IMAGE_TRANSFORMATIONS', 'false');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('responsive feed delivery', () => {
  it('selects the smallest variant that covers the rendered width and DPR', () => {
    expect(selectFeedVariant(variants, 500, 1)?.name).toBe('feed-640');
    expect(selectFeedVariant(variants, 500, 2)?.name).toBe('feed-1600');
    expect(selectFeedVariant(variants, 1200, 1)?.name).toBe('feed-1600');
    expect(selectFeedVariant(variants, 2000, 2)?.name).toBe('feed-1600');
    expect(selectFeedVariant({}, 500, 1)).toBeNull();
  });

  it('builds a width-descriptor srcset from stored paths, with the original as last fallback', () => {
    const sources = buildFeedImageSources(image, { cssWidth: 640, sizes: '640px' });
    expect(sources.usesVariant).toBe(true);
    expect(sources.src).toBe(publicStorageUrl('posts', path('feed-640')));
    expect(sources.srcSet).toContain(`${publicStorageUrl('posts', path('thumbnail'))} 320w`);
    expect(sources.srcSet).toContain(`${publicStorageUrl('posts', path('feed-1600'))} 1600w`);
    expect(sources.fallbacks[sources.fallbacks.length - 1]).toBe(image.url);
    expect(sources.width).toBe(640);
    expect(sources.height).toBe(320);
  });

  it('falls back to the original for legacy media and when transforms are unavailable', () => {
    const legacy = { type: 'image' as const, url: image.url };
    const sources = buildFeedImageSources(legacy, { cssWidth: 640, sizes: '640px' });
    expect(sources).toMatchObject({ src: image.url, usesVariant: false, srcSet: undefined });
    expect(feedImageAspectRatio(legacy)).toBeCloseTo(16 / 9);
  });

  it('uses dynamic Supabase transforms only when explicitly enabled', () => {
    expect(supabaseImageTransformsEnabled()).toBe(false);
    expect(buildFeedImageSources({ ...image, variants: {} }, {
      cssWidth: 400,
      sizes: '400px',
      allowTransforms: true,
    }).srcSet).toBeUndefined();

    vi.stubEnv('VITE_SUPABASE_IMAGE_TRANSFORMATIONS', 'true');
    expect(supabaseImageTransformsEnabled()).toBe(true);
    const sources = buildFeedImageSources(
      { ...image, variants: {} },
      { cssWidth: 400, sizes: '400px', allowTransforms: true, dpr: 2 },
    );
    expect(sources.srcSet).toContain(`${supabaseTransformUrl(image.path, 320)} 320w`);
    expect(sources.src).toBe(supabaseTransformUrl(image.path, 800));
  });
});

describe('FeedImage', () => {
  it('renders responsive attributes, reserved dimensions and lazy loading', () => {
    const markup = renderToStaticMarkup(
      createElement(FeedImage, {
        image,
        cssWidth: 640,
        sizes: '(max-width: 700px) calc(100vw - 28px), 640px',
        alt: 'A landscape photo',
      }),
    );
    expect(markup).toMatch(/src[Ss]et=/);
    expect(markup).toContain(' 320w');
    expect(markup).toContain(' 1600w');
    expect(markup).toContain('sizes="(max-width: 700px) calc(100vw - 28px), 640px"');
    expect(markup).toContain('width="640"');
    expect(markup).toContain('height="320"');
    expect(markup).toContain('alt="A landscape photo"');
    expect(markup).toContain('loading="lazy"');
    expect(markup).toContain('background-image');
  });

  it('loads priority images eagerly and keeps legacy URLs renderable', () => {
    const markup = renderToStaticMarkup(
      createElement(FeedImage, {
        image,
        cssWidth: 640,
        sizes: '640px',
        priority: true,
      }),
    );
    expect(markup).toContain('loading="eager"');
    expect(markup).toMatch(/fetchPriority="high"/i);

    const legacy = renderToStaticMarkup(
      createElement(FeedImage, {
        image: { type: 'image', url: image.url },
        cssWidth: 640,
        sizes: '640px',
      }),
    );
    expect(legacy).toContain(`src="${image.url}"`);
    expect(legacy).not.toMatch(/src[Ss]et=/);
    expect(legacy).toContain('aspect-ratio');
  });

  it('fills the post width for single images and videos instead of letterboxing them', () => {
    const single = renderToStaticMarkup(
      createElement(PostMedia, {
        media: [image],
        active: false,
        onOpenImage: () => undefined,
      }),
    );
    expect(single).toContain('w-full');
    expect(single).toContain('aspect-ratio');
    expect(single).not.toContain('max-h-[560px]');

    const video = renderToStaticMarkup(
      createElement(PostMedia, {
        media: [{ type: 'video', url: 'https://cdn.example.com/clip.mp4' }],
        active: false,
        onOpenImage: () => undefined,
      }),
    );
    expect(video).toContain('<video');
    expect(video).toContain('w-full');
    expect(video).toContain('object-contain');
    expect(video).toContain('aspect-ratio');
    expect(video).not.toContain('max-h-[560px]');
  });

  it('renders multi-image galleries in attachment order', () => {
    const secondId = '123e4567-e89b-42d3-a456-426614174001';
    const secondPath = (name: string) => `user-1/feed-media/${secondId}/variants/${name}.webp`;
    const second = {
      ...image,
      mediaId: secondId,
      url: image.url.replace(MEDIA_ID, secondId),
      variants: Object.fromEntries(
        Object.entries(variants).map(([name, variant]) => [
          name,
          { ...variant!, path: secondPath(name) },
        ]),
      ),
    };

    const markup = renderToStaticMarkup(
      createElement(PostMedia, {
        media: [image, second],
        active: false,
        onOpenImage: () => undefined,
      }),
    );
    expect(markup.match(/<img/g)).toHaveLength(2);
    expect(markup.indexOf(path('thumbnail'))).toBeLessThan(markup.indexOf(secondPath('thumbnail')));
    expect(markup).toContain('aspect-[16/9]');
  });
});
