'use client';

import { useState } from 'react';
import { createPost } from '@/app/actions/feed';
import { useFeedStore } from '@/store/feedStore';
import type { PostAuthor } from '@/types/feed';

interface PostComposerProps {
  currentUser: PostAuthor;
}

export function PostComposer({ currentUser }: PostComposerProps) {
  const [content, setContent] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [posting, setPosting] = useState(false);
  const prependPost = useFeedStore((s) => s.prependPost);

  const handlePost = async () => {
    if (!content.trim() || posting) return;
    setPosting(true);

    const result = await createPost({ content: content.trim() });

    if (result.success && result.post) {
      // Enrich with author info for immediate display
      result.post.author = currentUser;
      result.post.user_reaction = null;
      prependPost(result.post);
      setContent('');
      setIsExpanded(false);
    }

    setPosting(false);
  };

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-neutral-10">
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="shrink-0 w-12 h-12 rounded-full overflow-hidden bg-neutral-20">
          {currentUser.avatar_url ? (
            <img src={currentUser.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-lg font-bold text-neutral-50 bg-gradient-to-br from-blue-10 to-purple-10">
              {currentUser.full_name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="flex-1">
          {!isExpanded ? (
            <button
              onClick={() => setIsExpanded(true)}
              className="w-full text-left px-4 py-3 rounded-xl border border-neutral-20
                text-neutral-40 hover:bg-neutral-10 transition-colors text-sm"
            >
              ¿Qué quieres compartir?
            </button>
          ) : (
            <div className="space-y-3">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Comparte una actualización, logro o reflexión profesional..."
                className="w-full px-4 py-3 rounded-xl border border-neutral-20 bg-white
                  text-neutral-80 placeholder-neutral-30 resize-none
                  focus:outline-none focus:ring-2 focus:ring-blue-50/30 focus:border-blue-50
                  transition-all min-h-[120px] text-sm"
                maxLength={3000}
                autoFocus
              />

              {/* Footer */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-30">{content.length}/3000</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setIsExpanded(false); setContent(''); }}
                    className="px-4 py-2 rounded-xl text-sm font-medium text-neutral-50
                      hover:bg-neutral-10 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handlePost}
                    disabled={!content.trim() || posting}
                    className="px-5 py-2 rounded-xl text-sm font-semibold bg-blue-50 text-white
                      hover:bg-blue-40 disabled:opacity-40 disabled:cursor-not-allowed
                      transition-all shadow-sm"
                  >
                    {posting ? 'Publicando...' : 'Publicar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
