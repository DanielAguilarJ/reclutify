'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Post, PostComment, FeedResult, ReactionType } from '@/types/feed';
import { sanitizeText } from '@/lib/utils';

const POSTS_PER_PAGE = 10;

// ─── Get Feed Posts (cursor-based pagination) ───

export async function getFeedPosts(cursor?: string | null): Promise<FeedResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { posts: [], hasMore: false, nextCursor: null };

    // Get user's accepted connections for feed filtering
    const { data: connections } = await supabase
      .from('connections')
      .select('requester_id, addressee_id')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .eq('status', 'accepted');

    // Build list of user IDs whose posts we want to see (self + connections)
    const connectedUserIds = new Set<string>([user.id]);
    if (connections) {
      for (const conn of connections) {
        if (conn.requester_id === user.id) connectedUserIds.add(conn.addressee_id);
        else connectedUserIds.add(conn.requester_id);
      }
    }

    let query = supabase
      .from('posts')
      .select('*')
      .in('user_id', Array.from(connectedUserIds))
      .order('created_at', { ascending: false })
      .limit(POSTS_PER_PAGE + 1);

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
  } catch {
    return { posts: [], hasMore: false, nextCursor: null };
  }
}

// ─── Upload Post Media ───

export async function uploadPostMedia(
  formData: FormData
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'No autenticado' };

    const file = formData.get('file') as File | null;
    if (!file) return { success: false, error: 'No file provided' };

    // Validate file (max 5MB, images only)
    if (file.size > 5 * 1024 * 1024) {
      return { success: false, error: 'Archivo muy grande (max 5MB)' };
    }
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return { success: false, error: 'Solo se aceptan imágenes JPG, PNG, WebP o GIF' };
    }

    const ext = file.name.split('.').pop() || 'jpg';
    const filePath = `posts/${user.id}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('post-media')
      .upload(filePath, file, { upsert: false });

    if (uploadError) {
      return { success: false, error: uploadError.message };
    }

    const { data: publicUrl } = supabase.storage
      .from('post-media')
      .getPublicUrl(filePath);

    return { success: true, url: publicUrl.publicUrl };
  } catch {
    return { success: false, error: 'Error al subir archivo' };
  }
}

// ─── Create Post ───

export async function createPost(payload: {
  content: string;
  post_type?: string;
  image_url?: string;
}): Promise<{ success: boolean; post?: Post; error?: string }> {
  try {
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
    if (payload.image_url) {
      insertData.image_url = payload.image_url;
    }

    const { data, error } = await supabase
      .from('posts')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/feed');
    return { success: true, post: data as unknown as Post };
  } catch {
    return { success: false, error: 'Error inesperado al crear publicación' };
  }
}

// ─── Toggle Reaction ───

export async function toggleReaction(
  postId: string,
  reactionType: ReactionType
): Promise<{ success: boolean; action: 'added' | 'removed'; error?: string }> {
  try {
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
  } catch {
    return { success: false, action: 'removed', error: 'Error inesperado al reaccionar' };
  }
}

// ─── Get Comments for a Post ───

export async function getPostComments(postId: string): Promise<PostComment[]> {
  try {
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
  } catch {
    return [];
  }
}

// ─── Add Comment ───

export async function addComment(payload: {
  post_id: string;
  content: string;
  parent_id?: string;
}): Promise<{ success: boolean; comment?: PostComment; error?: string }> {
  try {
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
  } catch {
    return { success: false, error: 'Error inesperado al agregar comentario' };
  }
}

// ─── Update Comment ───

export async function updateComment(
  commentId: string,
  content: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'No autenticado' };

    const sanitized = sanitizeText(content, 1000);
    if (!sanitized) return { success: false, error: 'El comentario no puede estar vacío' };

    const { error } = await supabase
      .from('post_comments')
      .update({ content: sanitized })
      .eq('id', commentId)
      .eq('user_id', user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Error inesperado al actualizar comentario' };
  }
}

// ─── Delete Comment ───

export async function deleteComment(
  commentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'No autenticado' };

    const { error } = await supabase
      .from('post_comments')
      .delete()
      .eq('id', commentId)
      .eq('user_id', user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Error inesperado al eliminar comentario' };
  }
}

// ─── Delete Post ───

export async function deletePost(postId: string): Promise<{ success: boolean; error?: string }> {
  try {
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
  } catch {
    return { success: false, error: 'Error inesperado al eliminar publicación' };
  }
}

// ─── Update Post ───

export async function updatePost(
  postId: string,
  content: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'No autenticado' };

    const sanitized = sanitizeText(content, 3000);
    if (!sanitized) return { success: false, error: 'El contenido no puede estar vacío' };

    const { error } = await supabase
      .from('posts')
      .update({ content: sanitized })
      .eq('id', postId)
      .eq('user_id', user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/feed');
    return { success: true };
  } catch {
    return { success: false, error: 'Error inesperado al actualizar publicación' };
  }
}
