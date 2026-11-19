import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  ImagePlus,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import {
  ModelConfig,
  StoryChapter,
  StoryIllustration,
  StoryProject,
  StorySnapshot,
  StoryTurn,
} from '../types/story';
import { postJson } from '../utils/api';
import { processUploadedIllustration } from '../utils/imageUpload';
import { IllustrationFigure } from './IllustrationFigure';

export type IllustrationTarget =
  | { kind: 'scene'; turn: StoryTurn }
  | { kind: 'chapter'; chapter: StoryChapter; turns: StoryTurn[] };

export interface IllustrationPromptResponse {
  prompt: string;
  caption: string;
  artStyle: string;
  continuityChecklist: string[];
}

interface IllustrationModalProps {
  project: StoryProject;
  target: IllustrationTarget | null;
  modelConfig: ModelConfig;
  onClose: () => void;
  onSaveIllustration: (illustration: StoryIllustration | null) => void;
}

const STYLE_PRESETS = [
  'Editorial ink & watercolor plate',
  'Classic oil painting bookplate',
  'Charcoal & sepia engraving',
  'Atmospheric cinema still',
];

function buildSnapshot(project: StoryProject): StorySnapshot {
  return {
    title: project.title,
    universe: project.universe,
    setting: project.setting,
    tone: project.tone,
    premise: project.premise,
    protagonistId: project.protagonistId,
    turns: project.turns,
    characters: project.characters,
    crossIndex: project.crossIndex,
    chapters: project.chapters ?? [],
  };
}

