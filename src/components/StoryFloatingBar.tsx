import React, { useState } from 'react';
import {
  Bell,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  FolderPlus,
  Library,
  Loader2,
  Save,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { StoryDisplayMode, StoryProject, UserCollection } from '../types/story';
import { downloadStoryArchiveJson, downloadStoryHtml } from '../utils/htmlExport';
import { downloadStoryPdf } from '../utils/pdfExport';

interface StoryFloatingBarProps {
  displayMode: StoryDisplayMode;
  onChangeDisplayMode: (mode: StoryDisplayMode) => void;
  storyIdForLibrary: string;
  project?: StoryProject;
  storyCount?: number;
  collections: UserCollection[];
  isSubscribed: boolean;
  onToggleSubscribe: () => void;
  onToggleCollectionStory: (collectionId: string, storyId: string) => void;
  onQuickCreateCollection?: (name: string, storyId: string) => void;
  onPersistNow?: () => void;
  isPersisting?: boolean;
  onShareStory?: () => void;
  onCollaborateStory?: () => void;
  onOpenStoriesLibrary?: () => void;
  onCreateCheckpoint?: () => void;
  onRunAuditAndOpen?: () => void;
  onOpenHtmlExport?: () => void;
  onToast?: (message: string) => void;
}

const DISPLAY_OPTIONS: Array<{ id: StoryDisplayMode; label: string }> = [
  { id: 'scene', label: 'Current Scene' },
  { id: 'chapters', label: 'Chapters' },
  { id: 'story', label: 'Full Story' },
];

export const StoryFloatingBar: React.FC<StoryFloatingBarProps> = ({
  displayMode,
  onChangeDisplayMode,
  storyIdForLibrary,
  project,
  storyCount,
  collections,
  isSubscribed,
  onToggleSubscribe,
  onToggleCollectionStory,
  onQuickCreateCollection,
  onPersistNow,
  isPersisting = false,
  onShareStory,
  onCollaborateStory,
  onOpenStoriesLibrary,
  onCreateCheckpoint,
  onRunAuditAndOpen,
  onOpenHtmlExport,
  onToast,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [openDrawer, setOpenDrawer] = useState<'collections' | 'exports' | null>(
    null,
  );
  const [newColName, setNewColName] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const memberCount = collections.filter((c) =>
    c.storyIds.includes(storyIdForLibrary),
  ).length;

  return (
    <div
      data-testid="story-floating-bar"
      aria-label="Storywide Menu Overlay"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-1.5rem)] max-w-5xl pointer-events-none"
    >
      <div className="pointer-events-auto bg-white/95 backdrop-blur-md border border-neutral-300 shadow-lg rounded-2xl px-3 py-2.5 sm:px-4">
        {/* Popover Drawer for Collections or Exports */}
        {!collapsed && openDrawer === 'collections' && (
          <div className="mb-2.5 pb-2.5 border-b border-neutral-200 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#111827]">
                Add to Collection
              </span>
              <button
                type="button"
                onClick={() => setOpenDrawer(null)}
                className="text-[#6B7280] hover:text-[#111827] cursor-pointer"
              >
                Close
              </button>
            </div>
            {collections.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {collections.map((col) => {
                  const included = col.storyIds.includes(storyIdForLibrary);
                  return (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() =>
                        onToggleCollectionStory(col.id, storyIdForLibrary)
                      }
                      className={`px-2.5 py-1 text-xs rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        included
                          ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8] font-medium'
                          : 'bg-white border-neutral-300 text-[#374151] hover:bg-neutral-50'
                      }`}
                    >
                      {included ? '✓ ' : '+ '}
                      {col.name}
                    </button>
                  );
                })}
              </div>
            )}
            {onQuickCreateCollection && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const trimmed = newColName.trim();
                  if (!trimmed) return;
                  onQuickCreateCollection(trimmed, storyIdForLibrary);
                  setNewColName('');
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  placeholder="New collection name..."
                  maxLength={100}
                  className="flex-1 min-w-0 px-2.5 py-1 text-xs border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                />
                <button
                  type="submit"
                  disabled={!newColName.trim()}
                  className="px-3 py-1 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-40 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Create &amp; Add
                </button>
              </form>
            )}
          </div>
        )}

        {!collapsed && openDrawer === 'exports' && project && (
          <div className="mb-2.5 pb-2.5 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#111827]">
              Download &amp; Utilities
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {onCreateCheckpoint && (
                <button
                  type="button"
                  onClick={() => {
                    onCreateCheckpoint();
                    setOpenDrawer(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Bookmark className="w-3.5 h-3.5 text-[#1D4ED8]" />
                  Save Point
                </button>
              )}
              {onRunAuditAndOpen && (
                <button
                  type="button"
                  onClick={() => {
                    onRunAuditAndOpen();
                    setOpenDrawer(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-[#1D4ED8]" />
                  Audit Continuity
                </button>
              )}
              <button
                type="button"
                disabled={isExportingPdf}
                onClick={async () => {
                  setIsExportingPdf(true);
                  try {
                    const fn = await downloadStoryPdf(project);
                    onToast?.(`Saved ${fn}`);
                  } finally {
                    setIsExportingPdf(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-60 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isExportingPdf ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileText className="w-3.5 h-3.5" />
                )}
                PDF
              </button>
              <button
                type="button"
                onClick={() => {
                  const fn = downloadStoryHtml(project);
                  onToast?.(`Saved ${fn}`);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#1D4ED8]" />
                HTML
              </button>
              <button
                type="button"
                onClick={() => {
                  const fn = downloadStoryArchiveJson(project);
                  onToast?.(`Saved ${fn}`);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#4B5563]" />
                JSON
              </button>
              {onOpenHtmlExport && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenHtmlExport();
                    setOpenDrawer(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#4B5563]" />
                  Export Options
                </button>
              )}
            </div>
          </div>
        )}

        {/* Primary Floating Row */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* View Mode Segmented Toggle: Current Scene / Chapters / Full Story */}
          <div
            role="group"
            aria-label="Story display mode"
            className="inline-flex items-center bg-neutral-100 border border-neutral-200 rounded-lg p-0.5 shrink-0"
          >
            {DISPLAY_OPTIONS.map((opt) => {
              const active = displayMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeDisplayMode(opt.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-white text-[#1D4ED8] shadow-xs'
                      : 'text-[#4B5563] hover:text-[#111827]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {!collapsed && (
            <div className="flex flex-wrap items-center gap-1.5">
              {onPersistNow && (
                <button
                  type="button"
                  disabled={isPersisting}
                  onClick={onPersistNow}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isPersisting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1D4ED8]" />
                  ) : (
                    <Save className="w-3.5 h-3.5 text-[#1D4ED8]" />
                  )}
                  Save
                </button>
              )}

              {onShareStory && (
                <button
                  type="button"
                  onClick={onShareStory}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5 text-[#1D4ED8]" />
                  Share
                </button>
              )}

              {onCollaborateStory && (
                <button
                  type="button"
                  onClick={onCollaborateStory}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5 text-[#1D4ED8]" />
                  Collaborate
                </button>
              )}

              <button
                type="button"
                onClick={onToggleSubscribe}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
                  isSubscribed
                    ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8]'
                    : 'bg-white border-neutral-300 text-[#111827] hover:bg-neutral-50'
                }`}
              >
                <Bell className="w-3.5 h-3.5" />
                {isSubscribed ? 'Subscribed' : 'Subscribe'}
              </button>

              <button
                type="button"
                onClick={() =>
                  setOpenDrawer((d) => (d === 'collections' ? null : 'collections'))
                }
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
                  memberCount > 0 || openDrawer === 'collections'
                    ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8]'
                    : 'bg-white border-neutral-300 text-[#111827] hover:bg-neutral-50'
                }`}
              >
                <FolderPlus className="w-3.5 h-3.5" />
                Collect{memberCount > 0 ? ` (${memberCount})` : ''}
              </button>

              {onOpenStoriesLibrary && (
                <button
                  type="button"
                  onClick={onOpenStoriesLibrary}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Library className="w-3.5 h-3.5 text-[#1D4ED8]" />
                  Stories{typeof storyCount === 'number' ? ` (${storyCount})` : ''}
                </button>
              )}

              {project && (
                <button
                  type="button"
                  onClick={() =>
                    setOpenDrawer((d) => (d === 'exports' ? null : 'exports'))
                  }
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
                    openDrawer === 'exports'
                      ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8]'
                      : 'bg-white border-neutral-300 text-[#111827] hover:bg-neutral-50'
                  }`}
                >
                  <Download className="w-3.5 h-3.5" />
                  Export
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setCollapsed((c) => !c);
              setOpenDrawer(null);
            }}
            aria-label={collapsed ? 'Expand story menu bar' : 'Collapse story menu bar'}
            title={collapsed ? 'Expand story menu bar' : 'Collapse story menu bar'}
            className="p-1.5 text-[#6B7280] hover:text-[#111827] rounded-lg hover:bg-neutral-100 shrink-0 cursor-pointer"
          >
            {collapsed ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
