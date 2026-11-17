import React from 'react';
import { LogIn, User as UserIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export type WorkspaceTab = 'story' | 'chapters' | 'characters' | 'cross-index' | 'save-points';

interface TopNavProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  onOpenNewStory: () => void;
  onOpenAccountSettings: () => void;
}

const NAV_ITEMS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'story', label: 'Story' },
  { id: 'chapters', label: 'Chapters' },
  { id: 'characters', label: 'Characters' },
  { id: 'cross-index', label: 'Cross-Index' },
  { id: 'save-points', label: 'Save Points' },
];

export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  onSelectTab,
  onOpenNewStory,
  onOpenAccountSettings,
}) => {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-neutral-200">
      <div className="max-w-[1320px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-6">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => onSelectTab('story')}
          className="font-editorial text-xl font-semibold tracking-tight text-[#111827] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] rounded-sm"
        >
          Folio &amp; Canon
        </button>

        {/* Zone 2: Navigation links */}
        <nav
          aria-label="Primary Workspace"
          className="flex items-center gap-5 sm:gap-7 overflow-x-auto no-scrollbar"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative py-5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] ${
                  isActive
                    ? 'text-[#111827]'
                    : 'text-[#6B7280] hover:text-[#111827]'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-[#1D4ED8]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Account Settings & New Story */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onOpenAccountSettings}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-[#111827] bg-white hover:bg-neutral-50 border border-neutral-300 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
          >
            {user ? (
              <>
                <UserIcon className="w-4 h-4 text-[#1D4ED8]" />
                <span className="max-w-[120px] truncate hidden sm:inline">
                  {user.displayName?.split(' ')[0] || 'Account'}
                </span>
                <span className="sm:hidden">Account</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4 text-[#1D4ED8]" />
                <span>Sign In</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onOpenNewStory}
            className="px-4 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] focus-visible:ring-offset-2"
          >
            New Story
          </button>
        </div>
      </div>
    </header>
  );
};
