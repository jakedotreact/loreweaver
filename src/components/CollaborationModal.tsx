import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  Link2,
  Loader2,
  LogIn,
  RefreshCw,
  Share2,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { formatReadableFirestoreError, useAuth } from '../contexts/AuthContext';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { CollaborationSession, StoryProject } from '../types/story';
import { buildCollabUrl, buildShareUrl } from '../utils/storyLinks';

interface CollaborationModalProps {
  story: StoryProject | null;
  onClose: () => void;
  onCollabIdChange: (storyId: string, collabId?: string) => void;
  onOpenCollabRoom: (collabId: string) => void;
  onOpenShareStory: (story: StoryProject) => void;
}

export const CollaborationModal: React.FC<CollaborationModalProps> = ({
  story,
  onClose,
  onCollabIdChange,
  onOpenCollabRoom,
  onOpenShareStory,
}) => {
  const {
    firebaseConfigured,
    user,
    isSigningIn,
    authError,
    syncError,
    signInWithGoogle,
    syncStoryToCloud,
    findExistingCollaboration,
    publishCollaboration,
    revokeCollaboration,
  } = useAuth();

  const [session, setSession] = useState<CollaborationSession | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [copiedCollab, setCopiedCollab] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!story) {
      setSession(null);
      setError(null);
      setNotice(null);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [story, onClose]);

  useEffect(() => {
    if (!story || !user || !firebaseConfigured) {
      setSession(null);
      return;
    }
    let cancelled = false;
    setIsLookingUp(true);
    setError(null);

    void (async () => {
      try {
        const found = await findExistingCollaboration(story.id);
        if (!cancelled) {
          setSession(found);
          if (found && found.id !== story.collabId) {
            onCollabIdChange(story.id, found.id);
          }
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
  }, [story?.id, user, firebaseConfigured, findExistingCollaboration]);

  useModalScrollLock(Boolean(story));

  if (!story) return null;

  const activeCollabId = session?.id || story.collabId;
  const collabUrl = activeCollabId
    ? buildCollabUrl(window.location.origin, activeCollabId)
    : '';
  const shareUrl = story.shareId
    ? buildShareUrl(window.location.origin, story.shareId)
    : '';

  const handlePublishCollab = async () => {
    setError(null);
    setNotice(null);
    setIsPublishing(true);
    try {
      const created = await publishCollaboration(story, session?.id || story.collabId);
      setSession(created);
      onCollabIdChange(story.id, created.id);
      await syncStoryToCloud({ ...story, collabId: created.id });

      const url = buildCollabUrl(window.location.origin, created.id);
      try {
        await navigator.clipboard.writeText(url);
        setCopiedCollab(true);
        setTimeout(() => setCopiedCollab(false), 2200);
        setNotice(
          session
            ? 'Synced latest manuscript to collaboration room and copied link.'
            : 'Created live collaboration room in Firestore and copied invite link.',
        );
      } catch {
        setNotice(
          session
            ? 'Synced latest edits to collaboration room.'
            : 'Collaboration link created and ready below.',
        );
      }
    } catch (err) {
      setError(formatReadableFirestoreError(err));
    } finally {
      setIsPublishing(false);
    }
  };

  const handleCopyCollab = async () => {
    if (!collabUrl) return;
    try {
      await navigator.clipboard.writeText(collabUrl);
      setCopiedCollab(true);
      setTimeout(() => setCopiedCollab(false), 2000);
    } catch {
      setError('Clipboard copy blocked; select and copy the collaboration URL.');
    }
  };

  const handleCopyShare = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2000);
    } catch {
      setError('Clipboard copy blocked; select and copy the share URL.');
    }
  };

  const handleRevoke = async () => {
    if (!activeCollabId) return;
    setError(null);
    setNotice(null);
    setIsRevoking(true);
    try {
      await revokeCollaboration(activeCollabId);
      setSession(null);
      onCollabIdChange(story.id, undefined);
      setNotice('Collaboration link revoked. Co-authors can no longer edit via this link.');
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
      aria-labelledby="collab-work-heading"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-neutral-200 flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <Users className="w-5 h-5 text-[#1D4ED8] shrink-0 mt-1" />
            <div className="min-w-0">
              <p className="text-xs text-[#6B7280]">
                Collaborate Live <span aria-hidden="true">·</span> {story.universe}{' '}
                <span aria-hidden="true">·</span>{' '}
                <span className="font-mono tabular-nums">
                  {story.turns.length} {story.turns.length === 1 ? 'scene' : 'scenes'}
                </span>
              </p>
              <h2
                id="collab-work-heading"
                className="font-editorial text-xl font-semibold text-[#111827] mt-0.5 truncate"
              >
                {story.title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close collaboration dialog"
            className="p-2 text-[#6B7280] hover:text-[#111827] hover:bg-neutral-100 rounded-lg transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto overscroll-contain flex-1 min-h-0">
          {(error || authError || syncError) && (
            <div
              role="alert"
              className="px-4 py-3 bg-[#FEF2F2] border border-[#FECACA] rounded-lg flex items-start gap-2.5 text-xs text-[#991B1B]"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#DC2626]" />
              <span className="break-words">{error || authError || syncError}</span>
            </div>
          )}

          {notice && (
            <div className="px-4 py-2.5 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg flex items-center gap-2 text-xs text-[#15803D]">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          {!firebaseConfigured ? (
            <div className="border border-neutral-200 rounded-xl p-5 bg-[#F8FAFC] space-y-3">
              <div className="flex items-start gap-3">
                <Cloud className="w-5 h-5 text-[#1D4ED8] shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-[#111827]">
                    Configure a rotated Firebase API key to enable live cloud links
                  </h3>
                  <p className="text-xs text-[#4B5563] mt-1 leading-relaxed">
                    The previous client key was scrubbed from configuration files for security. Add your referrer-restricted{' '}
                    <code className="font-mono text-[11px] bg-white px-1 py-0.5 border border-neutral-200 rounded">
                      VITE_FIREBASE_API_KEY
                    </code>{' '}
                    in <code className="font-mono text-[11px]">.env.local</code> to activate live Firestore collaboration and link sharing.
                  </p>
                </div>
              </div>
            </div>
          ) : !user ? (
            <div className="border border-neutral-200 rounded-xl p-5 bg-[#F8FAFC] space-y-4">
              <div className="flex items-start gap-3">
                <Users className="w-5 h-5 text-[#1D4ED8] shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-[#111827]">
                    Sign in to create a live collaboration link
                  </h3>
                  <p className="text-xs text-[#4B5563] mt-1 leading-relaxed">
                    Collaboration links invite signed-in co-authors to write scenes, edit characters, organize chapters, and audit continuity together in real time via Firestore and WebSockets.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenShareStory(story);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Share2 className="w-3.5 h-3.5 text-[#4B5563]" />
                  Open Read-Only Share
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
              Checking Firestore for an active collaboration room...
            </div>
          ) : session || activeCollabId ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="collab-link-url"
                  className="block text-xs font-medium text-[#111827]"
                >
                  Live Collaboration Link (Co-Authoring Room)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="collab-link-url"
                    type="text"
                    readOnly
                    value={collabUrl}
                    onFocus={(e) => e.target.select()}
                    className="flex-1 min-w-0 px-3 py-2 text-xs font-mono text-[#111827] bg-[#F8FAFC] border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  />
                  <button
                    type="button"
                    onClick={handleCopyCollab}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    {copiedCollab ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy Collab Link
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-[#6B7280]">
                  Signed-in co-authors with this link can edit scenes, cast, and chapters together live. Last edited by{' '}
                  <span className="font-medium text-[#111827]">
                    {session?.lastEditedByName || user.displayName || 'You'}
                  </span>
                  .
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-100">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (activeCollabId) {
                        onOpenCollabRoom(activeCollabId);
                        onClose();
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Users className="w-3.5 h-3.5 text-[#1D4ED8]" />
                    Enter Live Room
                  </button>
                  <button
                    type="button"
                    disabled={isPublishing || isRevoking}
                    onClick={handlePublishCollab}
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
                        Sync Manuscript
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
                      Revoke Collab
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-[#4B5563] leading-relaxed">
                Create an invite-only collaboration room for{' '}
                <strong className="font-semibold text-[#111827]">{story.title}</strong>.
                Co-authors who open the link and sign in can steer scenes, update the Cross-Index, and organize chapters with you in real time.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenShareStory(story);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Share2 className="w-3.5 h-3.5 text-[#4B5563]" />
                  Share Read-Only Instead
                </button>
                <button
                  type="button"
                  disabled={isPublishing}
                  onClick={handlePublishCollab}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  {isPublishing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Opening Collab Room...
                    </>
                  ) : (
                    <>
                      <Link2 className="w-3.5 h-3.5" />
                      Create &amp; Copy Collab Link
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Companion Read-Only Share Link Summary */}
          <div className="pt-4 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-[#111827]">
                Read-Only Share Link
              </p>
              <p className="text-[11px] text-[#6B7280] truncate">
                {shareUrl || 'Publish a read-only reader snapshot link separately.'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {shareUrl && (
                <button
                  type="button"
                  onClick={handleCopyShare}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#111827] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg whitespace-nowrap"
                >
                  {copiedShare ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#15803D]" />
                      Copied Share
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#4B5563]" />
                      Copy Share Link
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenShareStory(story);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#1D4ED8] hover:underline whitespace-nowrap"
              >
                <Share2 className="w-3.5 h-3.5" />
                {shareUrl ? 'Manage Share Link' : 'Publish Share Link'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
