import dns from 'dns/promises';
import http from 'http';
import https from 'https';
import net from 'net';
import JSZip from 'jszip';
import { JSDOM } from 'jsdom';
import type {
  Ao3Category,
  Ao3Rating,
  Ao3Warning,
  CharacterProfile,
  CrossIndexCategory,
  CrossIndexEntry,
  ModelConfig,
  StoryChapter,
  StoryChoice,
  StoryProject,
  StoryTags,
  StoryTurn,
} from '../src/types/story.ts';
import {
  AO3_CATEGORIES,
  AO3_RATINGS,
  AO3_WARNINGS,
  countStoryWords,
  createDefaultTagsForProject,
  normalizeStoryTags,
} from '../src/utils/ao3Tags.ts';

export type ImportFormat = 'txt' | 'md' | 'docx' | 'odt' | 'html';

export interface ImportedSceneDraft {
  sceneTitle: string;
  paragraphs: string[];
  location?: string;
  inStoryTime?: string;
}

export interface ImportedChapterDraft {
  chapterTitle: string;
  summary?: string;
  scenes: ImportedSceneDraft[];
}

export interface ExtractedStoryDocument {
  format: ImportFormat;
  sourceName: string;
  sourceUrl?: string;
  title?: string;
  author?: string;
  universe?: string;
  setting?: string;
  tone?: string;
  premise?: string;
  tagsHint?: Partial<StoryTags>;
  chapters: ImportedChapterDraft[];
  hasExplicitChapters: boolean;
}

export interface ImportedStoryEnrichment {
  title?: string;
  universe?: string;
  setting?: string;
  tone?: string;
  premise?: string;
  characters: Array<{
    name: string;
    role: 'Protagonist' | 'Companion' | 'Antagonist' | 'NPC';
    origin: 'canon' | 'original';
    summary: string;
    pros: string[];
    flaws: string[];
    motivation: string;
    voiceAndMannerisms: string;
    status: string;
    location: string;
    inventory: string[];
    relationships: Array<{ targetName: string; relation: string }>;
  }>;
  crossIndex: Array<{
    category: CrossIndexCategory;
    title: string;
    detail: string;
    tags: string[];
    pinned: boolean;
  }>;
  tagsHint?: Partial<StoryTags>;
  continuationChoices?: Array<{
    label: string;
    intent: string;
    consequenceHint: string;
  }>;
}

export type StoryEnricherFn = (
  excerpt: {
    title: string;
    author?: string;
    source: string;
    universeHint?: string;
    settingHint?: string;
    toneHint?: string;
    premiseHint?: string;
    sampleText: string;
  },
  modelConfig?: Partial<ModelConfig>,
) => Promise<ImportedStoryEnrichment>;

export interface ImportStoryOptions {
  title?: string;
  universe?: string;
  setting?: string;
  tone?: string;
  isPrivate?: boolean;
  enrichWithAi?: boolean;
  modelConfig?: Partial<ModelConfig>;
  enricher?: StoryEnricherFn;
}

export interface ImportStoryResult {
  project: StoryProject;
  stats: {
    format: ImportFormat;
    sourceName: string;
    wordCount: number;
    chapterCount: number;
    sceneCount: number;
    characterCount: number;
    crossIndexCount: number;
    aiEnriched: boolean;
  };
  warnings: string[];
}

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_URL_BYTES = 5 * 1024 * 1024; // 5 MB
const URL_TIMEOUT_MS = 15_000;
const MAX_URL_REDIRECTS = 5;
const MAX_TURNS_FOR_CLOUD = 180;
const MAX_CHAPTERS_FOR_CLOUD = 95;

const CHAPTER_HEADING_RE =
  /^(?:chapter|chap\.?|part|book|act)\s+(?:[0-9]+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s*[:.\-—–]\s*(.+))?$/i;
const PROLOGUE_EPILOGUE_RE =
  /^(?:prologue|epilogue|interlude|prelude|afterword)(?:\s*[:.\-—–]\s*(.+))?$/i;
const SCENE_DIVIDER_RE = /^(?:\*\s*\*\s*\*|-\s*-\s*-|_\s*_\s*_|#\s*#\s*#|~+\s*~*|===+)$/;
const SCENE_HEADING_RE = /^scene\s+[0-9ivxlcdm]+(?:\s*[:.\-—–]\s*(.+))?$/i;

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#([0-9]+);/g, (_m, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function cleanParagraphText(raw: string): string {
  return raw
    .replace(/\uFEFF/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function deriveTitleFromFilename(filename: string): string {
  const base = filename
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.(txt|md|markdown|docx|odt|html?|htm)$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base) return 'Imported Story';
  return base.slice(0, 200);
}

function isChapterHeadingLine(line: string): { matched: boolean; title: string } {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 140) {
    return { matched: false, title: '' };
  }
  if (CHAPTER_HEADING_RE.test(trimmed) || PROLOGUE_EPILOGUE_RE.test(trimmed)) {
    return { matched: true, title: trimmed };
  }
  return { matched: false, title: '' };
}

function splitMarkdownInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/___([^_]+)___/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|\s)\*([^*\n]+)\*(?=\s|[.,!?;:'"’”]|$)/g, '$1$2')
    .replace(/(^|\s)_([^_\n]+)_(?=\s|[.,!?;:'"’”]|$)/g, '$1$2')
    .replace(/^\s*>\s?/gm, '')
    .trim();
}

function parseFrontmatter(rawText: string): {
  meta: Record<string, string | string[]>;
  body: string;
} {
  const normalized = rawText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return { meta: {}, body: normalized };
  }
  const endIdx = normalized.indexOf('\n---', 4);
  if (endIdx < 0) {
    return { meta: {}, body: normalized };
  }
  const fmBlock = normalized.slice(4, endIdx);
  const body = normalized.slice(endIdx + 4).replace(/^\n+/, '');
  const meta: Record<string, string | string[]> = {};
  let activeArrayKey: string | null = null;

  for (const line of fmBlock.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('- ') && activeArrayKey) {
      const val = trimmed.slice(2).trim().replace(/^["']|["']$/g, '');
      const existing = meta[activeArrayKey];
      if (Array.isArray(existing) && val) {
        existing.push(val);
      }
      continue;
    }
    activeArrayKey = null;
    const colonIdx = line.indexOf(':');
    if (colonIdx <= 0) continue;
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const rawVal = line.slice(colonIdx + 1).trim();
    if (!rawVal) {
      meta[key] = [];
      activeArrayKey = key;
    } else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      meta[key] = rawVal
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else {
      meta[key] = rawVal.replace(/^["']|["']$/g, '');
    }
  }

  return { meta, body };
}

interface BlockToken {
  kind: 'story_title' | 'h1' | 'h2' | 'h3' | 'break' | 'paragraph';
  text: string;
}

function buildDocumentFromTokens(
  tokens: BlockToken[],
  meta: {
    format: ImportFormat;
    sourceName: string;
    sourceUrl?: string;
    title?: string;
    author?: string;
    universe?: string;
    setting?: string;
    tone?: string;
    premise?: string;
    tagsHint?: Partial<StoryTags>;
  },
): ExtractedStoryDocument {
  let docTitle = meta.title?.trim() || undefined;
  const chapters: ImportedChapterDraft[] = [];
  let hasExplicitChapters = false;

  let currentChapter: ImportedChapterDraft = {
    chapterTitle: 'Opening',
    scenes: [],
  };
  let currentScene: ImportedSceneDraft = {
    sceneTitle: 'Opening Scene',
    paragraphs: [],
  };

  const flushScene = () => {
    if (currentScene.paragraphs.length > 0) {
      currentChapter.scenes.push(currentScene);
      const nextNum = currentChapter.scenes.length + 1;
      currentScene = {
        sceneTitle: `Scene ${nextNum}`,
        paragraphs: [],
      };
    }
  };

  const flushChapter = () => {
    flushScene();
    if (currentChapter.scenes.length > 0) {
      chapters.push(currentChapter);
    }
  };

  const hasSeenAnyProse = () =>
    chapters.length > 0 ||
    currentChapter.scenes.length > 0 ||
    currentScene.paragraphs.length > 0;

  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    if (tok.kind === 'break') {
      flushScene();
      continue;
    }

    if (tok.kind === 'story_title') {
      const cleaned = tok.text.trim();
      if (cleaned && !docTitle) {
        docTitle = cleaned.slice(0, 200);
      }
      continue;
    }

    if (tok.kind === 'h1') {
      const cleaned = tok.text.trim();
      if (!cleaned) continue;
      if (
        !docTitle &&
        !hasSeenAnyProse() &&
        !isChapterHeadingLine(cleaned).matched
      ) {
        docTitle = cleaned.slice(0, 200);
        continue;
      }
      hasExplicitChapters = true;
      flushChapter();
      currentChapter = {
        chapterTitle: cleaned.slice(0, 140),
        scenes: [],
      };
      currentScene = {
        sceneTitle: cleaned.slice(0, 120),
        paragraphs: [],
      };
      continue;
    }

    if (tok.kind === 'h2') {
      const cleaned = tok.text.trim();
      if (!cleaned) continue;
      hasExplicitChapters = true;
      flushChapter();
      currentChapter = {
        chapterTitle: cleaned.slice(0, 140),
        scenes: [],
      };
      currentScene = {
        sceneTitle: cleaned.slice(0, 120),
        paragraphs: [],
      };
      continue;
    }

    if (tok.kind === 'h3') {
      const cleaned = tok.text.trim();
      if (!cleaned) continue;
      flushScene();
      currentScene = {
        sceneTitle: cleaned.slice(0, 120),
        paragraphs: [],
      };
      continue;
    }

    const pText = cleanParagraphText(tok.text);
    if (!pText) continue;
    currentScene.paragraphs.push(pText);
  }

  flushChapter();

  if (chapters.length === 0) {
    throw new Error('No readable narrative prose was found in the source.');
  }

  return {
    format: meta.format,
    sourceName: meta.sourceName,
    sourceUrl: meta.sourceUrl,
    title: docTitle || deriveTitleFromFilename(meta.sourceName),
    author: meta.author?.trim() || undefined,
    universe: meta.universe?.trim() || undefined,
    setting: meta.setting?.trim() || undefined,
    tone: meta.tone?.trim() || undefined,
    premise: meta.premise?.trim() || undefined,
    tagsHint: meta.tagsHint,
    chapters,
    hasExplicitChapters,
  };
}

export function parsePlainTextDocument(
  rawText: string,
  sourceName = 'story.txt',
): ExtractedStoryDocument {
  const normalized = rawText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  let title: string | undefined;
  let author: string | undefined;
  let universe: string | undefined;
  let setting: string | undefined;
  let tone: string | undefined;
  let cursor = 0;

  // Inspect optional top metadata header lines ("Title: ...", "Author: ...")
  while (cursor < Math.min(lines.length, 10)) {
    const line = lines[cursor].trim();
    if (!line) {
      cursor += 1;
      continue;
    }
    const metaMatch = line.match(
      /^(Title|Author|By|Universe|Fandom|Setting|Tone|Genre)\s*:\s*(.+)$/i,
    );
    if (!metaMatch) break;
    const key = metaMatch[1].toLowerCase();
    const val = metaMatch[2].trim();
    if (key === 'title') title = val;
    else if (key === 'author' || key === 'by') author = val;
    else if (key === 'universe' || key === 'fandom') universe = val;
    else if (key === 'setting') setting = val;
    else if (key === 'tone' || key === 'genre') tone = val;
    cursor += 1;
  }

  const bodyLines = lines.slice(cursor);
  const tokens: BlockToken[] = [];
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    const joined = paragraphBuffer.join(' ').trim();
    if (
      joined &&
      tokens.length === 0 &&
      !title &&
      paragraphBuffer.length === 1 &&
      joined.length <= 100 &&
      !/[.!?]$/.test(joined)
    ) {
      const remainingNonEmpty = bodyLines
        .slice(currentLineIdx + 1)
        .some((l) => l.trim().length > 0);
      if (remainingNonEmpty) {
        tokens.push({ kind: 'story_title', text: joined });
        paragraphBuffer = [];
        return;
      }
    }
    if (joined) {
      tokens.push({ kind: 'paragraph', text: joined });
    }
    paragraphBuffer = [];
  };

  let currentLineIdx = 0;
  for (; currentLineIdx < bodyLines.length; currentLineIdx += 1) {
    const trimmed = bodyLines[currentLineIdx].trim();
    if (!trimmed) {
      flushParagraph();
      continue;
    }

    if (SCENE_DIVIDER_RE.test(trimmed)) {
      flushParagraph();
      tokens.push({ kind: 'break', text: '' });
      continue;
    }

    // Parse # Story Title, ## Chapter Title, ### Scene Title in TXT files
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+?)(?:\s+#+)?$/);
    if (headingMatch) {
      flushParagraph();
      const level = headingMatch[1].length;
      const headingText = headingMatch[2].trim();
      if (level === 1) {
        tokens.push({ kind: 'story_title', text: headingText });
      } else if (level === 2) {
        tokens.push({ kind: 'h2', text: headingText });
      } else {
        tokens.push({ kind: 'h3', text: headingText });
      }
      continue;
    }

    if (paragraphBuffer.length === 0) {
      const ch = isChapterHeadingLine(trimmed);
      if (ch.matched) {
        tokens.push({ kind: 'h2', text: ch.title });
        continue;
      }
      if (SCENE_HEADING_RE.test(trimmed) && trimmed.length <= 120) {
        tokens.push({ kind: 'h3', text: trimmed });
        continue;
      }
    }

    paragraphBuffer.push(trimmed);
  }

  currentLineIdx = bodyLines.length;
  flushParagraph();

  return buildDocumentFromTokens(tokens, {
    format: 'txt',
    sourceName,
    title,
    author,
    universe,
    setting,
    tone,
  });
}

export function parseMarkdownDocument(
  rawText: string,
  sourceName = 'story.md',
): ExtractedStoryDocument {
  const { meta, body } = parseFrontmatter(rawText);

  const rawTitle = typeof meta.title === 'string' ? meta.title : undefined;
  const rawAuthor = typeof meta.author === 'string' ? meta.author : undefined;
  const rawUniverse =
    typeof meta.universe === 'string'
      ? meta.universe
      : typeof meta.fandom === 'string'
        ? meta.fandom
        : undefined;
  const rawSetting = typeof meta.setting === 'string' ? meta.setting : undefined;
  const rawTone =
    typeof meta.tone === 'string'
      ? meta.tone
      : typeof meta.genre === 'string'
        ? meta.genre
        : undefined;
  const rawPremise =
    typeof meta.premise === 'string'
      ? meta.premise
      : typeof meta.summary === 'string'
        ? meta.summary
        : undefined;

  const tagsList = Array.isArray(meta.tags)
    ? meta.tags
    : typeof meta.tags === 'string'
      ? meta.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

  const tokens: BlockToken[] = [];
  const lines = body.split('\n');
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length > 0) {
      const joined = splitMarkdownInline(paragraphBuffer.join(' '));
      if (joined) {
        tokens.push({ kind: 'paragraph', text: joined });
      }
      paragraphBuffer = [];
    }
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      flushParagraph();
      continue;
    }

    if (SCENE_DIVIDER_RE.test(trimmed)) {
      flushParagraph();
      tokens.push({ kind: 'break', text: '' });
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+?)(?:\s+#+)?$/);
    if (headingMatch) {
      flushParagraph();
      const level = headingMatch[1].length;
      const headingText = splitMarkdownInline(headingMatch[2]);
      if (level === 1) {
        tokens.push({ kind: 'story_title', text: headingText });
      } else if (level === 2) {
        tokens.push({ kind: 'h2', text: headingText });
      } else {
        tokens.push({ kind: 'h3', text: headingText });
      }
      continue;
    }

    const ch = isChapterHeadingLine(splitMarkdownInline(trimmed));
    if (ch.matched && paragraphBuffer.length === 0) {
      tokens.push({ kind: 'h2', text: ch.title });
      continue;
    }

    paragraphBuffer.push(trimmed);
  }

  flushParagraph();

  return buildDocumentFromTokens(tokens, {
    format: 'md',
    sourceName,
    title: rawTitle,
    author: rawAuthor,
    universe: rawUniverse,
    setting: rawSetting,
    tone: rawTone,
    premise: rawPremise,
    tagsHint:
      tagsList.length > 0 || rawUniverse
        ? {
            ...(rawUniverse ? { fandoms: [rawUniverse] } : {}),
            ...(tagsList.length > 0 ? { freeforms: tagsList } : {}),
          }
        : undefined,
  });
}

function extractXmlTagText(xml: string, tagName: string): string | undefined {
  const re = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const m = xml.match(re);
  if (!m) return undefined;
  const cleaned = decodeXmlEntities(m[1].replace(/<[^>]+>/g, '')).trim();
  return cleaned || undefined;
}

export async function parseDocxBuffer(
  buffer: Buffer | Uint8Array,
  sourceName = 'story.docx',
): Promise<ExtractedStoryDocument> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error('The uploaded .docx file is corrupted or not a valid Word archive.');
  }

  const docFile = zip.file('word/document.xml');
  if (!docFile) {
    throw new Error('Invalid .docx document: missing word/document.xml.');
  }
  const docXml = await docFile.async('string');

  let title: string | undefined;
  let author: string | undefined;
  const coreFile = zip.file('docProps/core.xml');
  if (coreFile) {
    const coreXml = await coreFile.async('string');
    title = extractXmlTagText(coreXml, 'dc:title');
    author = extractXmlTagText(coreXml, 'dc:creator');
  }

  const tokens: BlockToken[] = [];
  const paragraphMatches = docXml.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>|<w:p\s*\/>/g) ?? [];

  for (const pXml of paragraphMatches) {
    const styleMatch = pXml.match(/<w:pStyle\s+w:val="([^"]+)"/i);
    const styleVal = styleMatch?.[1] ?? '';

    const normalizedXml = pXml
      .replace(/<w:tab\s*\/>/gi, '\t')
      .replace(/<w:br(?:\s[^>]*)?\/>/gi, '\n')
      .replace(/<w:cr\s*\/>/gi, '\n');

    const textParts: string[] = [];
    const runTextRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
    let tMatch: RegExpExecArray | null;
    while ((tMatch = runTextRe.exec(normalizedXml)) !== null) {
      textParts.push(decodeXmlEntities(tMatch[1]));
    }

    const rawText = cleanParagraphText(textParts.join(''));
    if (!rawText) continue;

    if (SCENE_DIVIDER_RE.test(rawText)) {
      tokens.push({ kind: 'break', text: '' });
      continue;
    }

    if (/^(Title|Heading1|Heading\s*1)$/i.test(styleVal)) {
      if (/^Title$/i.test(styleVal) && !title) {
        title = rawText.slice(0, 200);
        continue;
      }
      tokens.push({ kind: 'h1', text: rawText });
      continue;
    }

    if (/^(Heading2|Heading\s*2)$/i.test(styleVal)) {
      tokens.push({ kind: 'h2', text: rawText });
      continue;
    }

    if (/^(Heading[3-6]|Heading\s*[3-6]|Subtitle)$/i.test(styleVal)) {
      tokens.push({ kind: 'h3', text: rawText });
      continue;
    }

    const ch = isChapterHeadingLine(rawText);
    if (ch.matched) {
      tokens.push({ kind: 'h2', text: ch.title });
      continue;
    }

    if (SCENE_HEADING_RE.test(rawText) && rawText.length <= 120) {
      tokens.push({ kind: 'h3', text: rawText });
      continue;
    }

    tokens.push({ kind: 'paragraph', text: rawText });
  }

  return buildDocumentFromTokens(tokens, {
    format: 'docx',
    sourceName,
    title,
    author,
  });
}

