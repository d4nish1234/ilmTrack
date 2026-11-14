/**
 * Keeps the look in one place (src/constants/theme.ts): screens and
 * components use its colours, type scale and weights, never their own. If
 * this fails, use a theme token, or add one to the theme if nothing fits.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// The theme itself, and the PDFs, whose HTML has its own CSS.
const ALLOWED = new Set(['src/constants/theme.ts', 'src/utils/reportUtils.ts', 'src/utils/timesheetExport.ts']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !ALLOWED.has(path) ? [path] : [];
  });
}

const files = [...sourceFiles('app'), ...sourceFiles('src')];

function offenders(pattern: RegExp): string[] {
  return files.flatMap((path) =>
    readFileSync(path, 'utf8')
      .split('\n')
      .flatMap((line, i) => (pattern.test(line) ? [`${path}:${i + 1}  ${line.trim()}`] : []))
  );
}

describe('the theme is the only place for the look', () => {
  it('has no hard-coded colours outside it', () => {
    expect(offenders(/['"]#[0-9a-fA-F]{3,8}['"]|rgba?\(/)).toEqual([]);
  });

  it('has no literal font weights or Paper variant names outside it', () => {
    expect(offenders(/fontWeight: ['"]|variant="(display|headline|title|body|label)/)).toEqual([]);
  });
});
