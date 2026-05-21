/**
 * Types for the Feed / Social Content system.
 */

export type ReactionType = 'like' | 'celebrate' | 'insightful' | 'support';

export type PostType = 'update' | 'job_share' | 'achievement' | 'article';

export interface PostAuthor {
  user_id: string;
  username: string;
  full_name: string;
  headline: string | null;
  avatar_url: string | null;
}

export interface Post {
  id: string;
  user_id: string;
  content: string;
  media_urls: string[];
  post_type: PostType;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  created_at: string;
  updated_at: string;
  // Joined from profiles
  author?: PostAuthor;
  // Client-side enrichment
  user_reaction?: ReactionType | null;
}

export interface PostReaction {
  id: string;
  post_id: string;
  user_id: string;
  reaction_type: ReactionType;
  created_at: string;
}

export interface PostComment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined from profiles
  author?: PostAuthor;
}

export interface FeedResult {
  posts: Post[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface CreatePostPayload {
  content: string;
  post_type?: PostType;
  media_urls?: string[];
}

export interface CreateCommentPayload {
  post_id: string;
  content: string;
  parent_id?: string;
}
