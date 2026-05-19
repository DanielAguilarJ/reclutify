'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Post, PostComment, FeedResult, ReactionType } from '@/types/feed';

const POSTS_PER_PAGE = 10;

// ─── Sanitization ───

function sanitizeText(text: string, maxLength: number): string {
  return text.trim().slice(0, maxLength);
}

// ─── Get Feed Posts (cursor-based pagination) ───

export async function getFeedPosts(cursor?: string | null): Promise<FeedResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { posts: [], hasMore: false, nextCursor: null };

  let query = supabase
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(POSTS_PER_PAGE + 1); // Fetch one extra to detect hasMore

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data: postsData, error } = await query;

  if (error || !postsData) {
    return { posts: [], hasMore: false, nextCursor: null };
  }

  const hasMore = postsData.length > POSTS_PER_PAGE;
  const posts = postsData.slice(0, POSTS_PER_PAGE) as unknown as Post[];

  // Enrich posts with author info from profiles
  const userIds = [...new Set(posts.map(p => p.user_id))];
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, username, full_name, headline, avatar_url')
      .in('user_id', userIds);

    const profileMap = new Map(
      (profiles || []).map(p => [p.user_id, p])
    );

    for (const post of posts) {
      const profile = profileMap.get(post.user_id);
      if (profile) {
        post.author = {
          user_id: profile.user_id,
          username: profile.username,
          full_name: profile.full_name,
          headline: profile.headline,
          avatar_url: profile.avatar_url,
        };
      }
    }
  }

  // Get current user's reactions for these posts
  const postIds = posts.map(p => p.id);
  if (postIds.length > 0) {
    const { data: reactions } = await supabase
      .from('post_reactions')
      .select('post_id, reaction_type')
      .eq('user_id', user.id)
      .in('post_id', postIds);

    const reactionMap = new Map(
      (reactions || []).map(r => [r.post_id, r.reaction_type])
    );

    for (const post of posts) {
      post.user_reaction = (reactionMap.get(post.id) as ReactionType) || null;
    }
  }

  const nextCursor = hasMore ? posts[posts.length - 1]?.created_at : null;

  return { posts, hasMore, nextCursor };
}

// ─── Create Post ───

export async function createPost(payload: {
  content: string;
  post_type?: string;
  media_urls?: string[];
  poll_options?: { text: string; votes: number }[];
  poll_ends_at?: string;
  shared_from_id?: string;
  article_title?: string;
  article_content?: string;
  article_cover_url?: string;
}): Promise<{ success: boolean; post?: Post; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'No autenticado' };

  const content = sanitizeText(payload.content, 3000);
  if (!content) return { success: false, error: 'El contenido no puede estar vacío' };

  const postType = payload.post_type || 'update';

  const insertData: Record<string, unknown> = {
    user_id: user.id,
    content,
    post_type: postType,
  };

  if (payload.media_urls && payload.media_urls.length > 0) insertData.media_urls = payload.media_urls;
  if (payload.poll_options) insertData.poll_options = payload.poll_options;
  if (payload.poll_ends_at) insertData.poll_ends_at = payload.poll_ends_at;
  if (payload.shared_from_id) insertData.shared_from_id = payload.shared_from_id;
  if (payload.article_title) insertData.article_title = payload.article_title;
  if (payload.article_content) insertData.article_content = payload.article_content;
  if (payload.article_cover_url) insertData.article_cover_url = payload.article_cover_url;

  const { data, error } = await supabase
    .from('posts')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  // If sharing, increment shares_count on original post
  if (payload.shared_from_id) {
    try {
      const { data: origPost } = await supabase.from('posts').select('shares_count').eq('id', payload.shared_from_id).single();
      if (origPost) {
        await supabase.from('posts').update({ shares_count: (origPost.shares_count || 0) + 1 }).eq('id', payload.shared_from_id);
      }
    } catch { /* ignore */ }
  }

  revalidatePath('/feed');
  return { success: true, post: data as unknown as Post };
}

// ─── Toggle Reaction ───

