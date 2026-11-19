# Feed image pipeline

This document describes the hybrid image pipeline used by the social feed: uploads are
validated and processed with Sharp, responsive WebP variants are pre-generated, processing
state is recorded in Supabase Postgres, and the feed renders the variants with native
responsive images.

It was added without changing the app's architecture, database provider, authentication,
RLS, feed behaviour or historical post URLs.

## Architecture at a glance

| Concern | Existing system (reused) | Pipeline addition |
| --- | --- | --- |
| UI | Vite + React 19 | `FeedImage`, media-aware `PostMedia`, composer progress UI |
| API | Express app in `api/_lib/apiApp.ts` behind Vercel functions | `/api/media/feed/*` routes |
| Posts | Firestore `posts` collection | Existing `media` array kept; optional image metadata added to each item |
| Images | Public Supabase Storage bucket `posts` | `posts/<uid>/feed-media/<mediaId>/…` inside the same bucket |
| Metadata | Supabase Postgres mirror | New `feed_media` table (written only by the service role) |
| Auth | Firebase Auth ID tokens, Firebase Admin on the server | Same token verification and post-ownership check |

Firestore remains the source of truth for posts. The `feed_media` table is the canonical
record for processing status and variant paths. It deliberately has no foreign keys because
the Supabase mirror can lag a Firestore post/user write.

The posts bucket is public today, so `feed_media` stores relative storage paths rather than
public URLs. The client derives URLs, which keeps the rows portable and avoids storing
environment-specific hosts.

## Upload flow

1. The composer validates the selection before uploading:
   - accepted types: JPEG, PNG, WebP, GIF, AVIF;
   - at most 4 images per post;
   - at most 10 MB per image and 30 MB of images per post;
   - at least 32 × 32 and at most 12,000 × 12,000 pixels.
2. The browser uploads the untouched original to
   `posts/<uid>/feed-media/<mediaId>/original.<ext>` with a one-year immutable cache header.
   Storage RLS keeps the existing `posts/<uid>/…` ownership rule.
3. The browser calls `POST /api/media/feed/process` with the media id, path and declared MIME
   type. The server verifies the Firebase ID token and checks that the path matches the
   caller's uid and media id.
4. The server downloads the original and validates the decoded bytes (not just the
   declaration), then creates/updates its `feed_media` row and generates variants.
5. While publishing, the post is created in Firestore with the same `media` array shape as
   before. New optional fields carry `mediaId`, dimensions, aspect ratio, status, variants and
   the placeholder.
6. After the post exists, the client best-effort calls `POST /api/media/feed/attach`. The
   server checks post ownership in Firestore and sets `post_id` on the media rows.

Uploading the original directly to Storage avoids proxying large files through a serverless
function. Only the original's bytes are downloaded by the function for processing.

## Files

### Added

| Path | Purpose |
| --- | --- |
| `src/lib/media/config.ts` | Central limits, variants, MIME mappings, storage paths, id/path guards |
| `src/lib/media/types.ts` | Shared record and post-media types |
| `src/lib/media/validate.ts` | Browser-side per-file, dimension and batch validation |
| `src/lib/media/client.ts` | Upload, process, retry and attach client calls |
| `src/lib/media/delivery.ts` | Variant selection, `src`/`srcSet` construction, URL helpers |
| `src/components/media/FeedImage.tsx` | Responsive `<img>` with lazy loading, placeholder, fallback chain |
| `api/_lib/media/processor.ts` | Sharp validation, orientation handling, variants and placeholder |
| `api/_lib/media/service.ts` | Idempotent orchestration, retry, attach and cleanup |
| `api/_lib/media/repository.ts` | Supabase `feed_media` repository |
| `api/_lib/media/storage.ts` | Service-role Storage adapter |
| `api/_lib/media/handlers.ts` | Authenticated HTTP handlers |
| `api/_lib/media/types.ts` | Server-side repository/storage interfaces |
| `api/media/feed/[action].ts` | Vercel entrypoint for the nested media routes |
| `supabase/migrations/20261119000000_feed_media.sql` | Table, indexes, trigger and RLS |
| `tests/mediaValidation.test.ts` | Limits and batch validation |
| `tests/mediaProcessor.test.ts` | Sharp validation, variants, alpha, animation, metadata, corruption |
| `tests/mediaDelivery.test.ts` | Variant ordering/selection, `srcSet`, legacy fallbacks, SSR rendering |
| `tests/mediaService.test.ts` | Idempotency, retry, attach, cleanup and concurrent processing |
| `tests/fixtures/animated.gif` | Animated-GIF fixture |

