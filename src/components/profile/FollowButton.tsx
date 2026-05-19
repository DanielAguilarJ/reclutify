'use client';
import { useState } from 'react';
import { UserPlus, UserCheck } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

export function FollowButton({ targetUserId, initialFollowing = false }: { targetUserId: string; initialFollowing?: boolean }) {
  const [following, setFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    if (following) {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', targetUserId);
      setFollowing(false);
    } else {
      await supabase.from('follows').insert({ follower_id: user.id, following_id: targetUserId });
      setFollowing(true);
    }
    setLoading(false);
  };

  return (
    <button onClick={toggle} disabled={loading}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        following ? 'bg-muted/20 text-foreground border border-border' : 'bg-primary/10 text-primary hover:bg-primary/20'
      }`}>
      {following ? <><UserCheck className="h-3.5 w-3.5" />Following</> : <><UserPlus className="h-3.5 w-3.5" />Follow</>}
    </button>
  );
}
