'use client';
import { useState, useEffect } from 'react';
import { Star, Plus } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

interface Props {
  userId: string;
  skills: string[];
  isOwnProfile: boolean;
}

export function SkillEndorsements({ userId, skills, isOwnProfile }: Props) {
  const [endorsements, setEndorsements] = useState<Record<string, { count: number; endorsed: boolean }>>({});
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { data } = await supabase.from('endorsements').select('skill, endorser_id').eq('endorsee_id', userId);
      const map: Record<string, { count: number; endorsed: boolean }> = {};
      skills.forEach(s => { map[s] = { count: 0, endorsed: false }; });
      data?.forEach((e: any) => {
        if (!map[e.skill]) map[e.skill] = { count: 0, endorsed: false };
        map[e.skill].count++;
        if (user && e.endorser_id === user.id) map[e.skill].endorsed = true;
      });
      setEndorsements(map);
    };
    if (skills.length > 0) load();
  }, [userId, skills]);

  const toggleEndorse = async (skill: string) => {
    setLoading(skill);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(null); return; }
    const current = endorsements[skill];
    if (current?.endorsed) {
      await supabase.from('endorsements').delete().eq('endorser_id', user.id).eq('endorsee_id', userId).eq('skill', skill);
      setEndorsements(prev => ({ ...prev, [skill]: { count: prev[skill].count - 1, endorsed: false } }));
    } else {
      await supabase.from('endorsements').insert({ endorser_id: user.id, endorsee_id: userId, skill });
      setEndorsements(prev => ({ ...prev, [skill]: { count: (prev[skill]?.count || 0) + 1, endorsed: true } }));
    }
    setLoading(null);
  };

  if (skills.length === 0) return null;

  return (
    <div className="space-y-2">
      {skills.map((skill) => {
        const e = endorsements[skill];
        return (
          <div key={skill} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/5 border border-border/30">
            <div className="flex items-center gap-2">
              <span className="text-sm text-foreground">{skill}</span>
              {e && e.count > 0 && (
                <span className="flex items-center gap-0.5 text-xs text-primary font-medium">
                  <Star className="h-3 w-3 fill-primary" />{e.count}
                </span>
              )}
            </div>
            {!isOwnProfile && (
              <button onClick={() => toggleEndorse(skill)} disabled={loading === skill}
                className={`p-1.5 rounded-md transition-colors ${e?.endorsed ? 'text-primary bg-primary/10' : 'text-muted hover:text-primary hover:bg-primary/5'}`}>
                {e?.endorsed ? <Star className="h-4 w-4 fill-current" /> : <Plus className="h-4 w-4" />}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
