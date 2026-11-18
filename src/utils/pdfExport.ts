import { jsPDF } from 'jspdf';
import { StoryChapter, StoryProject, StoryTurn } from '../types/story';
import { HtmlExportOptions } from './htmlExport';

interface NormalizedPdfImage {
  dataUrl: string;
  width: number;
  height: number;
}

function slugifyTitle(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function normalizeImageForPdf(
  dataUrl: string,
): Promise<NormalizedPdfImage | null> {
  if (!dataUrl || typeof window === 'undefined') return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) {
          resolve(null);
          return;
        }
        const maxDim = 1280;
        const scale = Math.min(1, maxDim / Math.max(w, h));
        const targetW = Math.max(1, Math.round(w * scale));
        const targetH = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const jpegUrl = canvas.toDataURL('image/jpeg', 0.9);
        resolve({ dataUrl: jpegUrl, width: targetW, height: targetH });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export async function exportStoryToPdf(
  project: StoryProject,
  options: HtmlExportOptions,
): Promise<string> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 54;
  const marginTop = 56;
  const marginBottom = 56;
  const contentWidth = pageWidth - marginX * 2;
  const maxY = pageHeight - marginBottom;

  let y = marginTop;

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > maxY) {
      doc.addPage();
      y = marginTop;
    }
  };

  const drawWrappedLines = (
    lines: string[],
    x: number,
    lineHeight: number,
    color: [number, number, number] = [17, 24, 39],
  ) => {
    doc.setTextColor(color[0], color[1], color[2]);
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, x, y);
      y += lineHeight;
    }
  };

  const drawCalloutBox = (
    label: string,
    body: string,
    bgColor: [number, number, number],
    borderColor: [number, number, number],
    labelColor: [number, number, number],
    bodyColor: [number, number, number],
  ) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    const labelHeight = 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const bodyLines = doc.splitTextToSize(body, contentWidth - 24) as string[];
    const bodyLineHeight = 14.5;
    const boxHeight = 12 + labelHeight + bodyLines.length * bodyLineHeight + 8;

    if (boxHeight <= maxY - marginTop) {
      ensureSpace(boxHeight + 8);
      doc.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
      doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
      doc.roundedRect(marginX, y, contentWidth, boxHeight, 5, 5, 'FD');

      y += 16;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(labelColor[0], labelColor[1], labelColor[2]);
      doc.text(label, marginX + 12, y);
      y += 15;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(bodyColor[0], bodyColor[1], bodyColor[2]);
      for (const line of bodyLines) {
        doc.text(line, marginX + 12, y);
        y += bodyLineHeight;
      }
      y += 12;
    } else {
      ensureSpace(28);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(labelColor[0], labelColor[1], labelColor[2]);
      doc.text(label, marginX, y);
      y += 14;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      drawWrappedLines(bodyLines, marginX, bodyLineHeight, bodyColor);
      y += 8;
    }
  };

  const drawIllustration = async (dataUrl: string, caption: string) => {
    const img = await normalizeImageForPdf(dataUrl);
    if (!img) return;
    const maxImgHeight = 260;
    const ratio = Math.min(contentWidth / img.width, maxImgHeight / img.height);
    const renderW = img.width * ratio;
    const renderH = img.height * ratio;

    doc.setFont('times', 'italic');
    doc.setFontSize(9.5);
    const capLines = doc.splitTextToSize(caption, contentWidth - 16) as string[];
    const capHeight = capLines.length * 13 + 12;

    ensureSpace(renderH + capHeight + 16);
    const imgX = marginX + (contentWidth - renderW) / 2;
    doc.addImage(img.dataUrl, 'JPEG', imgX, y, renderW, renderH);
    y += renderH + 12;

    doc.setFont('times', 'italic');
    doc.setFontSize(9.5);
    doc.setTextColor(75, 85, 99);
    for (const line of capLines) {
      ensureSpace(13);
      doc.text(line, marginX, y);
      y += 13;
    }
    y += 10;
  };

  // Resolve scope
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

  const docTitle = targetTurn
    ? `${project.title} — Scene ${String(targetTurn.turnNumber).padStart(2, '0')}: ${targetTurn.sceneTitle}`
    : options.chapterId && targetChapters[0]
      ? `${project.title} — Chapter ${targetChapters[0].chapterNumber}: ${targetChapters[0].title}`
      : project.title;

  // Document Masthead
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(107, 114, 128);
  const metaText = `${project.universe} · ${project.setting} · ${project.tone}`;
  const metaLines = doc.splitTextToSize(metaText, contentWidth) as string[];
  drawWrappedLines(metaLines, marginX, 13, [107, 114, 128]);
  y += 4;

  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  const titleLines = doc.splitTextToSize(docTitle, contentWidth) as string[];
  drawWrappedLines(titleLines, marginX, 27, [17, 24, 39]);
  y += 6;

  doc.setDrawColor(229, 231, 235);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 18;

  if (options.includePrompts && project.premise) {
    drawCalloutBox(
      'INITIAL STORY PREMISE PROMPT',
      project.premise,
      [249, 250, 251],
      [229, 231, 235],
      [17, 24, 39],
      [75, 85, 99],
    );
  }

  const renderTurnToPdf = async (turn: StoryTurn, isMergedFlow: boolean) => {
    ensureSpace(44);
    if (isMergedFlow) {
      doc.setDrawColor(229, 231, 235);
      doc.line(marginX, y, pageWidth - marginX, y);
      y += 14;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    const sceneMeta = `Scene ${String(turn.turnNumber).padStart(2, '0')}: ${turn.sceneTitle} · ${turn.location} · ${turn.inStoryTime}`;
    const sceneMetaLines = doc.splitTextToSize(sceneMeta, contentWidth) as string[];
    drawWrappedLines(sceneMetaLines, marginX, 13, [107, 114, 128]);
    y += 4;

    if (options.includePrompts) {
      const promptText =
        turn.userAction || 'Initial scene generated from Universe & Premise prompt.';
      const promptKind = turn.userAction ? 'USER PROMPT / ACTION' : 'OPENING PROMPT';
      drawCalloutBox(
        promptKind,
        promptText,
        [243, 246, 252],
        [219, 234, 254],
        [29, 78, 216],
        [17, 24, 39],
      );
    }

    if (turn.continuityWarning) {
      drawCalloutBox(
        'CONTINUITY NOTICE',
        turn.continuityWarning,
        [255, 251, 235],
        [253, 230, 138],
        [146, 64, 14],
        [146, 64, 14],
      );
    }

    if (turn.illustration?.dataUrl) {
      const caption =
        turn.illustration.caption ||
        `Scene ${String(turn.turnNumber).padStart(2, '0')}: ${turn.sceneTitle}`;
      await drawIllustration(turn.illustration.dataUrl, caption);
    }

    doc.setFont('times', 'normal');
    doc.setFontSize(11.5);
    for (const paragraph of turn.prose) {
      const pLines = doc.splitTextToSize(paragraph, contentWidth) as string[];
      drawWrappedLines(pLines, marginX, 17, [17, 24, 39]);
      y += 8;
    }

    if (options.includeChoices && turn.choices.length > 0) {
      ensureSpace(34);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(75, 85, 99);
      doc.text('BRANCHING PROMPTS OFFERED', marginX, y);
      y += 14;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      for (const ch of turn.choices) {
        const selected = turn.selectedChoiceId === ch.id;
        const prefix = selected ? '• [Selected] ' : '• ';
        const lineText = `${prefix}${ch.label} — ${ch.intent}`;
        const lines = doc.splitTextToSize(lineText, contentWidth - 10) as string[];
        drawWrappedLines(
          lines,
          marginX + 8,
          13.5,
          selected ? [29, 78, 216] : [75, 85, 99],
        );
        y += 2;
      }
      y += 8;
    }

    if (options.includeContinuityNotes && turn.continuityNotes.length > 0) {
      ensureSpace(34);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(75, 85, 99);
      doc.text('CONTINUITY CHECKS', marginX, y);
      y += 14;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      for (const note of turn.continuityNotes) {
        const lines = doc.splitTextToSize(`• ${note}`, contentWidth - 10) as string[];
        drawWrappedLines(lines, marginX + 8, 13.5, [75, 85, 99]);
        y += 2;
      }
      y += 8;
    }

    y += 10;
  };

  for (const ch of targetChapters) {
    const chTurns = ch.turnIds
      .map((id) => turnMap.get(id))
      .filter((t): t is StoryTurn => Boolean(t));
    if (chTurns.length === 0) continue;

    ensureSpace(64);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(29, 78, 216);
    doc.text(
      `CHAPTER ${String(ch.chapterNumber).padStart(2, '0')} · ${chTurns.length} ${
        chTurns.length === 1 ? 'BLURB' : 'BLURBS'
      }`,
      marginX,
      y,
    );
    y += 18;

    doc.setFont('times', 'bold');
    doc.setFontSize(17);
    const chTitleLines = doc.splitTextToSize(ch.title, contentWidth) as string[];
    drawWrappedLines(chTitleLines, marginX, 22, [17, 24, 39]);

    if (ch.summary) {
      y += 2;
      doc.setFont('times', 'italic');
      doc.setFontSize(11);
      const sumLines = doc.splitTextToSize(ch.summary, contentWidth) as string[];
      drawWrappedLines(sumLines, marginX, 15, [75, 85, 99]);
    }
    y += 10;

    if (ch.illustration?.dataUrl) {
      await drawIllustration(ch.illustration.dataUrl, ch.illustration.caption || ch.title);
    }

    for (const turn of chTurns) {
      await renderTurnToPdf(turn, true);
    }

    y += 14;
  }

  if (unassignedTurns.length > 0) {
    if (!targetTurn) {
      ensureSpace(48);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(107, 114, 128);
      doc.text(
        chapters.length > 0 ? 'UNMERGED STORY BLURBS' : 'STORY MANUSCRIPT',
        marginX,
        y,
      );
      y += 18;
    }

    for (const turn of unassignedTurns) {
      await renderTurnToPdf(turn, false);
    }
  }

  if (options.includeCastAndLore) {
    ensureSpace(80);
    doc.setDrawColor(209, 213, 219);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 24;

    doc.setFont('times', 'bold');
    doc.setFontSize(17);
    doc.setTextColor(17, 24, 39);
    doc.text('Universe Appendix', marginX, y);
    y += 22;

    if (project.characters.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Character Profiles', marginX, y);
      y += 16;

      for (const c of project.characters) {
        ensureSpace(54);
        doc.setFont('times', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(17, 24, 39);
        doc.text(`${c.name} (${c.role} · ${c.origin})`, marginX, y);
        y += 15;

        doc.setFont('times', 'normal');
        doc.setFontSize(10.5);
        const sumLines = doc.splitTextToSize(c.summary, contentWidth) as string[];
        drawWrappedLines(sumLines, marginX, 14, [55, 65, 81]);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        const traitLines = doc.splitTextToSize(
          `Strengths: ${c.pros.join('; ') || 'None'} | Flaws: ${c.flaws.join('; ') || 'None'}`,
          contentWidth,
        ) as string[];
        drawWrappedLines(traitLines, marginX, 13, [75, 85, 99]);

        const stateLines = doc.splitTextToSize(
          `Location: ${c.location} · Status: ${c.status}`,
          contentWidth,
        ) as string[];
        drawWrappedLines(stateLines, marginX, 13, [107, 114, 128]);
        y += 10;
      }
    }

    if (project.crossIndex.length > 0) {
      ensureSpace(44);
      y += 8;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(17, 24, 39);
      doc.text('Cross-Index Lore Ledger', marginX, y);
      y += 16;

      for (const e of project.crossIndex) {
        ensureSpace(42);
        doc.setFont('times', 'bold');
        doc.setFontSize(11.5);
        doc.setTextColor(17, 24, 39);
        doc.text(`${e.title} (${e.category} · ${e.status})`, marginX, y);
        y += 14;

        doc.setFont('times', 'normal');
        doc.setFontSize(10.5);
        const detailLines = doc.splitTextToSize(e.detail, contentWidth) as string[];
        drawWrappedLines(detailLines, marginX, 14, [75, 85, 99]);
        y += 9;
      }
    }
  }

  // Add running page footer across all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(156, 163, 175);
    doc.text(`Folio & Canon · ${project.title}`, marginX, pageHeight - 26);
    doc.text(
      `Page ${p} of ${totalPages}`,
      pageWidth - marginX,
      pageHeight - 26,
      { align: 'right' },
    );
  }

  const slug = slugifyTitle(project.title) || 'story';
  const suffix = targetTurn
    ? `-scene-${String(targetTurn.turnNumber).padStart(2, '0')}`
    : options.chapterId && targetChapters[0]
      ? `-chapter-${String(targetChapters[0].chapterNumber).padStart(2, '0')}`
      : '';
  const filename = `${slug}${suffix}.pdf`;
  doc.save(filename);
  return filename;
}

export function downloadStoryPdf(
  project: StoryProject,
  options: Partial<HtmlExportOptions> = {},
): Promise<string> {
  return exportStoryToPdf(project, {
    includePrompts: options.includePrompts ?? true,
    includeChoices: options.includeChoices ?? true,
    includeContinuityNotes: options.includeContinuityNotes ?? false,
    includeCastAndLore: options.includeCastAndLore ?? true,
    chapterId: options.chapterId,
    turnId: options.turnId,
  });
}

export function downloadChapterPdf(
  project: StoryProject,
  chapter: StoryChapter,
): Promise<string> {
  return exportStoryToPdf(project, {
    includePrompts: true,
    includeChoices: true,
    includeContinuityNotes: true,
    includeCastAndLore: false,
    chapterId: chapter.id,
  });
}

export function downloadScenePdf(
  project: StoryProject,
  turn: StoryTurn,
): Promise<string> {
  return exportStoryToPdf(project, {
    includePrompts: true,
    includeChoices: true,
    includeContinuityNotes: true,
    includeCastAndLore: false,
    turnId: turn.id,
  });
}