### Modified

| Path | Change |
| --- | --- |
| `api/_lib/apiApp.ts` | Mounts the five media routes; cleanup uses the existing `CRON_SECRET` guard |
| `src/components/PostEditor.tsx` | Batch validation, uploading/optimizing overlays, image pipeline, attach call |
| `src/components/PostCard.tsx` | Uses the live media array, retry handler for authors, `priority` passthrough |
| `src/components/post/PostMedia.tsx` | Responsive `FeedImage` tiles, retry overlay, broken-image handling |
| `src/features/feed/components/FeedList.tsx` | Loads the first two feed posts eagerly |
| `src/pages/PostDetails.tsx` | Loads the detail image eagerly |
| `src/lib/storage.ts` | Optional `cacheControl` on uploads |
| `src/types/database.ts` | `feed_media` table types |
| `vercel.json` | Daily cleanup cron at 04:30 UTC |
| `.env.example` | Transformation flag and cron secret documentation |
| `package.json` / lockfile | `sharp@^0.35.5` |

## Database migration

Apply the migration **before deploying the API routes**:

```bash
supabase db push
```

Or run `supabase/migrations/20261119000000_feed_media.sql` in the Supabase SQL editor. Without
it, the process endpoint returns 500 because the table does not exist.

The migration is additive and safe to re-run (`CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF
EXISTS`, `CREATE OR REPLACE FUNCTION`).

### `feed_media`

| Column | Notes |
| --- | --- |
| `id` | UUID generated by the browser, also the storage folder name |
| `user_id` | Firebase uid; text because users live in Firebase |
| `post_id` | Firestore post id, null until attached |
| `bucket`, `original_path` | Storage location of the untouched original |
| `mime_type`, `original_bytes`, `format` | Decoded file facts, not the declaration |
| `width`, `height`, `aspect_ratio` | Display dimensions after EXIF orientation |
| `has_alpha`, `is_animated` | Drive lossless variants and animation preservation |
| `status` | `pending`, `processing`, `ready` or `failed` |
| `variants` | JSON map of variant name → `{ path, width, height, bytes, mimeType }` |
| `placeholder` | Blurred 32 px WebP data URI, or null |
| `error_message`, `attempt_count` | Diagnostics and retry bookkeeping |
| `created_at`, `updated_at` | `updated_at` maintained by a trigger |

Indexes cover `(user_id, created_at)`, `(status, updated_at)` and `post_id`.

RLS is enabled. There is one `SELECT` policy for authenticated owners
(`user_id = public.current_uid()::text`). There are no INSERT/UPDATE/DELETE policies: all
writes go through server endpoints using the service role, so a browser cannot forge status,
variant paths, or another user's media.

## Storage layout

```
posts/
  <uid>/
    feed-media/
      <mediaId>/
        original.jpg          # untouched source of truth
        variants/
          thumbnail.webp
          feed-640.webp
          feed-960.webp
          feed-1600.webp
```

All paths are deterministic and overwrite-safe (`upsert`). The media id is random, so the
path is immutable. Historical files under `posts/<uid>/<timestamp>_<name>` are untouched and
keep rendering as legacy images.

Variant and original uploads use `Cache-Control: 31536000, immutable`. Legacy uploads keep
the previous one-hour cache.

## Validation

Browser checks catch obvious mistakes before any upload; the server repeats every check
against the real bytes because a declared MIME type or extension can lie.

| Rule | Behaviour |
| --- | --- |
| Empty file | Rejected |
| Larger than 10 MB | Rejected (413) |
| Declared type not JPEG/PNG/WebP/GIF/AVIF | Rejected; SVG is deliberately excluded |
| Decoded format differs from declaration | Rejected (`mime_mismatch`) |
| Truncated or malformed file | Rejected (`invalid_image`) via `failOn: 'error'` |
| Width or height < 32 px | Rejected |
| Width or height > 12,000 px | Rejected; `limitInputPixels` also bounds decode work |
| EXIF orientation 5–8 | Dimensions swapped for display and pixels rotated |
| EXIF/GPS/other metadata | Stripped (the pipeline never calls `withMetadata()`) |
| Transparency | Variants are lossless WebP so alpha is preserved |
| Animated GIF/WebP | Detected as animated; **no variants are generated**, the original is served |
| Colour space | Converted to sRGB |

A rejected file never creates a `feed_media` row. If the process request is rejected, the
client deletes the just-uploaded original.

