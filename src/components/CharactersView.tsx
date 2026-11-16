import React, { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';
import { CharacterProfile, CharacterRole, ModelConfig, StoryProject } from '../types/story';
import { postJson } from '../utils/api';

interface CharactersViewProps {
  project: StoryProject;
  modelConfig: ModelConfig;
  onUpsertCharacter: (character: CharacterProfile) => void;
  onDeleteCharacter: (characterId: string) => void;
}

const ROLE_FILTERS: Array<'All' | CharacterRole> = [
  'All',
  'Protagonist',
  'Companion',
  'Antagonist',
  'NPC',
];

function emptyCharacter(): CharacterProfile {
  return {
    id: `char-${Date.now()}`,
    name: '',
    role: 'Companion',
    origin: 'canon',
    summary: '',
    pros: [],
    flaws: [],
    motivation: '',
    voiceAndMannerisms: '',
    status: 'Active',
    location: '',
    inventory: [],
    relationships: [],
    deducedFromContext: false,
  };
}

export const CharactersView: React.FC<CharactersViewProps> = ({
  project,
  modelConfig,
  onUpsertCharacter,
  onDeleteCharacter,
}) => {
  const [roleFilter, setRoleFilter] = useState<'All' | CharacterRole>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingChar, setEditingChar] = useState<CharacterProfile | null>(null);

  // Raw textarea helpers inside modal
  const [prosText, setProsText] = useState('');
  const [flawsText, setFlawsText] = useState('');
  const [inventoryText, setInventoryText] = useState('');
  const [notesForDeduction, setNotesForDeduction] = useState('');
  const [isDeducing, setIsDeducing] = useState(false);
  const [deduceError, setDeduceError] = useState<string | null>(null);

  const filteredCharacters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return project.characters.filter((c) => {
      const matchesRole = roleFilter === 'All' || c.role === roleFilter;
      const matchesQuery =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.summary.toLowerCase().includes(q) ||
        c.pros.some((p) => p.toLowerCase().includes(q)) ||
        c.flaws.some((f) => f.toLowerCase().includes(q));
      return matchesRole && matchesQuery;
    });
  }, [project.characters, roleFilter, searchQuery]);

  const openEditor = (char: CharacterProfile) => {
    setEditingChar({ ...char });
    setProsText(char.pros.join('\n'));
    setFlawsText(char.flaws.join('\n'));
    setInventoryText(char.inventory.join('\n'));
    setNotesForDeduction('');
    setDeduceError(null);
  };

  const handleDeduceFromContext = async () => {
    if (!editingChar || !editingChar.name.trim()) {
      setDeduceError('Enter a character name first so the agent can deduce their profile.');
      return;
    }

    setIsDeducing(true);
    setDeduceError(null);
    try {
      const existingPros = prosText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const existingFlaws = flawsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const data = await postJson<{ character: Omit<CharacterProfile, 'id'> }>(
        '/api/story/deduce-character',
        {
          universe: project.universe,
          setting: project.setting,
          tone: project.tone,
          premise: project.premise,
          existingCharacters: project.characters
            .filter((c) => c.id !== editingChar.id)
            .map((c) => ({ name: c.name, role: c.role, summary: c.summary })),
          name: editingChar.name.trim(),
          role: editingChar.role,
          notes: notesForDeduction.trim() || undefined,
          existingPros: existingPros.length ? existingPros : undefined,
          existingFlaws: existingFlaws.length ? existingFlaws : undefined,
          modelConfig,
        },
      );

      const deduced = data.character as Omit<CharacterProfile, 'id'>;
      setEditingChar((prev) =>
        prev
          ? {
              ...prev,
              ...deduced,
              id: prev.id,
            }
          : null,
      );
      setProsText(deduced.pros.join('\n'));
      setFlawsText(deduced.flaws.join('\n'));
      setInventoryText(deduced.inventory.join('\n'));
    } catch (err) {
      setDeduceError(
        err instanceof Error ? err.message : 'Unable to deduce character details.',
      );
    } finally {
      setIsDeducing(false);
    }
  };

  const handleSaveCharacter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChar || !editingChar.name.trim()) return;

    const finalChar: CharacterProfile = {
      ...editingChar,
      name: editingChar.name.trim(),
      pros: prosText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      flaws: flawsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      inventory: inventoryText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    };

    onUpsertCharacter(finalChar);
    setEditingChar(null);
  };

  return (
    <div className="max-w-[1240px] mx-auto px-4 sm:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-neutral-200">
        <div>
          <p className="text-xs text-[#6B7280]">
            {project.title} <span aria-hidden="true">·</span> {project.universe}
          </p>
          <h1 className="font-editorial text-3xl font-semibold text-[#111827] mt-1">
            Character Profiles
          </h1>
          <p className="text-sm text-[#4B5563] mt-1.5 max-w-2xl">
            Manage custom sheets or enter any canon character name to automatically deduce authentic pros, flaws, voice, and possessions from the story universe.
          </p>
        </div>

        <button
          type="button"
          onClick={() => openEditor(emptyCharacter())}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Character
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 p-1 bg-neutral-100 rounded-lg overflow-x-auto">
          {ROLE_FILTERS.map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => setRoleFilter(role)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                roleFilter === role
                  ? 'bg-white text-[#111827] shadow-sm'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              {role}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search cast, traits, or flaws..."
            className="w-full pl-9 pr-3.5 py-2 text-sm bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] focus:border-[#1D4ED8]"
          />
        </div>
      </div>

      {/* Cast Grid */}
      {filteredCharacters.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-10 text-center">
          <p className="text-sm font-medium text-[#111827]">No matching characters</p>
          <p className="text-sm text-[#6B7280] mt-1">
            Add a character or adjust your search and role filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCharacters.map((char) => (
            <article
              key={char.id}
              className="bg-white border border-neutral-200 rounded-xl p-6 flex flex-col justify-between"
            >
              <div>
                {/* Kicker & Actions */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-[#6B7280]">
                      {char.role} <span aria-hidden="true">·</span>{' '}
                      {char.origin === 'canon'
                        ? 'Canon'
                        : char.origin === 'emergent'
                        ? 'Emergent'
                        : 'Original'}
                      {char.deducedFromContext ? ' · Context-deduced' : ''}
                    </p>
                    <h2 className="font-editorial text-xl font-semibold text-[#111827] mt-1 truncate">
                      {char.name}
                    </h2>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditor(char)}
                      aria-label={`Edit ${char.name}`}
                      className="p-1.5 text-[#6B7280] hover:text-[#111827] hover:bg-neutral-100 rounded-md transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    {project.characters.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onDeleteCharacter(char.id)}
                        aria-label={`Delete ${char.name}`}
                        className="p-1.5 text-[#6B7280] hover:text-[#DC2626] hover:bg-neutral-100 rounded-md transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-sm text-[#4B5563] mt-3 leading-relaxed">
                  {char.summary}
                </p>

                {/* Current State */}
                <div className="mt-4 pt-4 border-t border-neutral-100 space-y-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-[#6B7280] shrink-0">Location</span>
                    <span className="text-[#111827] font-medium text-right">
                      {char.location || 'Unspecified'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#6B7280] shrink-0">Condition</span>
                    <span className="text-[#111827] text-right">
                      {char.status || 'Active'}
                    </span>
                  </div>
                </div>

                {/* Pros & Flaws */}
                <div className="mt-4 pt-4 border-t border-neutral-100 space-y-3">
                  <div>
                    <h3 className="text-xs font-semibold text-[#111827]">
                      Strengths &amp; Pros
                    </h3>
                    <ul className="mt-1.5 space-y-1 text-xs text-[#374151]">
                      {char.pros.length > 0 ? (
                        char.pros.map((pro, i) => (
                          <li key={i} className="leading-relaxed">
                            + {pro}
                          </li>
                        ))
                      ) : (
                        <li className="text-[#6B7280]">None specified</li>
                      )}
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold text-[#111827]">
                      Flaws &amp; Vulnerabilities
                    </h3>
                    <ul className="mt-1.5 space-y-1 text-xs text-[#374151]">
                      {char.flaws.length > 0 ? (
                        char.flaws.map((flaw, i) => (
                          <li key={i} className="leading-relaxed">
                            − {flaw}
                          </li>
                        ))
                      ) : (
                        <li className="text-[#6B7280]">None specified</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Inventory & Motivation footer */}
              <div className="mt-4 pt-4 border-t border-neutral-100 space-y-2 text-xs">
                {char.motivation && (
                  <p className="text-[#4B5563] leading-relaxed">
                    <span className="font-semibold text-[#111827]">Drive: </span>
                    {char.motivation}
                  </p>
                )}
                {char.inventory.length > 0 && (
                  <p className="text-[#4B5563] leading-relaxed">
                    <span className="font-semibold text-[#111827]">Carrying: </span>
                    {char.inventory.join(' · ')}
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Character Editor Modal */}
      {editingChar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-char-title"
        >
          <div className="w-full max-w-2xl bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between gap-4">
              <div>
                <h2
                  id="edit-char-title"
                  className="font-editorial text-xl font-semibold text-[#111827]"
                >
                  {project.characters.some((c) => c.id === editingChar.id)
                    ? `Edit ${editingChar.name || 'Character'}`
                    : 'Add Character Profile'}
                </h2>
                <p className="text-xs text-[#6B7280] mt-0.5">
                  Leave traits blank and use Context Deduction to infer canon pros, flaws, and possessions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingChar(null)}
                className="p-2 text-[#6B7280] hover:text-[#111827] hover:bg-neutral-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCharacter} className="p-6 overflow-y-auto space-y-5 flex-1">
              {deduceError && (
                <div className="p-3 text-sm text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] rounded-lg">
                  {deduceError}
                </div>
              )}

              {/* Name + Role + Deduce Action */}
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#111827] mb-1">
                    Character Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editingChar.name}
                    onChange={(e) =>
                      setEditingChar({ ...editingChar, name: e.target.value })
                    }
                    placeholder="e.g., Draco Malfoy, Lady Jessica, or Original Name"
                    className="w-full px-3.5 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#111827] mb-1">
                    Story Role
                  </label>
                  <select
                    value={editingChar.role}
                    onChange={(e) =>
                      setEditingChar({
                        ...editingChar,
                        role: e.target.value as CharacterRole,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  >
                    <option value="Protagonist">Protagonist</option>
                    <option value="Companion">Companion</option>
                    <option value="Antagonist">Antagonist</option>
                    <option value="NPC">NPC</option>
                  </select>
                </div>
              </div>

              {/* Context Deduction Box */}
              <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-semibold text-[#111827]">
                      Context &amp; Canon Trait Deduction
                    </h3>
                    <p className="text-xs text-[#6B7280] mt-0.5">
                      Optionally add brief guidance, or leave blank to infer directly from {project.universe}.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDeduceFromContext}
                    disabled={isDeducing}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {isDeducing ? 'Deducing...' : 'Deduce from Context'}
                  </button>
                </div>
                <input
                  type="text"
                  value={notesForDeduction}
                  onChange={(e) => setNotesForDeduction(e.target.value)}
                  placeholder="Optional guidance (e.g., 'Fifth-year Slytherin conflicted about family pressure')"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#111827] mb-1">
                  Character Summary
                </label>
                <textarea
                  rows={2}
                  value={editingChar.summary}
                  onChange={(e) =>
                    setEditingChar({ ...editingChar, summary: e.target.value })
                  }
                  className="w-full px-3.5 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#111827] mb-1">
                    Strengths &amp; Pros (one per line)
                  </label>
                  <textarea
                    rows={4}
                    value={prosText}
                    onChange={(e) => setProsText(e.target.value)}
                    placeholder="Leave blank to deduce..."
                    className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#111827] mb-1">
                    Flaws &amp; Vulnerabilities (one per line)
                  </label>
                  <textarea
                    rows={4}
                    value={flawsText}
                    onChange={(e) => setFlawsText(e.target.value)}
                    placeholder="Leave blank to deduce..."
                    className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#111827] mb-1">
                    Current Location
                  </label>
                  <input
                    type="text"
                    value={editingChar.location}
                    onChange={(e) =>
                      setEditingChar({ ...editingChar, location: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#111827] mb-1">
                    Current Condition / Status
                  </label>
                  <input
                    type="text"
                    value={editingChar.status}
                    onChange={(e) =>
                      setEditingChar({ ...editingChar, status: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#111827] mb-1">
                  Core Motivation
                </label>
                <input
                  type="text"
                  value={editingChar.motivation}
                  onChange={(e) =>
                    setEditingChar({ ...editingChar, motivation: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#111827] mb-1">
                    Voice &amp; Mannerisms
                  </label>
                  <textarea
                    rows={3}
                    value={editingChar.voiceAndMannerisms}
                    onChange={(e) =>
                      setEditingChar({
                        ...editingChar,
                        voiceAndMannerisms: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#111827] mb-1">
                    Inventory / Possessions (one per line)
                  </label>
                  <textarea
                    rows={3}
                    value={inventoryText}
                    onChange={(e) => setInventoryText(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-neutral-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingChar(null)}
                  className="px-4 py-2 text-sm font-medium text-[#4B5563] hover:text-[#111827]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors"
                >
                  Save Character
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
