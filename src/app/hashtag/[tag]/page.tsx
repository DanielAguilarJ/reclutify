'use client';
import { useState, useEffect, use } from 'react';
import { Hash } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';

export default function HashtagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = use(params);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: hashtag } = await supabase.from('hashtags').select('id').eq('tag', tag.toLowerCase()).single();
      if (hashtag) {
        const { data: postHashtags } = await supabase.from('post_hashtags').select('post_id').eq('hashtag_id', hashtag.id);
        if (postHashtags && postHashtags.length > 0) {
          const ids = postHashtags.map((ph: any) => ph.post_id);
          const { data } = await supabase.from('posts').select('*').in('id', ids).order('created_at', { ascending: false }).limit(50);
          setPosts(data || []);
        }
      }
      setLoading(false);
    };
    load();
  }, [tag]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center"><Hash className="h-6 w-6 text-primary" /></div>
          <div><h1 className="text-2xl font-bold text-foreground">#{tag}</h1><p className="text-sm text-muted">{posts.length} posts</p></div>
        </div>
        {loading ? <div className="text-center py-12"><div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" /></div> :
          posts.length === 0 ? <p className="text-center text-muted py-8">No posts with this hashtag yet.</p> :
          <div className="space-y-4">
            {posts.map((p) => (
              <div key={p.id} className="bg-card rounded-xl border border-border/50 p-5">
                <p className="text-sm text-foreground whitespace-pre-wrap">{p.content}</p>
                <p className="text-xs text-muted mt-3">{new Date(p.created_at).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        }
      </div>
    </div>
  );
}
