import { spawnSync } from 'child_process';
import fs from 'fs';
import http from 'http';
import { AddressInfo } from 'net';
import path from 'path';
import { chromium } from 'playwright-core';
import { createServer as createViteServer } from 'vite';
import { createApiApp } from '../server/apiApp.ts';
import { attachCollabWebSocket } from '../server/collabHub.ts';

const ROOT_DIR = process.cwd();
const SCREENSHOT_DIR = path.join(ROOT_DIR, 'docs', 'screenshots');

interface VitestSuiteMetrics {
  numTotalTestSuites: number;
  numPassedTestSuites: number;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  suites: Array<{ name: string; status: string; testCount: number }>;
}

function findPlaywrightExecutable(): string | undefined {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    '/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell',
  ].filter((v): v is string => Boolean(v));

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  const browsersRoot = process.env.PLAYWRIGHT_BROWSERS_PATH || '/ms-playwright';
  if (fs.existsSync(browsersRoot)) {
    const queue = [browsersRoot];
    while (queue.length > 0) {
      const dir = queue.shift()!;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          queue.push(full);
        } else if (
          entry.isFile() &&
          (entry.name === 'chrome-headless-shell' || entry.name === 'chrome')
        ) {
          return full;
        }
      }
    }
  }
  return undefined;
}

function runTestMetrics(): VitestSuiteMetrics {
  const reportFile = path.join(ROOT_DIR, 'node_modules', '.cache', 'vitest-report.json');
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });

  const proc = spawnSync(
    'npx',
    ['vitest', 'run', '--reporter=json', `--outputFile=${reportFile}`],
    {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  if (proc.status !== 0) {
    throw new Error(
      `Test suite must pass before updating README.md.\n${proc.stderr || proc.stdout}`,
    );
  }

  const parsed = JSON.parse(fs.readFileSync(reportFile, 'utf8')) as {
    numTotalTestSuites?: number;
    numPassedTestSuites?: number;
    numTotalTests?: number;
    numPassedTests?: number;
    numFailedTests?: number;
    testResults?: Array<{
      name: string;
      status: string;
      assertionResults?: Array<unknown>;
    }>;
  };

  const suites = (parsed.testResults ?? []).map((tr) => ({
    name: path.relative(ROOT_DIR, tr.name),
    status: tr.status,
    testCount: tr.assertionResults?.length ?? 0,
  }));

  return {
    numTotalTestSuites: parsed.numTotalTestSuites ?? suites.length,
    numPassedTestSuites: parsed.numPassedTestSuites ?? suites.length,
    numTotalTests: parsed.numTotalTests ?? 0,
    numPassedTests: parsed.numPassedTests ?? 0,
    numFailedTests: parsed.numFailedTests ?? 0,
    suites,
  };
}

async function startTempAppServer(): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const app = createApiApp();
  const httpServer = http.createServer(app);
  const collabHub = attachCollabWebSocket(httpServer);
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'spa',
  });
  app.use(vite.middlewares);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = httpServer.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: async () => {
      await collabHub.closeAll();
      await vite.close();
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    },
  };
}

async function captureScreenshots(baseUrl: string): Promise<void> {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const executablePath = findPlaywrightExecutable();
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#public-story-index', { timeout: 15000 });
    await page.waitForTimeout(600);

    // 1. Landing Page & Public Story Index (excludes private works, AO3 filters)
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'landing-index.png'),
    });

    // 2. Public Story Reader, Comments & Kudos
    await page.click('#public-story-index article h3 button');
    await page.waitForSelector('[data-testid="give-kudos-btn"]', { timeout: 5000 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'story-reader-kudos.png'),
    });

    // 3. Navigate into Writing Studio -> Story Workspace
    await page.click('header nav button:has-text("Story")');
    await page.waitForSelector('button:has-text("Collaborate Link")', { timeout: 8000 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'story-workspace.png'),
    });

    // 4. AO3 Tags & Visibility Editor Modal
    await page.click('button:has-text("AO3 Tags")');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'ao3-tagging.png'),
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // 5. Dual-Link Collaboration Modal (Share Link + Collaborate Link)
    await page.click('button:has-text("Collaborate Link")');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'story-links-collab.png'),
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // 6. Chapters View
    await page.click('header button:has-text("Chapters")');
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'chapters.png'),
    });

    // 7. Characters View
    await page.click('header button:has-text("Characters")');
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'characters.png'),
    });

    // 8. Cross-Index View
    await page.click('header button:has-text("Cross-Index")');
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'cross-index.png'),
    });

    // 9. Save Points View
    await page.click('header button:has-text("Save Points")');
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'save-points.png'),
    });

    // 10. Studio Settings Modal
    await page.click('button[aria-label="Studio settings"]');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'studio-settings.png'),
    });
    await page.keyboard.press('Escape');

    await context.close();
  } finally {
    await browser.close();
  }
}

