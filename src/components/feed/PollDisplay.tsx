'use client';
import { useState, useEffect } from 'react';
import { BarChart3, Check } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

interface PollOption { text: string; votes: number; }

export function PollDisplay({ postId, options, endsAt }: { postId: string; options: PollOption[]; endsAt?: string }) {
  const [pollOptions, setPollOptions] = useState<PollOption[]>(options);
  const [myVote, setMyVote] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const totalVotes = pollOptions.reduce((sum, o) => sum + o.votes, 0);
  const isExpired = endsAt ? new Date(endsAt) < new Date() : false;
  const hasVoted = myVote !== null;

  useEffect(() => {
    const check = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('poll_votes').select('option_index').eq('post_id', postId).eq('user_id', user.id).single();
      if (data) setMyVote(data.option_index);
    };
    check();
  }, [postId]);

  const vote = async (idx: number) => {
    if (hasVoted || isExpired || loading) return;
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { error } = await supabase.from('poll_votes').insert({ post_id: postId, user_id: user.id, option_index: idx });
    if (!error) {
      setMyVote(idx);
      setPollOptions(prev => prev.map((o, i) => i === idx ? { ...o, votes: o.votes + 1 } : o));
    }
    setLoading(false);
  };

  return (
    <div className="space-y-2 mt-3">
      {pollOptions.map((opt, idx) => {
        const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
        const isMyVote = myVote === idx;
        return (
          <button key={idx} onClick={() => vote(idx)} disabled={hasVoted || isExpired}
            className={`relative w-full text-left px-4 py-2.5 rounded-lg border transition-colors overflow-hidden ${
              isMyVote ? 'border-primary bg-primary/5' : hasVoted ? 'border-border/50 bg-muted/5' : 'border-border hover:border-primary/30 cursor-pointer'
            }`}>
            {(hasVoted || isExpired) && (
              <div className="absolute inset-0 bg-primary/10 rounded-lg" style={{ width: `${pct}%` }} />
            )}
            <div className="relative flex items-center justify-between">
              <span className="text-sm text-foreground flex items-center gap-2">
                {isMyVote && <Check className="h-4 w-4 text-primary" />}{opt.text}
              </span>
              {(hasVoted || isExpired) && <span className="text-xs font-bold text-muted">{pct}%</span>}
            </div>
          </button>
        );
      })}
      <p className="text-xs text-muted flex items-center gap-1.5">
        <BarChart3 className="h-3 w-3" />{totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
        {isExpired && <span className="ml-2 text-danger font-medium">Ended</span>}
      </p>
    </div>
  );
}
