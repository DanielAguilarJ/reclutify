'use client';

import { useState, useEffect, useRef } from 'react';
import { getPostComments, addComment, updateComment, deleteComment } from '@/app/actions/feed';
import { useFeedStore } from '@/store/feedStore';
import { useToast } from '@/components/ui/Toast';
import { useAppStore } from '@/store/appStore';
import { formatRelativeTime } from '@/lib/formatTime';
import { MoreHorizontal, Pencil, Trash2, CornerDownRight } from 'lucide-react';
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
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const incrementCommentCount = useFeedStore((s) => s.incrementCommentCount);
  const decrementCommentCount = useFeedStore((s) => s.decrementCommentCount);
  const { showToast } = useToast();
  const language = useAppStore((s) => s.language);

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

  // Auto-resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  const handleSubmit = async () => {
    if (!content.trim() || submitting) return;
    setSubmitting(true);

    const result = await addComment({
      post_id: postId,
      content: content.trim(),
      parent_id: replyTo || undefined,
    });

    if (result.success && result.comment) {
      result.comment.author = currentUser;
      setComments((prev) => [...prev, result.comment!]);
      incrementCommentCount(postId);
      setContent('');
      setReplyTo(null);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } else {
      showToast('error', language === 'es' ? 'No se pudo publicar el comentario' : 'Could not post comment');
    }

    setSubmitting(false);
  };

  const handleEdit = async (commentId: string) => {
    if (!editContent.trim()) return;
    const result = await updateComment(commentId, editContent.trim());
    if (result.success) {
      setComments((prev) =>
        prev.map((c) => c.id === commentId ? { ...c, content: editContent.trim() } : c)
      );
      setEditingId(null);
      setEditContent('');
    } else {
      showToast('error', language === 'es' ? 'Error al editar' : 'Edit failed');
    }
  };

  const handleDelete = async (commentId: string) => {
    const result = await deleteComment(commentId);
    if (result.success) {
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      decrementCommentCount(postId);
    } else {
      showToast('error', language === 'es' ? 'Error al eliminar' : 'Delete failed');
    }
    setMenuOpenId(null);
  };

  return (
    <div className="border-t border-border pt-3 space-y-3">
      {/* Comments list */}
      {loading ? (
        <div className="flex justify-center py-3">
          <div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {comments.map((comment) => {
            const isOwnComment = comment.user_id === currentUser.user_id;

            return (
              <div key={comment.id} className="flex gap-2.5">
                <div className="shrink-0 w-8 h-8 rounded-full overflow-hidden bg-surface">
                  {comment.author?.avatar_url ? (
                    <img src={comment.author.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-bold text-neutral-50 bg-gradient-to-br from-blue-10 to-purple-10">
                      {(comment.author?.full_name || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {editingId === comment.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-sm
                          text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/20
                          focus:border-primary transition-all min-h-[60px]"
                        maxLength={1000}
                      />
                      <div className="flex gap-2">
                        <button onClick={() => setEditingId(null)}
                          className="text-xs text-muted hover:text-foreground transition-colors">
                          {language === 'es' ? 'Cancelar' : 'Cancel'}
                        </button>
                        <button onClick={() => handleEdit(comment.id)}
                          className="text-xs font-semibold text-primary hover:text-primary-hover transition-colors">
                          {language === 'es' ? 'Guardar' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-surface/60 rounded-xl px-3 py-2 group relative">
                      <div className="flex items-baseline gap-2">
                        <a
                          href={comment.author ? `/profile/${comment.author.username}` : '#'}
                          className="text-sm font-semibold text-foreground hover:text-primary transition-colors"
                        >
                          {comment.author?.full_name || 'Usuario'}
                        </a>
                        <span className="text-[11px] text-muted/70">{formatRelativeTime(comment.created_at, language)}</span>
                      </div>
                      <p className="text-sm text-foreground/80 mt-0.5 whitespace-pre-line">{comment.content}</p>

                      {/* Comment actions menu */}
                      {isOwnComment && (
                        <div className="absolute top-1 right-1">
                          <button
                            onClick={() => setMenuOpenId(menuOpenId === comment.id ? null : comment.id)}
                            className="p-1 rounded-lg opacity-0 group-hover:opacity-100 text-muted hover:bg-surface-hover transition-all"
                          >
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </button>
                          {menuOpenId === comment.id && (
                            <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[100px] z-10">
                              <button
                                onClick={() => { setEditingId(comment.id); setEditContent(comment.content); setMenuOpenId(null); }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-surface transition-colors"
                              >
                                <Pencil className="w-3 h-3" /> {language === 'es' ? 'Editar' : 'Edit'}
                              </button>
                              <button
                                onClick={() => handleDelete(comment.id)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-danger hover:bg-surface transition-colors"
                              >
                                <Trash2 className="w-3 h-3" /> {language === 'es' ? 'Eliminar' : 'Delete'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Reply button */}
                  {!editingId && (
                    <button
                      onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                      className="flex items-center gap-1 mt-1 text-xs text-muted hover:text-primary transition-colors"
                    >
                      <CornerDownRight className="w-3 h-3" />
                      {language === 'es' ? 'Responder' : 'Reply'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reply indicator */}
      {replyTo && (
        <div className="flex items-center gap-2 text-xs text-muted bg-surface/60 px-3 py-1.5 rounded-lg">
          <CornerDownRight className="w-3 h-3" />
          <span>{language === 'es' ? 'Respondiendo a comentario' : 'Replying to comment'}</span>
          <button onClick={() => setReplyTo(null)} className="ml-auto text-muted hover:text-foreground">
            &times;
          </button>
        </div>
      )}

      {/* Comment input */}
      <div className="flex gap-2.5">
        <div className="shrink-0 w-8 h-8 rounded-full overflow-hidden bg-surface">
          {currentUser.avatar_url ? (
            <img src={currentUser.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs font-bold text-neutral-50 bg-gradient-to-br from-blue-10 to-purple-10">
              {currentUser.full_name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1 flex gap-2">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleTextareaChange}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            placeholder={language === 'es' ? 'Escribe un comentario...' : 'Write a comment...'}
            className="flex-1 px-3 py-2 rounded-xl border border-border bg-card text-sm
              text-foreground placeholder-muted resize-none overflow-hidden
              focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            maxLength={1000}
            rows={1}
            style={{ minHeight: '38px' }}
          />
          <button
            onClick={handleSubmit}
            disabled={!content.trim() || submitting}
            className="px-3 py-2 rounded-xl bg-primary text-white text-sm font-medium
              hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0 self-end"
          >
            {submitting ? '...' : '→'}
          </button>
        </div>
      </div>
    </div>
  );
}
