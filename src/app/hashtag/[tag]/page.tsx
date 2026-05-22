'use client';

import { useState, useEffect, use } from 'react';
import { Hash, Heart, UserCircle, Bell, BellOff, Calendar, MessageSquare } from 'lucide-react';
import Image from 'next/image';
import { useAppStore } from '@/store/appStore';
import { createClient } from '@/utils/supabase/client';
import AppNavbar from '@/components/ui/AppNavbar';

export default function HashtagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = use(params);
  const { language } = useAppStore();
  const t = (en: string, es: string) => language === 'es' ? es : en;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [postCount, setPostCount] = useState(0);

  useEffect(() => {
    loadPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag]);

  const loadPosts = async () => {
    setLoading(true);
    try {
      const supabase = createClient();

      // Try direct content search first
      const { data, error } = await supabase
        .from('posts')
        .select('*, profiles:user_id(full_name, avatar_url, username)')
        .ilike('content', `%#${tag}%`)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        setPosts(data);
        setPostCount(data.length);
      } else {
        // Fallback: try hashtags table approach
        try {
          const { data: hashtag } = await supabase
            .from('hashtags')
            .select('id')
            .eq('tag', tag.toLowerCase())
            .single();

          if (hashtag) {
            const { data: postHashtags } = await supabase
              .from('post_hashtags')
              .select('post_id')
              .eq('hashtag_id', hashtag.id);

            if (postHashtags && postHashtags.length > 0) {
              const ids = postHashtags.map((ph: { post_id: string }) => ph.post_id);
              const { data: hashtagPosts } = await supabase
                .from('posts')
                .select('*, profiles:user_id(full_name, avatar_url, username)')
                .in('id', ids)
                .order('created_at', { ascending: false })
                .limit(50);
              setPosts(hashtagPosts || []);
              setPostCount(hashtagPosts?.length || 0);
            }
          }
        } catch {
          // Tables might not exist, that's ok
          setPosts([]);
        }
      }
    } catch (error) {
      console.error('Error loading hashtag posts:', error);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const days = Math.floor(hours / 24);

      if (hours < 1) return t('Just now', 'Ahora');
      if (hours < 24) return `${hours}h`;
      if (days < 7) return `${days}d`;
      return date.toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppNavbar activeRoute="" />

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Hashtag Header */}
        <div className="bg-card rounded-xl border border-border p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
                <Hash className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">#{tag}</h1>
                <p className="text-sm text-muted mt-1">
                  {postCount > 0
                    ? `${postCount} ${t('posts', 'publicaciones')}`
                    : t('Popular Hashtag', 'Hashtag Popular')}
                </p>
              </div>
            </div>
            <button
              onClick={() => setFollowing(!following)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                following
                  ? 'bg-primary/10 text-primary border border-primary/30'
                  : 'bg-primary text-white hover:bg-primary/90'
              }`}
            >
              {following ? (
                <>
                  <BellOff className="h-4 w-4" />
                  {t('Following', 'Siguiendo')}
                </>
              ) : (
                <>
                  <Bell className="h-4 w-4" />
                  {t('Follow Hashtag', 'Seguir Hashtag')}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Posts List */}
        {loading ? (
          <div className="text-center py-16">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-16 bg-card rounded-xl border border-border">
            <Hash className="h-14 w-14 text-muted/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t('No posts yet', 'Aún no hay publicaciones')}
            </h3>
            <p className="text-sm text-muted max-w-md mx-auto">
              {t(
                `Be the first to post with #${tag} and start the conversation.`,
                `Sé el primero en publicar con #${tag} y comienza la conversación.`
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => {
              const profile = post.profiles;
              return (
                <div
                  key={post.id}
                  className="bg-card rounded-xl border border-border p-5 hover:border-border/80 transition-colors"
                >
                  {/* Author Header */}
                  <div className="flex items-center gap-3 mb-3">
                    {profile?.avatar_url ? (
                      <Image
                        src={profile.avatar_url}
                        alt={profile.full_name || ''}
                        width={40}
                        height={40}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center">
                        <UserCircle className="h-6 w-6 text-muted" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {profile?.full_name || t('Anonymous', 'Anónimo')}
                      </p>
                      <p className="text-xs text-muted">
                        {formatDate(post.created_at)}
                      </p>
                    </div>
                  </div>

                  {/* Content */}
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed mb-4 line-clamp-6">
                    {post.content}
                  </p>

                  {/* Engagement */}
                  <div className="flex items-center gap-4 pt-3 border-t border-border">
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      <Heart className="h-3.5 w-3.5" />
                      {post.likes_count || 0} {t('likes', 'me gusta')}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      <MessageSquare className="h-3.5 w-3.5" />
                      {post.comments_count || 0} {t('comments', 'comentarios')}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-muted ml-auto">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(post.created_at).toLocaleDateString(
                        language === 'es' ? 'es-MX' : 'en-US',
                        { month: 'short', day: 'numeric', year: 'numeric' }
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
