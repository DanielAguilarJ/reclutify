'use client';

import { useState, useRef } from 'react';
import { createPost, uploadPostMedia } from '@/app/actions/feed';
import { useFeedStore } from '@/store/feedStore';
import { useToast } from '@/components/ui/Toast';
import { useAppStore } from '@/store/appStore';
import { Image, X, Loader2 } from 'lucide-react';
import type { PostAuthor } from '@/types/feed';

interface PostComposerProps {
  currentUser: PostAuthor;
}

export function PostComposer({ currentUser }: PostComposerProps) {
  const [content, setContent] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [posting, setPosting] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prependPost = useFeedStore((s) => s.prependPost);
  const { showToast } = useToast();
  const language = useAppStore((s) => s.language);
  const t = (en: string, es: string) => language === 'es' ? es : en;

  const handlePost = async () => {
    if (!content.trim() || posting) return;
    setPosting(true);

    try {
      let imageUrl: string | undefined;

      // Upload media if selected
      if (mediaFile) {
        setUploading(true);
        const formData = new FormData();
        formData.append('file', mediaFile);
        const uploadResult = await uploadPostMedia(formData);
        setUploading(false);

        if (!uploadResult.success) {
          showToast('error', uploadResult.error || t('Could not upload image', 'No se pudo subir la imagen'));
          setPosting(false);
          return;
        }
        imageUrl = uploadResult.url;
      }

      const result = await createPost({
        content: content.trim(),
        image_url: imageUrl,
      });

      if (result.success && result.post) {
        result.post.author = currentUser;
        result.post.user_reaction = null;
        prependPost(result.post);
        setContent('');
        setIsExpanded(false);
        setMediaPreview(null);
        setMediaFile(null);
      } else {
        showToast('error', result.error || t('Could not publish your post', 'No se pudo publicar tu post'));
      }
    } catch {
      showToast('error', t('An unexpected error occurred', 'Ocurrió un error inesperado'));
    }

    setPosting(false);
  };

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate client-side
      if (file.size > 5 * 1024 * 1024) {
        showToast('error', t('Image too large (max 5MB)', 'Imagen muy pesada (max 5MB)'));
        return;
      }
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowedTypes.includes(file.type)) {
        showToast('error', t('Only JPG, PNG, WebP or GIF allowed', 'Solo se aceptan JPG, PNG, WebP o GIF'));
        return;
      }
      const url = URL.createObjectURL(file);
      setMediaPreview(url);
      setMediaFile(file);
    }
  };

  const removeMedia = () => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaPreview(null);
    setMediaFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="bg-card rounded-2xl p-5 shadow-sm border border-border">
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="shrink-0 w-12 h-12 rounded-full overflow-hidden bg-surface">
          {currentUser.avatar_url ? (
            <img src={currentUser.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-lg font-bold text-white bg-primary">
              {currentUser.full_name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="flex-1">
          {!isExpanded ? (
            <button
              onClick={() => setIsExpanded(true)}
              className="w-full text-left px-4 py-3 rounded-xl border border-border
                text-muted hover:bg-surface transition-colors text-sm"
            >
              {t('What do you want to share?', '\u00bfQu\u00e9 quieres compartir?')}
            </button>
          ) : (
            <div className="space-y-3">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t('Share an update, achievement, or professional reflection...', 'Comparte una actualizaci\u00f3n, logro o reflexi\u00f3n profesional...')}
                className="w-full px-4 py-3 rounded-xl border border-border bg-card
                  text-foreground placeholder-muted resize-none
                  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                  transition-all min-h-[120px] text-sm"
                maxLength={3000}
                autoFocus
              />

              {/* Media preview */}
              {mediaPreview && (
                <div className="relative rounded-xl overflow-hidden border border-border">
                  <img src={mediaPreview} alt="" className="w-full max-h-60 object-cover" />
                  <button
                    onClick={removeMedia}
                    className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 rounded-lg text-muted hover:bg-surface hover:text-foreground transition-colors"
                    title={t('Add image', 'Agregar imagen')}
                    disabled={posting}
                  >
                    <Image className="w-5 h-5" />
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleMediaSelect} className="hidden" />
                  <span className="text-xs text-muted">{content.length}/3000</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setIsExpanded(false); setContent(''); removeMedia(); }}
                    className="px-4 py-2 rounded-xl text-sm font-medium text-muted
                      hover:bg-surface transition-colors"
                    disabled={posting}
                  >
                    {t('Cancel', 'Cancelar')}
                  </button>
                  <button
                    onClick={handlePost}
                    disabled={!content.trim() || posting}
                    className="px-5 py-2 rounded-xl text-sm font-semibold bg-primary text-white
                      hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed
                      transition-all shadow-sm flex items-center gap-2"
                  >
                    {(posting || uploading) && <Loader2 className="w-4 h-4 animate-spin" />}
                    {uploading
                      ? t('Uploading...', 'Subiendo...')
                      : posting
                        ? t('Publishing...', 'Publicando...')
                        : t('Publish', 'Publicar')}
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
