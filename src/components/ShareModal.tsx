import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  Eye,
  Link2,
  Loader2,
  LogIn,
  RefreshCw,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import { formatReadableFirestoreError, useAuth } from '../contexts/AuthContext';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import {
  SharedWork,
  ShareScope,
  StoryChapter,
  StoryProject,
  StoryTurn,
} from '../types/story';
import { buildShareUrl } from '../utils/storyLinks';

export type ShareTarget =
  | { scope: 'story'; story: StoryProject }
  | {
      scope: 'chapter';
      story: StoryProject;
      chapter: StoryChapter;
      turns: StoryTurn[];
    }
  | { scope: 'scene'; story: StoryProject; turn: StoryTurn };

interface ShareModalProps {
  target: ShareTarget | null;
  onClose: () => void;
  onOpenSharedPreview: (shareId: string) => void;
  onShareIdChange?: (storyId: string, shareId?: string) => void;
  onOpenCollaborateStory?: (story: StoryProject) => void;
}

function getScopeLabel(scope: ShareScope): string {
  if (scope === 'chapter') return 'Chapter';
  if (scope === 'scene') return 'Scene';
  return 'Full Story';
}

function getTargetSummary(target: ShareTarget): {
  scope: ShareScope;
  targetId: string;
  heading: string;
  subtitle: string;
  plainText: string;
} {
  if (target.scope === 'chapter') {
    const num = String(target.chapter.chapterNumber).padStart(2, '0');
    const body = target.turns
      .map((t) => `Scene ${String(t.turnNumber).padStart(2, '0')} — ${t.sceneTitle}\n\n${t.prose.join('\n\n')}`)
      .join('\n\n* * *\n\n');
    return {
      scope: 'chapter',
      targetId: target.chapter.id,
      heading: `Chapter ${num} — ${target.chapter.title}`,
      subtitle: `${target.story.title} · ${target.turns.length} ${
        target.turns.length === 1 ? 'scene' : 'scenes'
      }`,
      plainText: `${target.story.title}\nChapter ${num}: ${target.chapter.title}\n${
        target.chapter.summary ? `\n${target.chapter.summary}\n` : ''
      }\n${body}`,
    };
  }
  if (target.scope === 'scene') {
    const num = String(target.turn.turnNumber).padStart(2, '0');
    return {
      scope: 'scene',
      targetId: target.turn.id,
      heading: `Scene ${num} — ${target.turn.sceneTitle}`,
      subtitle: `${target.story.title} · ${target.turn.location} · ${target.turn.inStoryTime}`,
      plainText: `${target.story.title}\nScene ${num}: ${target.turn.sceneTitle}\n${target.turn.location} · ${target.turn.inStoryTime}\n\n${target.turn.prose.join('\n\n')}`,
    };
  }
  const body = target.story.turns
    .map((t) => `Scene ${String(t.turnNumber).padStart(2, '0')} — ${t.sceneTitle}\n\n${t.prose.join('\n\n')}`)
    .join('\n\n* * *\n\n');
  return {
    scope: 'story',
    targetId: '',
    heading: target.story.title,
    subtitle: `${target.story.universe} · ${target.story.turns.length} ${
      target.story.turns.length === 1 ? 'scene' : 'scenes'
    }`,
    plainText: `${target.story.title}\n${target.story.universe} · ${target.story.setting}\n\n${body}`,
  };
}

