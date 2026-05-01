'use client';

import { useState, useEffect } from 'react';
import { getPostComments, addComment } from '@/app/actions/feed';
import { useFeedStore } from '@/store/feedStore';
import type { PostComment, PostAuthor } from '@/types/feed';

interface CommentSectionProps {
  postId: string;
  currentUser: PostAuthor;
}

export function CommentSection({ postId, currentUser }: CommentSectionProps) {
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const incrementCommentCount = useFeedStore((s) => s.incrementCommentCount);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPostComments(postId).then((data) => {
      if (!cancelled) {
        setComments(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [postId]);

  const handleSubmit = async () => {
    if (!content.trim() || submitting) return;
    setSubmitting(true);

    const result = await addComment({ post_id: postId, content: content.trim() });

    if (result.success && result.comment) {
      result.comment.author = currentUser;
      setComments((prev) => [...prev, result.comment!]);
      incrementCommentCount(postId);
      setContent('');
    }

    setSubmitting(false);
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'ahora';
    if (diffMin < 60) return `${diffMin}m`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="border-t border-neutral-10 pt-3 space-y-3">
      {/* Comments list */}
      {loading ? (
        <div className="flex justify-center py-3">
          <div className="w-5 h-5 border-2 border-neutral-20 border-t-blue-50 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3 max-h-[300px] overflow-y-auto">
          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-2.5">
              <div className="shrink-0 w-8 h-8 rounded-full overflow-hidden bg-neutral-20">
                {comment.author?.avatar_url ? (
                  <img src={comment.author.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs font-bold text-neutral-50 bg-gradient-to-br from-blue-10 to-purple-10">
                    {(comment.author?.full_name || '?').charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="bg-neutral-10/60 rounded-xl px-3 py-2">
                  <div className="flex items-baseline gap-2">
                    <a
                      href={comment.author ? `/profile/${comment.author.username}` : '#'}
                      className="text-sm font-semibold text-neutral-80 hover:text-blue-50 transition-colors"
                    >
                      {comment.author?.full_name || 'Usuario'}
                    </a>
                    <span className="text-[11px] text-neutral-30">{formatTime(comment.created_at)}</span>
                  </div>
                  <p className="text-sm text-neutral-60 mt-0.5 whitespace-pre-line">{comment.content}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Comment input */}
      <div className="flex gap-2.5">
        <div className="shrink-0 w-8 h-8 rounded-full overflow-hidden bg-neutral-20">
          {currentUser.avatar_url ? (
            <img src={currentUser.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs font-bold text-neutral-50 bg-gradient-to-br from-blue-10 to-purple-10">
              {currentUser.full_name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1 flex gap-2">
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            placeholder="Escribe un comentario..."
            className="flex-1 px-3 py-2 rounded-xl border border-neutral-20 bg-white text-sm
              text-neutral-80 placeholder-neutral-30
              focus:outline-none focus:ring-2 focus:ring-blue-50/20 focus:border-blue-50 transition-all"
            maxLength={1000}
          />
          <button
            onClick={handleSubmit}
            disabled={!content.trim() || submitting}
            className="px-3 py-2 rounded-xl bg-blue-50 text-white text-sm font-medium
              hover:bg-blue-40 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
          >
            {submitting ? '...' : '→'}
          </button>
        </div>
      </div>
    </div>
  );
}
