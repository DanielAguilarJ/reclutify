'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useFeedStore } from '@/store/feedStore';
import { getFeedPosts } from '@/app/actions/feed';
import { PostCard } from './PostCard';
import type { PostAuthor } from '@/types/feed';

interface FeedListProps {
  currentUser: PostAuthor;
}

export function FeedList({ currentUser }: FeedListProps) {
  const { posts, hasMore, nextCursor, loading, setPosts, appendPosts, setLoading } = useFeedStore();
  const observerRef = useRef<HTMLDivElement>(null);
  const initialLoad = useRef(false);

  // Initial load
  useEffect(() => {
    if (initialLoad.current) return;
    initialLoad.current = true;
    setLoading(true);
    getFeedPosts(null).then((result) => {
      setPosts(result.posts, result.hasMore, result.nextCursor);
      setLoading(false);
    });
  }, [setPosts, setLoading]);

  // Load more
  const loadMore = useCallback(async () => {
    if (loading || !hasMore || !nextCursor) return;
    setLoading(true);
    const result = await getFeedPosts(nextCursor);
    appendPosts(result.posts, result.hasMore, result.nextCursor);
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

  if (!initialLoad.current || (loading && posts.length === 0)) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-2xl p-5 shadow-sm border border-neutral-10 animate-pulse">
            <div className="flex gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-neutral-20" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-neutral-20 rounded w-1/3" />
                <div className="h-3 bg-neutral-10 rounded w-1/2" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-3 bg-neutral-10 rounded w-full" />
              <div className="h-3 bg-neutral-10 rounded w-4/5" />
              <div className="h-3 bg-neutral-10 rounded w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-10 shadow-sm border border-neutral-10 text-center">
        <div className="text-4xl mb-3">📝</div>
        <h3 className="text-lg font-bold text-neutral-70 mb-1">Tu feed está vacío</h3>
        <p className="text-sm text-neutral-40">
          ¡Sé el primero en publicar algo! Comparte una actualización profesional.
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
          <div className="w-6 h-6 border-2 border-neutral-20 border-t-blue-50 rounded-full animate-spin" />
        </div>
      )}

      {!hasMore && posts.length > 0 && (
        <p className="text-center text-sm text-neutral-30 py-4">
          Has visto todas las publicaciones
        </p>
      )}
    </div>
  );
}
