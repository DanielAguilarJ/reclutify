'use client';

import { useState, useRef, useEffect } from 'react';
import { useFeedStore } from '@/store/feedStore';
import { toggleReaction } from '@/app/actions/feed';
import { useToast } from '@/components/ui/Toast';
import { useAppStore } from '@/store/appStore';
import { MessageCircle, Share2 } from 'lucide-react';
import type { ReactionType } from '@/types/feed';

interface ReactionBarProps {
  postId: string;
  likesCount: number;
  commentsCount: number;
  userReaction: ReactionType | null;
  onToggleComments: () => void;
}

const REACTIONS: { type: ReactionType; emoji: string; labelEn: string; labelEs: string }[] = [
  { type: 'like', emoji: '👍', labelEn: 'Like', labelEs: 'Me gusta' },
  { type: 'celebrate', emoji: '🎉', labelEn: 'Celebrate', labelEs: 'Celebrar' },
  { type: 'insightful', emoji: '💡', labelEn: 'Insightful', labelEs: 'Interesante' },
  { type: 'support', emoji: '❤️', labelEn: 'Support', labelEs: 'Apoyar' },
];

export function ReactionBar({
  postId,
  likesCount,
  commentsCount,
  userReaction,
  onToggleComments,
}: ReactionBarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reacting, setReacting] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const optimisticReaction = useFeedStore((s) => s.optimisticReaction);
  const { showToast } = useToast();
  const language = useAppStore((s) => s.language);

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    if (pickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [pickerOpen]);

  const handleReaction = async (reactionType: ReactionType) => {
    if (reacting) return; // Debounce
    setReacting(true);
    setPickerOpen(false);

    const isRemoving = userReaction === reactionType;
    optimisticReaction(postId, reactionType, isRemoving ? 'remove' : 'add');

    const result = await toggleReaction(postId, reactionType);
    if (!result.success) {
      // Rollback optimistic update
      optimisticReaction(postId, reactionType, isRemoving ? 'add' : 'remove');
      showToast('error', language === 'es' ? 'No se pudo guardar la reacción' : 'Could not save reaction');
    }

    // Debounce delay
    timeoutRef.current = setTimeout(() => setReacting(false), 300);
  };

  // Cleanup timeout
  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  const activeReaction = REACTIONS.find((r) => r.type === userReaction);

  return (
    <div className="border-t border-border pt-3">
      {/* Counts */}
      {(likesCount > 0 || commentsCount > 0) && (
        <div className="flex items-center justify-between text-xs text-muted mb-2 px-1">
          {likesCount > 0 && (
            <span>
              {likesCount} {likesCount === 1
                ? (language === 'es' ? 'reacción' : 'reaction')
                : (language === 'es' ? 'reacciones' : 'reactions')}
            </span>
          )}
          {commentsCount > 0 && (
            <button onClick={onToggleComments} className="hover:text-primary transition-colors">
              {commentsCount} {commentsCount === 1
                ? (language === 'es' ? 'comentario' : 'comment')
                : (language === 'es' ? 'comentarios' : 'comments')}
            </button>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        {/* Like button with picker */}
        <div className="relative flex-1" ref={pickerRef}>
          <button
            onClick={() => handleReaction(userReaction || 'like')}
            onMouseEnter={() => { if (window.innerWidth > 768) setPickerOpen(true); }}
            onMouseLeave={() => { if (window.innerWidth > 768) setTimeout(() => setPickerOpen(false), 200); }}
            onTouchStart={(e) => {
              e.preventDefault();
              if (pickerOpen) {
                handleReaction(userReaction || 'like');
              } else {
                setPickerOpen(true);
              }
            }}
            className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium
              transition-all duration-200 ${
                userReaction
                  ? 'text-primary bg-primary-light hover:bg-primary-light/80'
                  : 'text-muted hover:bg-surface'
              }`}
          >
            <span className="text-base">{activeReaction?.emoji || '👍'}</span>
            {activeReaction
              ? (language === 'es' ? activeReaction.labelEs : activeReaction.labelEn)
              : (language === 'es' ? 'Me gusta' : 'Like')}
          </button>

          {/* Reaction picker popup */}
          {pickerOpen && (
            <div className="absolute bottom-full left-0 mb-1 z-20 animate-[slideIn_0.15s_ease-out]">
              <div className="flex gap-1 bg-card rounded-2xl shadow-lg border border-border p-2">
                {REACTIONS.map((r) => (
                  <button
                    key={r.type}
                    onClick={() => handleReaction(r.type)}
                    className={`w-10 h-10 flex items-center justify-center rounded-xl text-xl
                      hover:bg-surface hover:scale-125 transition-all duration-150
                      ${userReaction === r.type ? 'bg-primary-light scale-110' : ''}`}
                    title={language === 'es' ? r.labelEs : r.labelEn}
                  >
                    {r.emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Comment button */}
        <button
          onClick={onToggleComments}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium
            text-muted hover:bg-surface transition-all duration-200"
        >
          <MessageCircle className="w-4 h-4" />
          {language === 'es' ? 'Comentar' : 'Comment'}
        </button>

        {/* Share button */}
        <button
          onClick={() => {
            navigator.clipboard.writeText(`${window.location.origin}/feed#${postId}`);
            showToast('success', language === 'es' ? 'Enlace copiado' : 'Link copied');
          }}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium
            text-muted hover:bg-surface transition-all duration-200"
        >
          <Share2 className="w-4 h-4" />
          {language === 'es' ? 'Compartir' : 'Share'}
        </button>
      </div>
    </div>
  );
}
