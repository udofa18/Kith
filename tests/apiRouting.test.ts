import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Vercel turns each file under `api/` into one Serverless Function and routes by path. A segment
 * written as `[name]` matches exactly one segment — `[...route].ts` is NOT a catch-all there, it
 * behaves like `[route].ts` — so `/api/live-session/info` needs a file in a matching
 * subdirectory. This mirrors that matcher so a nested client path without a function file fails
 * here instead of 404ing from Vercel's edge with a plain-text NOT_FOUND.
 */
const API_DIR = join(process.cwd(), 'api');
const SRC_DIR = join(process.cwd(), 'src');
const DYNAMIC = /^\[.+\]$/;
/** Hobby plans allow at most 12 Serverless Functions per deployment. */
const FUNCTION_LIMIT = 12;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return [full];
  });
}

function routePatterns(): string[][] {
  return files(API_DIR)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => relative(API_DIR, file).slice(0, -'.ts'.length).split('/'))
    // Underscore-prefixed files and directories are shared modules, not endpoints.
    .filter((segments) => !segments.some((segment) => segment.startsWith('_')));
}

function matches(pattern: string[], segments: string[]): boolean {
  return (
    pattern.length === segments.length &&
    pattern.every((part, index) => DYNAMIC.test(part) || part === segments[index])
  );
}

function clientApiPaths(): string[] {
  const found = new Set<string>();
  for (const file of files(SRC_DIR)) {
    if (!/\.(ts|tsx)$/.test(file)) continue;
    // Require a quote or backtick before `/api/` so absolute third-party URLs are ignored.
    for (const match of readFileSync(file, 'utf8').matchAll(/["'`](\/api\/[A-Za-z0-9_\-/]+)/g)) {
      const path = match[1].replace(/\/+$/, '');
      // Skip `/api` and partial paths such as `/api/gemini/${endpoint}`.
      if (path.length > '/api'.length) found.add(path);
    }
  }
  return [...found].sort();
}

describe('vercel api routing', () => {
  it('has a function file for every API path the client calls', () => {
    const patterns = routePatterns();
    const unmatched = clientApiPaths().filter((path) => {
      const segments = path.split('/').slice(2);
      return !patterns.some((pattern) => matches(pattern, segments));
    });

    expect(unmatched).toEqual([]);
  });

  it('stays within the Hobby plan function limit', () => {
    expect(routePatterns().length).toBeLessThanOrEqual(FUNCTION_LIMIT);
  });
});
