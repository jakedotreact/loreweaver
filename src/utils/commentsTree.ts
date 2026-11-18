import {
  CommentTargetType,
  StoryChapter,
  StoryComment,
  StoryTurn,
} from '../types/story';

export interface CommentThreadNode {
  comment: StoryComment;
  replies: CommentThreadNode[];
}

export interface HierarchicalCommentScopeParams {
  comments: StoryComment[];
  scope: CommentTargetType;
  targetId: string;
  chapters: StoryChapter[];
  turns: StoryTurn[];
}

/**
 * Infers normalized targetType & targetId for a comment (including legacy comments
 * that may only specify chapterOrSceneLabel).
 */
export function resolveCommentTarget(
  comment: StoryComment,
  chapters: StoryChapter[],
  turns: StoryTurn[],
): { targetType: CommentTargetType; targetId: string; targetLabel?: string } {
  if (comment.targetType && comment.targetId) {
    return {
      targetType: comment.targetType,
      targetId: comment.targetId,
      targetLabel: comment.targetLabel || comment.chapterOrSceneLabel,
    };
  }

  const lbl = (comment.targetLabel || comment.chapterOrSceneLabel || '').trim();
  if (lbl) {
    const sceneMatch = /^Scene\s+(\d+)/i.exec(lbl);
    if (sceneMatch) {
      const turnNum = Number(sceneMatch[1]);
      const matchedTurn = turns.find((t) => t.turnNumber === turnNum);
      if (matchedTurn) {
        return { targetType: 'scene', targetId: matchedTurn.id, targetLabel: lbl };
      }
    }
    const chMatch = /^Chapter\s+(\d+)/i.exec(lbl);
    if (chMatch) {
      const chNum = Number(chMatch[1]);
      const matchedCh = chapters.find((c) => c.chapterNumber === chNum);
      if (matchedCh) {
        return { targetType: 'chapter', targetId: matchedCh.id, targetLabel: lbl };
      }
    }
  }

  return {
    targetType: comment.targetType || 'story',
    targetId: comment.targetId || comment.storyId,
    targetLabel: comment.targetLabel || comment.chapterOrSceneLabel,
  };
}

/**
 * Returns comments visible at a requested hierarchy level:
 * - 'scene': comments anchored directly to `targetId` (+ all nested descendant replies)
 * - 'chapter': comments anchored to the chapter `targetId` PLUS comments (and sub-comments)
 *   on every scene inside that chapter
 * - 'story': ALL comments on the story (story + chapter + scene comments & sub-comments)
 */
export function getScopedComments({
  comments,
  scope,
  targetId,
  chapters,
  turns,
}: HierarchicalCommentScopeParams): StoryComment[] {
  if (comments.length === 0) return [];
  const byId = new Map(comments.map((c) => [c.id, c]));

  const findRoot = (c: StoryComment): StoryComment => {
    let curr = c;
    const seen = new Set<string>([curr.id]);
    while (curr.parentCommentId && byId.has(curr.parentCommentId)) {
      if (seen.has(curr.parentCommentId)) break;
      seen.add(curr.parentCommentId);
      curr = byId.get(curr.parentCommentId)!;
    }
    return curr;
  };

  if (scope === 'story') {
    return [...comments].sort((a, b) => a.createdAtMs - b.createdAtMs);
  }

  if (scope === 'chapter') {
    const targetChapter = chapters.find((ch) => ch.id === targetId);
    const sceneIdsInChapter = new Set(targetChapter?.turnIds ?? []);
    return comments
      .filter((c) => {
        const selfTarget = resolveCommentTarget(c, chapters, turns);
        const rootTarget = resolveCommentTarget(findRoot(c), chapters, turns);
        const matchesSelf =
          (selfTarget.targetType === 'chapter' && selfTarget.targetId === targetId) ||
          (selfTarget.targetType === 'scene' && sceneIdsInChapter.has(selfTarget.targetId));
        const matchesRoot =
          (rootTarget.targetType === 'chapter' && rootTarget.targetId === targetId) ||
          (rootTarget.targetType === 'scene' && sceneIdsInChapter.has(rootTarget.targetId));
        return matchesSelf || matchesRoot;
      })
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
  }

  // scope === 'scene'
  return comments
    .filter((c) => {
      const selfTarget = resolveCommentTarget(c, chapters, turns);
      const rootTarget = resolveCommentTarget(findRoot(c), chapters, turns);
      return (
        (selfTarget.targetType === 'scene' && selfTarget.targetId === targetId) ||
        (rootTarget.targetType === 'scene' && rootTarget.targetId === targetId)
      );
    })
    .sort((a, b) => a.createdAtMs - b.createdAtMs);
}

/**
 * Organizes flat scoped comments into a deterministic recursive parent->replies tree
 * so arbitrarily deep sub-comments (e.g., scene sub-comments rolling into chapters/stories)
 * render cleanly.
 */
export function buildCommentTree(comments: StoryComment[]): CommentThreadNode[] {
  const sorted = [...comments].sort((a, b) => a.createdAtMs - b.createdAtMs);
  const nodeMap = new Map<string, CommentThreadNode>();
  for (const c of sorted) {
    nodeMap.set(c.id, { comment: c, replies: [] });
  }

  const roots: CommentThreadNode[] = [];
  for (const c of sorted) {
    const node = nodeMap.get(c.id)!;
    if (c.parentCommentId && nodeMap.has(c.parentCommentId) && c.parentCommentId !== c.id) {
      nodeMap.get(c.parentCommentId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export function formatTargetBadgeLabel(
  comment: StoryComment,
  chapters: StoryChapter[],
  turns: StoryTurn[],
): string | null {
  const resolved = resolveCommentTarget(comment, chapters, turns);
  if (resolved.targetLabel) return resolved.targetLabel;
  if (resolved.targetType === 'scene') {
    const t = turns.find((item) => item.id === resolved.targetId);
    return t ? `Scene ${String(t.turnNumber).padStart(2, '0')} — ${t.sceneTitle}` : 'Scene';
  }
  if (resolved.targetType === 'chapter') {
    const ch = chapters.find((item) => item.id === resolved.targetId);
    return ch ? `Chapter ${String(ch.chapterNumber).padStart(2, '0')} — ${ch.title}` : 'Chapter';
  }
  return null;
}
