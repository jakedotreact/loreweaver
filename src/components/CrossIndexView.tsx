import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Pencil,
  Pin,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  ContinuityAuditReport,
  CrossIndexCategory,
  CrossIndexEntry,
  CrossIndexStatus,
  StoryProject,
} from '../types/story';

interface CrossIndexViewProps {
  project: StoryProject;
  auditReport: ContinuityAuditReport | null;
  isAuditing: boolean;
  onRunAudit: () => void;
  onUpsertEntry: (entry: CrossIndexEntry) => void;
  onDeleteEntry: (entryId: string) => void;
  onTogglePin: (entryId: string) => void;
}

const CATEGORY_OPTIONS: Array<{ id: 'all' | CrossIndexCategory; label: string }> = [
  { id: 'all', label: 'All Lore' },
  { id: 'world_rule', label: 'World Rules' },
  { id: 'location', label: 'Locations' },
  { id: 'item', label: 'Items' },
  { id: 'plot_thread', label: 'Plot Threads' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'character_state', label: 'Character Facts' },
];

const CATEGORY_LABEL_MAP: Record<CrossIndexCategory, string> = {
  world_rule: 'World Rule',
  location: 'Location',
  item: 'Item',
  plot_thread: 'Plot Thread',
  timeline: 'Timeline',
  character_state: 'Character Fact',
};

const STATUS_LABEL_MAP: Record<CrossIndexStatus, string> = {
  active: 'Active',
  resolved: 'Resolved',
  conflict: 'Conflict',
};

