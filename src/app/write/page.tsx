'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText,
  Image,
  X,
  Loader2,
  ArrowLeft,
  Type,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { createPost, uploadPostMedia } from '@/app/actions/feed';
import AppNavbar from '@/components/ui/AppNavbar';

const MAX_TITLE_LENGTH = 150;
const MAX_CONTENT_LENGTH = 10000;

export default function WritePage() {
  const { language } = useAppStore();
  const t = (en: string, es: string) => (language === 'es' ? es : en);
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError(t('Image too large (max 5MB)', 'Imagen muy pesada (max 5MB)'));
      return;
    }
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setError(t('Only JPG, PNG, WebP or GIF allowed', 'Solo se aceptan JPG, PNG, WebP o GIF'));
      return;
    }

    const url = URL.createObjectURL(file);
    setCoverPreview(url);
    setCoverFile(file);
    setError(null);
  };

  const removeCover = () => {
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverPreview(null);
    setCoverFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePublish = async () => {
    if (!title.trim() || !content.trim()) return;
    setPublishing(true);
    setError(null);

    try {
      let imageUrl: string | undefined;

      // Upload cover image if provided
      if (coverFile) {
        setUploading(true);
        const formData = new FormData();
        formData.append('file', coverFile);
        const uploadResult = await uploadPostMedia(formData);
        setUploading(false);

        if (!uploadResult.success) {
          setError(uploadResult.error || t('Could not upload image', 'No se pudo subir la imagen'));
          setPublishing(false);
          return;
        }
        imageUrl = uploadResult.url;
      }

      const result = await createPost({
        content: `${title.trim()}\n\n${content.trim()}`,
        post_type: 'article',
        image_url: imageUrl,
      });

      if (result.success) {
        router.push('/feed');
      } else {
        setError(result.error || t('Could not publish article', 'No se pudo publicar el articulo'));
      }
    } catch {
      setError(t('An unexpected error occurred', 'Ocurrio un error inesperado'));
    }

    setPublishing(false);
  };

  const canPublish = title.trim().length > 0 && content.trim().length > 0 && !publishing;

  return (
    <div className="min-h-screen bg-background">
      <AppNavbar activeRoute="/write" />

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/feed')}
              className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface transition-colors"
              title={t('Back to feed', 'Volver al feed')}
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
              <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              {t('Write Article', 'Escribir Articulo')}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/feed')}
              className="px-4 py-2 rounded-lg text-sm font-medium text-muted hover:bg-surface transition-colors"
              disabled={publishing}
            >
              {t('Cancel', 'Cancelar')}
            </button>
            <button
              onClick={handlePublish}
              disabled={!canPublish}
              className="px-5 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {(publishing || uploading) && <Loader2 className="h-4 w-4 animate-spin" />}
              {uploading
                ? t('Uploading...', 'Subiendo...')
                : publishing
                  ? t('Publishing...', 'Publicando...')
                  : t('Publish', 'Publicar')}
            </button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
            {error}
          </div>
        )}

        {/* Cover Image */}
        <div className="mb-6">
          {coverPreview ? (
            <div className="relative rounded-xl overflow-hidden border border-border">
              <img
                src={coverPreview}
                alt={t('Cover image', 'Imagen de portada')}
                className="w-full h-48 sm:h-64 object-cover"
              />
              <button
                onClick={removeCover}
                className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-32 rounded-xl border-2 border-dashed border-border hover:border-primary/40 bg-surface/50 hover:bg-surface flex flex-col items-center justify-center gap-2 transition-colors"
            >
              <Image className="h-6 w-6 text-muted" />
              <span className="text-sm text-muted">
                {t('Add cover image (optional)', 'Agregar imagen de portada (opcional)')}
              </span>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleCoverSelect}
            className="hidden"
          />
        </div>

        {/* Title Input */}
        <div className="mb-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE_LENGTH))}
            placeholder={t('Article title...', 'Titulo del articulo...')}
            className="w-full px-0 py-3 text-2xl sm:text-3xl font-bold text-foreground bg-transparent border-none outline-none placeholder:text-muted/40"
          />
          <div className="flex items-center justify-between">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted/60 ml-2">
              {title.length}/{MAX_TITLE_LENGTH}
            </span>
          </div>
        </div>

        {/* Content Textarea */}
        <div className="mb-4">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, MAX_CONTENT_LENGTH))}
            placeholder={t(
              'Write your article here... (Markdown supported)',
              'Escribe tu articulo aqui... (Markdown soportado)'
            )}
            className="w-full px-0 py-3 text-base text-foreground bg-transparent border-none outline-none resize-none min-h-[400px] placeholder:text-muted/40 leading-relaxed focus:ring-0"
          />
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div className="flex items-center gap-3 text-xs text-muted">
            <Type className="h-4 w-4" />
            <span>
              {content.length.toLocaleString()}/{MAX_CONTENT_LENGTH.toLocaleString()} {t('characters', 'caracteres')}
            </span>
          </div>
          <p className="text-xs text-muted/60">
            {t('Supports Markdown formatting', 'Soporta formato Markdown')}
          </p>
        </div>
      </div>
    </div>
  );
}
