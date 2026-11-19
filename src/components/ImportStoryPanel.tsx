import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Check,
  FileText,
  Globe,
  Loader2,
  Lock,
  Sparkles,
  Upload,
} from 'lucide-react';
import { ModelConfig, StoryProject } from '../types/story';
import { postJson } from '../utils/api';

type ImportSourceTab = 'file' | 'url';

interface ImportApiStats {
  format: 'txt' | 'md' | 'docx' | 'odt' | 'html';
  sourceName: string;
  wordCount: number;
  chapterCount: number;
  sceneCount: number;
  characterCount: number;
  crossIndexCount: number;
  aiEnriched: boolean;
}

interface ImportApiResponse {
  project: StoryProject;
  stats: ImportApiStats;
  warnings: string[];
}

interface ImportStoryPanelProps {
  modelConfig: ModelConfig;
  onImportComplete: (project: StoryProject) => void;
  onCancel: () => void;
}

const ACCEPTED_EXTENSIONS = ['.txt', '.md', '.markdown', '.docx', '.odt'];
const MAX_CLIENT_FILE_BYTES = 10 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function isSupportedDocumentFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export const ImportStoryPanel: React.FC<ImportStoryPanelProps> = ({
  modelConfig,
  onImportComplete,
  onCancel,
}) => {
  const [sourceTab, setSourceTab] = useState<ImportSourceTab>('file');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [titleOverride, setTitleOverride] = useState('');
  const [universeOverride, setUniverseOverride] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [enrichWithAi, setEnrichWithAi] = useState(true);

  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportApiResponse | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelectFile = (file: File | null) => {
    setError(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (!isSupportedDocumentFile(file)) {
      setError(
        'Unsupported document format. Please select a .txt, .md, .docx, or .odt file.',
      );
      return;
    }
    if (file.size === 0) {
      setError('The selected file is empty.');
      return;
    }
    if (file.size > MAX_CLIENT_FILE_BYTES) {
      setError('File exceeds the 10 MB upload limit.');
      return;
    }
    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    handleSelectFile(file);
  };

  const handleParseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (sourceTab === 'file') {
      if (!selectedFile) {
        setError('Please choose a .txt, .md, .docx, or .odt file to import.');
        return;
      }
      setIsParsing(true);
      try {
        const buffer = await selectedFile.arrayBuffer();
        const contentBase64 = arrayBufferToBase64(buffer);
        const result = await postJson<ImportApiResponse>('/api/story/import-file', {
          filename: selectedFile.name,
          mimeType: selectedFile.type || undefined,
          contentBase64,
          title: titleOverride.trim() || undefined,
          universe: universeOverride.trim() || undefined,
          isPrivate,
          enrichWithAi,
          modelConfig,
        });
        setPreview(result);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Unable to parse the selected file.',
        );
      } finally {
        setIsParsing(false);
      }
      return;
    }

    const cleanedUrl = importUrl.trim();
    if (!cleanedUrl) {
      setError('Please enter an http:// or https:// URL to import.');
      return;
    }
    setIsParsing(true);
    try {
      const result = await postJson<ImportApiResponse>('/api/story/import-url', {
        url: cleanedUrl,
        title: titleOverride.trim() || undefined,
        universe: universeOverride.trim() || undefined,
        isPrivate,
        enrichWithAi,
        modelConfig,
      });
      setPreview(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to import story from that URL.',
      );
    } finally {
      setIsParsing(false);
    }
  };

  const updatePreviewProject = (patch: Partial<StoryProject>) => {
    setPreview((prev) =>
      prev
        ? {
            ...prev,
            project: {
              ...prev.project,
              ...patch,
            },
          }
        : null,
    );
  };

  if (preview) {
    const { project, stats, warnings } = preview;
    const openingTurn = project.turns[0];
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-200">
          <div>
            <p className="text-xs text-[#6B7280]">
              Import Ready <span aria-hidden="true">·</span>{' '}
              <span className="uppercase font-mono">{stats.format}</span>{' '}
              <span aria-hidden="true">·</span> {stats.sourceName}
            </p>
            <h3 className="font-editorial text-xl font-semibold text-[#111827] mt-0.5">
              Review Imported Manuscript
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setPreview(null)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#374151] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Choose Another Source
          </button>
        </div>

        {warnings.length > 0 && (
          <div className="p-3.5 text-xs text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] rounded-lg flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              {warnings.map((w, idx) => (
                <p key={idx}>{w}</p>
              ))}
            </div>
          </div>
        )}

        {/* Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-[#F8FAFC] border border-neutral-200 rounded-xl p-4">
          <div>
            <p className="font-mono text-lg font-semibold text-[#111827] tabular-nums">
              {stats.wordCount.toLocaleString()}
            </p>
            <p className="text-xs text-[#6B7280]">Words</p>
          </div>
          <div>
            <p className="font-mono text-lg font-semibold text-[#111827] tabular-nums">
              {stats.chapterCount}
            </p>
            <p className="text-xs text-[#6B7280]">Chapters</p>
          </div>
          <div>
            <p className="font-mono text-lg font-semibold text-[#111827] tabular-nums">
              {stats.sceneCount}
            </p>
            <p className="text-xs text-[#6B7280]">Scenes</p>
          </div>
          <div>
            <p className="font-mono text-lg font-semibold text-[#111827] tabular-nums">
              {project.characters.length}
            </p>
            <p className="text-xs text-[#6B7280]">Cast Profiles</p>
          </div>
          <div>
            <p className="font-mono text-lg font-semibold text-[#111827] tabular-nums">
              {project.crossIndex.length}
            </p>
            <p className="text-xs text-[#6B7280]">Cross-Index</p>
          </div>
        </div>

        {/* Editable Metadata */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="import-preview-title"
              className="block text-xs font-medium text-[#111827] mb-1"
            >
              Story Title
            </label>
            <input
              id="import-preview-title"
              type="text"
              value={project.title}
              onChange={(e) => updatePreviewProject({ title: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
            />
          </div>
          <div>
            <label
              htmlFor="import-preview-universe"
              className="block text-xs font-medium text-[#111827] mb-1"
            >
              Universe / Fandom
            </label>
            <input
              id="import-preview-universe"
              type="text"
              value={project.universe}
              onChange={(e) => updatePreviewProject({ universe: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
            />
          </div>
          <div>
            <label
              htmlFor="import-preview-setting"
              className="block text-xs font-medium text-[#111827] mb-1"
            >
              Setting &amp; Era
            </label>
            <input
              id="import-preview-setting"
              type="text"
              value={project.setting}
              onChange={(e) => updatePreviewProject({ setting: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
            />
          </div>
          <div>
            <label
              htmlFor="import-preview-tone"
              className="block text-xs font-medium text-[#111827] mb-1"
            >
              Tone &amp; Genre
            </label>
            <input
              id="import-preview-tone"
              type="text"
              value={project.tone}
              onChange={(e) => updatePreviewProject({ tone: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
            />
          </div>
        </div>

        {/* Cast & Outline Preview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-neutral-200 rounded-xl p-4 space-y-2 bg-white">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#4B5563]">
              Structure Preview ({project.chapters && project.chapters.length > 0 ? `${project.chapters.length} chapters` : `${project.turns.length} scenes`})
            </h4>
            <ul className="space-y-1.5 text-xs text-[#374151] max-h-40 overflow-y-auto pr-1">
              {(project.chapters && project.chapters.length > 0
                ? project.chapters.map((ch) => ({
                    key: ch.id,
                    label: `Ch. ${ch.chapterNumber}: ${ch.title}`,
                    meta: `${ch.turnIds.length} ${ch.turnIds.length === 1 ? 'scene' : 'scenes'}`,
                  }))
                : project.turns.map((t) => ({
                    key: t.id,
                    label: `Scene ${String(t.turnNumber).padStart(2, '0')}: ${t.sceneTitle}`,
                    meta: `${t.prose.length} para`,
                  }))
              )
                .slice(0, 20)
                .map((row) => (
                  <li
                    key={row.key}
                    className="flex items-center justify-between gap-2 py-1 border-b border-neutral-100 last:border-b-0"
                  >
                    <span className="truncate font-medium text-[#111827]">
                      {row.label}
                    </span>
                    <span className="font-mono text-[11px] text-[#6B7280] tabular-nums shrink-0">
                      {row.meta}
                    </span>
                  </li>
                ))}
            </ul>
          </div>

          <div className="border border-neutral-200 rounded-xl p-4 space-y-2 bg-white">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#4B5563]">
              Opening Prose &amp; Cast ({stats.aiEnriched ? 'AI-analyzed' : 'Structural'})
            </h4>
            <p className="text-xs text-[#6B7280]">
              Cast:{' '}
              <span className="text-[#111827] font-medium">
                {project.characters.map((c) => c.name).join(', ')}
              </span>
            </p>
            {openingTurn && (
              <p className="text-xs text-[#374151] leading-relaxed line-clamp-5 border-t border-neutral-100 pt-2">
                {openingTurn.prose.slice(0, 2).join(' ')}
              </p>
            )}
          </div>
        </div>

        <label className="flex items-start gap-2.5 p-3 border border-neutral-200 rounded-lg bg-[#F8FAFC] cursor-pointer">
          <input
            type="checkbox"
            checked={project.isPrivate === true}
            onChange={(e) => updatePreviewProject({ isPrivate: e.target.checked })}
            className="mt-0.5 accent-[#1D4ED8]"
          />
          <span className="text-xs text-[#374151]">
            <span className="font-semibold text-[#111827] inline-flex items-center gap-1">
              <Lock className="w-3 h-3" />
              Keep imported manuscript Private
            </span>
            <span className="block mt-0.5">
              Private works are stored in your Studio library only and strictly excluded from the public Landing Page Story Index.
            </span>
          </span>
        </label>

        <div className="pt-4 border-t border-neutral-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-[#4B5563] hover:text-[#111827] rounded-lg transition-colors whitespace-nowrap"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onImportComplete(project)}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Check className="w-4 h-4" />
            Open Imported Story in Studio
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleParseSubmit} className="space-y-5">
      {error && (
        <div
          role="alert"
          className="p-3.5 text-sm text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] rounded-lg"
        >
          {error}
        </div>
      )}

      {/* Source Type Switch */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Import source type"
          className="inline-flex items-center gap-1 p-1 bg-neutral-100 rounded-lg"
        >
          <button
            type="button"
            role="tab"
            aria-selected={sourceTab === 'file'}
            onClick={() => {
              setSourceTab('file');
              setError(null);
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              sourceTab === 'file'
                ? 'bg-white text-[#111827] shadow-sm'
                : 'text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            Upload File (.txt, .md, .docx, .odt)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sourceTab === 'url'}
            onClick={() => {
              setSourceTab('url');
              setError(null);
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              sourceTab === 'url'
                ? 'bg-white text-[#111827] shadow-sm'
                : 'text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            Import from URL
          </button>
        </div>
      </div>

      {sourceTab === 'file' ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
            isDragging
              ? 'border-[#1D4ED8] bg-[#EFF6FF]/60'
              : 'border-neutral-300 bg-[#F8FAFC] hover:border-neutral-400'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.markdown,.docx,.odt,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text"
            onChange={(e) => handleSelectFile(e.target.files?.[0] ?? null)}
            className="hidden"
            aria-label="Choose story file to upload"
          />

          {selectedFile ? (
            <div className="space-y-3">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#EFF6FF] text-[#1D4ED8]">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#111827]">
                  {selectedFile.name}
                </p>
                <p className="text-xs font-mono text-[#6B7280] tabular-nums mt-0.5">
                  {formatBytes(selectedFile.size)}
                </p>
              </div>
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 text-xs font-medium text-[#1D4ED8] bg-white border border-[#BFDBFE] hover:bg-[#EFF6FF] rounded-lg whitespace-nowrap cursor-pointer"
                >
                  Replace File
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-[#4B5563] hover:text-[#111827] rounded-lg whitespace-nowrap cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white border border-neutral-200 text-[#4B5563]">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#111827]">
                  Drop a manuscript file here, or{' '}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[#1D4ED8] hover:underline font-semibold cursor-pointer"
                  >
                    browse your device
                  </button>
                </p>
                <p className="text-xs text-[#6B7280] mt-1">
                  Supports Plain Text (.txt) · Markdown (.md) · Microsoft Word (.docx) · OpenDocument (.odt) up to 10 MB
                </p>
                <p className="text-[11px] font-mono text-[#6B7280] mt-1">
                  .txt &amp; .md headings: # Story Title · ## Chapter Title · ### Scene Title
                </p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2 bg-[#F8FAFC] border border-neutral-200 rounded-xl p-5">
          <label
            htmlFor="story-import-url"
            className="block text-sm font-medium text-[#111827]"
          >
            Story Web Page or Document URL
          </label>
          <input
            id="story-import-url"
            type="url"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="https://example.com/stories/chapter-one or direct .txt / .md / .docx / .odt link"
            className="w-full px-3.5 py-2.5 text-sm bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
          />
          <p className="text-xs text-[#6B7280] leading-relaxed">
            Extracts chapters, scenes, paragraphs, and metadata from HTML story pages (including AO3 work pages) or direct `.txt`, `.md`, `.docx`, and `.odt` links.
          </p>
        </div>
      )}

      {/* Optional Overrides */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="import-title-override"
            className="block text-xs font-medium text-[#111827] mb-1"
          >
            Title Override (Optional)
          </label>
          <input
            id="import-title-override"
            type="text"
            value={titleOverride}
            onChange={(e) => setTitleOverride(e.target.value)}
            placeholder="Auto-detected from document if blank"
            className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
          />
        </div>
        <div>
          <label
            htmlFor="import-universe-override"
            className="block text-xs font-medium text-[#111827] mb-1"
          >
            Universe / Fandom (Optional)
          </label>
          <input
            id="import-universe-override"
            type="text"
            value={universeOverride}
            onChange={(e) => setUniverseOverride(e.target.value)}
            placeholder="e.g., Original Fiction, Harry Potter, Dune"
            className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
          />
        </div>
      </div>

      {/* Options */}
      <div className="space-y-2.5">
        <label className="flex items-start gap-2.5 p-3 border border-neutral-200 rounded-lg bg-[#F8FAFC] cursor-pointer">
          <input
            type="checkbox"
            checked={enrichWithAi}
            onChange={(e) => setEnrichWithAi(e.target.checked)}
            className="mt-0.5 accent-[#1D4ED8]"
          />
          <span className="text-xs text-[#374151]">
            <span className="font-semibold text-[#111827] inline-flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-[#1D4ED8]" />
              Deduce Cast, Cross-Index &amp; AO3 Tags with AI
            </span>
            <span className="block mt-0.5">
              Preserves your full imported prose verbatim while automatically building character profiles, continuity anchors, and next-scene choices.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2.5 p-3 border border-neutral-200 rounded-lg bg-[#F8FAFC] cursor-pointer">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="mt-0.5 accent-[#1D4ED8]"
          />
          <span className="text-xs text-[#374151]">
            <span className="font-semibold text-[#111827] inline-flex items-center gap-1">
              <Lock className="w-3 h-3" />
              Keep imported story Private
            </span>
            <span className="block mt-0.5">
              Imported manuscripts start Private and remain excluded from the public Story Index until you toggle visibility.
            </span>
          </span>
        </label>
      </div>

      <div className="pt-4 border-t border-neutral-200 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isParsing}
          className="px-4 py-2 text-sm font-medium text-[#4B5563] hover:text-[#111827] rounded-lg transition-colors whitespace-nowrap"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isParsing}
          className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
        >
          {isParsing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Extracting &amp; Analyzing Story...
            </>
          ) : (
            <>
              <BookOpen className="w-4 h-4" />
              Parse &amp; Preview Story
            </>
          )}
        </button>
      </div>
    </form>
  );
};
