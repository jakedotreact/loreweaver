import React, { useRef, useState } from 'react';
import { Bookmark, Download, RotateCcw, Trash2, Upload } from 'lucide-react';
import { SavePoint, StoryProject } from '../types/story';
import { saveTextFile } from '../utils/htmlExport';

interface SavePointsViewProps {
  project: StoryProject;
  onCreateSavePoint: (label: string) => void;
  onRestoreSavePoint: (saveId: string) => void;
  onDeleteSavePoint: (saveId: string) => void;
  onImportProject: (project: StoryProject) => void;
  onOpenHtmlExport: () => void;
}

export const SavePointsView: React.FC<SavePointsViewProps> = ({
  project,
  onCreateSavePoint,
  onRestoreSavePoint,
  onDeleteSavePoint,
  onImportProject,
  onOpenHtmlExport,
}) => {
  const [label, setLabel] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const latestTurn = project.turns[project.turns.length - 1];

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const finalLabel =
      label.trim() ||
      `Scene ${String(latestTurn?.turnNumber ?? 1).padStart(2, '0')} — ${
        latestTurn?.sceneTitle ?? 'Checkpoint'
      }`;
    onCreateSavePoint(finalLabel);
    setLabel('');
  };

  const handleExport = () => {
    const payload = JSON.stringify(project, null, 2);
    const slug = project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    saveTextFile(`${slug || 'story'}-archive.json`, payload, 'application/json;charset=utf-8');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      let parsed: StoryProject;
      try {
        parsed = JSON.parse(text) as StoryProject;
      } catch {
        throw new Error('Selected file is not a valid JSON story archive.');
      }
      if (!parsed.title || !Array.isArray(parsed.turns) || !Array.isArray(parsed.characters)) {
        throw new Error('Invalid story archive format.');
      }
      onImportProject(parsed);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : 'Unable to read story archive file.',
      );
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-[1040px] mx-auto px-4 sm:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-neutral-200">
        <div>
          <p className="text-xs text-[#6B7280]">
            {project.title} <span aria-hidden="true">·</span> {project.universe}
          </p>
          <h1 className="font-editorial text-3xl font-semibold text-[#111827] mt-1">
            Save Points &amp; Archives
          </h1>
          <p className="text-sm text-[#4B5563] mt-1.5 max-w-2xl">
            Capture exact snapshots of narrative history, character inventories, and Cross-Index state—or export your full story as HTML or JSON.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onOpenHtmlExport}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-[#1D4ED8]" />
            Export HTML
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-[#4B5563]" />
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <Upload className="w-4 h-4 text-[#4B5563]" />
            Import JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </div>

      {importError && (
        <div className="p-3.5 text-sm text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] rounded-lg">
          {importError}
        </div>
      )}

      {/* Create Save Point Form */}
      <form
        onSubmit={handleSave}
        className="bg-white border border-neutral-200 rounded-xl p-5 flex flex-col sm:flex-row items-stretch sm:items-end gap-4"
      >
        <div className="flex-1">
          <label
            htmlFor="save-point-label"
            className="block text-sm font-medium text-[#111827] mb-1.5"
          >
            Create Checkpoint from Current State
          </label>
          <input
            id="save-point-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={`e.g., Before confronting Snape (Scene ${String(
              latestTurn?.turnNumber ?? 1,
            ).padStart(2, '0')})`}
            className="w-full px-3.5 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] focus:border-[#1D4ED8]"
          />
        </div>
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 px-5 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Bookmark className="w-4 h-4" />
          Save Point
        </button>
      </form>

      {/* Save Points List */}
      <section aria-label="Saved checkpoints">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-[#111827]">
            Saved Checkpoints
          </h2>
          <span className="text-xs font-mono tabular-nums text-[#6B7280]">
            {project.savePoints.length} total
          </span>
        </div>

        {project.savePoints.length === 0 ? (
          <div className="bg-white border border-neutral-200 rounded-xl p-10 text-center">
            <p className="text-sm font-medium text-[#111827]">No save points recorded yet</p>
            <p className="text-sm text-[#6B7280] mt-1 max-w-md mx-auto">
              Save a checkpoint before risky branching decisions so you can restore or explore alternate timelines at any time.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-neutral-200 rounded-xl divide-y divide-neutral-200">
            {project.savePoints.map((sp: SavePoint) => (
              <div
                key={sp.id}
                className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-neutral-50/70 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 text-xs text-[#6B7280] font-mono tabular-nums">
                    <span>Scene {String(sp.turnNumber).padStart(2, '0')}</span>
                    <span aria-hidden="true">·</span>
                    <span>{new Date(sp.createdAt).toLocaleString()}</span>
                  </div>
                  <h3 className="text-base font-semibold text-[#111827] mt-1 truncate">
                    {sp.label}
                  </h3>
                  <p className="text-xs text-[#4B5563] mt-1">
                    {sp.sceneTitle} <span aria-hidden="true">·</span>{' '}
                    <span className="font-mono tabular-nums">
                      {sp.snapshot.characters.length} characters
                    </span>{' '}
                    <span aria-hidden="true">·</span>{' '}
                    <span className="font-mono tabular-nums">
                      {sp.snapshot.crossIndex.length} lore entries
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onRestoreSavePoint(sp.id)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-100 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-[#1D4ED8]" />
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteSavePoint(sp.id)}
                    aria-label={`Delete save point ${sp.label}`}
                    className="p-2 text-[#6B7280] hover:text-[#DC2626] hover:bg-neutral-100 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
