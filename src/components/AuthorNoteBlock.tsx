import React from 'react';
import { Feather, Pencil } from 'lucide-react';

interface AuthorNoteBlockProps {
  variant: 'prefix' | 'suffix';
  scope: 'story' | 'chapter' | 'scene';
  note?: string;
  compact?: boolean;
  onEdit?: () => void;
  children?: React.ReactNode;
}

const SCOPE_LABELS: Record<'story' | 'chapter' | 'scene', string> = {
  story: 'Story',
  chapter: 'Chapter',
  scene: 'Scene',
};

export const AuthorNoteBlock: React.FC<AuthorNoteBlockProps> = ({
  variant,
  scope,
  note,
  compact = false,
  onEdit,
  children,
}) => {
  const trimmed = note?.trim();
  if (!trimmed) return null;

  const heading =
    variant === 'prefix'
      ? `${SCOPE_LABELS[scope]} Beginning Author's Note`
      : `${SCOPE_LABELS[scope]} Ending Author's Note`;

  return (
    <aside
      aria-label={heading}
      data-author-note={`${scope}-${variant}`}
      className={`border border-neutral-200 rounded-xl bg-[#F8FAFC] ${
        compact ? 'px-4 py-3' : 'px-5 py-4'
      }`}
    >
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#4B5563]">
          <Feather className="w-3.5 h-3.5 text-[#1D4ED8] shrink-0" />
          <span>{heading}</span>
        </div>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1D4ED8] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Pencil className="w-3 h-3" />
            Edit Note
          </button>
        )}
      </div>
      <div className="text-sm text-[#374151] leading-relaxed whitespace-pre-wrap">
        {children ?? trimmed}
      </div>
    </aside>
  );
};
