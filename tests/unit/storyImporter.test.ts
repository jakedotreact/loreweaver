// @vitest-environment node
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  importStoryFromFileBuffer,
  importStoryFromUrl,
  parseDocxBuffer,
  parseHtmlDocument,
  parseMarkdownDocument,
  parseOdtBuffer,
  parsePlainTextDocument,
  structureExtractedStory,
  validateAndResolveImportUrl,
} from '../../server/storyImporter';

async function buildSampleDocxBuffer(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    'docProps/core.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
     <cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
       <dc:title>Clockwork Harbour</dc:title>
       <dc:creator>Ada Lovelace</dc:creator>
     </cp:coreProperties>`,
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
     <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
       <w:body>
         <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter 1: Fog Over the Docks</w:t></w:r></w:p>
         <w:p><w:r><w:t>Clara adjusted her brass lantern &amp; stepped onto Pier Four.</w:t></w:r></w:p>
         <w:p><w:r><w:t>***</w:t></w:r></w:p>
         <w:p><w:pPr><w:pStyle w:val="Heading3"/></w:pPr><w:r><w:t>The Signal Tower</w:t></w:r></w:p>
         <w:p><w:r><w:t>Julian waited beside the telegraph coil.</w:t></w:r></w:p>
       </w:body>
     </w:document>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function buildSampleOdtBuffer(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    'meta.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
     <office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
       <office:meta>
         <dc:title>Glass Meridian</dc:title>
         <dc:creator>Julian Verne</dc:creator>
       </office:meta>
     </office:document-meta>`,
  );
  zip.file(
    'content.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
     <office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
       <office:body>
         <office:text>
           <text:h text:outline-level="2">Chapter 1: Observatory</text:h>
           <text:p>Mira<text:s text:c="1"/>checked the star chart.<text:line-break/>Cold light spilled across the floor.</text:p>
           <text:h text:outline-level="2">Chapter 2: Descent</text:h>
           <text:p>They descended the spiral stairs in silence.</text:p>
         </office:text>
       </office:body>
     </office:document-content>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('storyImporter parsers & structurer', () => {
  it('parses plain text files with metadata lines, chapters, and scene dividers', async () => {
    const raw = [
      'Title: Letters from Rainwater',
      'Author: M. Hawthorne',
      'Universe: Original Mystery',
      '',
      'Chapter 1: The Envelope',
      'Eleanor slit open the wax seal while thunder rattled the conservatory.',
      '',
      '***',
      '',
      'Later that night, Eleanor asked Thomas about the missing ledger.',
      '',
      'Chapter 2: Ash & Ink',
      'Thomas whispered that the ledger had never left the vault.',
    ].join('\n');

    const extracted = parsePlainTextDocument(raw, 'letters.txt');
    expect(extracted.title).toBe('Letters from Rainwater');
    expect(extracted.author).toBe('M. Hawthorne');
    expect(extracted.universe).toBe('Original Mystery');
    expect(extracted.chapters).toHaveLength(2);
    expect(extracted.chapters[0].scenes).toHaveLength(2);

    const { project, stats } = await structureExtractedStory(extracted, {
      isPrivate: true,
    });
    expect(project.title).toBe('Letters from Rainwater');
    expect(project.isPrivate).toBe(true);
    expect(project.chapters).toHaveLength(2);
    expect(project.turns).toHaveLength(3);
    expect(stats.wordCount).toBeGreaterThan(20);
    expect(project.characters.some((c) => c.name === 'Eleanor')).toBe(true);
  });

  it('parses markdown frontmatter, chapter headings, and strips inline syntax cleanly', async () => {
    const md = `---
title: "The Velvet Cipher"
universe: "Gaslamp Detective"
tags: [Mystery, Slow Burn]
---

# The Velvet Cipher

## Chapter 1: Baker Street Rain

Arthur opened the **iron-bound** folio and examined the [map](https://example.com).

### Midnight Interrogation

"You knew about the courier," Arthur said quietly.
`;

    const extracted = parseMarkdownDocument(md, 'cipher.md');
    expect(extracted.title).toBe('The Velvet Cipher');
    expect(extracted.universe).toBe('Gaslamp Detective');
    expect(extracted.tagsHint?.freeforms).toEqual(['Mystery', 'Slow Burn']);
    expect(extracted.chapters).toHaveLength(1);
    expect(extracted.chapters[0].scenes).toHaveLength(2);
    expect(extracted.chapters[0].scenes[0].paragraphs[0]).toBe(
      'Arthur opened the iron-bound folio and examined the map.',
    );

    const result = await structureExtractedStory(extracted);
    expect(result.project.tags?.freeforms).toContain('Mystery');
    expect(result.project.tags?.freeforms).toContain('Imported Story');
  });

  it('parses binary .docx ZIP archives preserving title, headings, entities, and scenes', async () => {
    const docxBuffer = await buildSampleDocxBuffer();
    const extracted = await parseDocxBuffer(docxBuffer, 'clockwork.docx');

    expect(extracted.format).toBe('docx');
    expect(extracted.title).toBe('Clockwork Harbour');
    expect(extracted.author).toBe('Ada Lovelace');
    expect(extracted.chapters).toHaveLength(1);
    expect(extracted.chapters[0].chapterTitle).toBe('Chapter 1: Fog Over the Docks');
    expect(extracted.chapters[0].scenes).toHaveLength(2);
    expect(extracted.chapters[0].scenes[0].paragraphs[0]).toContain('brass lantern & stepped');
    expect(extracted.chapters[0].scenes[1].sceneTitle).toBe('The Signal Tower');

    const result = await importStoryFromFileBuffer({
      filename: 'clockwork.docx',
      buffer: docxBuffer,
      options: { enrichWithAi: false },
    });
    expect(result.stats.format).toBe('docx');
    expect(result.project.turns).toHaveLength(2);
  });

  it('parses binary .odt ZIP archives preserving headings, spaces, and line breaks', async () => {
    const odtBuffer = await buildSampleOdtBuffer();
    const extracted = await parseOdtBuffer(odtBuffer, 'meridian.odt');

    expect(extracted.format).toBe('odt');
    expect(extracted.title).toBe('Glass Meridian');
    expect(extracted.author).toBe('Julian Verne');
    expect(extracted.chapters).toHaveLength(2);
    expect(extracted.chapters[0].scenes[0].paragraphs[0]).toContain(
      'Mira checked the star chart.',
    );
    expect(extracted.chapters[0].scenes[0].paragraphs[0]).toContain(
      'Cold light spilled across the floor.',
    );

    const result = await importStoryFromFileBuffer({
      filename: 'meridian.odt',
      buffer: odtBuffer,
    });
    expect(result.stats.chapterCount).toBe(2);
    expect(result.project.chapters).toHaveLength(2);
  });

  it('extracts AO3-structured HTML pages including tags, summary, and multi-chapter body', () => {
    const html = `
      <!doctype html>
      <html>
        <head><title>Lanterns at Dawn - Archive of Our Own</title></head>
        <body>
          <nav>Home | Browse</nav>
          <div id="workskin">
            <dl class="work meta">
              <dd class="rating tags"><a class="tag">Teen And Up Audiences</a></dd>
              <dd class="warning tags"><a class="tag">No Archive Warnings Apply</a></dd>
              <dd class="category tags"><a class="tag">Gen</a></dd>
              <dd class="fandom tags"><a class="tag">Sherlock Holmes</a></dd>
              <dd class="character tags"><a class="tag">Sherlock Holmes</a><a class="tag">John Watson</a></dd>
              <dd class="freeform tags"><a class="tag">Case Fic</a></dd>
            </dl>
            <div class="preface group">
              <h2 class="title heading">Lanterns at Dawn</h2>
              <a rel="author">ConanD</a>
              <div class="summary"><blockquote class="userstuff"><p>A fogbound mystery in Whitechapel.</p></blockquote></div>
            </div>
            <div id="chapters">
              <div class="chapter">
                <h3 class="title">Chapter 1: Baker Street</h3>
                <div class="userstuff"><p>Holmes tapped his pipe against the grate.</p></div>
              </div>
              <div class="chapter">
                <h3 class="title">Chapter 2: The Wharf</h3>
                <div class="userstuff"><p>Watson drew his coat tighter against the mist.</p></div>
              </div>
            </div>
          </div>
          <script>alert('xss')</script>
        </body>
      </html>
    `;

    const extracted = parseHtmlDocument(html, 'https://example.org/works/42');
    expect(extracted.title).toBe('Lanterns at Dawn');
    expect(extracted.author).toBe('ConanD');
    expect(extracted.universe).toBe('Sherlock Holmes');
    expect(extracted.premise).toBe('A fogbound mystery in Whitechapel.');
    expect(extracted.tagsHint?.rating).toBe('Teen And Up Audiences');
    expect(extracted.tagsHint?.characters).toEqual(['Sherlock Holmes', 'John Watson']);
    expect(extracted.tagsHint?.freeforms).toEqual(['Case Fic']);
    expect(extracted.chapters).toHaveLength(2);
    expect(extracted.chapters[0].scenes[0].paragraphs[0]).toBe(
      'Holmes tapped his pipe against the grate.',
    );
  });

  it('blocks SSRF internal, localhost, metadata, and non-HTTP URLs', async () => {
    await expect(validateAndResolveImportUrl('file:///etc/passwd')).rejects.toThrow(/Only http/i);
    await expect(validateAndResolveImportUrl('http://localhost:3000/secret')).rejects.toThrow(/not allowed/i);
    await expect(validateAndResolveImportUrl('http://127.0.0.1:8080/')).rejects.toThrow(/not allowed/i);
    await expect(validateAndResolveImportUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(/not allowed/i);
    await expect(validateAndResolveImportUrl('http://192.168.1.10/story.txt')).rejects.toThrow(/not allowed/i);
  });

  it('parses # Story Title, ## Chapter Title, and ### Scene Title consistently in both .txt and .md', async () => {
    const template = [
      '# Lanterns in the Fog',
      '## The Broken Compass',
      '### At the Harbour Gate',
      'Rain swept across the cobbles while Sera checked the lantern.',
      '### Inside the Tavern',
      'A lantern swayed above the bar where Bram waited.',
      '## The Second Clue',
      '### The Clocktower',
      'Midnight chimed overhead.',
    ].join('\n');

    for (const [label, extracted] of [
      ['txt', parsePlainTextDocument(template, 'lanterns.txt')],
      ['md', parseMarkdownDocument(template, 'lanterns.md')],
    ] as const) {
      expect(extracted.title, `${label} story title`).toBe('Lanterns in the Fog');
      expect(extracted.hasExplicitChapters, `${label} explicit chapters`).toBe(true);
      expect(extracted.chapters, `${label} chapter count`).toHaveLength(2);
      expect(extracted.chapters[0].chapterTitle).toBe('The Broken Compass');
      expect(extracted.chapters[0].scenes.map((s) => s.sceneTitle)).toEqual([
        'At the Harbour Gate',
        'Inside the Tavern',
      ]);
      expect(extracted.chapters[1].chapterTitle).toBe('The Second Clue');
      expect(extracted.chapters[1].scenes.map((s) => s.sceneTitle)).toEqual([
        'The Clocktower',
      ]);

      const structured = await structureExtractedStory(extracted);
      expect(structured.project.title).toBe('Lanterns in the Fog');
      expect(structured.project.chapters?.map((c) => c.title)).toEqual([
        'The Broken Compass',
        'The Second Clue',
      ]);
      expect(structured.project.turns.map((t) => t.sceneTitle)).toEqual([
        'At the Harbour Gate',
        'Inside the Tavern',
        'The Clocktower',
      ]);
    }
  });

  it('imports a remote markdown URL cleanly using a mock fetcher', async () => {
    const mockFetch: typeof fetch = async () =>
      new Response('# Skyward Harbor\n\nCaptain Lin checked the barometer.\n', {
        status: 200,
        headers: { 'content-type': 'text/markdown; charset=utf-8' },
      });

    const result = await importStoryFromUrl({
      url: 'https://example.com/stories/skyward.md',
      fetcher: mockFetch,
      skipDnsLookup: true,
      options: { isPrivate: true, enrichWithAi: false },
    });

    expect(result.stats.format).toBe('md');
    expect(result.project.title).toBe('Skyward Harbor');
    expect(result.project.isPrivate).toBe(true);
    expect(result.project.turns[0].prose[0]).toBe('Captain Lin checked the barometer.');
  });
});

