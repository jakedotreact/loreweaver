import React, { useState } from 'react';
import { BookOpen, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { UNIVERSE_TEMPLATES, UniverseTemplate } from '../data/presets';
import { ModelConfig, StoryProject, StorySnapshot } from '../types/story';
import { postJson } from '../utils/api';
import { DictaquillButton } from './DictaquillButton';
import { ModelConfigPanel } from './ModelConfigPanel';

interface SeedRow {
  id: string;
  name: string;
  role: 'Protagonist' | 'Companion' | 'Antagonist' | 'NPC';
  notes: string;
}

interface NewStoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadProject: (project: StoryProject) => void;
  modelConfig: ModelConfig;
  onChangeModelConfig: (next: ModelConfig) => void;
}

export const NewStoryModal: React.FC<NewStoryModalProps> = ({
  isOpen,
  onClose,
  onLoadProject,
  modelConfig,
  onChangeModelConfig,
}) => {
  const [mode, setMode] = useState<'presets' | 'custom'>('presets');
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  // Custom Universe Builder state
  const [universe, setUniverse] = useState('Harry Potter (Wizarding World)');
  const [title, setTitle] = useState('');
  const [setting, setSetting] = useState('Hogwarts Castle · Autumn 1996');
  const [tone, setTone] = useState('Character-Driven Mystery');
  const [premise, setPremise] = useState(
    'An unrecorded portrait in the Slytherin common room begins speaking in Parseltongue to third-year students during the night before Hogsmeade weekend.',
  );
  const [seeds, setSeeds] = useState<SeedRow[]>([
    { id: 's1', name: 'Harry Potter', role: 'Protagonist', notes: '' },
    { id: 's2', name: 'Luna Lovegood', role: 'Companion', notes: '' },
    { id: 's3', name: 'Draco Malfoy', role: 'Antagonist', notes: '' },
  ]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelectPreset = (tpl: UniverseTemplate) => {
    const cloned: StoryProject = JSON.parse(JSON.stringify(tpl.starterProject));
    cloned.id = `proj-${Date.now()}`;
    cloned.updatedAt = Date.now();
    onLoadProject(cloned);
    onClose();
  };

  const handleAddSeed = () => {
    setSeeds((prev) => [
      ...prev,
      { id: `s-${Date.now()}`, name: '', role: 'NPC', notes: '' },
    ]);
  };

  const handleRemoveSeed = (id: string) => {
    setSeeds((prev) => prev.filter((s) => s.id !== id));
  };

  const handleUpdateSeed = (id: string, patch: Partial<SeedRow>) => {
    setSeeds((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const handleCreateCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!universe.trim() || !setting.trim() || !premise.trim()) {
      setError('Please enter a universe, setting, and opening premise.');
      return;
    }

    setIsGenerating(true);
    try {
      const validSeeds = seeds
        .filter((s) => s.name.trim().length > 0)
        .map((s) => ({
          name: s.name.trim(),
          role: s.role,
          notes: s.notes.trim() || undefined,
        }));

      const data = await postJson<{ snapshot: StorySnapshot }>(
        '/api/story/deduce-universe',
        {
          title: title.trim() || undefined,
          universe: universe.trim(),
          setting: setting.trim(),
          tone: tone.trim(),
          premise: premise.trim(),
          seedCharacters: validSeeds,
          modelConfig,
        },
      );

      const newProject: StoryProject = {
        ...data.snapshot,
        id: `proj-${Date.now()}`,
        savePoints: [],
        updatedAt: Date.now(),
      };
      onLoadProject(newProject);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-story-heading"
    >
      <div className="w-full max-w-4xl bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-neutral-200 flex items-center justify-between gap-4">
          <div>
            <h2
              id="new-story-heading"
              className="font-editorial text-2xl font-semibold text-[#111827]"
            >
              Start a Story Universe
            </h2>
            <p className="text-sm text-[#4B5563] mt-0.5">
              Begin from a curated canon premise or build any fictional or original setting.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 text-[#6B7280] hover:text-[#111827] hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Segmented Bar */}
        <div className="px-6 pt-4 pb-2 border-b border-neutral-100 flex items-center gap-2">
          <div className="inline-flex items-center gap-1 p-1 bg-neutral-100 rounded-lg">
            <button
              type="button"
              onClick={() => setMode('presets')}
              className={`px-3.5 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                mode === 'presets'
                  ? 'bg-white text-[#111827] shadow-sm'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              Curated Worlds
            </button>
            <button
              type="button"
              onClick={() => setMode('custom')}
              className={`px-3.5 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                mode === 'custom'
                  ? 'bg-white text-[#111827] shadow-sm'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              Custom Universe &amp; Canon Builder
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {mode === 'presets' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {UNIVERSE_TEMPLATES.map((tpl) => {
                const imgBroken = failedImages[tpl.id];
                return (
                  <article
                    key={tpl.id}
                    className="flex flex-col border border-neutral-200 rounded-xl overflow-hidden bg-white hover:border-neutral-300 transition-colors"
                  >
                    <div className="aspect-video w-full bg-neutral-100 overflow-hidden relative">
                      {!imgBroken ? (
                        <img
                          src={tpl.coverImage}
                          alt={`${tpl.title} cover illustration`}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setFailedImages((prev) => ({ ...prev, [tpl.id]: true }))
                          }
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-neutral-200 to-neutral-100 flex flex-col items-center justify-center p-4 text-center">
                          <BookOpen className="w-6 h-6 text-neutral-500 mb-2" />
                          <span className="font-editorial text-sm font-semibold text-neutral-700">
                            {tpl.title}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="p-5 flex-1 flex flex-col">
                      <p className="text-xs text-[#6B7280]">
                        {tpl.universe} <span aria-hidden="true">·</span> {tpl.tone}
                      </p>
                      <h3 className="font-editorial text-lg font-semibold text-[#111827] mt-1">
                        {tpl.title}
                      </h3>
                      <p className="text-sm text-[#4B5563] mt-2 leading-relaxed flex-1">
                        {tpl.summary}
                      </p>
                      <div className="mt-5 pt-4 border-t border-neutral-100 flex items-center justify-between text-xs text-[#6B7280]">
                        <span className="font-mono tabular-nums">
                          {tpl.starterProject.characters.length} characters ·{' '}
                          {tpl.starterProject.crossIndex.length} lore rules
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelectPreset(tpl)}
                        className="mt-4 w-full py-2 px-4 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors whitespace-nowrap"
                      >
                        Open Story
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <form onSubmit={handleCreateCustom} className="space-y-6">
              {error && (
                <div className="p-3.5 text-sm text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] rounded-lg">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#111827] mb-1.5">
                    Fictional Universe or Original World
                  </label>
                  <input
                    type="text"
                    value={universe}
                    onChange={(e) => setUniverse(e.target.value)}
                    placeholder="e.g., Harry Potter, Star Wars, Sherlock Holmes, or Original Steampunk"
                    className="w-full px-3.5 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] focus:border-[#1D4ED8]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#111827] mb-1.5">
                    Story Title (Optional)
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Leave blank to generate automatically"
                    className="w-full px-3.5 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] focus:border-[#1D4ED8]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#111827] mb-1.5">
                    Setting &amp; Era
                  </label>
                  <input
                    type="text"
                    value={setting}
                    onChange={(e) => setSetting(e.target.value)}
                    placeholder="e.g., 221B Baker Street, November 1894"
                    className="w-full px-3.5 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] focus:border-[#1D4ED8]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#111827] mb-1.5">
                    Tone &amp; Genre
                  </label>
                  <input
                    type="text"
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    placeholder="e.g., Political Intrigue, Cozy Mystery, Dark Fantasy"
                    className="w-full px-3.5 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] focus:border-[#1D4ED8]"
                  />
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <label className="block text-sm font-medium text-[#111827]">
                    Opening Premise
                  </label>
                  <DictaquillButton
                    disabled={isGenerating}
                    contextHint={`${universe}. ${setting}`}
                    onTranscribe={(dictated) =>
                      setPremise((prev) =>
                        prev.trim() ? `${prev.trimEnd()} ${dictated}` : dictated,
                      )
                    }
                  />
                </div>
                <textarea
                  rows={3}
                  value={premise}
                  onChange={(e) => setPremise(e.target.value)}
                  placeholder="Describe or dictate the inciting situation or conflict..."
                  className="w-full px-3.5 py-2.5 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] focus:border-[#1D4ED8]"
                />
              </div>

              {/* Seed Characters */}
              <div className="pt-2 border-t border-neutral-200">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[#111827]">
                      Cast Seeds
                    </h3>
                    <p className="text-xs text-[#6B7280]">
                      Provide names only to deduce canon pros, flaws, and voice automatically—or add custom notes. Leave empty to auto-populate the cast.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddSeed}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#111827] border border-neutral-300 hover:bg-neutral-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Character
                  </button>
                </div>

                <div className="space-y-2.5">
                  {seeds.map((seed) => (
                    <div
                      key={seed.id}
                      className="grid grid-cols-1 sm:grid-cols-[1fr_140px_1.4fr_36px] gap-2.5 items-center"
                    >
                      <input
                        type="text"
                        value={seed.name}
                        onChange={(e) => handleUpdateSeed(seed.id, { name: e.target.value })}
                        placeholder="Character name (e.g., Hermione Granger)"
                        className="px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                      />
                      <select
                        value={seed.role}
                        onChange={(e) =>
                          handleUpdateSeed(seed.id, {
                            role: e.target.value as SeedRow['role'],
                          })
                        }
                        className="px-2.5 py-2 text-sm border border-neutral-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                      >
                        <option value="Protagonist">Protagonist</option>
                        <option value="Companion">Companion</option>
                        <option value="Antagonist">Antagonist</option>
                        <option value="NPC">NPC</option>
                      </select>
                      <input
                        type="text"
                        value={seed.notes}
                        onChange={(e) => handleUpdateSeed(seed.id, { notes: e.target.value })}
                        placeholder="Optional custom traits/notes (blank = deduce from canon)"
                        className="px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveSeed(seed.id)}
                        aria-label="Remove seed character"
                        className="p-2 text-[#6B7280] hover:text-[#DC2626] rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-neutral-200">
                <h3 className="text-sm font-semibold text-[#111827] mb-3">
                  Model Configuration
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <ModelConfigPanel
                      config={modelConfig}
                      onChange={onChangeModelConfig}
                      compact
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-neutral-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isGenerating}
                  className="px-4 py-2 text-sm font-medium text-[#4B5563] hover:text-[#111827] rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isGenerating}
                  className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Sparkles className="w-4 h-4" />
                  {isGenerating ? 'Building Universe & Cast...' : 'Create Story & Deduce Cast'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