export const CrossIndexView: React.FC<CrossIndexViewProps> = ({
  project,
  auditReport,
  isAuditing,
  onRunAudit,
  onUpsertEntry,
  onDeleteEntry,
  onTogglePin,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<'all' | CrossIndexCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingEntry, setEditingEntry] = useState<CrossIndexEntry | null>(null);
  const [tagsText, setTagsText] = useState('');

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...project.crossIndex]
      .filter((entry) => {
        const matchesCat = categoryFilter === 'all' || entry.category === categoryFilter;
        const matchesSearch =
          !q ||
          entry.title.toLowerCase().includes(q) ||
          entry.detail.toLowerCase().includes(q) ||
          entry.tags.some((t) => t.toLowerCase().includes(q));
        return matchesCat && matchesSearch;
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.lastVerifiedTurn - a.lastVerifiedTurn;
      });
  }, [project.crossIndex, categoryFilter, searchQuery]);

  const openEditor = (entry?: CrossIndexEntry) => {
    const latestTurn = project.turns[project.turns.length - 1]?.turnNumber ?? 1;
    const base: CrossIndexEntry = entry
      ? { ...entry }
      : {
          id: `ci-${Date.now()}`,
          category: 'world_rule',
          title: '',
          detail: '',
          tags: [],
          status: 'active',
          introducedAtTurn: latestTurn,
          lastVerifiedTurn: latestTurn,
          pinned: true,
        };
    setEditingEntry(base);
    setTagsText(base.tags.join(', '));
  };

  const handleSaveEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry || !editingEntry.title.trim() || !editingEntry.detail.trim()) return;
    onUpsertEntry({
      ...editingEntry,
      title: editingEntry.title.trim(),
      detail: editingEntry.detail.trim(),
      tags: tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });
    setEditingEntry(null);
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
            Universe Cross-Index
          </h1>
          <p className="text-sm text-[#4B5563] mt-1.5 max-w-2xl">
            Every narrative turn is checked against this canonical ledger to prevent plotholes, lost items, timeline errors, or rule contradictions.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onRunAudit}
            disabled={isAuditing}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
          >
            <ShieldCheck className="w-4 h-4 text-[#1D4ED8]" />
            {isAuditing ? 'Auditing...' : 'Audit Continuity'}
          </button>
          <button
            type="button"
            onClick={() => openEditor()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Add Lore Entry
          </button>
        </div>
      </div>

      {/* Audit Report Panel (when present) */}
      {auditReport && (
        <section
          aria-label="Continuity Audit Report"
          className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-neutral-100">
            <div>
              <h2 className="text-base font-semibold text-[#111827]">
                Continuity Audit Report
              </h2>
              <p className="text-xs text-[#6B7280] font-mono tabular-nums mt-0.5">
                Checked {new Date(auditReport.checkedAt).toLocaleTimeString()} ·{' '}
                {auditReport.findings.length} checks
              </p>
            </div>
          </div>

          <p className="text-sm text-[#374151] leading-relaxed">{auditReport.summary}</p>

          <div className="divide-y divide-neutral-100">
            {auditReport.findings.map((finding, idx) => (
              <div key={idx} className="py-3.5 first:pt-1 last:pb-0 flex items-start gap-3">
                {finding.severity === 'verified' ? (
                  <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle
                    className={`w-4 h-4 shrink-0 mt-0.5 ${
                      finding.severity === 'contradiction'
                        ? 'text-[#DC2626]'
                        : 'text-[#D97706]'
                    }`}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={`font-semibold ${
                        finding.severity === 'verified'
                          ? 'text-[#15803D]'
                          : finding.severity === 'contradiction'
                          ? 'text-[#B91C1C]'
                          : 'text-[#B45309]'
                      }`}
                    >
                      {finding.severity === 'verified'
                        ? 'Verified'
                        : finding.severity === 'contradiction'
                        ? 'Contradiction'
                        : 'Warning'}
                    </span>
                    <span aria-hidden="true" className="text-[#9CA3AF]">
                      ·
                    </span>
                    <span className="font-semibold text-[#111827]">{finding.title}</span>
                  </div>
                  <p className="text-sm text-[#4B5563] mt-1 leading-relaxed">
                    {finding.explanation}
                  </p>
                  {finding.suggestedFix && (
                    <p className="text-xs text-[#1D4ED8] mt-1.5">
                      Suggested resolution: {finding.suggestedFix}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 p-1 bg-neutral-100 rounded-lg overflow-x-auto">
          {CATEGORY_OPTIONS.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryFilter(cat.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                categoryFilter === cat.id
                  ? 'bg-white text-[#111827] shadow-sm'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="relative w-full lg:w-72">
          <Search className="w-4 h-4 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter lore, rules, locations..."
            className="w-full pl-9 pr-3.5 py-2 text-sm bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
          />
        </div>
      </div>

      {/* Ledger Table / List */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        {filteredEntries.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-[#111827]">No matching Cross-Index entries</p>
            <p className="text-sm text-[#6B7280] mt-1">
              Add a world rule, location, or plot promise to anchor story continuity.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-200">
            {filteredEntries.map((entry) => (
              <div
                key={entry.id}
                className="p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4 hover:bg-neutral-50/70 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#6B7280]">
                    <span className="font-medium text-[#111827]">
                      {CATEGORY_LABEL_MAP[entry.category]}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={`font-medium ${
                        entry.status === 'conflict'
                          ? 'text-[#DC2626]'
                          : entry.status === 'resolved'
                          ? 'text-[#16A34A]'
                          : 'text-[#1D4ED8]'
                      }`}
                    >
                      {STATUS_LABEL_MAP[entry.status]}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      Added Turn {String(entry.introducedAtTurn).padStart(2, '0')} · Verified Turn{' '}
                      {String(entry.lastVerifiedTurn).padStart(2, '0')}
                    </span>
                    {entry.pinned && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#111827] font-medium">Pinned invariant</span>
                      </>
                    )}
                  </div>

                  <h3 className="text-base font-semibold text-[#111827] mt-1">
                    {entry.title}
                  </h3>
                  <p className="text-sm text-[#4B5563] mt-1 leading-relaxed max-w-3xl">
                    {entry.detail}
                  </p>

                  {entry.tags.length > 0 && (
                    <p className="text-xs text-[#6B7280] mt-2">
                      Keywords: {entry.tags.join(' · ')}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onTogglePin(entry.id)}
                    aria-label={entry.pinned ? 'Unpin entry' : 'Pin entry'}
                    title={entry.pinned ? 'Unpin invariant' : 'Pin as invariant'}
                    className={`p-2 rounded-lg transition-colors ${
                      entry.pinned
                        ? 'text-[#1D4ED8] bg-[#1D4ED8]/10'
                        : 'text-[#6B7280] hover:text-[#111827] hover:bg-neutral-100'
                    }`}
                  >
                    <Pin className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditor(entry)}
                    aria-label={`Edit ${entry.title}`}
                    className="p-2 text-[#6B7280] hover:text-[#111827] hover:bg-neutral-100 rounded-lg transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteEntry(entry.id)}
                    aria-label={`Delete ${entry.title}`}
                    className="p-2 text-[#6B7280] hover:text-[#DC2626] hover:bg-neutral-100 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Lore Entry Modal */}
      {editingEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lore-modal-title"
        >
          <div className="w-full max-w-lg bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
              <h2
                id="lore-modal-title"
                className="font-editorial text-xl font-semibold text-[#111827]"
              >
                {project.crossIndex.some((e) => e.id === editingEntry.id)
                  ? 'Edit Cross-Index Entry'
                  : 'New Cross-Index Entry'}
              </h2>
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                className="p-1.5 text-[#6B7280] hover:text-[#111827] rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEntry} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#111827] mb-1">
                    Category
                  </label>
                  <select
                    value={editingEntry.category}
                    onChange={(e) =>
                      setEditingEntry({
                        ...editingEntry,
                        category: e.target.value as CrossIndexCategory,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  >
                    <option value="world_rule">World Rule</option>
                    <option value="location">Location</option>
                    <option value="item">Item</option>
                    <option value="plot_thread">Plot Thread</option>
                    <option value="timeline">Timeline</option>
                    <option value="character_state">Character Fact</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#111827] mb-1">
                    Status
                  </label>
                  <select
                    value={editingEntry.status}
                    onChange={(e) =>
                      setEditingEntry({
                        ...editingEntry,
                        status: e.target.value as CrossIndexStatus,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  >
                    <option value="active">Active</option>
                    <option value="resolved">Resolved</option>
                    <option value="conflict">Conflict</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#111827] mb-1">
                  Title
                </label>
                <input
                  type="text"
                  required
                  value={editingEntry.title}
                  onChange={(e) =>
                    setEditingEntry({ ...editingEntry, title: e.target.value })
                  }
                  placeholder="e.g., Fidelius Charm Secret-Keeper Law"
                  className="w-full px-3.5 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#111827] mb-1">
                  Canonical Detail / Constraint
                </label>
                <textarea
                  rows={4}
                  required
                  value={editingEntry.detail}
                  onChange={(e) =>
                    setEditingEntry({ ...editingEntry, detail: e.target.value })
                  }
                  placeholder="State the concrete world rule, physical fact, or continuity constraint..."
                  className="w-full px-3.5 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#111827] mb-1">
                  Keywords (comma-separated)
                </label>
                <input
                  type="text"
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="magic, hogwarts, restriction"
                  className="w-full px-3.5 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-[#111827] cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingEntry.pinned}
                  onChange={(e) =>
                    setEditingEntry({ ...editingEntry, pinned: e.target.checked })
                  }
                  className="rounded border-neutral-300 text-[#1D4ED8] focus:ring-[#1D4ED8]"
                />
                Pin as high-priority universe invariant
              </label>

              <div className="pt-4 border-t border-neutral-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingEntry(null)}
                  className="px-4 py-2 text-sm font-medium text-[#4B5563] hover:text-[#111827]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors"
                >
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