function extractOdtBlockText(innerXml: string): string {
  const expanded = innerXml
    .replace(/<text:s(?:\s+text:c="([0-9]+)")?\s*\/>/gi, (_m, cnt) => {
      const n = cnt ? Math.min(Number.parseInt(cnt, 10) || 1, 16) : 1;
      return ' '.repeat(n);
    })
    .replace(/<text:tab\s*\/>/gi, '\t')
    .replace(/<text:line-break\s*\/>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  return cleanParagraphText(decodeXmlEntities(expanded));
}

export async function parseOdtBuffer(
  buffer: Buffer | Uint8Array,
  sourceName = 'story.odt',
): Promise<ExtractedStoryDocument> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error('The uploaded .odt file is corrupted or not a valid OpenDocument archive.');
  }

  const contentFile = zip.file('content.xml');
  if (!contentFile) {
    throw new Error('Invalid .odt document: missing content.xml.');
  }
  const contentXml = await contentFile.async('string');

  let title: string | undefined;
  let author: string | undefined;
  const metaFile = zip.file('meta.xml');
  if (metaFile) {
    const metaXml = await metaFile.async('string');
    title = extractXmlTagText(metaXml, 'dc:title');
    author =
      extractXmlTagText(metaXml, 'meta:initial-creator') ??
      extractXmlTagText(metaXml, 'dc:creator');
  }

  const tokens: BlockToken[] = [];
  const blockRe = /<text:(h|p)([^>]*)>([\s\S]*?)<\/text:\1>/g;
  let match: RegExpExecArray | null;

  while ((match = blockRe.exec(contentXml)) !== null) {
    const tagType = match[1];
    const attrs = match[2] ?? '';
    const inner = match[3] ?? '';
    const text = extractOdtBlockText(inner);
    if (!text) continue;

    if (SCENE_DIVIDER_RE.test(text)) {
      tokens.push({ kind: 'break', text: '' });
      continue;
    }

    if (tagType === 'h') {
      const levelMatch = attrs.match(/text:outline-level="([0-9]+)"/i);
      const level = levelMatch ? Number.parseInt(levelMatch[1], 10) : 1;
      if (level <= 1) {
        tokens.push({ kind: 'h1', text });
      } else if (level === 2) {
        tokens.push({ kind: 'h2', text });
      } else {
        tokens.push({ kind: 'h3', text });
      }
      continue;
    }

    const styleMatch = attrs.match(/text:style-name="([^"]+)"/i);
    const styleName = styleMatch?.[1] ?? '';
    if (/^Title$/i.test(styleName) && !title) {
      title = text.slice(0, 200);
      continue;
    }

    const ch = isChapterHeadingLine(text);
    if (ch.matched) {
      tokens.push({ kind: 'h2', text: ch.title });
      continue;
    }

    if (SCENE_HEADING_RE.test(text) && text.length <= 120) {
      tokens.push({ kind: 'h3', text });
      continue;
    }

    tokens.push({ kind: 'paragraph', text });
  }

  return buildDocumentFromTokens(tokens, {
    format: 'odt',
    sourceName,
    title,
    author,
  });
}

function mapAo3Rating(raw: string): Ao3Rating | undefined {
  const lower = raw.toLowerCase();
  if (lower.includes('general')) return 'General Audiences';
  if (lower.includes('teen')) return 'Teen And Up Audiences';
  if (lower.includes('mature')) return 'Mature';
  if (lower.includes('explicit')) return 'Explicit';
  if (lower.includes('not rated')) return 'Not Rated';
  return AO3_RATINGS.find((r) => r.toLowerCase() === lower);
}

function mapAo3Warnings(list: string[]): Ao3Warning[] {
  const out: Ao3Warning[] = [];
  for (const item of list) {
    const lower = item.toLowerCase();
    const matched = AO3_WARNINGS.find(
      (w) => w.toLowerCase() === lower || lower.includes(w.toLowerCase()),
    );
    if (matched && !out.includes(matched)) out.push(matched);
  }
  return out;
}

function mapAo3Categories(list: string[]): Ao3Category[] {
  const out: Ao3Category[] = [];
  for (const item of list) {
    const matched = AO3_CATEGORIES.find(
      (c) => c.toLowerCase() === item.trim().toLowerCase(),
    );
    if (matched && !out.includes(matched)) out.push(matched);
  }
  return out;
}

