'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useFeedStore } from '@/store/feedStore';
import type { Post } from '@/types/feed';

interface FeedRealtimeProps {
  currentUserId: string;
}

/**
 * Invisible component that subscribes to realtime updates for the feed.
 * When a new post is created by another user, it will be shown in the feed.
 */
export function FeedRealtime({ currentUserId }: FeedRealtimeProps) {
  const prependPost = useFeedStore((s) => s.prependPost);
  const postsRef = useRef(useFeedStore.getState().posts);

  // Keep ref in sync without triggering re-renders
  useEffect(() => {
    const unsub = useFeedStore.subscribe((state) => {
      postsRef.current = state.posts;
    });
    return unsub;
  }, []);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel('feed-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'posts',
        },
        async (payload) => {
          const newPost = payload.new as Post;

          // Don't add our own posts (already handled optimistically)
          if (newPost.user_id === currentUserId) return;

          // Don't add if already in the list (use ref to avoid stale closure)
          if (postsRef.current.some(p => p.id === newPost.id)) return;

          // Fetch author info for the new post
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('user_id, username, full_name, headline, avatar_url')
              .eq('user_id', newPost.user_id)
              .single();

            if (profile) {
              newPost.author = {
                user_id: profile.user_id,
                username: profile.username,
                full_name: profile.full_name,
                headline: profile.headline,
                avatar_url: profile.avatar_url,
              };
            }
          } catch {
            // If profile fetch fails, still show the post without author details
          }

          newPost.user_reaction = null;
          newPost.likes_count = newPost.likes_count ?? 0;
          newPost.comments_count = newPost.comments_count ?? 0;
          prependPost(newPost);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, prependPost]);

  return null; // Invisible component
}
