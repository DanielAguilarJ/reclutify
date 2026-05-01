'use client';

import { useState } from 'react';
import type { Post, PostAuthor } from '@/types/feed';
import { ReactionBar } from './ReactionBar';
import { CommentSection } from './CommentSection';
import { deletePost } from '@/app/actions/feed';
import { useFeedStore } from '@/store/feedStore';

interface PostCardProps {
  post: Post;
  currentUser: PostAuthor;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `hace ${diffMin}m`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `hace ${diffHrs}h`;
  const diffDays = Math.floor(diffHrs / 24);
  return `hace ${diffDays}d`;
}

export function PostCard({ post, currentUser }: PostCardProps) {
  const [showComments, setShowComments] = useState(false);
  const removePost = useFeedStore((s) => s.removePost);
  const isOwn = post.user_id === currentUser.user_id;

  const handleDelete = async () => {
    if (!confirm('¿Eliminar esta publicación?')) return;
    removePost(post.id);
    await deletePost(post.id);
  };

  return (
    <article className="bg-white rounded-2xl shadow-sm border border-neutral-10 hover:shadow-md transition-shadow duration-300">
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <a href={post.author ? `/profile/${post.author.username}` : '#'}
            className="shrink-0 w-12 h-12 rounded-full overflow-hidden bg-neutral-20">
            {post.author?.avatar_url ? (
              <img src={post.author.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-lg font-bold text-neutral-50 bg-gradient-to-br from-blue-10 to-purple-10">
                {(post.author?.full_name || '?').charAt(0)}
              </div>
            )}
          </a>
          <div className="flex-1 min-w-0">
            <a href={post.author ? `/profile/${post.author.username}` : '#'}
              className="font-semibold text-neutral-80 hover:text-blue-50 transition-colors">
              {post.author?.full_name || 'Usuario'}
            </a>
            {post.author?.headline && (
              <p className="text-xs text-neutral-40 truncate">{post.author.headline}</p>
            )}
            <p className="text-[11px] text-neutral-30 mt-0.5">{formatTime(post.created_at)}</p>
          </div>
          {isOwn && (
            <button onClick={handleDelete}
              className="text-xs text-neutral-30 hover:text-red-50 transition-colors px-2 py-1">
              Eliminar
            </button>
          )}
        </div>

        {/* Content */}
        <p className="text-sm text-neutral-70 leading-relaxed whitespace-pre-line mb-3">{post.content}</p>

        {/* Reactions */}
        <ReactionBar postId={post.id} likesCount={post.likes_count}
          commentsCount={post.comments_count} userReaction={post.user_reaction || null}
          onToggleComments={() => setShowComments(!showComments)} />

        {showComments && (
          <div className="mt-3">
            <CommentSection postId={post.id} currentUser={currentUser} />
          </div>
        )}
      </div>
    </article>
  );
}
