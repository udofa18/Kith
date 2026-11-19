import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  MediaError,
  inspectFeedImage,
  processFeedImageBuffer,
} from '../api/_lib/media/processor';
import { FEED_MEDIA_LIMITS } from '../src/lib/media/config';

const animatedGif = readFileSync(new URL('./fixtures/animated.gif', import.meta.url));

let jpeg: Buffer;
let portrait: Buffer;
let square: Buffer;
let tall: Buffer;
let wide: Buffer;
let transparentPng: Buffer;
let webp: Buffer;
let exifRotated: Buffer;

const createImage = (width: number, height: number, channels: 3 | 4 = 3) =>
  sharp({
    create: {
      width,
      height,
      channels,
      background: channels === 4 ? { r: 30, g: 120, b: 220, alpha: 0.45 } : { r: 30, g: 120, b: 220 },
    },
  });

beforeAll(async () => {
  jpeg = await createImage(2000, 1000).jpeg({ quality: 90 }).toBuffer();
  portrait = await createImage(800, 1600).jpeg().toBuffer();
  square = await createImage(1000, 1000).jpeg().toBuffer();
  tall = await createImage(400, 4000).jpeg().toBuffer();
  wide = await createImage(4000, 400).jpeg().toBuffer();
  transparentPng = await createImage(500, 400, 4).png().toBuffer();
  webp = await createImage(1200, 900).webp().toBuffer();
  exifRotated = await createImage(800, 600)
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
});

describe('feed image processor', () => {
  it('generates the four photographic variants with correct dimensions', async () => {
    const result = await processFeedImageBuffer(jpeg, 'image/jpeg');
    expect(result.info).toMatchObject({
      format: 'jpeg',
      mimeType: 'image/jpeg',
      width: 2000,
      height: 1000,
      hasAlpha: false,
      isAnimated: false,
    });
    expect(result.variants.map(({ name, width, height }) => [name, width, height])).toEqual([
      ['thumbnail', 320, 160],
      ['feed-640', 640, 320],
      ['feed-960', 960, 480],
      ['feed-1600', 1600, 800],
    ]);
    for (const variant of result.variants) {
      expect(variant.mimeType).toBe('image/webp');
      expect(variant.bytes).toBeGreaterThan(0);
      expect(variant.width / variant.height).toBeCloseTo(2, 4);
    }
    expect(result.placeholder).toMatch(/^data:image\/webp;base64,/);
  });

  it('never upscales small images and skips unnecessary larger variants', async () => {
    const small = await createImage(200, 150).png().toBuffer();
    const smallResult = await processFeedImageBuffer(small, 'image/png');
    expect(smallResult.variants).toEqual([]);

    const medium = await createImage(500, 400).jpeg().toBuffer();
    const mediumResult = await processFeedImageBuffer(medium, 'image/jpeg');
    expect(mediumResult.variants.map((v) => v.name)).toEqual(['thumbnail']);
    expect(mediumResult.variants[0].width).toBe(320);
    expect(mediumResult.variants[0].height).toBe(256);
  });

  it('preserves aspect ratio for portrait, landscape, square, tall and wide images', async () => {
    const cases: Array<[Buffer, number, string]> = [
      [portrait, 800 / 1600, 'image/jpeg'],
      [jpeg, 2, 'image/jpeg'],
      [square, 1, 'image/jpeg'],
      [tall, 400 / 4000, 'image/jpeg'],
      [wide, 10, 'image/jpeg'],
    ];
    for (const [buffer, ratio, mime] of cases) {
      const result = await processFeedImageBuffer(buffer, mime);
      for (const variant of result.variants) {
        expect(variant.width / variant.height).toBeCloseTo(ratio, 2);
        expect(variant.width).toBeLessThanOrEqual(1600);
        expect(variant.height).toBeLessThanOrEqual(1600);
      }
    }

    const tallResult = await processFeedImageBuffer(tall);
    expect(tallResult.variants.map((v) => [v.width, v.height])).toEqual([
      [32, 320],
      [64, 640],
      [96, 960],
      [160, 1600],
    ]);
  });

  it('corrects EXIF orientation and strips metadata', async () => {
    const result = await processFeedImageBuffer(exifRotated, 'image/jpeg');
    expect(result.info.width).toBe(600);
    expect(result.info.height).toBe(800);
    expect(result.variants[0]).toMatchObject({ width: 240, height: 320 });

    const output = await sharp(result.variants[0].buffer).metadata();
    expect(output.width).toBe(240);
    expect(output.height).toBe(320);
    expect(output.orientation).toBeUndefined();
    expect(output.exif).toBeUndefined();
  });

  it('preserves transparency in PNG and WebP inputs', async () => {
    for (const [buffer, mime] of [
      [transparentPng, 'image/png'],
      [webp, 'image/webp'],
    ] as const) {
      const result = await processFeedImageBuffer(buffer, mime);
      expect(result.info.hasAlpha).toBe(buffer === transparentPng);
      const output = await sharp(result.variants[0].buffer).metadata();
      if (buffer === transparentPng) expect(output.hasAlpha).toBe(true);
      expect(output.width).toBe(result.variants[0].width);
    }
  });

  it('keeps animated GIFs as animated originals instead of flattening them', async () => {
    const before = Buffer.from(animatedGif);
    const result = await processFeedImageBuffer(animatedGif, 'image/gif');
    expect(result.info).toMatchObject({ format: 'gif', isAnimated: true, width: 64, height: 64 });
    expect(result.variants).toEqual([]);
    // The source buffer is not mutated; the original remains the source of truth.
    expect(animatedGif.equals(before)).toBe(true);
    const source = await sharp(animatedGif, { animated: true }).metadata();
    expect(source.pages).toBe(2);
  });

  it('rejects corrupted, unsupported, oversized and out-of-range files', async () => {
    await expect(inspectFeedImage(Buffer.from('definitely not an image'))).rejects.toMatchObject({
      code: 'invalid_image',
    });

    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="red"/></svg>',
    );
    await expect(inspectFeedImage(svg, 'image/svg+xml')).rejects.toMatchObject({
      code: 'unsupported_format',
    });

    const svgWithoutDeclaration = await inspectFeedImage(svg).catch((error) => error);
    expect(svgWithoutDeclaration).toBeInstanceOf(MediaError);
    expect(svgWithoutDeclaration.code).toBe('unsupported_format');

    await expect(
      inspectFeedImage(Buffer.alloc(FEED_MEDIA_LIMITS.maxImageBytes + 1)),
    ).rejects.toMatchObject({ code: 'file_too_large', status: 413 });

    const tiny = await createImage(16, 16).png().toBuffer();
    await expect(inspectFeedImage(tiny, 'image/png')).rejects.toMatchObject({
      code: 'dimensions_too_small',
    });

    const tooWide = await createImage(12_001, 32).png().toBuffer();
    await expect(inspectFeedImage(tooWide, 'image/png')).rejects.toMatchObject({
      code: 'dimensions_too_large',
    });
  });

  it('rejects a MIME declaration that does not match the decoded bytes', async () => {
    await expect(inspectFeedImage(jpeg, 'image/png')).rejects.toMatchObject({
      code: 'mime_mismatch',
    });
  });
});
