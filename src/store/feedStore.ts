import { create } from 'zustand';
import type { Post, ReactionType } from '@/types/feed';

interface FeedState {
  posts: Post[];
  hasMore: boolean;
  nextCursor: string | null;
  loading: boolean;

  // Actions
  setPosts: (posts: Post[], hasMore: boolean, nextCursor: string | null) => void;
  appendPosts: (posts: Post[], hasMore: boolean, nextCursor: string | null) => void;
  prependPost: (post: Post) => void;
  removePost: (postId: string) => void;
  optimisticReaction: (postId: string, reactionType: ReactionType, action: 'add' | 'remove') => void;
  incrementCommentCount: (postId: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useFeedStore = create<FeedState>()((set) => ({
  posts: [],
  hasMore: false,
  nextCursor: null,
  loading: false,

  setPosts: (posts, hasMore, nextCursor) =>
    set({ posts, hasMore, nextCursor }),

  appendPosts: (newPosts, hasMore, nextCursor) =>
    set((state) => ({
      posts: [...state.posts, ...newPosts],
      hasMore,
      nextCursor,
    })),

  prependPost: (post) =>
    set((state) => ({
      posts: [post, ...state.posts],
    })),

  removePost: (postId) =>
    set((state) => ({
      posts: state.posts.filter((p) => p.id !== postId),
    })),

  optimisticReaction: (postId, reactionType, action) =>
    set((state) => ({
      posts: state.posts.map((post) => {
        if (post.id !== postId) return post;

        if (action === 'add') {
          return {
            ...post,
            likes_count: post.user_reaction ? post.likes_count : post.likes_count + 1,
            user_reaction: reactionType,
          };
        } else {
          return {
            ...post,
            likes_count: Math.max(0, post.likes_count - 1),
            user_reaction: null,
          };
        }
      }),
    })),

  incrementCommentCount: (postId) =>
    set((state) => ({
      posts: state.posts.map((post) =>
        post.id === postId
          ? { ...post, comments_count: post.comments_count + 1 }
          : post
      ),
    })),

  setLoading: (loading) => set({ loading }),
}));
