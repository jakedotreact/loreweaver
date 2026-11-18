import React, { useMemo, useState } from 'react';
import { CornerDownRight, MessageSquare, Send, Trash2 } from 'lucide-react';
import {
  CommentTargetType,
  StoryChapter,
  StoryComment,
  StoryTurn,
} from '../types/story';
import {
  buildCommentTree,
  CommentThreadNode,
  formatTargetBadgeLabel,
  getScopedComments,
} from '../utils/commentsTree';

export interface CommentAddPayload {
  body: string;
  authorName?: string;
  targetType: CommentTargetType;
  targetId: string;
  targetLabel?: string;
  chapterOrSceneLabel?: string;
  parentCommentId?: string;
}

interface CommentsSectionProps {
  storyId: string;
  comments: StoryComment[];
  chapters: StoryChapter[];
  turns: StoryTurn[];
  scope: CommentTargetType;
  targetId: string;
  targetLabel?: string;
  currentReaderUid: string;
  currentReaderName: string;
  isOwner: boolean;
  onAddComment: (storyId: string, payload: CommentAddPayload) => Promise<void> | void;
  onDeleteComment: (storyId: string, commentId: string) => Promise<void> | void;
  compact?: boolean;
}

export const CommentsSection: React.FC<CommentsSectionProps> = ({
  storyId,
  comments,
  chapters,
  turns,
  scope,
  targetId,
  targetLabel,
  currentReaderUid,
  currentReaderName,
  isOwner,
  onAddComment,
  onDeleteComment,
  compact = false,
}) => {
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [commentBody, setCommentBody] = useState('');
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const scopedComments = useMemo(
    () =>
      getScopedComments({
        comments,
        scope,
        targetId,
        chapters,
        turns,
      }),
    [comments, scope, targetId, chapters, turns],
  );

  const commentTree = useMemo(
    () => buildCommentTree(scopedComments),
    [scopedComments],
  );

  // Determine default anchor target & label based on current view scope
  const resolveAnchorForPost = (): {
    targetType: CommentTargetType;
    targetId: string;
    targetLabel?: string;
  } => {
    if (selectedTarget.startsWith('scene:')) {
      const id = selectedTarget.slice(6);
      const t = turns.find((item) => item.id === id);
      if (t) {
        return {
          targetType: 'scene',
          targetId: t.id,
          targetLabel: `Scene ${String(t.turnNumber).padStart(2, '0')} — ${t.sceneTitle}`,
        };
      }
    }
    if (selectedTarget.startsWith('chapter:')) {
      const id = selectedTarget.slice(8);
      const ch = chapters.find((item) => item.id === id);
      if (ch) {
        return {
          targetType: 'chapter',
          targetId: ch.id,
          targetLabel: `Chapter ${String(ch.chapterNumber).padStart(2, '0')} — ${ch.title}`,
        };
      }
    }
    return {
      targetType: scope,
      targetId: targetId || storyId,
      targetLabel: targetLabel,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = commentBody.trim();
    if (!cleaned || submitting) return;
    setCommentError(null);
    setSubmitting(true);
    try {
      const anchor = resolveAnchorForPost();
      await onAddComment(storyId, {
        body: cleaned,
        authorName: currentReaderName || 'Reader',
        targetType: anchor.targetType,
        targetId: anchor.targetId,
        targetLabel: anchor.targetLabel,
        chapterOrSceneLabel: anchor.targetLabel,
      });
      setCommentBody('');
      setSelectedTarget('');
    } catch (err) {
      setCommentError(
        err instanceof Error ? err.message : 'Unable to post comment.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReply = async (e: React.FormEvent, parent: StoryComment) => {
    e.preventDefault();
    const cleaned = replyBody.trim();
    if (!cleaned || submitting) return;
    setCommentError(null);
    setSubmitting(true);
    try {
      await onAddComment(storyId, {
        body: cleaned,
        authorName: currentReaderName || 'Reader',
        targetType: parent.targetType || scope,
        targetId: parent.targetId || targetId || storyId,
        targetLabel: parent.targetLabel || parent.chapterOrSceneLabel || targetLabel,
        chapterOrSceneLabel:
          parent.chapterOrSceneLabel || parent.targetLabel || targetLabel,
        parentCommentId: parent.id,
      });
      setReplyBody('');
      setReplyingToId(null);
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Unable to post reply.');
    } finally {
      setSubmitting(false);
    }
  };

  const scopeHint =
    scope === 'story'
      ? 'Full Story · includes story, chapter & scene comments'
      : scope === 'chapter'
        ? 'Chapter · includes chapter & nested scene comments'
        : 'Current Scene · scoped to this scene';

  const renderNode = (node: CommentThreadNode, depth: number) => {
    const { comment, replies } = node;
    const canDelete = isOwner || comment.authorUid === currentReaderUid;
    const badgeLabel = formatTargetBadgeLabel(comment, chapters, turns);

    return (
      <div
        key={comment.id}
        className={
          depth === 0
            ? 'py-4 space-y-2.5'
            : 'pl-4 border-l-2 border-neutral-200 space-y-2 pt-2'
        }
      >
        <div className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {depth > 0 && (
                <CornerDownRight className="w-3.5 h-3.5 text-[#6B7280] shrink-0" />
              )}
              <span className="font-semibold text-[#111827]">
                {comment.authorName}
              </span>
              {badgeLabel && (
                <>
                  <span className="text-[#9CA3AF]">·</span>
                  <span className="text-[#4B5563]">on {badgeLabel}</span>
                </>
              )}
            </div>
            <span className="font-mono text-[11px] text-[#6B7280]">
              {new Date(comment.createdAtMs).toLocaleString()}
            </span>
          </div>

          <p className="text-sm text-[#1F2937] leading-relaxed whitespace-pre-wrap">
            {comment.body}
          </p>

          <div className="flex items-center gap-4 pt-0.5 text-xs">
            <button
              type="button"
              onClick={() => {
                setReplyingToId((prev) =>
                  prev === comment.id ? null : comment.id,
                );
                setReplyBody('');
              }}
              className="font-medium text-[#1D4ED8] hover:underline cursor-pointer"
            >
              {replyingToId === comment.id ? 'Cancel Reply' : 'Reply'}
            </button>

            {canDelete && (
              <button
                type="button"
                onClick={() => void onDeleteComment(storyId, comment.id)}
                className="inline-flex items-center gap-1 text-[#6B7280] hover:text-[#DC2626] cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                Delete
              </button>
            )}
          </div>
        </div>

        {replyingToId === comment.id && (
          <form
            onSubmit={(e) => void handleSubmitReply(e, comment)}
            className="pl-4 border-l-2 border-[#BFDBFE] space-y-2 pt-1"
          >
            <textarea
              rows={2}
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder={`Reply to ${comment.authorName}...`}
              className="w-full px-3 py-2 text-xs text-[#111827] bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
            />
            <button
              type="submit"
              disabled={!replyBody.trim() || submitting}
              className="px-3 py-1.5 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg disabled:opacity-40 cursor-pointer"
            >
              Post Reply
            </button>
          </form>
        )}

        {replies.length > 0 && (
          <div className="space-y-2">
            {replies.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <section
      aria-labelledby="story-comments-heading"
      className={`bg-white border border-neutral-200 rounded-xl ${
        compact ? 'p-5 space-y-5' : 'p-6 sm:p-8 space-y-6'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 pb-3">
        <div>
          <h2
            id="story-comments-heading"
            className="font-editorial text-xl font-semibold text-[#111827] flex items-center gap-2"
          >
            <MessageSquare className="w-5 h-5 text-[#1D4ED8]" />
            Comments ({scopedComments.length})
          </h2>
          <p className="text-xs text-[#6B7280] mt-0.5">{scopeHint}</p>
        </div>
        <p className="text-xs text-[#4B5563]">
          Posting as <span className="font-semibold text-[#111827]">{currentReaderName}</span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {scope !== 'scene' && (chapters.length > 0 || turns.length > 0) && (
          <div>
            <label
              htmlFor={`comment-anchor-${scope}`}
              className="block text-xs font-medium text-[#4B5563] mb-1"
            >
              Comment Anchor (Optional)
            </label>
            <select
              id={`comment-anchor-${scope}`}
              value={selectedTarget}
              onChange={(e) => setSelectedTarget(e.target.value)}
              className="w-full px-3 py-2 text-xs text-[#111827] bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
            >
              <option value="">
                {targetLabel ? `Current View (${targetLabel})` : 'Full Story'}
              </option>
              {scope === 'story' &&
                chapters.map((ch) => (
                  <option key={ch.id} value={`chapter:${ch.id}`}>
                    Chapter {String(ch.chapterNumber).padStart(2, '0')} — {ch.title}
                  </option>
                ))}
              {turns
                .filter((t) => {
                  if (scope !== 'chapter') return true;
                  const ch = chapters.find((c) => c.id === targetId);
                  return ch ? ch.turnIds.includes(t.id) : true;
                })
                .map((t) => (
                  <option key={t.id} value={`scene:${t.id}`}>
                    Scene {String(t.turnNumber).padStart(2, '0')} — {t.sceneTitle}
                  </option>
                ))}
            </select>
          </div>
        )}

        <div>
          <label
            htmlFor={`comment-body-${scope}`}
            className="block text-xs font-medium text-[#4B5563] mb-1"
          >
            Leave a Comment
          </label>
          <textarea
            id={`comment-body-${scope}`}
            rows={compact ? 2 : 3}
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder="Share thoughts, feedback, or continuity notes..."
            maxLength={4000}
            className="w-full px-3 py-2.5 text-sm text-[#111827] bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
          />
        </div>

        {commentError && (
          <p className="text-xs text-[#B91C1C]" role="alert">
            {commentError}
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!commentBody.trim() || submitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg disabled:opacity-40 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            Post Comment
          </button>
        </div>
      </form>

      {commentTree.length === 0 ? (
        <p className="text-sm text-[#6B7280] py-4 text-center border-t border-neutral-200">
          No comments in this view yet. Be the first to leave a note.
        </p>
      ) : (
        <div className="divide-y divide-neutral-200 border-t border-neutral-200">
          {commentTree.map((node) => renderNode(node, 0))}
        </div>
      )}
    </section>
  );
};
