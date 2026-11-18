// @vitest-environment node
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const ROOT_DIR = process.cwd();
const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.playwright-cli',
  'docs',
]);

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.json',
  '.md',
  '.html',
  '.css',
  '.rules',
  '.example',
]);

const GOOGLE_API_KEY_RE = /AIza[0-9A-Za-z_-]{20,}/g;

function walkFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (
        TEXT_EXTENSIONS.has(ext) ||
        entry.name === '.gitignore' ||
        entry.name === '.env.example'
      ) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

describe('security hygiene', () => {
  it('does not contain any hardcoded live Google API keys (AIza...) in repository files', () => {
    const files = walkFiles(ROOT_DIR);
    const offending: string[] = [];

    for (const filePath of files) {
      const relPath = path.relative(ROOT_DIR, filePath);
      if (relPath === 'tests/unit/securityHygiene.test.ts') continue;
      if (entryIsEnvSecretFile(relPath)) continue;

      const content = fs.readFileSync(filePath, 'utf8');
      if (GOOGLE_API_KEY_RE.test(content)) {
        offending.push(relPath);
      }
      GOOGLE_API_KEY_RE.lastIndex = 0;
    }

    expect(offending).toEqual([]);
  });

  it('keeps live secret files in .gitignore and exposes scrubbed firebase-applet-config.json', () => {
    const gitignore = fs.readFileSync(path.join(ROOT_DIR, '.gitignore'), 'utf8');
    expect(gitignore).toContain('.env*');
    expect(gitignore).toContain('!.env.example');
    expect(gitignore).toContain('firebase-applet-config.json');

    const configPath = path.join(ROOT_DIR, 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
        apiKey?: string;
        projectId?: string;
      };
      expect(parsed.apiKey ?? '').toBe('');
      expect(parsed.projectId).toBeTruthy();
    }

    expect(fs.existsSync(path.join(ROOT_DIR, '.env.example'))).toBe(true);
    expect(
      fs.existsSync(path.join(ROOT_DIR, 'firebase-applet-config.example.json')),
    ).toBe(true);
  });
});

function entryIsEnvSecretFile(relPath: string): boolean {
  const base = path.basename(relPath);
  return base.startsWith('.env') && base !== '.env.example';
}