export function parseHtmlDocument(
  html: string,
  sourceUrl?: string,
  sourceName = 'web-story.html',
): ExtractedStoryDocument {
  const dom = new JSDOM(html);
  const { document } = dom.window;

  // AO3-aware metadata extraction when present
  const ao3Meta = document.querySelector('dl.work.meta, #workskin');
  let title =
    document.querySelector('h2.title.heading')?.textContent?.trim() ||
    document
      .querySelector('meta[property="og:title"]')
      ?.getAttribute('content')
      ?.trim() ||
    document.querySelector('title')?.textContent?.trim() ||
    undefined;

  // Strip common site suffix like " - Archive of Our Own" or " | Royal Road"
  if (title) {
    title = title
      .replace(/\s*[-–|]\s*(?:Archive of Our Own|AO3|Wattpad|Medium|Substack).*$/i, '')
      .trim();
  }

  const author =
    document.querySelector('a[rel="author"], .byline a[rel="author"]')?.textContent?.trim() ||
    document.querySelector('meta[name="author"]')?.getAttribute('content')?.trim() ||
    undefined;

  let premise =
    document.querySelector('div.summary blockquote.userstuff')?.textContent?.trim() ||
    document
      .querySelector('meta[name="description"], meta[property="og:description"]')
      ?.getAttribute('content')
      ?.trim() ||
    undefined;

  let tagsHint: Partial<StoryTags> | undefined;
  let universe: string | undefined;

  if (ao3Meta) {
    const readTagLinks = (selector: string) =>
      Array.from(document.querySelectorAll(selector))
        .map((el) => el.textContent?.trim() || '')
        .filter(Boolean);

    const ratings = readTagLinks('dd.rating.tags a.tag');
    const warnings = readTagLinks('dd.warning.tags a.tag');
    const categories = readTagLinks('dd.category.tags a.tag');
    const fandoms = readTagLinks('dd.fandom.tags a.tag');
    const relationships = readTagLinks('dd.relationship.tags a.tag');
    const characters = readTagLinks('dd.character.tags a.tag');
    const freeforms = readTagLinks('dd.freeform.tags a.tag');

    if (fandoms.length > 0) {
      universe = fandoms[0];
    }

    const mappedRating = ratings[0] ? mapAo3Rating(ratings[0]) : undefined;
    const mappedWarnings = mapAo3Warnings(warnings);
    const mappedCategories = mapAo3Categories(categories);

    if (
      mappedRating ||
      mappedWarnings.length > 0 ||
      mappedCategories.length > 0 ||
      fandoms.length > 0 ||
      relationships.length > 0 ||
      characters.length > 0 ||
      freeforms.length > 0
    ) {
      tagsHint = {
        ...(mappedRating ? { rating: mappedRating } : {}),
        ...(mappedWarnings.length > 0 ? { warnings: mappedWarnings } : {}),
        ...(mappedCategories.length > 0 ? { categories: mappedCategories } : {}),
        ...(fandoms.length > 0 ? { fandoms } : {}),
        ...(relationships.length > 0 ? { relationships } : {}),
        ...(characters.length > 0 ? { characters } : {}),
        ...(freeforms.length > 0 ? { freeforms } : {}),
      };
    }
  }

  // Remove non-narrative chrome before extracting story body
  const noiseSelectors = [
    'script',
    'style',
    'noscript',
    'svg',
    'iframe',
    'nav',
    'aside',
    'footer',
    '.comments',
    '#feedback',
    '.navigation',
    'dl.work.meta',
    'div.preface.group > div.summary',
  ];
  for (const sel of noiseSelectors) {
    document.querySelectorAll(sel).forEach((el) => el.remove());
  }

  const rootContainer =
    document.querySelector('#chapters') ||
    document.querySelector('#workskin') ||
    document.querySelector('article') ||
    document.querySelector('main') ||
    document.querySelector('[role="main"]') ||
    document.querySelector('.chapter-content, .entry-content, .post-content') ||
    document.body;

  const tokens: BlockToken[] = [];

  const chapterEls = document.querySelectorAll('#chapters div.chapter');
  if (chapterEls.length > 0) {
    chapterEls.forEach((chEl, idx) => {
      const chHeading =
        chEl.querySelector('h3.title')?.textContent?.trim() ||
        `Chapter ${idx + 1}`;
      tokens.push({ kind: 'h2', text: chHeading.replace(/\s+/g, ' ') });

      const userstuff = chEl.querySelector('div.userstuff') || chEl;
      userstuff.querySelectorAll('h1, h2, h3, h4, hr, p, blockquote').forEach((node) => {
        const tag = node.tagName.toLowerCase();
        if (tag === 'hr') {
          tokens.push({ kind: 'break', text: '' });
          return;
        }
        const txt = cleanParagraphText(node.textContent || '');
        if (!txt) return;
        if (tag === 'h3' || tag === 'h4') {
          tokens.push({ kind: 'h3', text: txt });
        } else if (SCENE_DIVIDER_RE.test(txt)) {
          tokens.push({ kind: 'break', text: '' });
        } else {
          tokens.push({ kind: 'paragraph', text: txt });
        }
      });
    });
  } else if (rootContainer) {
    const blocks = rootContainer.querySelectorAll(
      'h1, h2, h3, h4, hr, p, blockquote, pre',
    );
    if (blocks.length > 0) {
      blocks.forEach((node) => {
        // Avoid duplicating nested p inside blockquote
        if (
          node.tagName.toLowerCase() === 'p' &&
          node.closest('blockquote')
        ) {
          return;
        }
        const tag = node.tagName.toLowerCase();
        if (tag === 'hr') {
          tokens.push({ kind: 'break', text: '' });
          return;
        }
        const txt = cleanParagraphText(node.textContent || '');
        if (!txt) return;
        if (SCENE_DIVIDER_RE.test(txt)) {
          tokens.push({ kind: 'break', text: '' });
          return;
        }
        if (tag === 'h1') {
          tokens.push({ kind: 'h1', text: txt });
        } else if (tag === 'h2') {
          tokens.push({ kind: 'h2', text: txt });
        } else if (tag === 'h3' || tag === 'h4') {
          tokens.push({ kind: 'h3', text: txt });
        } else {
          const ch = isChapterHeadingLine(txt);
          if (ch.matched) {
            tokens.push({ kind: 'h2', text: ch.title });
          } else {
            tokens.push({ kind: 'paragraph', text: txt });
          }
        }
      });
    } else {
      // Fallback if HTML had plain text without <p> tags
      const plain = parsePlainTextDocument(
        rootContainer.textContent || '',
        sourceName,
      );
      return {
        ...plain,
        format: 'html',
        sourceUrl,
        title: title || plain.title,
        author: author || plain.author,
        universe: universe || plain.universe,
        premise: premise || plain.premise,
        tagsHint,
      };
    }
  }

  return buildDocumentFromTokens(tokens, {
    format: 'html',
    sourceName,
    sourceUrl,
    title,
    author,
    universe,
    premise,
    tagsHint,
  });
}

export interface ResolvedImportAddress {
  address: string;
  family: 4 | 6;
}

export type ImportDnsLookupFn = (
  hostname: string,
) => Promise<ResolvedImportAddress[]>;

export interface ValidatedImportTarget {
  url: URL;
  addresses: ResolvedImportAddress[];
}

function parseMappedIpv4FromIpv6(ip: string): string | null {
  if (!ip.startsWith('::ffff:')) return null;
  const suffix = ip.slice('::ffff:'.length);
  if (net.isIPv4(suffix)) return suffix;
  const hexMatch = suffix.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!hexMatch) return null;
  const hi = Number.parseInt(hexMatch[1], 16);
  const lo = Number.parseInt(hexMatch[2], 16);
  if (Number.isNaN(hi) || Number.isNaN(lo)) return null;
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

export function isDisallowedIpAddress(ip: string): boolean {
  const trimmed = ip.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!trimmed || trimmed.includes('%')) return true;

  const version = net.isIP(trimmed);
  if (version === 4) {
    const octets = trimmed.split('.').map((n) => Number.parseInt(n, 10));
    if (octets.length !== 4 || octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
      return true;
    }
    const [a, b, c] = octets;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // Cloud metadata / link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC 1918
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // IETF / TEST-NET-1
    if (a === 192 && b === 168) return true; // RFC 1918
    if (a === 198 && (b === 18 || b === 19)) return true; // Benchmarking
    if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
    if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // Multicast & reserved
    return false;
  }

  if (version === 6) {
    const mappedV4 = parseMappedIpv4FromIpv6(trimmed);
    if (mappedV4) {
      return isDisallowedIpAddress(mappedV4);
    }
    if (
      trimmed === '::' ||
      trimmed === '::1' ||
      /^fe[89ab][0-9a-f]:/.test(trimmed) ||
      /^f[cd][0-9a-f]{0,2}:/.test(trimmed) ||
      /^ff[0-9a-f]{0,2}:/.test(trimmed) ||
      trimmed.startsWith('2001:db8:') ||
      trimmed.startsWith('2001:0db8:') ||
      trimmed.startsWith('64:ff9b:') ||
      trimmed.startsWith('100::')
    ) {
      return true;
    }
    return false;
  }

  return true;
}