export const IllustrationModal: React.FC<IllustrationModalProps> = ({
  project,
  target,
  modelConfig,
  onClose,
  onSaveIllustration,
}) => {
  const existingIllustration =
    target?.kind === 'scene'
      ? target.turn.illustration ?? null
      : target?.kind === 'chapter'
        ? target.chapter.illustration ?? null
        : null;

  const defaultCaption =
    target?.kind === 'scene'
      ? `Scene ${String(target.turn.turnNumber).padStart(2, '0')} — ${target.turn.sceneTitle}`
      : target?.kind === 'chapter'
        ? `Chapter ${String(target.chapter.chapterNumber).padStart(2, '0')} — ${target.chapter.title}`
        : '';

  const [dataUrl, setDataUrl] = useState<string>('');
  const [caption, setCaption] = useState<string>('');
  const [artStyle, setArtStyle] = useState<string>('');
  const [promptUsed, setPromptUsed] = useState<string>('');
  const [uploadMeta, setUploadMeta] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [stylePreference, setStylePreference] = useState<string>(STYLE_PRESETS[0]);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [generatedBrief, setGeneratedBrief] =
    useState<IllustrationPromptResponse | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!target) return;
    setDataUrl(existingIllustration?.dataUrl ?? '');
    setCaption(existingIllustration?.caption ?? defaultCaption);
    setArtStyle(existingIllustration?.artStyle ?? '');
    setPromptUsed(existingIllustration?.promptUsed ?? '');
    setUploadMeta(null);
    setUploadError(null);
    setIsProcessingUpload(false);
    setIsDragging(false);
    setPromptError(null);
    setGeneratedBrief(null);
    setCopiedPrompt(false);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [target, existingIllustration, defaultCaption, onClose]);

  useModalScrollLock(Boolean(target));

  if (!target) return null;

  const headingTitle =
    target.kind === 'scene'
      ? `Scene ${String(target.turn.turnNumber).padStart(2, '0')} Illustration`
      : `Chapter ${String(target.chapter.chapterNumber).padStart(2, '0')} Illustration`;

  const subTitle =
    target.kind === 'scene'
      ? `${target.turn.sceneTitle} · ${target.turn.location}`
      : `${target.chapter.title} · ${target.turns.length} ${
          target.turns.length === 1 ? 'scene' : 'scenes'
        }`;

  const handleFile = async (file: File) => {
    setUploadError(null);
    setIsProcessingUpload(true);
    try {
      const processed = await processUploadedIllustration(file);
      setDataUrl(processed.dataUrl);
      setUploadMeta(
        `${processed.width} × ${processed.height}px · ~${processed.approxKb} KB`,
      );
      if (!caption.trim()) {
        setCaption(defaultCaption);
      }
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Unable to process image upload.',
      );
    } finally {
      setIsProcessingUpload(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      void handleFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleFile(file);
    }
  };

  const handleGeneratePrompt = async () => {
    setPromptError(null);
    setIsGeneratingPrompt(true);
    try {
      const payload =
        target.kind === 'scene'
          ? {
              snapshot: buildSnapshot(project),
              targetKind: 'scene' as const,
              turnId: target.turn.id,
              stylePreference,
              modelConfig,
            }
          : {
              snapshot: buildSnapshot(project),
              targetKind: 'chapter' as const,
              chapterId: target.chapter.id,
              stylePreference,
              modelConfig,
            };

      const data = await postJson<{ result: IllustrationPromptResponse }>(
        '/api/story/illustration-prompt',
        payload,
      );
      setGeneratedBrief(data.result);
    } catch (err) {
      setPromptError(
        err instanceof Error
          ? err.message
          : 'Unable to generate illustration prompt.',
      );
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const handleCopyPrompt = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch {
      // Clipboard may be restricted in non-HTTPS contexts
    }
  };

  const handleApplyBriefMetadata = () => {
    if (!generatedBrief) return;
    setCaption(generatedBrief.caption);
    setArtStyle(generatedBrief.artStyle);
    setPromptUsed(generatedBrief.prompt);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dataUrl) {
      setUploadError('Upload an illustration image first before saving.');
      return;
    }
    const saved: StoryIllustration = {
      id: existingIllustration?.id ?? `ill-${Date.now()}`,
      dataUrl,
      caption: caption.trim() || defaultCaption,
      artStyle: artStyle.trim() || undefined,
      promptUsed: promptUsed.trim() || undefined,
      source: 'uploaded',
      createdAt: existingIllustration?.createdAt ?? Date.now(),
    };
    onSaveIllustration(saved);
    onClose();
  };

  const handleRemove = () => {
    onSaveIllustration(null);
    onClose();
  };

  const previewIllustration: StoryIllustration | null = dataUrl
    ? {
        id: 'preview',
        dataUrl,
        caption: caption.trim() || defaultCaption,
        artStyle: artStyle.trim() || undefined,
        promptUsed: promptUsed.trim() || undefined,
        source: 'uploaded',
        createdAt: Date.now(),
      }
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 sm:p-6 overflow-hidden overscroll-contain"
      role="dialog"
      aria-modal="true"
      aria-labelledby="illustration-modal-heading"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <ImagePlus className="w-5 h-5 text-[#1D4ED8] shrink-0 mt-1" />
            <div className="min-w-0">
              <p className="text-xs font-mono tabular-nums text-[#6B7280]">
                {subTitle}
              </p>
              <h2
                id="illustration-modal-heading"
                className="font-editorial text-xl sm:text-2xl font-semibold text-[#111827] mt-0.5 text-balance"
              >
                {headingTitle}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close illustration studio"
            className="p-2 text-[#6B7280] hover:text-[#111827] hover:bg-neutral-100 rounded-lg shrink-0 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 space-y-7 overflow-y-auto overscroll-contain flex-1 min-h-0">
          <p className="text-xs text-[#4B5563] bg-neutral-50 border border-neutral-200 rounded-lg px-4 py-2.5 leading-relaxed">
            In-app AI image rendering requires a paid API key, so this studio combines{' '}
            <span className="font-semibold text-[#111827]">
              Canon Illustration Prompt Generation
            </span>{' '}
            (powered by Gemini 4 Hydrogen) with{' '}
            <span className="font-semibold text-[#111827]">
              Manual Artwork Upload
            </span>{' '}
            stored directly in your manuscript and HTML exports.
          </p>

          {/* Section 1: Canon Illustration Prompt Generator */}
          <section className="border border-neutral-200 rounded-xl p-5 space-y-4 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[#111827]">
                  1. Generate Canon Illustration Prompt
                </h3>
                <p className="text-xs text-[#4B5563] mt-0.5">
                  Synthesize a continuity-checked art direction brief from the prose, cast inventories, and Cross-Index.
                </p>
              </div>
              <button
                type="button"
                onClick={handleGeneratePrompt}
                disabled={isGeneratingPrompt}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                {isGeneratingPrompt ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Crafting Prompt...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    Generate Prompt
                  </>
                )}
              </button>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="illustration-style-pref"
                className="block text-xs font-medium text-[#111827]"
              >
                Visual Style &amp; Medium Preference
              </label>
              <input
                id="illustration-style-pref"
                type="text"
                value={stylePreference}
                onChange={(e) => setStylePreference(e.target.value)}
                placeholder="e.g., Editorial ink & watercolor plate, woodcut engraving, atmospheric film still..."
                className="w-full px-3.5 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                {STYLE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setStylePreference(preset)}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors whitespace-nowrap ${
                      stylePreference === preset
                        ? 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE] font-medium'
                        : 'bg-white text-[#4B5563] border-neutral-200 hover:bg-neutral-50'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {promptError && (
              <div
                role="alert"
                className="px-3.5 py-2.5 bg-[#FEF2F2] border border-[#FECACA] rounded-lg flex items-start gap-2 text-xs text-[#991B1B]"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#DC2626]" />
                <div className="flex-1">
                  <p>{promptError}</p>
                  <button
                    type="button"
                    onClick={handleGeneratePrompt}
                    className="mt-1 font-semibold underline hover:no-underline"
                  >
                    Retry prompt generation
                  </button>
                </div>
              </div>
            )}

            {generatedBrief && (
              <div className="pt-3 border-t border-neutral-100 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#111827]">
                    Generated Illustration Prompt
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleApplyBriefMetadata}
                      className="px-2.5 py-1 text-xs font-medium text-[#1D4ED8] bg-[#EFF6FF] hover:bg-[#DBEAFE] border border-[#BFDBFE] rounded-md transition-colors whitespace-nowrap"
                    >
                      Apply Caption &amp; Notes
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopyPrompt(generatedBrief.prompt)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#111827] bg-white hover:bg-neutral-50 border border-neutral-200 rounded-md transition-colors whitespace-nowrap"
                    >
                      {copiedPrompt ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#15803D]" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copy Prompt
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-[#111827] leading-relaxed whitespace-pre-wrap select-all">
                  {generatedBrief.prompt}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-white border border-neutral-200 rounded-lg">
                    <p className="font-semibold text-[#111827] mb-0.5">
                      Suggested Caption
                    </p>
                    <p className="text-[#4B5563] italic">{generatedBrief.caption}</p>
                  </div>
                  <div className="p-3 bg-white border border-neutral-200 rounded-lg">
                    <p className="font-semibold text-[#111827] mb-0.5">
                      Recommended Medium
                    </p>
                    <p className="text-[#4B5563]">{generatedBrief.artStyle}</p>
                  </div>
                </div>

                {generatedBrief.continuityChecklist.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-[#111827]">
                      Canon Visual Continuity Checklist
                    </p>
                    <ul className="text-xs text-[#4B5563] space-y-1 list-disc pl-4">
                      {generatedBrief.continuityChecklist.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Section 2: Manual Illustration Upload */}
          <form onSubmit={handleSave} className="border border-neutral-200 rounded-xl p-5 space-y-4 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-[#111827]">
                  2. Upload &amp; Attach Illustration
                </h3>
                <p className="text-xs text-[#4B5563] mt-0.5">
                  Upload any PNG, JPEG, WebP, or GIF artwork. Images are resized cleanly to stay fast in local storage.
                </p>
              </div>
              {uploadMeta && (
                <span className="text-xs font-mono tabular-nums text-[#6B7280]">
                  {uploadMeta}
                </span>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              onChange={handleFileInputChange}
              className="sr-only"
              aria-label="Choose illustration image file"
            />

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors ${
                isDragging
                  ? 'border-[#1D4ED8] bg-[#EFF6FF]'
                  : 'border-neutral-300 bg-neutral-50 hover:border-neutral-400'
              }`}
            >
              <Upload className="w-5 h-5 text-[#1D4ED8] mx-auto mb-2" />
              <p className="text-sm font-medium text-[#111827]">
                {isProcessingUpload
                  ? 'Optimizing illustration...'
                  : previewIllustration
                    ? 'Drop a new image here or browse to replace artwork'
                    : 'Drag and drop an illustration here, or choose a file'}
              </p>
              <p className="text-xs text-[#6B7280] mt-1">
                PNG, JPEG, WebP, or GIF up to 20 MB
              </p>
              <button
                type="button"
                disabled={isProcessingUpload}
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-[#111827] bg-white hover:bg-neutral-100 border border-neutral-300 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
              >
                <ImagePlus className="w-3.5 h-3.5 text-[#1D4ED8]" />
                {previewIllustration ? 'Choose Replacement Image' : 'Browse Image File'}
              </button>
            </div>

            {uploadError && (
              <div
                role="alert"
                className="px-3.5 py-2.5 bg-[#FEF2F2] border border-[#FECACA] rounded-lg flex items-center gap-2 text-xs text-[#991B1B]"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 text-[#DC2626]" />
                <span>{uploadError}</span>
              </div>
            )}

            {previewIllustration && (
              <IllustrationFigure
                illustration={previewIllustration}
                fallbackAlt={defaultCaption}
                compact
              />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="illustration-caption"
                  className="block text-xs font-medium text-[#111827] mb-1"
                >
                  Figure Caption
                </label>
                <input
                  id="illustration-caption"
                  type="text"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder={defaultCaption}
                  className="w-full px-3.5 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                />
              </div>
              <div>
                <label
                  htmlFor="illustration-art-style"
                  className="block text-xs font-medium text-[#111827] mb-1"
                >
                  Art Medium / Credit (Optional)
                </label>
                <input
                  id="illustration-art-style"
                  type="text"
                  value={artStyle}
                  onChange={(e) => setArtStyle(e.target.value)}
                  placeholder="e.g., Ink wash by studio artist"
                  className="w-full px-3.5 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="illustration-prompt-notes"
                className="block text-xs font-medium text-[#111827] mb-1"
              >
                Prompt / Art Direction Notes (Optional)
              </label>
              <textarea
                id="illustration-prompt-notes"
                rows={2}
                value={promptUsed}
                onChange={(e) => setPromptUsed(e.target.value)}
                placeholder="Save the prompt or visual notes used to produce this plate..."
                className="w-full px-3.5 py-2 text-xs border border-neutral-300 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
              />
            </div>

            <div className="pt-3 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                {existingIllustration && (
                  <button
                    type="button"
                    onClick={handleRemove}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#DC2626] hover:bg-[#FEF2F2] border border-[#FECACA] rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove Illustration
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-[#4B5563] hover:text-[#111827]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!dataUrl || isProcessingUpload}
                  className="px-5 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  Save Illustration
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
