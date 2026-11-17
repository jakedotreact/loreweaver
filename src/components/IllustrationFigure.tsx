import React, { useEffect, useState } from 'react';
import { ImageOff, Pencil, Trash2 } from 'lucide-react';
import { StoryIllustration } from '../types/story';

interface IllustrationFigureProps {
  illustration: StoryIllustration;
  fallbackAlt: string;
  onEdit?: () => void;
  onRemove?: () => void;
  compact?: boolean;
}

export const IllustrationFigure: React.FC<IllustrationFigureProps> = ({
  illustration,
  fallbackAlt,
  onEdit,
  onRemove,
  compact = false,
}) => {
  const [hasLoadError, setHasLoadError] = useState(false);

  useEffect(() => {
    setHasLoadError(false);
  }, [illustration.dataUrl]);

  const showPlaceholder = hasLoadError || !illustration.dataUrl;

  return (
    <figure className="border border-neutral-200 rounded-xl overflow-hidden bg-neutral-50">
      {showPlaceholder ? (
        <div
          className={`flex flex-col items-center justify-center text-center px-4 bg-neutral-100 text-[#6B7280] ${
            compact ? 'py-8' : 'py-12'
          }`}
        >
          <ImageOff className="w-6 h-6 mb-2 text-[#9CA3AF]" />
          <p className="text-xs font-medium text-[#374151]">
            {!illustration.dataUrl
              ? 'Illustration plate stored locally on another browser'
              : 'Illustration could not be displayed'}
          </p>
          <p className="text-xs text-[#6B7280] mt-0.5 max-w-md">
            {illustration.caption || fallbackAlt}
          </p>
        </div>
      ) : (
        <div className="bg-neutral-100 flex items-center justify-center">
          <img
            src={illustration.dataUrl}
            alt={illustration.caption || fallbackAlt}
            referrerPolicy="no-referrer"
            onError={() => setHasLoadError(true)}
            className={`w-full object-cover ${
              compact ? 'max-h-[300px]' : 'max-h-[460px]'
            }`}
          />
        </div>
      )}

      {(illustration.caption || onEdit || onRemove) && (
        <figcaption className="px-4 py-2.5 bg-white border-t border-neutral-200 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            {illustration.caption ? (
              <p className="text-xs text-[#374151] italic leading-relaxed">
                {illustration.caption}
              </p>
            ) : (
              <p className="text-xs text-[#6B7280]">Uploaded illustration</p>
            )}
            {illustration.artStyle && (
              <p className="text-[11px] text-[#6B7280] mt-0.5">
                Style: {illustration.artStyle}
              </p>
            )}
          </div>

          {(onEdit || onRemove) && (
            <div className="flex items-center gap-1.5 shrink-0">
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#4B5563] hover:text-[#1D4ED8] border border-neutral-200 hover:border-[#BFDBFE] hover:bg-[#F8FAFC] rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  <Pencil className="w-3 h-3" />
                  Replace
                </button>
              )}
              {onRemove && (
                <button
                  type="button"
                  onClick={onRemove}
                  aria-label="Remove illustration"
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-[#6B7280] hover:text-[#DC2626] border border-neutral-200 hover:border-[#FECACA] hover:bg-[#FEF2F2] rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                  Remove
                </button>
              )}
            </div>
          )}
        </figcaption>
      )}
    </figure>
  );
};
