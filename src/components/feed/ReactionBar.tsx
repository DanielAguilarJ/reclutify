'use client';

import { useFeedStore } from '@/store/feedStore';
import { toggleReaction } from '@/app/actions/feed';
import type { ReactionType } from '@/types/feed';

interface ReactionBarProps {
  postId: string;
  likesCount: number;
  commentsCount: number;
  userReaction: ReactionType | null;
  onToggleComments: () => void;
}

const REACTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: 'like', emoji: '👍', label: 'Me gusta' },
  { type: 'celebrate', emoji: '🎉', label: 'Celebrar' },
  { type: 'insightful', emoji: '💡', label: 'Interesante' },
  { type: 'support', emoji: '❤️', label: 'Apoyar' },
];

export function ReactionBar({
  postId,
  likesCount,
  commentsCount,
  userReaction,
  onToggleComments,
}: ReactionBarProps) {
  const optimisticReaction = useFeedStore((s) => s.optimisticReaction);

  const handleReaction = async (reactionType: ReactionType) => {
    const isRemoving = userReaction === reactionType;

    // Optimistic update
    optimisticReaction(postId, reactionType, isRemoving ? 'remove' : 'add');

    // Server action (fire-and-forget style, errors are non-critical)
    await toggleReaction(postId, reactionType);
  };

  const activeReaction = REACTIONS.find((r) => r.type === userReaction);

  return (
    <div className="border-t border-neutral-10 pt-3">
      {/* Counts */}
      {(likesCount > 0 || commentsCount > 0) && (
        <div className="flex items-center justify-between text-xs text-neutral-40 mb-2 px-1">
          {likesCount > 0 && (
            <span>{likesCount} {likesCount === 1 ? 'reacción' : 'reacciones'}</span>
          )}
          {commentsCount > 0 && (
            <button onClick={onToggleComments} className="hover:text-blue-50 transition-colors">
              {commentsCount} {commentsCount === 1 ? 'comentario' : 'comentarios'}
            </button>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        {/* Like button (with hover to show all reactions) */}
        <div className="relative group flex-1">
          <button
            onClick={() => handleReaction(userReaction || 'like')}
            className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium
              transition-all duration-200 ${
                userReaction
                  ? 'text-blue-50 bg-blue-10/50 hover:bg-blue-10'
                  : 'text-neutral-50 hover:bg-neutral-10'
              }`}
          >
            <span className="text-base">{activeReaction?.emoji || '👍'}</span>
            {activeReaction?.label || 'Me gusta'}
          </button>

          {/* Reaction picker popup */}
          <div className="absolute bottom-full left-0 mb-1 opacity-0 scale-95 pointer-events-none
            group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto
            transition-all duration-200 z-20">
            <div className="flex gap-1 bg-white rounded-2xl shadow-lg border border-neutral-10 p-2">
              {REACTIONS.map((r) => (
                <button
                  key={r.type}
                  onClick={(e) => { e.stopPropagation(); handleReaction(r.type); }}
                  className={`w-10 h-10 flex items-center justify-center rounded-xl text-xl
                    hover:bg-neutral-10 hover:scale-125 transition-all duration-150
                    ${userReaction === r.type ? 'bg-blue-10 scale-110' : ''}`}
                  title={r.label}
                >
                  {r.emoji}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Comment button */}
        <button
          onClick={onToggleComments}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium
            text-neutral-50 hover:bg-neutral-10 transition-all duration-200"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3 20.25V4.5A2.25 2.25 0 015.25 2.25h13.5A2.25 2.25 0 0121 4.5v11.25a2.25 2.25 0 01-2.25 2.25H6.18a2.25 2.25 0 00-1.59.659l-1.59 1.59z" />
          </svg>
          Comentar
        </button>
      </div>
    </div>
  );
}