export async function validateAndResolveImportTarget(
  rawUrl: string,
  options?: {
    skipDnsLookup?: boolean;
    dnsLookup?: ImportDnsLookupFn;
  },
): Promise<ValidatedImportTarget> {
  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim().length > 2048) {
    throw new Error('Please enter a valid http:// or https:// story URL.');
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('Please enter a valid http:// or https:// story URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http:// and https:// URLs are supported for story import.');
  }

  if (parsed.username || parsed.password) {
    throw new Error('URLs with embedded credentials are not allowed.');
  }

  const rawHostname = parsed.hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  const hostname = rawHostname.replace(/\.+$/, '');
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.home.arpa') ||
    hostname.endsWith('.localdomain') ||
    hostname.endsWith('.lan') ||
    hostname === 'metadata.google.internal'
  ) {
    throw new Error('Local or internal network URLs are not allowed.');
  }

  const literalVersion = net.isIP(hostname);
  if (literalVersion === 4 || literalVersion === 6) {
    if (isDisallowedIpAddress(hostname)) {
      throw new Error('Private or loopback IP addresses are not allowed.');
    }
    return {
      url: parsed,
      addresses: [{ address: hostname, family: literalVersion }],
    };
  }

  if (options?.skipDnsLookup) {
    return { url: parsed, addresses: [] };
  }

  try {
    const resolved = options?.dnsLookup
      ? await options.dnsLookup(hostname)
      : (await dns.lookup(hostname, { all: true })).map((entry) => ({
          address: entry.address,
          family: (entry.family === 6 ? 6 : 4) as 4 | 6,
        }));

    if (!resolved || resolved.length === 0) {
      throw new Error('Could not resolve target hostname.');
    }

    const addresses: ResolvedImportAddress[] = [];
    for (const addr of resolved) {
      if (isDisallowedIpAddress(addr.address)) {
        throw new Error('URL resolves to a restricted internal network address.');
      }
      addresses.push({
        address: addr.address,
        family: net.isIPv6(addr.address) ? 6 : 4,
      });
    }

    return { url: parsed, addresses };
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes('restricted internal network') ||
        err.message.includes('not allowed'))
    ) {
      throw err;
    }
    throw new Error('Could not resolve story URL hostname.');
  }
}

export async function validateAndResolveImportUrl(
  rawUrl: string,
  options?: {
    skipDnsLookup?: boolean;
    dnsLookup?: ImportDnsLookupFn;
  },
): Promise<URL> {
  const target = await validateAndResolveImportTarget(rawUrl, options);
  return target.url;
}

function splitLongSceneParagraphs(
  scenes: ImportedSceneDraft[],
  targetParagraphsPerScene: number,
): ImportedSceneDraft[] {
  const out: ImportedSceneDraft[] = [];
  for (const scene of scenes) {
    if (scene.paragraphs.length <= targetParagraphsPerScene) {
      out.push(scene);
      continue;
    }
    const chunkCount = Math.ceil(scene.paragraphs.length / targetParagraphsPerScene);
    for (let i = 0; i < chunkCount; i += 1) {
      const slice = scene.paragraphs.slice(
        i * targetParagraphsPerScene,
        (i + 1) * targetParagraphsPerScene,
      );
      out.push({
        sceneTitle:
          i === 0 ? scene.sceneTitle : `${scene.sceneTitle} (Part ${i + 1})`,
        paragraphs: slice,
        location: scene.location,
        inStoryTime: scene.inStoryTime,
      });
    }
  }
  return out;
}

function extractFallbackCharacterNames(
  extracted: ExtractedStoryDocument,
  tagsHint?: Partial<StoryTags>,
): string[] {
  const fromTags = (tagsHint?.characters ?? [])
    .map((c) => c.trim())
    .filter(Boolean);
  if (fromTags.length > 0) {
    return Array.from(new Set(fromTags)).slice(0, 8);
  }

  const stopwords = new Set([
    'The', 'And', 'But', 'Then', 'When', 'Where', 'While', 'What', 'With',
    'From', 'Into', 'After', 'Before', 'Chapter', 'Scene', 'Part', 'Book',
    'Prologue', 'Epilogue', 'Once', 'There', 'Here', 'This', 'That', 'These',
    'Those', 'They', 'Their', 'Them', 'She', 'Her', 'His', 'Him', 'You',
    'Your', 'Our', 'However', 'Perhaps', 'Suddenly', 'Inside', 'Outside',
    'Across', 'Beneath', 'Above', 'Under', 'Nothing', 'Something', 'Everyone',
    'Someone', 'Morning', 'Evening', 'Night', 'Monday', 'Tuesday', 'Wednesday',
    'Thursday', 'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March',
    'April', 'May', 'June', 'July', 'August', 'September', 'October',
    'November', 'December',
  ]);

  const counts = new Map<string, number>();
  const sampleParagraphs = extracted.chapters
    .flatMap((c) => c.scenes.flatMap((s) => s.paragraphs))
    .slice(0, 40)
    .join('\n');

  // Match capitalized words not purely at start of line, or names followed by speech verbs
  const speechRe =
    /\b([A-Z][a-z]{2,18}(?:\s+[A-Z][a-z]{2,18})?)\s+(?:said|asked|whispered|replied|murmured|nodded|looked|turned|walked|smiled)\b/g;
  let m: RegExpExecArray | null;
  while ((m = speechRe.exec(sampleParagraphs)) !== null) {
    const candidate = m[1].trim();
    if (!stopwords.has(candidate.split(' ')[0])) {
      counts.set(candidate, (counts.get(candidate) ?? 0) + 3);
    }
  }

  const midSentenceProperRe = /(?<=[a-z,;]\s+)([A-Z][a-z]{2,16})\b/g;
  while ((m = midSentenceProperRe.exec(sampleParagraphs)) !== null) {
    const candidate = m[1].trim();
    if (!stopwords.has(candidate)) {
      counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name]) => name);
}

function buildSampleExcerptText(extracted: ExtractedStoryDocument): string {
  const allParagraphs = extracted.chapters.flatMap((ch) =>
    ch.scenes.flatMap((sc) => sc.paragraphs),
  );
  const fullJoined = allParagraphs.join('\n\n');
  if (fullJoined.length <= 10000) {
    return fullJoined;
  }
  const opening = fullJoined.slice(0, 4200);
  const midStart = Math.max(0, Math.floor(fullJoined.length / 2) - 1000);
  const middle = fullJoined.slice(midStart, midStart + 2000);
  const ending = fullJoined.slice(-3800);
  return `${opening}\n\n[...middle excerpt...]\n\n${middle}\n\n[...latest excerpt...]\n\n${ending}`;
}