export const ShareModal: React.FC<ShareModalProps> = ({
  target,
  onClose,
  onOpenSharedPreview,
  onShareIdChange,
  onOpenCollaborateStory,
}) => {
  const {
    firebaseConfigured,
    user,
    isSigningIn,
    authError,
    syncError,
    signInWithGoogle,
    syncStoryToCloud,
    findExistingShare,
    publishSharedWork,
    revokeSharedWork,
  } = useAuth();

  const [existingShare, setExistingShare] = useState<SharedWork | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const info = target ? getTargetSummary(target) : null;

  useEffect(() => {
    if (!target) {
      setExistingShare(null);
      setError(null);
      setNotice(null);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [target, onClose]);

  useModalScrollLock(Boolean(target));

  useEffect(() => {
    if (!target || !info || !user) {
      setExistingShare(null);
      return;
    }
    let cancelled = false;
    setIsLookingUp(true);
    setError(null);

    void (async () => {
      try {
        const found = await findExistingShare(
          target.story.id,
          info.scope,
          info.targetId,
        );
        if (!cancelled) {
          setExistingShare(found);
        }
      } catch (err) {
        if (!cancelled) {
          setError(formatReadableFirestoreError(err));
        }
      } finally {
        if (!cancelled) {
          setIsLookingUp(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [target?.story.id, info?.scope, info?.targetId, user, findExistingShare]);

  if (!target || !info) return null;

  const shareUrl = existingShare
    ? buildShareUrl(window.location.origin, existingShare.id)
    : '';

  const handlePublish = async () => {
    setError(null);
    setNotice(null);
    setIsPublishing(true);
    try {
      const published = await publishSharedWork({
        existingShareId: existingShare?.id,
        scope: info.scope,
        story: target.story,
        chapter: target.scope === 'chapter' ? target.chapter : undefined,
        turn: target.scope === 'scene' ? target.turn : undefined,
      });
      if (info.scope === 'story') {
        onShareIdChange?.(target.story.id, published.id);
        await syncStoryToCloud({ ...target.story, shareId: published.id });
      } else {
        await syncStoryToCloud(target.story);
      }
      setExistingShare(published);
      const url = buildShareUrl(window.location.origin, published.id);
      try {
        await navigator.clipboard.writeText(url);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2200);
        setNotice(
          existingShare
            ? 'Updated shared snapshot in Firestore and copied link.'
            : 'Saved to Firestore and copied share link.',
        );
      } catch {
        setNotice(
          existingShare
            ? 'Updated shared snapshot in Firestore.'
            : 'Saved to Firestore. Share link is ready below.',
        );
      }
    } catch (err) {
      setError(formatReadableFirestoreError(err));
    } finally {
      setIsPublishing(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setError('Clipboard copy was blocked; select and copy the link manually.');
    }
  };

  const handleCopyPlainText = async () => {
    try {
      await navigator.clipboard.writeText(info.plainText);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    } catch {
      setError('Unable to copy text to clipboard.');
    }
  };

  const handleRevoke = async () => {
    if (!existingShare) return;
    setError(null);
    setNotice(null);
    setIsRevoking(true);
    try {
      await revokeSharedWork(existingShare.id);
      if (info.scope === 'story') {
        onShareIdChange?.(target.story.id, undefined);
      }
      setExistingShare(null);
      setNotice('Share link revoked and removed from Firestore.');
    } catch (err) {
      setError(formatReadableFirestoreError(err));
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 sm:p-6 overflow-hidden overscroll-contain"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-work-heading"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <Share2 className="w-5 h-5 text-[#1D4ED8] shrink-0 mt-1" />
            <div className="min-w-0">
              <p className="text-xs text-[#6B7280]">
                Share {getScopeLabel(info.scope)} <span aria-hidden="true">·</span>{' '}
                {info.subtitle}
              </p>
              <h2
                id="share-work-heading"
                className="font-editorial text-xl font-semibold text-[#111827] mt-0.5 truncate"
              >
                {info.heading}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close share dialog"
            className="p-2 text-[#6B7280] hover:text-[#111827] hover:bg-neutral-100 rounded-lg transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto overscroll-contain flex-1 min-h-0">
          {(error || authError || syncError) && (
            <div
              role="alert"
              className="px-4 py-3 bg-[#FEF2F2] border border-[#FECACA] rounded-lg flex items-start gap-2.5 text-xs text-[#991B1B]"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#DC2626]" />
              <span className="break-words">
                {error || authError || syncError}
              </span>
            </div>
          )}

          {notice && (
            <div className="px-4 py-2.5 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg flex items-center gap-2 text-xs text-[#15803D]">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          {!firebaseConfigured ? (
            <div className="border border-neutral-200 rounded-xl p-5 bg-[#F8FAFC] space-y-4">
              <div className="flex items-start gap-3">
                <Cloud className="w-5 h-5 text-[#1D4ED8] shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-[#111827]">
                    Firebase API key cleared pending key rotation
                  </h3>
                  <p className="text-xs text-[#4B5563] mt-1 leading-relaxed">
                    Add your restricted <code className="font-mono text-[11px]">VITE_FIREBASE_API_KEY</code> in{' '}
                    <code className="font-mono text-[11px]">.env.local</code> to publish live links, or copy the formatted text below right now.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopyPlainText}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  {copiedText ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#15803D]" />
                      Copied Text
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#4B5563]" />
                      Copy Text Instead
                    </>
                  )}
                </button>
                {onOpenCollaborateStory && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenCollaborateStory(target.story);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#1D4ED8] hover:underline whitespace-nowrap"
                  >
                    Open Collaboration Settings
                  </button>
                )}
              </div>
            </div>
          ) : !user ? (
            <div className="border border-neutral-200 rounded-xl p-5 bg-[#F8FAFC] space-y-4">
              <div className="flex items-start gap-3">
                <Cloud className="w-5 h-5 text-[#1D4ED8] shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-[#111827]">
                    Sign in to publish a live Firestore share link
                  </h3>
                  <p className="text-xs text-[#4B5563] mt-1 leading-relaxed">
                    Google OAuth persists your {getScopeLabel(info.scope).toLowerCase()} in Firestore and creates an unguessable share link you can update or revoke anytime.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopyPlainText}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  {copiedText ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#15803D]" />
                      Copied Text
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#4B5563]" />
                      Copy Text Instead
                    </>
                  )}
                </button>
                <button
                  type="button"
                  disabled={isSigningIn}
                  onClick={() => void signInWithGoogle()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  {isSigningIn ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <LogIn className="w-3.5 h-3.5" />
                      Continue with Google
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : isLookingUp ? (
            <div className="py-6 flex items-center justify-center gap-2 text-xs text-[#6B7280]">
              <Loader2 className="w-4 h-4 animate-spin text-[#1D4ED8]" />
              Checking Firestore for an existing share link...
            </div>
          ) : existingShare ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="share-link-url"
                  className="block text-xs font-medium text-[#111827]"
                >
                  Live Share Link ({getScopeLabel(info.scope)})
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="share-link-url"
                    type="text"
                    readOnly
                    value={shareUrl}
                    onFocus={(e) => e.target.select()}
                    className="flex-1 min-w-0 px-3 py-2 text-xs font-mono text-[#111827] bg-[#F8FAFC] border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy Link
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-[#6B7280]">
                  Anyone with this exact link can read this {getScopeLabel(info.scope).toLowerCase()} snapshot without seeing your account email or private stories.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-100">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onOpenSharedPreview(existingShare.id);
                      onClose();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#1D4ED8]" />
                    Preview Shared View
                  </button>
                  <button
                    type="button"
                    disabled={isPublishing || isRevoking}
                    onClick={handlePublish}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1D4ED8] bg-[#EFF6FF] border border-[#BFDBFE] hover:bg-[#DBEAFE] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
                  >
                    {isPublishing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" />
                        Sync Latest Edits
                      </>
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  disabled={isRevoking || isPublishing}
                  onClick={handleRevoke}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#B91C1C] hover:bg-[#FEF2F2] border border-[#FECACA] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  {isRevoking ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Revoking...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      Revoke Link
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-[#4B5563] leading-relaxed">
                Publishing saves your story to Firestore and creates a read-only link for this{' '}
                <strong className="font-semibold text-[#111827]">
                  {getScopeLabel(info.scope).toLowerCase()}
                </strong>
                . Recipients can read it or import a copy into their own workspace.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={handleCopyPlainText}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  {copiedText ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#15803D]" />
                      Copied Text
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#4B5563]" />
                      Copy Text
                    </>
                  )}
                </button>
                <button
                  type="button"
                  disabled={isPublishing}
                  onClick={handlePublish}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  {isPublishing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Publishing to Firestore...
                    </>
                  ) : (
                    <>
                      <Link2 className="w-3.5 h-3.5" />
                      Publish &amp; Copy Share Link
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
