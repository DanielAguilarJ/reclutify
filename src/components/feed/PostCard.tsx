'use client';

import { useState, useRef } from 'react';
import type { Post, PostAuthor } from '@/types/feed';
import { ReactionBar } from './ReactionBar';
import { CommentSection } from './CommentSection';
import { deletePost, updatePost } from '@/app/actions/feed';
import { useFeedStore } from '@/store/feedStore';
import { useToast } from '@/components/ui/Toast';
import { useAppStore } from '@/store/appStore';
import { formatRelativeTime } from '@/lib/formatTime';
import { MoreHorizontal, Pencil, Trash2, X } from 'lucide-react';

interface PostCardProps {
  post: Post;
  currentUser: PostAuthor;
}

const POST_TRUNCATE_LENGTH = 300;

export function PostCard({ post, currentUser }: PostCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [editSaving, setEditSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const removePost = useFeedStore((s) => s.removePost);
  const updatePostContent = useFeedStore((s) => s.updatePostContent);
  const { showToast } = useToast();
  const language = useAppStore((s) => s.language);
  const isOwn = post.user_id === currentUser.user_id;
  const isLong = post.content.length > POST_TRUNCATE_LENGTH;
  const displayContent = isLong && !expanded
    ? post.content.slice(0, POST_TRUNCATE_LENGTH) + '...'
    : post.content;

  const handleDelete = async () => {
    setShowDeleteConfirm(false);
    removePost(post.id);
    const result = await deletePost(post.id);
    if (!result.success) {
      showToast('error', language === 'es' ? 'No se pudo eliminar el post' : 'Could not delete post');
    }
  };

  const handleEdit = async () => {
    if (!editContent.trim() || editSaving) return;
    setEditSaving(true);
    const result = await updatePost(post.id, editContent.trim());
    if (result.success) {
      updatePostContent(post.id, editContent.trim());
      setIsEditing(false);
      showToast('success', language === 'es' ? 'Post actualizado' : 'Post updated');
    } else {
      showToast('error', result.error || (language === 'es' ? 'Error al editar' : 'Edit failed'));
    }
    setEditSaving(false);
  };

  return (
    <article className="bg-card rounded-2xl shadow-sm border border-border hover:shadow-md transition-all duration-300">
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <a href={post.author ? `/profile/${post.author.username}` : '#'}
            className="shrink-0 w-12 h-12 rounded-full overflow-hidden bg-surface">
            {post.author?.avatar_url ? (
              <img src={post.author.avatar_url} alt={post.author.full_name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-lg font-bold text-neutral-50 bg-gradient-to-br from-blue-10 to-purple-10">
                {(post.author?.full_name || '?').charAt(0)}
              </div>
            )}
          </a>
          <div className="flex-1 min-w-0">
            <a href={post.author ? `/profile/${post.author.username}` : '#'}
              className="font-semibold text-foreground hover:text-primary transition-colors">
              {post.author?.full_name || 'Usuario'}
            </a>
            {post.author?.headline && (
              <p className="text-xs text-muted truncate">{post.author.headline}</p>
            )}
            <p className="text-[11px] text-muted/70 mt-0.5">{formatRelativeTime(post.created_at, language)}</p>
          </div>

          {/* Actions menu */}
          {isOwn && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-2 rounded-lg text-muted hover:bg-surface hover:text-foreground transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[140px] z-20">
                  <button
                    onClick={() => { setIsEditing(true); setEditContent(post.content); setShowMenu(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-surface transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    {language === 'es' ? 'Editar' : 'Edit'}
                  </button>
                  <button
                    onClick={() => { setShowDeleteConfirm(true); setShowMenu(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-surface transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {language === 'es' ? 'Eliminar' : 'Delete'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        {isEditing ? (
          <div className="space-y-3 mb-3">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-border bg-surface
                text-foreground placeholder-muted resize-none
                focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                transition-all min-h-[100px] text-sm"
              maxLength={3000}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-muted hover:bg-surface transition-colors"
              >
                {language === 'es' ? 'Cancelar' : 'Cancel'}
              </button>
              <button
                onClick={handleEdit}
                disabled={!editContent.trim() || editSaving}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-white
                  hover:bg-primary-hover disabled:opacity-40 transition-all"
              >
                {editSaving
                  ? (language === 'es' ? 'Guardando...' : 'Saving...')
                  : (language === 'es' ? 'Guardar' : 'Save')}
              </button>
            </div>
          </div>
        ) : (
          <div className="mb-3">
            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">{displayContent}</p>
            {isLong && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-sm font-medium text-primary hover:text-primary-hover mt-1 transition-colors"
              >
                {expanded
                  ? (language === 'es' ? 'Ver menos' : 'See less')
                  : (language === 'es' ? 'Ver más' : 'See more')}
              </button>
            )}
          </div>
        )}

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

      {/* Delete confirmation overlay */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card rounded-2xl p-6 shadow-2xl border border-border max-w-sm mx-4 w-full">
            <h3 className="text-lg font-bold text-foreground mb-2">
              {language === 'es' ? '¿Eliminar publicación?' : 'Delete post?'}
            </h3>
            <p className="text-sm text-muted mb-5">
              {language === 'es'
                ? 'Esta acción no se puede deshacer.'
                : 'This action cannot be undone.'}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-muted hover:bg-surface transition-colors"
              >
                {language === 'es' ? 'Cancelar' : 'Cancel'}
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-danger text-white hover:bg-danger/90 transition-colors"
              >
                {language === 'es' ? 'Eliminar' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
