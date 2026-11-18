import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Vercel compiles everything under `api/` to `.js` and runs it with Node ESM,
 * which refuses extensionless relative imports with ERR_MODULE_NOT_FOUND.
 * TypeScript's "bundler" resolution accepts them locally, so this checks the
 * source directly: a missing `.js` here takes the whole serverless function
 * down in production while `npm run dev` keeps working.
 */
const API_DIR = join(process.cwd(), 'api');

function apiSources(dir: string = API_DIR): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return apiSources(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

describe('api module imports', () => {
  it('keeps explicit extensions on relative imports', () => {
    const offenders: string[] = [];
    for (const file of apiSources()) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
        const specifier = match[1];
        if (!/\.(js|json|mjs|cjs)$/.test(specifier)) {
          offenders.push(`${relative(process.cwd(), file)} -> ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('uses import attributes instead of the removed assert syntax', () => {
    const offenders = apiSources().filter((file) =>
      /from\s+['"][^'"]+['"]\s+assert\s*\{/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders.map((file) => relative(process.cwd(), file))).toEqual([]);
  });
});