export async function structureExtractedStory(
  extracted: ExtractedStoryDocument,
  options: ImportStoryOptions = {},
): Promise<ImportStoryResult> {
  const warnings: string[] = [];
  const now = Date.now();
  const baseStamp = now.toString(36);

  // Merge user-supplied metadata hints with parsed document hints
  let resolvedTitle =
    options.title?.trim() || extracted.title || deriveTitleFromFilename(extracted.sourceName);
  let resolvedUniverse =
    options.universe?.trim() || extracted.universe || 'Imported Manuscript';
  let resolvedSetting =
    options.setting?.trim() ||
    extracted.setting ||
    (extracted.sourceUrl ? `Imported from ${new URL(extracted.sourceUrl).hostname}` : `Imported from ${extracted.format.toUpperCase()} document`);
  let resolvedTone = options.tone?.trim() || extracted.tone || 'Literary Fiction';

  const firstParagraphs = extracted.chapters
    .flatMap((c) => c.scenes.flatMap((s) => s.paragraphs))
    .slice(0, 2)
    .join(' ');
  let resolvedPremise =
    extracted.premise ||
    firstParagraphs.slice(0, 600).trim() ||
    `Imported story manuscript from ${extracted.sourceName}.`;

  let characters: CharacterProfile[] = [];
  let crossIndex: CrossIndexEntry[] = [];
  let mergedTagsHint: Partial<StoryTags> | undefined = extracted.tagsHint;
  let continuationChoices: StoryChoice[] = [
    {
      id: `choice-imp-1-${baseStamp}`,
      label: 'Continue directly from the last scene',
      intent: 'Advance narrative momentum cleanly',
      consequenceHint: 'Continues with full Cross-Index continuity.',
    },
    {
      id: `choice-imp-2-${baseStamp}`,
      label: 'Shift focus to another character’s perspective',
      intent: 'Deepen ensemble tension',
      consequenceHint: 'Explores parallel events in the same setting.',
    },
    {
      id: `choice-imp-3-${baseStamp}`,
      label: 'Introduce an unexpected canon complication',
      intent: 'Escalate stakes',
      consequenceHint: 'Challenges active plot threads.',
    },
  ];

  let aiEnriched = false;
  if (options.enrichWithAi && options.enricher) {
    try {
      const sampleText = buildSampleExcerptText(extracted);
      const enrichment = await options.enricher(
        {
          title: resolvedTitle,
          author: extracted.author,
          source: extracted.sourceUrl || extracted.sourceName,
          universeHint: options.universe?.trim() || extracted.universe,
          settingHint: options.setting?.trim() || extracted.setting,
          toneHint: options.tone?.trim() || extracted.tone,
          premiseHint: extracted.premise,
          sampleText,
        },
        options.modelConfig,
      );
      aiEnriched = true;

      if (!options.title?.trim() && enrichment.title?.trim()) {
        resolvedTitle = enrichment.title.trim();
      }
      if (!options.universe?.trim() && enrichment.universe?.trim()) {
        resolvedUniverse = enrichment.universe.trim();
      }
      if (!options.setting?.trim() && enrichment.setting?.trim()) {
        resolvedSetting = enrichment.setting.trim();
      }
      if (!options.tone?.trim() && enrichment.tone?.trim()) {
        resolvedTone = enrichment.tone.trim();
      }
      if (!extracted.premise && enrichment.premise?.trim()) {
        resolvedPremise = enrichment.premise.trim();
      }

      if (Array.isArray(enrichment.characters) && enrichment.characters.length > 0) {
        characters = enrichment.characters.slice(0, 12).map((c, idx) => ({
          id: `char-${baseStamp}-${idx + 1}`,
          name: (c.name || `Character ${idx + 1}`).slice(0, 100),
          role: c.role || (idx === 0 ? 'Protagonist' : 'Companion'),
          origin: c.origin === 'canon' ? 'canon' : 'original',
          summary: c.summary || 'Appears in the imported manuscript.',
          pros: Array.isArray(c.pros) && c.pros.length > 0 ? c.pros : ['Resourceful'],
          flaws: Array.isArray(c.flaws) && c.flaws.length > 0 ? c.flaws : ['Guarded'],
          motivation: c.motivation || 'Navigate the central conflict.',
          voiceAndMannerisms: c.voiceAndMannerisms || 'Consistent with imported prose.',
          status: c.status || 'Active',
          location: c.location || resolvedSetting,
          inventory: Array.isArray(c.inventory) ? c.inventory : [],
          relationships: Array.isArray(c.relationships) ? c.relationships : [],
          deducedFromContext: true,
        }));
      }

      if (Array.isArray(enrichment.crossIndex) && enrichment.crossIndex.length > 0) {
        crossIndex = enrichment.crossIndex.slice(0, 20).map((entry, idx) => ({
          id: `ci-${baseStamp}-${idx + 1}`,
          category: entry.category || 'plot_thread',
          title: (entry.title || `Imported Anchor ${idx + 1}`).slice(0, 120),
          detail: entry.detail || 'Extracted from imported manuscript.',
          tags: Array.isArray(entry.tags) ? entry.tags : ['imported'],
          status: 'active',
          introducedAtTurn: 1,
          lastVerifiedTurn: 1,
          pinned: Boolean(entry.pinned),
        }));
      }

      if (enrichment.tagsHint) {
        mergedTagsHint = {
          ...enrichment.tagsHint,
          ...extracted.tagsHint,
          fandoms: Array.from(
            new Set([
              ...(extracted.tagsHint?.fandoms ?? []),
              ...(enrichment.tagsHint.fandoms ?? []),
            ]),
          ),
          characters: Array.from(
            new Set([
              ...(extracted.tagsHint?.characters ?? []),
              ...(enrichment.tagsHint.characters ?? []),
            ]),
          ),
          freeforms: Array.from(
            new Set([
              ...(extracted.tagsHint?.freeforms ?? []),
              ...(enrichment.tagsHint.freeforms ?? []),
            ]),
          ),
        };
      }

      if (
        Array.isArray(enrichment.continuationChoices) &&
        enrichment.continuationChoices.length > 0
      ) {
        continuationChoices = enrichment.continuationChoices.slice(0, 4).map((ch, idx) => ({
          id: `choice-imp-${idx + 1}-${baseStamp}`,
          label: ch.label,
          intent: ch.intent,
          consequenceHint: ch.consequenceHint,
        }));
      }
    } catch {
      warnings.push(
        'AI cast/lore analysis was skipped because enrichment was unavailable. Imported full manuscript cleanly using structural parsing.',
      );
    }
  }

  // Deterministic fallbacks for characters & cross-index
  if (characters.length === 0) {
    const detectedNames = extractFallbackCharacterNames(extracted, mergedTagsHint);
    if (detectedNames.length > 0) {
      characters = detectedNames.map((name, idx) => ({
        id: `char-${baseStamp}-${idx + 1}`,
        name,
        role: idx === 0 ? 'Protagonist' : 'Companion',
        origin: 'original',
        summary: `Extracted from ${extracted.sourceName}.`,
        pros: ['Observed in imported narrative'],
        flaws: ['Open for author refinement'],
        motivation: 'Active within the imported story.',
        voiceAndMannerisms: 'Defined in the imported scenes.',
        status: 'Active',
        location: resolvedSetting.slice(0, 120),
        inventory: [],
        relationships: [],
        deducedFromContext: true,
      }));
    } else {
      characters = [
        {
          id: `char-${baseStamp}-1`,
          name: extracted.author ? `${extracted.author}'s Protagonist` : 'Lead Protagonist',
          role: 'Protagonist',
          origin: 'original',
          summary: `Primary viewpoint character in “${resolvedTitle}”.`,
          pros: ['Central perspective'],
          flaws: ['Details pending character audit'],
          motivation: 'Carry the narrative forward.',
          voiceAndMannerisms: 'Consistent with imported prose.',
          status: 'Active',
          location: resolvedSetting.slice(0, 120),
          inventory: [],
          relationships: [],
          deducedFromContext: false,
        },
      ];
    }
  }

  if (crossIndex.length === 0) {
    crossIndex = [
      {
        id: `ci-${baseStamp}-1`,
        category: 'world_rule',
        title: 'Imported Source Origin',
        detail: extracted.sourceUrl
          ? `Imported from ${extracted.sourceUrl}${extracted.author ? ` by ${extracted.author}` : ''}.`
          : `Imported from ${extracted.sourceName} (${extracted.format.toUpperCase()}).`,
        tags: ['imported', extracted.format],
        status: 'active',
        introducedAtTurn: 1,
        lastVerifiedTurn: 1,
        pinned: true,
      },
    ];
  }

  // Split very long unbroken scenes into comfortable reading scenes while respecting cloud turn limits
  const totalParagraphs = extracted.chapters.reduce(
    (acc, ch) => acc + ch.scenes.reduce((sAcc, sc) => sAcc + sc.paragraphs.length, 0),
    0,
  );
  const minParagraphsPerScene = Math.max(
    10,
    Math.ceil(totalParagraphs / MAX_TURNS_FOR_CLOUD),
  );

  const normalizedChaptersInput = extracted.chapters
    .slice(0, MAX_CHAPTERS_FOR_CLOUD)
    .map((ch) => ({
      ...ch,
      scenes: splitLongSceneParagraphs(ch.scenes, minParagraphsPerScene),
    }));

  if (extracted.chapters.length > MAX_CHAPTERS_FOR_CLOUD) {
    warnings.push(
      `Manuscript contained ${extracted.chapters.length} chapters; condensed trailing sections to fit the ${MAX_CHAPTERS_FOR_CLOUD}-chapter workspace limit.`,
    );
  }

  // Flatten and ensure turns <= MAX_TURNS_FOR_CLOUD by grouping overflow paragraphs into final turn if gigantic
  const rawTurnEntries: Array<{
    chapterIdx: number;
    scene: ImportedSceneDraft;
  }> = [];

  normalizedChaptersInput.forEach((ch, chIdx) => {
    ch.scenes.forEach((sc) => {
      rawTurnEntries.push({ chapterIdx: chIdx, scene: sc });
    });
  });

  if (rawTurnEntries.length > MAX_TURNS_FOR_CLOUD) {
    const kept = rawTurnEntries.slice(0, MAX_TURNS_FOR_CLOUD - 1);
    const overflow = rawTurnEntries.slice(MAX_TURNS_FOR_CLOUD - 1);
    kept.push({
      chapterIdx: overflow[0].chapterIdx,
      scene: {
        sceneTitle: `${overflow[0].scene.sceneTitle} (Continued)`,
        paragraphs: overflow.flatMap((o) => o.scene.paragraphs),
      },
    });
    rawTurnEntries.length = 0;
    rawTurnEntries.push(...kept);
    warnings.push(
      `Long manuscript condensed across ${MAX_TURNS_FOR_CLOUD} scenes without dropping text.`,
    );
  }

  const charNames = characters.map((c) => c.name);
  const turns: StoryTurn[] = [];
  const chapterTurnIds = new Map<number, string[]>();

  rawTurnEntries.forEach((item, idx) => {
    const turnNum = idx + 1;
    const turnId = `turn-${baseStamp}-${turnNum}`;
    const isLast = idx === rawTurnEntries.length - 1;
    const activeChars = charNames.filter((n) =>
      item.scene.paragraphs.some((p) =>
        p.toLowerCase().includes(n.toLowerCase().split(' ')[0]),
      ),
    );

    const turn: StoryTurn = {
      id: turnId,
      turnNumber: turnNum,
      sceneTitle: item.scene.sceneTitle.slice(0, 140) || `Scene ${turnNum}`,
      location: item.scene.location || resolvedSetting.slice(0, 120),
      inStoryTime: item.scene.inStoryTime || `Imported Scene ${turnNum}`,
      userAction: idx === 0 ? null : `Continue to ${item.scene.sceneTitle.slice(0, 80)}`,
      prose: item.scene.paragraphs,
      choices: isLast ? continuationChoices : [],
      selectedChoiceId: null,
      activeCharacters: activeChars.length > 0 ? activeChars : charNames.slice(0, 3),
      continuityNotes:
        idx === 0
          ? [`Imported (${extracted.format.toUpperCase()}) from ${extracted.sourceName}`]
          : [],
      continuityWarning: null,
      timestamp: now + idx,
    };

    turns.push(turn);
    const list = chapterTurnIds.get(item.chapterIdx) ?? [];
    list.push(turnId);
    chapterTurnIds.set(item.chapterIdx, list);
  });

  // Update Cross-Index lastVerifiedTurn
  const lastTurnNumber = turns[turns.length - 1]?.turnNumber ?? 1;
  crossIndex = crossIndex.map((entry) => ({
    ...entry,
    lastVerifiedTurn: lastTurnNumber,
  }));

  const shouldCreateChapters =
    extracted.hasExplicitChapters || normalizedChaptersInput.length > 1;
  const chapters: StoryChapter[] = shouldCreateChapters
    ? normalizedChaptersInput
        .map((ch, idx) => {
          const turnIds = chapterTurnIds.get(idx) ?? [];
          if (turnIds.length === 0) return null;
          const preview = ch.scenes[0]?.paragraphs[0] ?? '';
          return {
            id: `chap-${baseStamp}-${idx + 1}`,
            chapterNumber: idx + 1,
            title: ch.chapterTitle.slice(0, 140) || `Chapter ${idx + 1}`,
            summary: (ch.summary || preview).slice(0, 280),
            turnIds,
            mergedAt: now,
          };
        })
        .filter((c): c is StoryChapter => Boolean(c))
    : [];

  const protagonist =
    characters.find((c) => c.role === 'Protagonist') ?? characters[0];

  const finalUniverse = resolvedUniverse.slice(0, 200);
  const finalTone = resolvedTone.slice(0, 200);
  const defaultTags = createDefaultTagsForProject({
    universe: finalUniverse,
    tone: finalTone,
    characters,
  });
  const tags = normalizeStoryTags(
    {
      ...defaultTags,
      ...mergedTagsHint,
      fandoms:
        mergedTagsHint?.fandoms && mergedTagsHint.fandoms.length > 0
          ? mergedTagsHint.fandoms
          : defaultTags.fandoms,
      characters:
        mergedTagsHint?.characters && mergedTagsHint.characters.length > 0
          ? mergedTagsHint.characters
          : defaultTags.characters,
      freeforms: Array.from(
        new Set([
          ...(mergedTagsHint?.freeforms ?? []),
          ...defaultTags.freeforms,
          'Imported Story',
        ]),
      ),
    },
    { universe: finalUniverse, tone: finalTone, characters },
  );

  const project: StoryProject = {
    id: `proj-${baseStamp}-${Math.random().toString(36).slice(2, 6)}`,
    title: resolvedTitle.slice(0, 200) || 'Imported Story',
    universe: finalUniverse,
    setting: resolvedSetting.slice(0, 400),
    tone: finalTone,
    premise: resolvedPremise.slice(0, 4000),
    protagonistId: protagonist?.id ?? '',
    turns,
    characters,
    crossIndex,
    chapters,
    savePoints: [],
    isPrivate: options.isPrivate !== false,
    tags,
    updatedAt: now,
  };

  return {
    project,
    stats: {
      format: extracted.format,
      sourceName: extracted.sourceName,
      wordCount: countStoryWords(turns),
      chapterCount: chapters.length,
      sceneCount: turns.length,
      characterCount: characters.length,
      crossIndexCount: crossIndex.length,
      aiEnriched,
    },
    warnings,
  };
}