export async function toggleReaction(
  postId: string,
  reactionType: ReactionType
): Promise<{ success: boolean; action: 'added' | 'removed'; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, action: 'removed', error: 'No autenticado' };

  // Check if reaction already exists
  const { data: existing } = await supabase
    .from('post_reactions')
    .select('id, reaction_type')
    .eq('post_id', postId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    // If same reaction type, remove it (toggle off)
    if (existing.reaction_type === reactionType) {
      await supabase.from('post_reactions').delete().eq('id', existing.id);
      return { success: true, action: 'removed' };
    }
    // Different type: update
    await supabase.from('post_reactions')
      .update({ reaction_type: reactionType })
      .eq('id', existing.id);
    return { success: true, action: 'added' };
  }

  // No existing reaction — insert
  const { error } = await supabase
    .from('post_reactions')
    .insert({
      post_id: postId,
      user_id: user.id,
      reaction_type: reactionType,
    });

  if (error) {
    return { success: false, action: 'removed', error: error.message };
  }

  return { success: true, action: 'added' };
}

// ─── Get Comments for a Post ───

export async function getPostComments(postId: string): Promise<PostComment[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('post_comments')
    .select('*')
    .eq('post_id', postId)
    .is('parent_id', null) // Top-level comments only
    .order('created_at', { ascending: true })
    .limit(50);

  if (error || !data) return [];

  const comments = data as unknown as PostComment[];

  // Enrich with author info
  const userIds = [...new Set(comments.map(c => c.user_id))];
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, username, full_name, headline, avatar_url')
      .in('user_id', userIds);

    const profileMap = new Map(
      (profiles || []).map(p => [p.user_id, p])
    );

    for (const comment of comments) {
      const profile = profileMap.get(comment.user_id);
      if (profile) {
        comment.author = {
          user_id: profile.user_id,
          username: profile.username,
          full_name: profile.full_name,
          headline: profile.headline,
          avatar_url: profile.avatar_url,
        };
      }
    }
  }

  return comments;
}

// ─── Add Comment ───

export async function addComment(payload: {
  post_id: string;
  content: string;
  parent_id?: string;
}): Promise<{ success: boolean; comment?: PostComment; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'No autenticado' };

  const content = sanitizeText(payload.content, 1000);
  if (!content) return { success: false, error: 'El comentario no puede estar vacío' };

  const { data, error } = await supabase
    .from('post_comments')
    .insert({
      post_id: payload.post_id,
      user_id: user.id,
      content,
      parent_id: payload.parent_id || null,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, comment: data as unknown as PostComment };
}

// ─── Delete Post ───

export async function deletePost(postId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'No autenticado' };

  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', postId)
    .eq('user_id', user.id); // RLS + explicit check

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/feed');
  return { success: true };
}

// ─── Share Post ───

export async function sharePost(postId: string, comment?: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'No autenticado' };

  // Get original post
  const { data: original } = await supabase.from('posts').select('id, content, user_id').eq('id', postId).single();
  if (!original) return { success: false, error: 'Post not found' };

  const content = comment?.trim() || `Shared a post`;

  const { error } = await supabase.from('posts').insert({
    user_id: user.id,
    content,
    post_type: 'update',
    shared_from_id: postId,
  });

  if (!error) {
    // Increment shares count
    await supabase.from('posts').update({ shares_count: (original as any).shares_count + 1 || 1 }).eq('id', postId);
  }

  revalidatePath('/feed');
  return { success: !error };
}

// ─── Vote on Poll ───

export async function votePoll(postId: string, optionIndex: number): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'No autenticado' };

  // Check if already voted
  const { data: existing } = await supabase.from('poll_votes').select('id').eq('post_id', postId).eq('user_id', user.id).single();
  if (existing) return { success: false, error: 'Ya votaste en esta encuesta' };

  const { error } = await supabase.from('poll_votes').insert({
    post_id: postId, user_id: user.id, option_index: optionIndex,
  });

  if (!error) {
    // Update poll_options vote count in post
    const { data: post } = await supabase.from('posts').select('poll_options').eq('id', postId).single();
    if (post?.poll_options && Array.isArray(post.poll_options)) {
      const options = [...post.poll_options];
      if (options[optionIndex]) {
        options[optionIndex] = { ...options[optionIndex], votes: (options[optionIndex].votes || 0) + 1 };
        await supabase.from('posts').update({ poll_options: options }).eq('id', postId);
      }
    }
  }

  return { success: !error };
}

// ─── Get Trending Hashtags ───

export async function getTrendingHashtags(limit = 10) {
  const supabase = await createClient();
  const { data } = await supabase.from('hashtags').select('tag, post_count').order('post_count', { ascending: false }).limit(limit);
  return data || [];
}
