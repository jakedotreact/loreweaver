import React, { useState } from 'react';
import {
  ArrowRight,
  Bell,
  BellOff,
  FolderOpen,
  Globe,
  Lock,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  PublicStoryWork,
  StorySubscription,
  UserCollection,
} from '../types/story';

interface LibraryShelfViewProps {
  mode: 'collections' | 'subscriptions';
  collections: UserCollection[];
  subscriptions: StorySubscription[];
  allStories: PublicStoryWork[];
  onCreateCollection: (payload: {
    name: string;
    description: string;
    isPrivate: boolean;
  }) => void;
  onDeleteCollection: (collectionId: string) => void;
  onRemoveStoryFromCollection: (collectionId: string, storyId: string) => void;
  onUnsubscribe: (storyId: string) => void;
  onOpenStory: (storyId: string) => void;
}

export const LibraryShelfView: React.FC<LibraryShelfViewProps> = ({
  mode,
  collections,
  subscriptions,
  allStories,
  onCreateCollection,
  onDeleteCollection,
  onRemoveStoryFromCollection,
  onUnsubscribe,
  onOpenStory,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);

  const storyMap = new Map(allStories.map((s) => [s.id, s]));

  if (mode === 'subscriptions') {
    return (
      <section aria-label="Story Subscriptions" className="space-y-4">
        {subscriptions.length === 0 ? (
          <div className="bg-white border border-neutral-200 rounded-xl p-10 text-center space-y-2">
            <Bell className="w-6 h-6 text-[#9CA3AF] mx-auto" />
            <p className="font-editorial text-lg font-semibold text-[#111827]">
              No story subscriptions yet
            </p>
            <p className="text-xs text-[#6B7280] max-w-md mx-auto">
              Subscribe to any story in the Story Index or Reader view to track new scenes and chapters.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-200 bg-white border border-neutral-200 rounded-xl">
            {subscriptions.map((sub) => {
              const live = storyMap.get(sub.storyId);
              const currentTurns = live?.turns.length ?? sub.lastSeenTurnCount;
              const newTurns = Math.max(0, currentTurns - sub.lastSeenTurnCount);
              return (
                <div
                  key={sub.storyId}
                  className="p-5 flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenStory(sub.storyId)}
                        className="font-editorial text-lg font-semibold text-[#111827] hover:text-[#1D4ED8] hover:underline text-left cursor-pointer"
                      >
                        {live?.title || sub.storyTitle}
                      </button>
                      {newTurns > 0 && (
                        <span className="text-xs font-medium text-[#1D4ED8]">
                          · +{newTurns} new {newTurns === 1 ? 'scene' : 'scenes'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#6B7280]">
                      by {live?.authorName || sub.authorName} · {currentTurns}{' '}
                      {currentTurns === 1 ? 'scene' : 'scenes'} · Subscribed{' '}
                      {new Date(sub.subscribedAtMs).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenStory(sub.storyId)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1D4ED8] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg cursor-pointer"
                    >
                      Open Story
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onUnsubscribe(sub.storyId)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-[#6B7280] hover:text-[#DC2626] border border-neutral-200 rounded-lg cursor-pointer"
                    >
                      <BellOff className="w-3.5 h-3.5" />
                      Unsubscribe
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  return (
    <section aria-label="User Collections" className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) return;
          onCreateCollection({
            name: trimmed,
            description: description.trim(),
            isPrivate,
          });
          setName('');
          setDescription('');
        }}
        className="bg-white border border-neutral-200 rounded-xl p-5 space-y-3"
      >
        <h3 className="text-sm font-semibold text-[#111827]">
          Create New Collection
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Collection title (e.g. Favorite Slow Burns)..."
            maxLength={100}
            className="px-3 py-2 text-xs text-[#111827] bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description (optional)..."
            maxLength={500}
            className="px-3 py-2 text-xs text-[#111827] bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-[#4B5563] cursor-pointer">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="rounded border-neutral-300 text-[#1D4ED8]"
            />
            Private collection (visible only to you)
          </label>
          <button
            type="submit"
            disabled={!name.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-40 rounded-lg cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Collection
          </button>
        </div>
      </form>

      {collections.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-10 text-center space-y-2">
          <FolderOpen className="w-6 h-6 text-[#9CA3AF] mx-auto" />
          <p className="font-editorial text-lg font-semibold text-[#111827]">
            No collections yet
          </p>
          <p className="text-xs text-[#6B7280]">
            Create a collection above or click Collect on any story card or reader bar.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {collections.map((col) => {
            const members = col.storyIds
              .map((sid) => storyMap.get(sid))
              .filter((w): w is PublicStoryWork => Boolean(w));
            return (
              <article
                key={col.id}
                className="bg-white border border-neutral-200 rounded-xl p-5 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2 pb-2 border-b border-neutral-100">
                  <div>
                    <h4 className="font-editorial text-lg font-semibold text-[#111827] flex items-center gap-2">
                      {col.name}
                      <span className="text-xs font-sans font-normal text-[#6B7280] inline-flex items-center gap-1">
                        {col.isPrivate ? (
                          <Lock className="w-3 h-3" />
                        ) : (
                          <Globe className="w-3 h-3" />
                        )}
                        {col.isPrivate ? 'Private' : 'Public'}
                      </span>
                    </h4>
                    {col.description && (
                      <p className="text-xs text-[#4B5563] mt-0.5">{col.description}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteCollection(col.id)}
                    className="inline-flex items-center gap-1 text-xs text-[#6B7280] hover:text-[#DC2626] cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>

                {members.length === 0 ? (
                  <p className="text-xs text-[#6B7280]">
                    No stories added to this collection yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-neutral-100">
                    {members.map((story) => (
                      <li
                        key={story.id}
                        className="py-2 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => onOpenStory(story.id)}
                            className="font-medium text-[#111827] hover:text-[#1D4ED8] hover:underline truncate cursor-pointer"
                          >
                            {story.title}
                          </button>
                          <span className="text-[#6B7280] ml-2">
                            by {story.authorName}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemoveStoryFromCollection(col.id, story.id)}
                          className="text-[#6B7280] hover:text-[#DC2626] shrink-0 cursor-pointer"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
