import { StoryChapter, StoryProject, StoryTurn } from '../types/story';

export interface HtmlExportOptions {
  includePrompts: boolean;
  includeChoices: boolean;
  includeContinuityNotes: boolean;
  includeCastAndLore: boolean;
  chapterId?: string; // If provided, exports only this chapter
  turnId?: string; // If provided, exports only this single scene/blurb
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderTurnHtml(turn: StoryTurn, options: HtmlExportOptions, isMergedFlow: boolean): string {
  const parts: string[] = [];

  if (!isMergedFlow) {
    parts.push(`
      <div class="scene-meta">
        <span>Scene ${String(turn.turnNumber).padStart(2, '0')}</span>
        <span>&middot;</span>
        <span>${escapeHtml(turn.sceneTitle)}</span>
        <span>&middot;</span>
        <span>${escapeHtml(turn.location)}</span>
        <span>&middot;</span>
        <span>${escapeHtml(turn.inStoryTime)}</span>
      </div>
    `);
  } else {
    parts.push(`
      <div class="blurb-divider" aria-label="Scene ${turn.turnNumber}">
        <span>Scene ${String(turn.turnNumber).padStart(2, '0')}: ${escapeHtml(turn.sceneTitle)} &middot; ${escapeHtml(turn.location)}</span>
      </div>
    `);
  }

  if (options.includePrompts) {
    const promptText = turn.userAction
      ? escapeHtml(turn.userAction)
      : 'Initial scene generated from Universe &amp; Premise prompt.';
    const promptKind = turn.userAction ? 'User Prompt / Action' : 'Opening Prompt';
    parts.push(`
      <aside class="prompt-block">
        <div class="prompt-label">${promptKind}</div>
        <div class="prompt-text">${promptText}</div>
      </aside>
    `);
  }

  if (turn.continuityWarning) {
    parts.push(`
      <aside class="warning-block">
        <strong>Continuity Notice:</strong> ${escapeHtml(turn.continuityWarning)}
      </aside>
    `);
  }

  if (turn.illustration?.dataUrl) {
    const captionText = escapeHtml(
      turn.illustration.caption ||
        `Scene ${String(turn.turnNumber).padStart(2, '0')}: ${turn.sceneTitle}`,
    );
    parts.push(`
      <figure class="illustration-block">
        <img src="${escapeHtml(turn.illustration.dataUrl)}" alt="${captionText}" />
        <figcaption>${captionText}</figcaption>
      </figure>
    `);
  }

  parts.push(`<div class="prose-block">`);
  for (const p of turn.prose) {
    parts.push(`<p>${escapeHtml(p)}</p>`);
  }
  parts.push(`</div>`);

  if (options.includeChoices && turn.choices.length > 0) {
    parts.push(`<div class="choices-block"><div class="choices-heading">Branching Prompts Offered</div><ul>`);
    for (const ch of turn.choices) {
      const selected = turn.selectedChoiceId === ch.id;
      parts.push(`
        <li class="${selected ? 'choice-selected' : ''}">
          <strong>${selected ? '[Selected] ' : ''}${escapeHtml(ch.label)}</strong>
          <span class="choice-intent"> &mdash; ${escapeHtml(ch.intent)}</span>
        </li>
      `);
    }
    parts.push(`</ul></div>`);
  }

  if (options.includeContinuityNotes && turn.continuityNotes.length > 0) {
    parts.push(`<div class="notes-block"><div class="notes-heading">Continuity Checks</div><ul>`);
    for (const note of turn.continuityNotes) {
      parts.push(`<li>${escapeHtml(note)}</li>`);
    }
    parts.push(`</ul></div>`);
  }

  return `<section class="story-blurb">${parts.join('\n')}</section>`;
}

export function generateStoryHtml(project: StoryProject, options: HtmlExportOptions): string {
  const chapters = [...(project.chapters ?? [])].sort(
    (a, b) => a.chapterNumber - b.chapterNumber,
  );
  const turnMap = new Map<string, StoryTurn>();
  for (const t of project.turns) {
    turnMap.set(t.id, t);
  }

  const assignedTurnIds = new Set<string>();
  for (const ch of chapters) {
    for (const tid of ch.turnIds) {
      assignedTurnIds.add(tid);
    }
  }

  const targetTurn = options.turnId ? turnMap.get(options.turnId) : undefined;

  const targetChapters: StoryChapter[] = targetTurn
    ? []
    : options.chapterId
    ? chapters.filter((c) => c.id === options.chapterId)
    : chapters;

  const unassignedTurns = targetTurn
    ? [targetTurn]
    : options.chapterId
    ? []
    : project.turns.filter((t) => !assignedTurnIds.has(t.id));

  const sectionsHtml: string[] = [];

  for (const ch of targetChapters) {
    const chTurns = ch.turnIds
      .map((id) => turnMap.get(id))
      .filter((t): t is StoryTurn => Boolean(t));

    if (chTurns.length === 0) continue;

    const chapterIllustrationHtml = ch.illustration?.dataUrl
      ? `<figure class="illustration-block">
          <img src="${escapeHtml(ch.illustration.dataUrl)}" alt="${escapeHtml(ch.illustration.caption || ch.title)}" />
          <figcaption>${escapeHtml(ch.illustration.caption || ch.title)}</figcaption>
        </figure>`
      : '';

    sectionsHtml.push(`
      <article class="chapter">
        <header class="chapter-header">
          <div class="chapter-kicker">Chapter ${String(ch.chapterNumber).padStart(2, '0')} &middot; ${chTurns.length} merged ${chTurns.length === 1 ? 'blurb' : 'blurbs'}</div>
          <h2>${escapeHtml(ch.title)}</h2>
          ${ch.summary ? `<p class="chapter-summary">${escapeHtml(ch.summary)}</p>` : ''}
        </header>
        ${chapterIllustrationHtml}
        <div class="chapter-body">
          ${chTurns.map((t) => renderTurnHtml(t, options, true)).join('\n')}
        </div>
      </article>
    `);
  }

  if (unassignedTurns.length > 0) {
    const sectionKicker = targetTurn
      ? `Scene ${String(targetTurn.turnNumber).padStart(2, '0')}`
      : chapters.length > 0
      ? 'Unmerged Story Blurbs'
      : 'Story Manuscript';
    const sectionTitle = targetTurn
      ? targetTurn.sceneTitle
      : chapters.length > 0
      ? 'Standalone Scenes'
      : project.title;

    sectionsHtml.push(`
      <article class="chapter">
        <header class="chapter-header">
          <div class="chapter-kicker">${escapeHtml(sectionKicker)}</div>
          <h2>${escapeHtml(sectionTitle)}</h2>
        </header>
        <div class="chapter-body">
          ${unassignedTurns.map((t) => renderTurnHtml(t, options, false)).join('\n')}
        </div>
      </article>
    `);
  }

  let appendixHtml = '';
  if (options.includeCastAndLore) {
    const charsHtml = project.characters
      .map(
        (c) => `
      <div class="appendix-item">
        <h3>${escapeHtml(c.name)} <span class="muted">(${escapeHtml(c.role)} &middot; ${escapeHtml(c.origin)})</span></h3>
        <p>${escapeHtml(c.summary)}</p>
        <p><strong>Strengths:</strong> ${c.pros.map(escapeHtml).join('; ') || 'None'}</p>
        <p><strong>Flaws:</strong> ${c.flaws.map(escapeHtml).join('; ') || 'None'}</p>
        <p><strong>Location:</strong> ${escapeHtml(c.location)} &middot; <strong>Status:</strong> ${escapeHtml(c.status)}</p>
      </div>
    `,
      )
      .join('\n');

    const loreHtml = project.crossIndex
      .map(
        (e) => `
      <div class="appendix-item">
        <h3>${escapeHtml(e.title)} <span class="muted">(${escapeHtml(e.category)} &middot; ${escapeHtml(e.status)})</span></h3>
        <p>${escapeHtml(e.detail)}</p>
      </div>
    `,
      )
      .join('\n');

    appendixHtml = `
      <section class="appendix">
        <h2>Universe Appendix</h2>
        <div class="appendix-grid">
          <div>
            <div class="appendix-subhead">Character Profiles</div>
            ${charsHtml}
          </div>
          <div>
            <div class="appendix-subhead">Cross-Index Lore Ledger</div>
            ${loreHtml}
          </div>
        </div>
      </section>
    `;
  }

  const docTitle = targetTurn
    ? `${project.title} — Scene ${String(targetTurn.turnNumber).padStart(2, '0')}: ${targetTurn.sceneTitle}`
    : options.chapterId && targetChapters[0]
    ? `${project.title} — Chapter ${targetChapters[0].chapterNumber}: ${targetChapters[0].title}`
    : project.title;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(docTitle)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f8f9fa;
      --surface: #ffffff;
      --ink: #111827;
      --muted: #4b5563;
      --subtle: #6b7280;
      --border: #e5e7eb;
      --accent: #1d4ed8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 40px 20px;
      background: var(--bg);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.7;
    }
    .page {
      max-width: 780px;
      margin: 0 auto;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 48px 56px;
    }
    .doc-header {
      padding-bottom: 28px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 36px;
    }
    .doc-meta {
      font-size: 13px;
      color: var(--subtle);
      margin-bottom: 8px;
    }
    h1 {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 34px;
      line-height: 1.2;
      margin: 0;
      font-weight: 600;
    }
    .premise-box {
      margin-top: 20px;
      padding: 16px 18px;
      background: #f9fafb;
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 14px;
      color: var(--muted);
    }
    .premise-box strong {
      display: block;
      font-size: 12px;
      color: var(--ink);
      margin-bottom: 4px;
    }
    .chapter {
      margin-bottom: 48px;
    }
    .chapter-header {
      margin-bottom: 24px;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--border);
    }
    .chapter-kicker {
      font-size: 12px;
      font-family: ui-monospace, SFMono-Regular, monospace;
      color: var(--subtle);
    }
    .chapter-header h2 {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 26px;
      margin: 6px 0 0;
      font-weight: 600;
    }
    .chapter-summary {
      margin: 8px 0 0;
      font-size: 14px;
      color: var(--muted);
      font-style: italic;
    }
    .story-blurb {
      margin-bottom: 28px;
    }
    .scene-meta, .blurb-divider {
      font-size: 12px;
      font-family: ui-monospace, SFMono-Regular, monospace;
      color: var(--subtle);
      margin-bottom: 12px;
    }
    .blurb-divider {
      padding-top: 12px;
      border-top: 1px dashed var(--border);
    }
    .prompt-block {
      margin: 12px 0 18px;
      padding: 12px 16px;
      background: #f3f6fc;
      border: 1px solid #dbeafe;
      border-radius: 8px;
      font-size: 14px;
    }
    .prompt-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--accent);
      margin-bottom: 3px;
    }
    .prompt-text {
      color: var(--ink);
    }
    .warning-block {
      margin: 12px 0 16px;
      padding: 10px 14px;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 8px;
      font-size: 13px;
      color: #92400e;
    }
    .prose-block p {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 17px;
      line-height: 1.8;
      margin: 0 0 16px;
      color: var(--ink);
    }
    .illustration-block {
      margin: 18px 0 22px;
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
      background: #f9fafb;
    }
    .illustration-block img {
      display: block;
      width: 100%;
      max-height: 460px;
      object-fit: cover;
    }
    .illustration-block figcaption {
      padding: 10px 14px;
      font-size: 13px;
      color: var(--muted);
      font-style: italic;
      background: #ffffff;
      border-top: 1px solid var(--border);
    }
    .choices-block, .notes-block {
      margin-top: 14px;
      padding: 12px 16px;
      background: #fafafa;
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 13px;
      color: var(--muted);
    }
    .choices-heading, .notes-heading {
      font-weight: 600;
      color: var(--ink);
      margin-bottom: 6px;
      font-size: 12px;
    }
    .choices-block ul, .notes-block ul {
      margin: 0;
      padding-left: 18px;
    }
    .choices-block li, .notes-block li {
      margin-bottom: 4px;
    }
    .choice-selected {
      color: var(--accent);
    }
    .appendix {
      margin-top: 52px;
      padding-top: 32px;
      border-top: 2px solid var(--border);
    }
    .appendix h2 {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 24px;
      margin: 0 0 20px;
    }
    .appendix-subhead {
      font-size: 14px;
      font-weight: 600;
      color: var(--ink);
      margin: 18px 0 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--border);
    }
    .appendix-item {
      margin-bottom: 16px;
      font-size: 14px;
    }
    .appendix-item h3 {
      font-size: 15px;
      margin: 0 0 4px;
    }
    .appendix-item p {
      margin: 2px 0;
      color: var(--muted);
    }
    .muted {
      font-weight: 400;
      color: var(--subtle);
      font-size: 13px;
    }
    @media (max-width: 640px) {
      .page { padding: 28px 22px; }
    }
    @media print {
      body { background: #ffffff; padding: 0; }
      .page { border: none; padding: 0; max-width: none; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="doc-header">
      <div class="doc-meta">${escapeHtml(project.universe)} &middot; ${escapeHtml(project.setting)} &middot; ${escapeHtml(project.tone)}</div>
      <h1>${escapeHtml(docTitle)}</h1>
      ${
        options.includePrompts
          ? `<div class="premise-box"><strong>Initial Story Premise Prompt</strong>${escapeHtml(project.premise)}</div>`
          : ''
      }
    </header>
    ${sectionsHtml.join('\n')}
    ${appendixHtml}
  </main>
</body>
</html>`;
}

export function saveTextFile(
  filename: string,
  content: string,
  mimeType = 'text/plain;charset=utf-8',
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function downloadHtmlFile(filename: string, html: string): void {
  saveTextFile(filename, html, 'text/html;charset=utf-8');
}

function slugifyTitle(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function downloadSceneHtml(project: StoryProject, turn: StoryTurn): string {
  const html = generateStoryHtml(project, {
    includePrompts: true,
    includeChoices: true,
    includeContinuityNotes: true,
    includeCastAndLore: false,
    turnId: turn.id,
  });
  const slug = slugifyTitle(project.title) || 'story';
  const filename = `${slug}-scene-${String(turn.turnNumber).padStart(2, '0')}.html`;
  downloadHtmlFile(filename, html);
  return filename;
}

export function downloadChapterHtml(project: StoryProject, chapter: StoryChapter): string {
  const html = generateStoryHtml(project, {
    includePrompts: true,
    includeChoices: true,
    includeContinuityNotes: true,
    includeCastAndLore: false,
    chapterId: chapter.id,
  });
  const slug = slugifyTitle(project.title) || 'story';
  const filename = `${slug}-chapter-${String(chapter.chapterNumber).padStart(2, '0')}.html`;
  downloadHtmlFile(filename, html);
  return filename;
}