export function detectFileFormat(
  filename: string,
  mimeType?: string,
): Exclude<ImportFormat, 'html'> | 'html' | null {
  const lowerName = filename.trim().toLowerCase();
  const lowerMime = (mimeType || '').trim().toLowerCase();

  if (lowerName.endsWith('.docx') || lowerMime.includes('wordprocessingml')) {
    return 'docx';
  }
  if (lowerName.endsWith('.odt') || lowerMime.includes('opendocument.text')) {
    return 'odt';
  }
  if (lowerName.endsWith('.md') || lowerName.endsWith('.markdown') || lowerMime.includes('markdown')) {
    return 'md';
  }
  if (lowerName.endsWith('.txt') || lowerMime === 'text/plain') {
    return 'txt';
  }
  if (lowerName.endsWith('.html') || lowerName.endsWith('.htm') || lowerMime.includes('text/html')) {
    return 'html';
  }
  return null;
}

export async function importStoryFromFileBuffer(input: {
  filename: string;
  mimeType?: string;
  buffer: Buffer;
  options?: ImportStoryOptions;
}): Promise<ImportStoryResult> {
  if (!input.filename || !input.filename.trim()) {
    throw new Error('Filename is required.');
  }
  if (input.buffer.byteLength === 0) {
    throw new Error('The uploaded file is empty.');
  }
  if (input.buffer.byteLength > MAX_FILE_BYTES) {
    throw new Error('Uploaded file exceeds the 10 MB size limit.');
  }

  const format = detectFileFormat(input.filename, input.mimeType);
  if (!format || format === 'html') {
    throw new Error(
      'Unsupported file format. Please upload a .txt, .md, .docx, or .odt document.',
    );
  }

  let extracted: ExtractedStoryDocument;
  if (format === 'docx') {
    extracted = await parseDocxBuffer(input.buffer, input.filename);
  } else if (format === 'odt') {
    extracted = await parseOdtBuffer(input.buffer, input.filename);
  } else if (format === 'md') {
    extracted = parseMarkdownDocument(input.buffer.toString('utf8'), input.filename);
  } else {
    extracted = parsePlainTextDocument(input.buffer.toString('utf8'), input.filename);
  }

  return structureExtractedStory(extracted, input.options);
}

interface PinnedFetchResponse {
  status: number;
  statusText: string;
  headers: Headers;
  bodyBuffer: Buffer;
}

const DEFAULT_FETCH_HEADERS = {
  'User-Agent': 'FolioAndCanon-StoryImporter/1.0 (+https://folioandcanon.local)',
  Accept:
    'text/html,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text;q=0.9,*/*;q=0.8',
};

