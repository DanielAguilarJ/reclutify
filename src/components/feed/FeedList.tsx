'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useFeedStore } from '@/store/feedStore';
import { getFeedPosts } from '@/app/actions/feed';
import { PostCard } from './PostCard';
import { useToast } from '@/components/ui/Toast';
import { useAppStore } from '@/store/appStore';
import type { PostAuthor } from '@/types/feed';

interface FeedListProps {
  currentUser: PostAuthor;
}

export function FeedList({ currentUser }: FeedListProps) {
  const { posts, hasMore, nextCursor, loading, setPosts, appendPosts, setLoading } = useFeedStore();
  const { showToast } = useToast();
  const language = useAppStore((s) => s.language);
  const t = (en: string, es: string) => language === 'es' ? es : en;
  const observerRef = useRef<HTMLDivElement>(null);
  /**
   * Marca si la carga inicial ya terminó.
   *
   * Era un `useRef` que se leía durante el render para decidir si mostrar el
   * esqueleto. Un ref no dispara re-render al cambiar, así que el componente podía
   * seguir mostrando el esqueleto después de que la carga terminara hasta que otro
   * cambio de estado lo repintara por casualidad. Como estado sí gobierna el
   * render.
   *
   * El guardado contra la doble ejecución del efecto en modo estricto se mantiene
   * con un ref aparte, que es su uso correcto: coordinar un efecto, no decidir lo
   * que se pinta.
   */
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const loadStartedRef = useRef(false);

  // Initial load
  useEffect(() => {
    if (loadStartedRef.current) return;
    loadStartedRef.current = true;
    setLoading(true);
    getFeedPosts(null)
      .then((result) => {
        setPosts(result.posts, result.hasMore, result.nextCursor);
      })
      .catch(() => {
        showToast('error', t('Failed to load feed', 'Error al cargar el feed'));
      })
      .finally(() => {
        setLoading(false);
        setHasLoadedOnce(true);
      });
  }, [setPosts, setLoading]);

  // Load more
  const loadMore = useCallback(async () => {
    if (loading || !hasMore || !nextCursor) return;
    setLoading(true);
    try {
      const result = await getFeedPosts(nextCursor);
      appendPosts(result.posts, result.hasMore, result.nextCursor);
    } catch {
      showToast('error', t('Failed to load more posts', 'Error al cargar más publicaciones'));
    }
    setLoading(false);
  }, [loading, hasMore, nextCursor, appendPosts, setLoading]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    const el = observerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadMore();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, loadMore]);

  if (!hasLoadedOnce || (loading && posts.length === 0)) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-card rounded-2xl p-5 shadow-sm border border-border animate-pulse">
            <div className="flex gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-surface" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-surface rounded w-1/3" />
                <div className="h-3 bg-surface rounded w-1/2" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-3 bg-surface rounded w-full" />
              <div className="h-3 bg-surface rounded w-4/5" />
              <div className="h-3 bg-surface rounded w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="bg-card rounded-2xl p-10 shadow-sm border border-border text-center">
        <div className="text-4xl mb-3">📝</div>
        <h3 className="text-lg font-bold text-foreground mb-1">
          {t('Your feed is empty', 'Tu feed está vacío')}
        </h3>
        <p className="text-sm text-muted">
          {t(
            'Be the first to post something! Share a professional update.',
            '¡Sé el primero en publicar algo! Comparte una actualización profesional.'
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} currentUser={currentUser} />
      ))}

      {/* Infinite scroll sentinel */}
      <div ref={observerRef} className="h-4" />

      {loading && (
        <div className="flex justify-center py-4">
          <div className="w-6 h-6 border-2 border-surface border-t-primary rounded-full animate-spin" />
        </div>
      )}

      {!hasMore && posts.length > 0 && (
        <p className="text-center text-sm text-muted/70 py-4">
          {t('You have seen all posts', 'Has visto todas las publicaciones')}
        </p>
      )}
    </div>
  );
}
