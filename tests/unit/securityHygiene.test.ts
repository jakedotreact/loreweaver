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
]);

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.zip',
  '.docx',
  '.odt',
  '.pdf',
  '.mp3',
  '.wav',
  '.webm',
]);

const SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{20,}/g },
  {
    name: 'Private key block',
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
  },
  { name: 'GitHub classic/fine token', re: /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g },
  { name: 'AWS access key ID', re: /\bAKIA[0-9A-Z]{16}\b/g },
];

const PLACEHOLDER_RE = /(?:YOUR_|MY_GEMINI_API_KEY|EXAMPLE_KEY|DUMMY_|TEST_SECRET|<[A-Z0-9_]+>)/i;

function walkAllProjectTextFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkAllProjectTextFiles(fullPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) continue;
      results.push(fullPath);
    }
  }
  return results;
}

function entryIsEnvSecretFile(relPath: string): boolean {
  const base = path.basename(relPath);
  return base.startsWith('.env') && base !== '.env.example';
}

describe('security hygiene', () => {
  it('scans all non-binary tracked files including docs/ for leaked credentials without flagging examples', () => {
    const files = walkAllProjectTextFiles(ROOT_DIR);
    const offending: Array<{ file: string; pattern: string }> = [];

    for (const filePath of files) {
      const relPath = path.relative(ROOT_DIR, filePath);
      if (relPath === 'tests/unit/securityHygiene.test.ts') continue;
      if (relPath === 'tests/integration/server.api.test.ts') continue;
      if (entryIsEnvSecretFile(relPath)) continue;

      const raw = fs.readFileSync(filePath);
      if (raw.includes(0)) continue; // skip binary content
      const content = raw.toString('utf8');

      for (const { name, re } of SECRET_PATTERNS) {
        re.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = re.exec(content)) !== null) {
          const matchedText = match[0];
          const isExampleFile =
            relPath.endsWith('.example') || relPath.endsWith('.example.json');
          if (isExampleFile && PLACEHOLDER_RE.test(matchedText)) {
            continue;
          }
          if (PLACEHOLDER_RE.test(matchedText)) {
            continue;
          }
          offending.push({ file: relPath, pattern: name });
          break;
        }
        re.lastIndex = 0;
      }
    }

    expect(offending).toEqual([]);
  });

  it('keeps GEMINI_API_KEY strictly server-side and excluded from client src/ bundles', () => {
    const srcFiles = walkAllProjectTextFiles(path.join(ROOT_DIR, 'src'));
    const clientLeaks: string[] = [];

    for (const filePath of srcFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      if (/\b(?:GEMINI_API_KEY|VITE_GEMINI_API_KEY)\b/.test(content)) {
        clientLeaks.push(path.relative(ROOT_DIR, filePath));
      }
    }

    expect(clientLeaks).toEqual([]);
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