function fetchSingleHopWithPinnedDns(
  targetUrl: URL,
  addresses: ResolvedImportAddress[],
  signal: AbortSignal,
): Promise<PinnedFetchResponse> {
  return new Promise((resolve, reject) => {
    const isHttps = targetUrl.protocol === 'https:';
    const transport = isHttps ? https : http;
    const pinnedLookup: NonNullable<http.RequestOptions['lookup']> = (
      _hostname,
      opts,
      callback,
    ) => {
      if (addresses.length === 0) {
        callback(new Error('No validated destination IP addresses available.'), '', 4);
        return;
      }
      const wantsAll = typeof opts === 'object' && opts !== null && opts.all === true;
      if (wantsAll) {
        (
          callback as (
            err: NodeJS.ErrnoException | null,
            addresses: Array<{ address: string; family: number }>,
          ) => void
        )(
          null,
          addresses.map((a) => ({ address: a.address, family: a.family })),
        );
        return;
      }
      const requestedFamily =
        typeof opts === 'number'
          ? opts
          : typeof opts === 'object' && opts !== null
            ? opts.family
            : undefined;
      const chosen =
        (requestedFamily
          ? addresses.find((a) => a.family === requestedFamily)
          : undefined) ?? addresses[0];
      callback(null, chosen.address, chosen.family);
    };

    const port = targetUrl.port
      ? Number.parseInt(targetUrl.port, 10)
      : isHttps
        ? 443
        : 80;

    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      reject(err);
    };

    const req = transport.request(
      {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname.replace(/^\[|\]$/g, ''),
        port,
        path: `${targetUrl.pathname}${targetUrl.search}`,
        method: 'GET',
        headers: DEFAULT_FETCH_HEADERS,
        lookup: addresses.length > 0 ? pinnedLookup : undefined,
      },
      (res) => {
        const remoteAddress = res.socket?.remoteAddress;
        if (remoteAddress && isDisallowedIpAddress(remoteAddress)) {
          req.destroy();
          fail(new Error('URL resolves to a restricted internal network address.'));
          return;
        }

        const headers = new Headers();
        for (const [k, v] of Object.entries(res.headers)) {
          if (typeof v === 'string') {
            headers.set(k, v);
          } else if (Array.isArray(v)) {
            headers.set(k, v.join(', '));
          }
        }

        const contentLengthHeader = headers.get('content-length');
        if (contentLengthHeader) {
          const contentLength = Number.parseInt(contentLengthHeader, 10);
          if (Number.isFinite(contentLength) && contentLength > MAX_URL_BYTES) {
            req.destroy();
            fail(new Error('Remote story document exceeds the 5 MB download limit.'));
            return;
          }
        }

        const chunks: Buffer[] = [];
        let totalBytes = 0;

        res.on('data', (chunk: Buffer) => {
          totalBytes += chunk.byteLength;
          if (totalBytes > MAX_URL_BYTES) {
            req.destroy();
            fail(new Error('Remote story document exceeds the 5 MB download limit.'));
            return;
          }
          chunks.push(chunk);
        });

        res.on('end', () => {
          if (settled) return;
          settled = true;
          signal.removeEventListener('abort', onAbort);
          resolve({
            status: res.statusCode ?? 0,
            statusText: res.statusMessage ?? '',
            headers,
            bodyBuffer: Buffer.concat(chunks),
          });
        });

        res.on('error', () => {
          fail(new Error('Unable to fetch story URL due to a network error.'));
        });
      },
    );

    const onAbort = () => {
      const abortErr = new Error('Fetching the story URL timed out after 15 seconds.');
      abortErr.name = 'AbortError';
      req.destroy(abortErr);
      fail(abortErr);
    };

    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });

    req.on('socket', (socket) => {
      socket.on('connect', () => {
        if (socket.remoteAddress && isDisallowedIpAddress(socket.remoteAddress)) {
          req.destroy();
          fail(new Error('URL resolves to a restricted internal network address.'));
        }
      });
    });

    req.on('error', (err) => {
      if (err.name === 'AbortError' || signal.aborted) {
        const timeoutErr = new Error('Fetching the story URL timed out after 15 seconds.');
        timeoutErr.name = 'AbortError';
        fail(timeoutErr);
        return;
      }
      fail(new Error('Unable to fetch story URL due to a network error.'));
    });

    req.end();
  });
}

async function fetchSingleHopWithCustomFetcher(
  targetUrl: URL,
  fetcher: typeof fetch,
  signal: AbortSignal,
): Promise<PinnedFetchResponse> {
  let response: Response;
  try {
    response = await fetcher(targetUrl.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal,
      headers: DEFAULT_FETCH_HEADERS,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Fetching the story URL timed out after 15 seconds.');
    }
    throw new Error('Unable to fetch story URL due to a network error.');
  }

  if (response.type === 'opaqueredirect') {
    throw new Error('Remote URL attempted an uninspectable redirect.');
  }

  const contentLengthHeader = response.headers.get('content-length');
  if (contentLengthHeader) {
    const contentLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_URL_BYTES) {
      throw new Error('Remote story document exceeds the 5 MB download limit.');
    }
  }

  const isRedirect = response.status >= 300 && response.status < 400;
  const arrayBuffer = isRedirect ? new ArrayBuffer(0) : await response.arrayBuffer();
  if (!isRedirect && arrayBuffer.byteLength > MAX_URL_BYTES) {
    throw new Error('Remote story document exceeds the 5 MB download limit.');
  }

  return {
    status: response.status,
    statusText: response.statusText || '',
    headers: response.headers,
    bodyBuffer: Buffer.from(arrayBuffer),
  };
}

export async function importStoryFromUrl(input: {
  url: string;
  options?: ImportStoryOptions;
  fetcher?: typeof fetch;
  skipDnsLookup?: boolean;
  dnsLookup?: ImportDnsLookupFn;
}): Promise<ImportStoryResult> {
  let currentTarget = await validateAndResolveImportTarget(input.url, {
    skipDnsLookup: input.skipDnsLookup,
    dnsLookup: input.dnsLookup,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), URL_TIMEOUT_MS);

  let hopResponse: PinnedFetchResponse | null = null;
  try {
    for (let redirectCount = 0; redirectCount <= MAX_URL_REDIRECTS; redirectCount += 1) {
      const res = input.fetcher
        ? await fetchSingleHopWithCustomFetcher(
            currentTarget.url,
            input.fetcher,
            controller.signal,
          )
        : await fetchSingleHopWithPinnedDns(
            currentTarget.url,
            currentTarget.addresses,
            controller.signal,
          );

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) {
          throw new Error(`URL returned HTTP ${res.status} without a redirect location.`);
        }
        if (redirectCount >= MAX_URL_REDIRECTS) {
          throw new Error('Too many redirects while fetching story URL.');
        }

        let resolvedRedirectUrl: URL;
        try {
          resolvedRedirectUrl = new URL(location, currentTarget.url);
        } catch {
          throw new Error('Remote URL returned an invalid redirect target.');
        }

        // Validate every redirect hop BEFORE issuing the next request
        currentTarget = await validateAndResolveImportTarget(
          resolvedRedirectUrl.toString(),
          {
            skipDnsLookup: input.skipDnsLookup,
            dnsLookup: input.dnsLookup,
          },
        );
        continue;
      }

      hopResponse = res;
      break;
    }
  } finally {
    clearTimeout(timeout);
  }

  if (!hopResponse) {
    throw new Error('Too many redirects while fetching story URL.');
  }

  if (hopResponse.status < 200 || hopResponse.status >= 300) {
    throw new Error(
      `URL returned HTTP ${hopResponse.status} (${hopResponse.statusText || 'Error'}).`,
    );
  }

  if (hopResponse.bodyBuffer.byteLength === 0) {
    throw new Error('The fetched URL returned an empty response.');
  }
  if (hopResponse.bodyBuffer.byteLength > MAX_URL_BYTES) {
    throw new Error('Remote story document exceeds the 5 MB download limit.');
  }

  const parsedUrl = currentTarget.url;
  const buffer = hopResponse.bodyBuffer;
  const contentType = (hopResponse.headers.get('content-type') || '').toLowerCase();
  const urlPathName = parsedUrl.pathname.split('/').pop() || parsedUrl.hostname;

  let format: ImportFormat = 'html';
  if (
    contentType.includes('wordprocessingml') ||
    urlPathName.toLowerCase().endsWith('.docx')
  ) {
    format = 'docx';
  } else if (
    contentType.includes('opendocument.text') ||
    urlPathName.toLowerCase().endsWith('.odt')
  ) {
    format = 'odt';
  } else if (
    contentType.includes('markdown') ||
    urlPathName.toLowerCase().endsWith('.md') ||
    urlPathName.toLowerCase().endsWith('.markdown')
  ) {
    format = 'md';
  } else if (
    contentType.includes('text/plain') ||
    urlPathName.toLowerCase().endsWith('.txt')
  ) {
    format = 'txt';
  } else if (contentType.includes('text/html') || contentType.includes('xhtml')) {
    format = 'html';
  } else {
    const sniff = buffer.slice(0, 512).toString('utf8').trimStart();
    if (/^<(?:!doctype|html|head|body)/i.test(sniff)) {
      format = 'html';
    } else {
      format = 'txt';
    }
  }

  let extracted: ExtractedStoryDocument;
  if (format === 'docx') {
    extracted = await parseDocxBuffer(buffer, urlPathName);
    extracted.sourceUrl = parsedUrl.toString();
  } else if (format === 'odt') {
    extracted = await parseOdtBuffer(buffer, urlPathName);
    extracted.sourceUrl = parsedUrl.toString();
  } else if (format === 'md') {
    extracted = parseMarkdownDocument(buffer.toString('utf8'), urlPathName);
    extracted.sourceUrl = parsedUrl.toString();
  } else if (format === 'txt') {
    extracted = parsePlainTextDocument(buffer.toString('utf8'), urlPathName);
    extracted.sourceUrl = parsedUrl.toString();
  } else {
    extracted = parseHtmlDocument(
      buffer.toString('utf8'),
      parsedUrl.toString(),
      urlPathName,
    );
  }

  return structureExtractedStory(extracted, input.options);
}
