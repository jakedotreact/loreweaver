import React, { useMemo, useState } from 'react';
import { Check, Copy, Download, FileText, Loader2, X } from 'lucide-react';
import { StoryProject } from '../types/story';
import { downloadHtmlFile, generateStoryHtml, HtmlExportOptions } from '../utils/htmlExport';
import { exportStoryToPdf } from '../utils/pdfExport';

interface HtmlExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: StoryProject;
  initialChapterId?: string;
}

export const HtmlExportModal: React.FC<HtmlExportModalProps> = ({
  isOpen,
  onClose,
  project,
  initialChapterId,
}) => {
  const [includePrompts, setIncludePrompts] = useState(true);
  const [includeChoices, setIncludeChoices] = useState(true);
  const [includeContinuityNotes, setIncludeContinuityNotes] = useState(false);
  const [includeCastAndLore, setIncludeCastAndLore] = useState(true);
  const [selectedChapterId, setSelectedChapterId] = useState<string>(initialChapterId ?? '');
  const [previewMode, setPreviewMode] = useState<'rendered' | 'source'>('rendered');
  const [copied, setCopied] = useState(false);
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setSelectedChapterId(initialChapterId ?? '');
      setCopied(false);
      setSavedToast(null);
      setIsGeneratingPdf(false);
    }
  }, [isOpen, initialChapterId]);

  const chapters = useMemo(
    () => [...(project.chapters ?? [])].sort((a, b) => a.chapterNumber - b.chapterNumber),
    [project.chapters],
  );

  const htmlOutput = useMemo(() => {
    const opts: HtmlExportOptions = {
      includePrompts,
      includeChoices,
      includeContinuityNotes,
      includeCastAndLore,
      chapterId: selectedChapterId || undefined,
    };
    return generateStoryHtml(project, opts);
  }, [
    project,
    includePrompts,
    includeChoices,
    includeContinuityNotes,
    includeCastAndLore,
    selectedChapterId,
  ]);

  if (!isOpen) return null;

  const slug = project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const chapterSuffix = selectedChapterId
    ? `-chapter-${
        chapters.find((c) => c.id === selectedChapterId)?.chapterNumber ?? 'part'
      }`
    : '';
  const baseFilename = `${slug || 'story'}${chapterSuffix}`;
  const filename = `${baseFilename}.html`;

  const handleSaveAsFile = () => {
    downloadHtmlFile(filename, htmlOutput);
    setSavedToast(`Saved ${filename}`);
    setTimeout(() => setSavedToast(null), 3000);
  };

  const handleDownloadPdf = async () => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      const pdfName = await exportStoryToPdf(project, {
        includePrompts,
        includeChoices,
        includeContinuityNotes,
        includeCastAndLore,
        chapterId: selectedChapterId || undefined,
      });
      setSavedToast(`Saved ${pdfName}`);
      setTimeout(() => setSavedToast(null), 3000);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(htmlOutput);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="html-export-heading"
    >
      <div className="w-full max-w-5xl bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between gap-4 shrink-0">
          <div>
            <h2
              id="html-export-heading"
              className="font-editorial text-xl font-semibold text-[#111827]"
            >
              Export Manuscript
            </h2>
            <p className="text-xs text-[#6B7280] mt-0.5">
              Preview your manuscript with merged chapters and prompts, then download as PDF or HTML.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close HTML export modal"
            className="p-2 text-[#6B7280] hover:text-[#111827] hover:bg-neutral-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
          {/* Options Sidebar */}
          <div className="p-5 border-b lg:border-b-0 lg:border-r border-neutral-200 space-y-5 lg:overflow-y-auto bg-neutral-50/50">
            <div>
              <label
                htmlFor="export-scope-select"
                className="block text-xs font-semibold text-[#111827] mb-1.5"
              >
                Export Scope
              </label>
              <select
                id="export-scope-select"
                value={selectedChapterId}
                onChange={(e) => setSelectedChapterId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
              >
                <option value="">Entire Manuscript ({project.turns.length} blurbs)</option>
                {chapters.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    Chapter {String(ch.chapterNumber).padStart(2, '0')}: {ch.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3 pt-2 border-t border-neutral-200">
              <p className="text-xs font-semibold text-[#111827]">Included Sections</p>

              <label className="flex items-start gap-2.5 text-sm text-[#374151] cursor-pointer">
                <input
                  type="checkbox"
                  checked={includePrompts}
                  onChange={(e) => setIncludePrompts(e.target.checked)}
                  className="mt-1 rounded border-neutral-300 text-[#1D4ED8] focus:ring-[#1D4ED8]"
                />
                <span>
                  <span className="font-medium text-[#111827] block">
                    User Prompts &amp; Premise
                  </span>
                  <span className="text-xs text-[#6B7280]">
                    Includes the initial premise and every scene action or custom prompt.
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-2.5 text-sm text-[#374151] cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeChoices}
                  onChange={(e) => setIncludeChoices(e.target.checked)}
                  className="mt-1 rounded border-neutral-300 text-[#1D4ED8] focus:ring-[#1D4ED8]"
                />
                <span>
                  <span className="font-medium text-[#111827] block">
                    Branching Choices Offered
                  </span>
                  <span className="text-xs text-[#6B7280]">
                    Lists options presented after each blurb and marks the chosen path.
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-2.5 text-sm text-[#374151] cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeContinuityNotes}
                  onChange={(e) => setIncludeContinuityNotes(e.target.checked)}
                  className="mt-1 rounded border-neutral-300 text-[#1D4ED8] focus:ring-[#1D4ED8]"
                />
                <span>
                  <span className="font-medium text-[#111827] block">
                    Continuity Verification Notes
                  </span>
                  <span className="text-xs text-[#6B7280]">
                    Logs Cross-Index checks recorded per scene.
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-2.5 text-sm text-[#374151] cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeCastAndLore}
                  onChange={(e) => setIncludeCastAndLore(e.target.checked)}
                  className="mt-1 rounded border-neutral-300 text-[#1D4ED8] focus:ring-[#1D4ED8]"
                />
                <span>
                  <span className="font-medium text-[#111827] block">
                    Cast &amp; Cross-Index Appendix
                  </span>
                  <span className="text-xs text-[#6B7280]">
                    Appends full character profiles and lore rules at the end.
                  </span>
                </span>
              </label>
            </div>
          </div>

          {/* Preview Pane */}
          <div className="flex flex-col min-h-[340px] lg:min-h-0 overflow-hidden bg-white">
            <div className="px-5 py-2.5 border-b border-neutral-200 flex items-center justify-between gap-4 shrink-0">
              <div className="inline-flex items-center gap-1 p-1 bg-neutral-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setPreviewMode('rendered')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    previewMode === 'rendered'
                      ? 'bg-white text-[#111827] shadow-sm'
                      : 'text-[#6B7280] hover:text-[#111827]'
                  }`}
                >
                  Document Preview
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode('source')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    previewMode === 'source'
                      ? 'bg-white text-[#111827] shadow-sm'
                      : 'text-[#6B7280] hover:text-[#111827]'
                  }`}
                >
                  HTML Source
                </button>
              </div>
              <span className="text-xs font-mono tabular-nums text-[#6B7280]">
                {(htmlOutput.length / 1024).toFixed(1)} KB
              </span>
            </div>

            {previewMode === 'rendered' ? (
              <iframe
                title="HTML Export Preview"
                srcDoc={htmlOutput}
                sandbox="allow-same-origin"
                className="w-full flex-1 min-h-[300px] border-0 bg-[#F8F9FA]"
              />
            ) : (
              <pre className="flex-1 min-h-[300px] p-5 text-xs font-mono text-[#1F2937] bg-neutral-50 overflow-auto whitespace-pre-wrap break-words">
                {htmlOutput}
              </pre>
            )}
          </div>
        </div>

        {/* Always-Visible Footer Action Bar */}
        <div className="px-6 py-4 border-t border-neutral-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-[#6B7280] font-mono truncate">
            {savedToast ? (
              <span className="text-[#15803D] font-sans font-medium">{savedToast}</span>
            ) : (
              <span>Output: {baseFilename}.html / .pdf</span>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-[#16A34A]" />
                  Copied HTML
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-[#4B5563]" />
                  Copy HTML
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleSaveAsFile}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4 text-[#4B5563]" />
              Download HTML
            </button>
            <button
              type="button"
              disabled={isGeneratingPdf}
              onClick={() => void handleDownloadPdf()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {isGeneratingPdf ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating PDF...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  Download PDF
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