## Variants

| Name | Bounds | Quality | Used for |
| --- | --- | --- | --- |
| `thumbnail` | 320 × 320 | 72 | Grid tiles, small screens |
| `feed-640` | 640 × 640 | 78 | Single-column feed on phones |
| `feed-960` | 960 × 960 | 80 | Larger phone/tablet displays |
| `feed-1600` | 1600 × 1600 | 82 | High-DPI and desktop |

All variants are WebP, resized with `fit: 'inside'`, `withoutEnlargement: true` and a Lanczos3
kernel. Images are never cropped or stretched; the feed uses the stored aspect ratio and
`object-contain`/`object-cover` only for layout.

`planFeedVariants` skips variants at or below the source dimensions, so a 400 px image does
not produce a 640 px upscale. If every planned variant would be skipped, the response returns
the original and `variants: {}`.

Transparent images are encoded with `lossless: true`. Opaque photos use the quality table
above with `alphaQuality: 100` and `smartSubsample`.

A 32 × 32 blurred WebP data URI is stored as the loading placeholder. Placeholder generation
is best-effort and never fails the request.

## Processing and idempotency

- The original is never modified or deleted during processing.
- The media id determines the row and storage folder, so retries reuse the same paths.
- A `ready` row is returned immediately; the original is not downloaded again.
- A concurrent request for the same media id is deduplicated in-process (`inFlight` map).
  The DB status stops later requests once a run is `processing` (a `processing` row newer
  than 5 minutes is treated as in-flight). Two requests that cross instances at exactly the
  same moment can repeat the work, but they write the same deterministic paths, so the
  stored result is identical.
- Processing is limited to **2 concurrent Sharp jobs per function instance**.
- A `pending`/stale `processing`/`failed` row is retried with the stored path; the client
  cannot inject a new path.
- Failures after a row exists set `status = 'failed'` and keep the original, so retry does
  not require re-uploading. The error is truncated to 500 characters.
- `attempt_count` increments on each processing attempt.
- Variant uploads use `upsert: true`, so a partial previous attempt can be overwritten
  safely.

## Delivery

`buildFeedImageSources` derives URLs from stored paths and returns:

- `src`: the closest generated variant for the expected CSS width and device pixel ratio;
- `srcSet`: every existing variant with its intrinsic width;
- intrinsic `width`/`height` and `aspectRatio` to reserve layout space and avoid shifts;
- a fallback list: remaining variants, then the original.

Layout follows X's feed behaviour: a single image fills the post width at its natural
aspect ratio (square stays square, portrait stays tall and uncropped). Legacy posts without
stored dimensions use a temporary 16:9 box while loading, then switch to the real ratio once
the browser has them, so they never get stuck letterboxed. Single videos reserve 16:9 until
metadata arrives and then use the video's own ratio inside a black, `object-contain` player.
Two-to-four image galleries still crop into the tiled grid, as X does.

`FeedImage` renders a native `<img>` with `sizes`, `loading="lazy"` (or eager +
`fetchPriority="high"` for above-the-fold posts), `decoding="async"`, the placeholder as a
background, and an error chain that walks through variants and finally the original. If every
candidate fails it calls the gallery's `onError`, which shows the quiet broken-image
placeholder. The image is clickable to open the untouched original at full resolution.

Supabase Image Transformations are **off by default**. Setting
`VITE_SUPABASE_IMAGE_TRANSFORMATIONS=true` adds dynamic transform candidates for legacy or
uncommon sizes, but pre-generated variants are always preferred and nothing depends on the
feature. If transforms are unavailable, the code falls back to generated variants or the
original.

Historical posts with `{ type, url }` only take the legacy path and render normally. The
1/2/3/4-tile gallery layouts, "+N" overflow, video behaviour and detail view are unchanged.

## Retry

The post author sees a "Retry optimization" control on images whose recorded status is
`failed`. It calls `POST /api/media/feed/retry` with the media id only.

The server verifies ownership, loads the stored original path, re-runs validation and
variant generation, updates the row, and returns the new record. The client then merges the
new variants into the post's existing `media` array and updates the Firestore post so the
change persists for all readers. Non-authors never see the control, and the API rejects
another user's media.

Images that uploaded successfully but whose processing call failed (for example, a network
drop) are still attached to the post with `status: 'failed'` and can be retried later.

## Cleanup