function buildReadmeMarkdown(metrics: VitestSuiteMetrics): string {
  const suiteRows = metrics.suites
    .map(
      (s) =>
        `| \`${s.name}\` | ${s.testCount} | ${s.status === 'passed' ? 'Passed' : s.status} |`,
    )
    .join('\n');

  return `# Folio & Canon

**Folio & Canon** is a full-stack interactive storytelling studio, continuity ledger, and real-time collaborative writing platform for canon-aware fiction and original worldbuilding. Built with React 19, TypeScript, Vite 8, Tailwind CSS v4, Express, WebSockets (\`ws\`), Firebase Auth/Firestore, and \`@google/genai\`, it tracks characters, inventories, locations, timelines, and canonical rules across branching scenes.

---

## Visual Tour (Auto-Captured Screenshots)

All screenshots below are automatically captured from the live application using Playwright (\`npm run docs:update\`).

### 1. Landing Page, Story Index, Collections & Subscriptions
Editorial landing experience showcasing public works indexed with AO3-style metadata (\`Rating\`, \`Archive Warnings\`, \`Category\`, \`Fandoms\`, \`Relationships\`, \`Characters\`, and \`Additional Tags\`), instant multi-facet filtering, sorting, strict exclusion of any manuscript marked \`isPrivate: true\`, and dedicated **Collections** and **Subscriptions** shelves.

![Landing Page Story Index](docs/screenshots/landing-index.png)

### 2. Public Story Reader, View Modes, Comments & Anonymous Kudos
Full work view (\`/?story=<publicId>\`) with the complete AO3 metadata grid, a 3-way **Current Scene | Chapters | Full Story** display toggle, hovering storywide menu overlay, one-per-user/anonymous **Give Kudos ♥** action with live counter, and hierarchical scene → chapter → story comments & replies.

![Public Story Reader & Kudos](docs/screenshots/story-reader-kudos.png)

### 3. Story Workspace, Hovering Menu Bar & Two-Link Masthead
Interactive narrative stream featuring **Current Scene / Chapters / Full Story** view switching, live scene search and character filtering (\`#turn\`, title, keyword, or cast member), hovering translucent **StoryFloatingBar** overlay (quick Save, Share, Collaborate, Subscribe, Collect, Stories, and PDF/HTML/JSON exports), AO3 Tags & Visibility controls, per-scene pre-computed TTS narration, scene illustrations, manual flagging & retroactive AI rewrites, branching choices, Dictaquill voice dictation, and explicit **Share Link** and **Collaborate Link** controls for every story.

![Story Workspace](docs/screenshots/story-workspace.png)

### 4. AO3 Tag Taxonomy & Public/Private Visibility Modal
Authors can toggle any story between **Public (Listed in Story Index)** and **Private (Excluded from Index)** and manage Rating, Archive Warnings, Categories, Fandoms, Relationships (\`/\` and \`&\`), Cast-synced Characters, and Additional Tags.

![AO3 Tagging & Visibility](docs/screenshots/ao3-tagging.png)

### 5. Two Links per Story: Public Share & Live Collaboration
Every manuscript maintains two dedicated links synchronized across the masthead, hovering overlay bar, and **My Stories** library:
- **Share Link (\`/?share=<shareId>\`)**: Publishes a read-only reader snapshot (\`/sharedWorks/{shareId}\`) for sharing full stories, single chapters, or individual scenes without exposing private user data.
- **Collaborate Link (\`/?collab=<collabId>\`)**: Opens a live co-authoring room (\`/collaborations/{collabId}\` + \`/ws/collab\` WebSocket presence) so multiple signed-in writers can advance scenes, edit prose, organize chapters, and watch collaborator activity live.

![Share & Collaboration Controls](docs/screenshots/story-links-collab.png)

### 6. Chapter Organization & Manuscript Assembly
Assemble unassigned story blurbs into numbered chapters, reorder scenes, toggle between merged reading flow and prompt-preserving studio mode, generate chapter illustrations or audio narration, export PDF/HTML chapters, and publish chapter-level Share Links.

![Chapter Organization](docs/screenshots/chapters.png)

### 7. Character Profiles & Canon Deduction
Structured dossiers tracking strengths, flaws, motivations, vocal mannerisms, injuries/status, locations, inventories, and relationships—plus instant canon profile deduction from a character name and universe.

![Character Profiles](docs/screenshots/characters.png)

### 8. Universe Cross-Index & Continuity Audits
Categorized canon ledger (\`World Rules\`, \`Locations\`, \`Items\`, \`Plot Threads\`, \`Timeline\`, \`Character Facts\`) with pinned invariants, manual CRUD, filtering, and full-manuscript AI continuity audits.

![Universe Cross-Index](docs/screenshots/cross-index.png)

### 9. Save Points, Exports & Archive Recovery
Capture named snapshots of turns, cast, chapters, and Cross-Index state; restore any checkpoint; or download the full book as formatted PDF, styled HTML, or portable JSON archive.

![Save Points & Exports](docs/screenshots/save-points.png)

### 10. Studio Settings & Custom Account Handle
Centralized Studio Settings behind the gear icon for narrative Gemini model selection, reasoning thinking level, Text-to-Speech narrator voice, and automatic playback on ready—paired with a compact icon-only Account button for freely chooseable author/reader usernames and Google OAuth cloud sync.

![Studio Settings](docs/screenshots/studio-settings.png)

---

## Core Functionality

- **Landing Page & Public Story Index with Private Story Exclusion**:
  - Default entry view showcases indexed public stories while strictly excluding any manuscript with \`isPrivate: true\` at both the UI query/filter layer (\`filterPublicStories\`, \`buildMergedPublicStoryIndex\`) and Firestore security rules (\`/publicStories/{publicId}\`).
- **3-Way Display Toggle & Hovering Overlay Menu (\`StoryFloatingBar\`)**:
  - Switch seamlessly between **Current Scene**, **Chapters**, and **Full Story** in both the Reader and Studio Workspace, supported by a collapsible translucent floating action bar.
- **Freely Chooseable Account Username & Icon-Only Account Button**:
  - Customize a public pen name / reader handle whether browsing locally or synced to Firestore via Google OAuth, accessed via a clean icon-only button in \`TopNav\`.
- **AO3-Style Tagging Taxonomy (\`ao3Tags.ts\`, \`StoryTagsModal\`)**:
  - Full structured metadata supporting \`Rating\`, \`Archive Warnings\`, \`Categories\`, \`Fandoms\`, \`Relationships\` (\`/\` romantic and \`&\` platonic conventions), \`Characters\` (with one-click cast sync), and \`Additional Tags\`.
- **Hierarchical Comments & Anonymous Kudos (\`CommentsSection\`, \`commentsTree.ts\`, \`communityStore.ts\`)**:
  - Both signed-in readers (optional anonymity) and guests (persistent browser \`anon_*\` token) can award permanent deduplicated kudos (\`/publicStories/{publicId}/kudos/{kudoId}\`).
  - Threaded comments and sub-comments anchor to \`story\`, \`chapter\`, or \`scene\`: scene comments roll up into chapters, and chapter + scene comments roll up into the full story view.
- **Collections & Story Subscriptions (\`LibraryShelfView\`)**:
  - Create public or private named collections, add or remove stories from index cards or the hovering bar, and subscribe to public stories to track newly added scenes/chapters—synced to \`/users/{uid}/collections\` and \`/users/{uid}/subscriptions\`.
- **Dual Per-Story Links (Share vs. Collaborate)**:
  - **Read-Only Share Link (\`/?share=<shareId>\`)**: Share full manuscripts, individual chapters, or single scenes via \`ShareModal\` and \`SharedWorkView\`, backed by \`/sharedWorks/{shareId}\`. Readers can inspect prose and cast read-only or fork/import a local copy.
  - **Real-Time Collaboration Link (\`/?collab=<collabId>\`)**: Invite verified co-authors via \`CollaborationModal\` into a synchronized room backed by Firestore (\`/collaborations/{collabId}\` + \`/collaborations/{collabId}/members/{uid}\`) and a low-latency WebSocket presence hub (\`/ws/collab\`).
- **Turn Search & Instant Jump (\`StoryTurnSearchBar\`)**:
  - Filter scenes by scene number (\`#2\`, \`scene 02\`, \`2\`), scene/chapter title, keyword, or character dropdown, highlight matches inline, and jump straight to any scene card.
- **Persistent Multi-Story Library & Cloud Sync (\`AuthContext\`, \`cloudSanitize\`)**:
  - Works offline-first via \`localStorage\` (\`folio-canon-stories-v1\`) and automatically synchronizes user settings and stories to Firestore on Google OAuth sign-in, while safely stripping inline base64 images so Firestore document limits are respected.
- **Pre-Computed Narrative Audio & Auto-Play (\`useNarrativeSpeech\`, \`TtsPlayerBar\`)**:
  - Background pre-computation of scene narration via \`gemini-3.8-flash-lite-tts\` with configurable voices (\`Charon\`, \`Kore\`, \`Fenrir\`, \`Puck\`, \`Zephyr\`), seekable timeline, optional auto-play on readiness, and WAV download.
- **Dictaquill Speech-to-Text (\`DictaquillButton\`)**:
  - Record voice direction via \`MediaRecorder\` or upload audio clips transcribed through \`gemini-3.5-transcribe\` with universe and cast context hints.
- **Rich Manuscript Exports (\`pdfExport\`, \`htmlExport\`, \`HtmlExportModal\`)**:
  - Export standalone formatted PDF documents (\`jspdf\`), styled responsive HTML manuscripts (with toggleable prompts, choices, continuity notes, and lore appendix), or JSON archives for single scenes, chapters, or full books.

---

## Security & Secret Hygiene

- **Zero Tracked API Keys**: Client Firebase settings are loaded via Vite environment variables (\`VITE_FIREBASE_API_KEY\`, \`VITE_FIREBASE_PROJECT_ID\`, \`VITE_FIREBASE_APP_ID\`, etc.) in \`src/firebase.ts\` with graceful fallback to unconfigured/local-first mode when credentials are absent or rotated.
- **Gitignore Protection**: \`.env*\` (except \`.env.example\`) and \`firebase-applet-config.json\` are excluded via \`.gitignore\`; only safe template placeholders (\`.env.example\`, \`firebase-applet-config.example.json\`) belong in version control.
- **Google Cloud API Key Restrictions**: Browser Firebase Web API keys should always be restricted by **HTTP referrers** and limited solely to Firebase Authentication (\`Identity Toolkit API\`) and \`Cloud Firestore API\`—never unrestricted and never granted access to \`Generative Language API\` (which remains strictly server-side in \`server/storyAgent.ts\` via \`process.env.GEMINI_API_KEY\`).
- **Firestore Security Rules (\`firestore.rules\`)**: Enforces default deny-all, \`email_verified == true\`, strict schema allowlists (\`hasAll\` / \`hasOnly\`), immutable ownership keys, server timestamp checks, and collaborator membership enforcement.
- **Automated Build Gate**: \`tests/unit/securityHygiene.test.ts\` runs on every \`npm test\` / \`npm run build\` to fail immediately if any \`AIza...\` key pattern ever appears in tracked files.

---

## Automated Unit & Integration Test Suite

\`npm run build\` runs the full **Vitest** suite automatically before bundling (\`npm test && vite build\`).

Latest verified run via \`npm run docs:update\`: **${metrics.numPassedTestSuites}/${metrics.numTotalTestSuites} test files passed (${metrics.numPassedTests}/${metrics.numTotalTests} tests passed)**.

| Test File | Tests | Status |
| --- | ---: | --- |
${suiteRows}

---

## Backend API & WebSocket Endpoints

- \`GET /api/health\` — Server liveness check (\`{ ok: true }\`).
- \`GET /api/config\` & \`GET /api/models\` — Available Gemini narrative models and server key readiness boolean (never exposes raw secrets).
- \`POST /api/story/deduce-universe\` — Generates opening world, cast dossiers, and initial Cross-Index ledger.
- \`POST /api/story/deduce-character\` — Canon-aware profile synthesis for a single character.
- \`POST /api/story/advance\` — Generates next narrative scene, state updates, and branching choices.
- \`POST /api/story/rewrite-scene\` — Retroactively rewrites a flagged scene while keeping continuity synchronized.
- \`POST /api/story/audit\` — Full-story continuity check across turns, cast, and Cross-Index ledger.
- \`POST /api/story/illustrate\` — Scene and chapter illustration generation.
- \`POST /api/story/tts\` — Multi-chunk WAV narrative audio synthesis.
- \`POST /api/story/transcribe\` — Dictaquill audio-to-text transcription.
- \`WS /ws/collab\` — Real-time room presence (\`room:presence\`), collaborator activity pings (\`room:activity\`), and sync notifications (\`room:sync\`).

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS v4, \`lucide-react\`, \`jspdf\`
- **Backend**: Node.js, Express 4, \`ws\`, \`tsx\`, \`@google/genai\`
- **Auth & Persistence**: Firebase Authentication (Google OAuth) & Cloud Firestore
- **Testing & Docs Automation**: Vitest 5, Testing Library (\`@testing-library/react\`, \`@testing-library/jest-dom\`), \`jsdom\`, Playwright (\`playwright-core\`)

---

## Project Structure

\`\`\`text
├── server.ts                            # HTTP server entry point (Express + WS collab hub + Vite/static)
├── server/
│   ├── apiApp.ts                        # Modular Express API router & JSON error middleware
│   ├── collabHub.ts                     # Real-time WebSocket collaboration hub (/ws/collab)
│   └── storyAgent.ts                    # Gemini generation, audits, rewrites, WAV TTS, STT
├── src/
│   ├── App.tsx                          # Studio orchestrator, multi-story state, Share & Collab routes
│   ├── firebase.ts                      # Env-driven Firebase initialization with safe local fallback
│   ├── contexts/AuthContext.tsx         # Google OAuth, cloud sync, SharedWork & Collaboration CRUD
│   ├── hooks/
│   │   ├── useCollabRoom.ts             # WebSocket live participant presence & activity hook
│   │   └── useNarrativeSpeech.ts        # Pre-computed scene/chapter narration & auto-play hook
│   ├── utils/
│   │   ├── cloudSanitize.ts             # Firestore undefined/image stripping helpers
│   │   ├── htmlExport.ts                # Scene, chapter, and full-book HTML exporters
│   │   ├── pdfExport.ts                 # Scene, chapter, and full-book PDF generators
│   │   ├── storyLinks.ts                # Canonical ?share= and ?collab= URL builders/parsers
│   │   └── turnSearch.ts                # Turn number, keyword, title, and character search matcher
│   └── components/                      # Workspace views, search bar, settings, Share & Collaboration modals
├── tests/
│   ├── unit/                            # Pure logic & security hygiene unit tests
│   └── integration/                     # HTTP API, WS hub, Firestore rules, and React UI integration tests
├── scripts/
│   └── update-readme.ts                 # Automated Playwright screenshot capture & README generator
└── docs/
    └── screenshots/                     # Auto-generated application screenshots
\`\`\`

---

## Local Setup & Scripts

1. **Install dependencies**:
   \`\`\`bash
   npm install
   \`\`\`
2. **Configure environment variables**:
   \`\`\`bash
   cp .env.example .env.local
   \`\`\`
   Provide your server-side \`GEMINI_API_KEY\` plus your referrer-restricted Firebase Web SDK \`VITE_FIREBASE_*\` variables.
3. **Run development server** (port \`3000\`):
   \`\`\`bash
   npm run dev
   \`\`\`
4. **Run unit & integration tests**:
   \`\`\`bash
   npm test
   \`\`\`
5. **Type-check, test, and build for production**:
   \`\`\`bash
   npm run lint
   npm run build
   \`\`\`
6. **Capture fresh Playwright screenshots and regenerate \`README.md\`**:
   \`\`\`bash
   npm run docs:update
   \`\`\`
`;
}

async function main() {
  console.log('1/4 Running Vitest unit & integration test suite...');
  const metrics = runTestMetrics();
  console.log(
    `    Passed ${metrics.numPassedTestSuites}/${metrics.numTotalTestSuites} files (${metrics.numPassedTests} tests).`,
  );

  console.log('2/4 Booting temporary Vite + Express + WS server for Playwright...');
  const srv = await startTempAppServer();
  try {
    console.log(`3/4 Capturing Playwright screenshots from ${srv.baseUrl}...`);
    await captureScreenshots(srv.baseUrl);
  } finally {
    await srv.close();
  }

  console.log('4/4 Updating README.md...');
  const readme = buildReadmeMarkdown(metrics);
  fs.writeFileSync(path.join(ROOT_DIR, 'README.md'), readme, 'utf8');
  console.log('README.md and docs/screenshots/*.png updated successfully.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