`GET|POST /api/media/feed/cleanup` runs daily at 04:30 UTC via `vercel.json`. It requires the
same `CRON_SECRET` bearer token as payment reconciliation; in production a missing secret
returns 503 instead of running unauthenticated.

It removes rows that are:

- still `pending` or `processing`,
- not attached to a post (`post_id IS NULL`),
- older than 24 hours,

and deletes their original and variant objects. `failed` and `ready` originals are preserved:
a post may reference them and retry must not need a re-upload.

## API

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/media/feed/process` | Firebase ID token | Validate original, create row, generate variants |
| `POST` | `/api/media/feed/retry` | Firebase ID token | Re-process an owned failed/stale row |
| `GET` | `/api/media/feed/status?id=…` | Firebase ID token | Owner-only processing status |
| `POST` | `/api/media/feed/attach` | Firebase ID token | Link owned rows to an owned Firestore post |
| `GET`/`POST` | `/api/media/feed/cleanup` | `CRON_SECRET` | Delete abandoned uploads |

Error responses are JSON `{ error, code? }`. Expected codes include `file_too_large`,
`invalid_image`, `unsupported_format`, `dimensions_too_small`, `dimensions_too_large`,
`empty_file`, `mime_mismatch`, `invalid_path`, `not_found`, `forbidden` and `conflict`.

## Environment

The pipeline needs the variables already required by the app:

- `SUPABASE_URL` or `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY` (server only)
- Firebase service-account credentials for `firebaseAdmin()` / `firestoreAdmin()`

New optional variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_IMAGE_TRANSFORMATIONS` | `false` | Enables dynamic Supabase transform candidates |
| `CRON_SECRET` | — | Authenticates the daily cleanup cron (shared with payments) |

Never expose the service-role key to the browser. The client only uses the existing public
bucket URL and Firebase Auth.

## Deployment notes

1. Apply `20261119000000_feed_media.sql`.
2. Ensure `sharp` is installed at build time. It ships prebuilt Linux binaries for the Vercel
   Node runtime; no extra configuration is required.
3. `api/media/feed/[action].ts` is required because Vercel expands only one dynamic segment
   per directory; the root `api/[...route].ts` cannot match nested paths. This adds one
   Serverless Function, and `tests/apiRouting.test.ts` still enforces the Hobby limit of 12.
4. `CRON_SECRET` must be set in production for cleanup to run. Vercel sends it as a bearer
   token.
5. The media entrypoint sets `maxDuration: 60` in `vercel.json` so a large original can finish
   all variants. Processing downloads one image per request and limits Sharp to two concurrent
   jobs per instance; a 10 MB original is the largest input.
6. No Storage bucket or CORS change is required: uploads reuse the public `posts` bucket and
   the existing browser Storage access.

## Verification

Executed on the final working tree:

| Command | Result |
| --- | --- |
| `npx vitest run` | **21 test files, 154 tests passed** |
| `npx tsc --noEmit` | Passed, no diagnostics |
| `npm run build` | Succeeded (existing Firebase dynamic-import and chunk-size warnings only) |

The media tests use Sharp against generated fixtures plus in-memory repository/storage fakes.
They cover the rules above, including orientation, transparency, animated GIF preservation,
metadata stripping, corrupt input, variant dimensions, `srcSet` selection, legacy fallback,
idempotency, retry, attach authorization, cleanup and concurrent processing. They are
diagnostic tests: no live Supabase or Firebase project is contacted.

## Known limitations

- **Orphaned originals:** if a tab closes after the Storage upload but before the process
  request, no `feed_media` row exists, so the daily cleanup (which walks rows) cannot find the
  object. The object stays in `posts/<uid>/feed-media/…` and is not shown anywhere. A future
  Storage lifecycle rule or a periodic prefix scan can remove these.
- **Alt text:** the composer has no alt-text field yet, so rendered images use the generic
  "Post image" label. The data model already accepts `alt`.
- **Animated images:** animated GIF/WebP files are served as originals without variants, so
  they are not optimized. Preserving animation was chosen over silently flattening it.
- **No background queue:** processing happens in the upload request, bounded to two Sharp
  jobs per instance. A traffic spike queues at the function/DB level rather than in a worker.
- **Post relationship is best-effort:** the attach call is fire-and-forget after the
  Firestore write. If it fails, processing metadata is still correct but `post_id` stays null
  and the row may eventually be eligible for cleanup once it is older than 24 hours. The
  post's `media` array and images are unaffected.
- **Diagnostic tests only:** there is no automated integration test against a live Supabase
  project in this suite.
