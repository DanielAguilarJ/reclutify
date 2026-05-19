'use client';
import { useState } from 'react';
import { Bookmark } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

export function SaveJobButton({ roleId, initialSaved = false }: { roleId: string; initialSaved?: boolean }) {
  const [saved, setSaved] = useState(initialSaved);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    if (saved) {
      await supabase.from('saved_jobs').delete().eq('user_id', user.id).eq('role_id', roleId);
      setSaved(false);
    } else {
      await supabase.from('saved_jobs').insert({ user_id: user.id, role_id: roleId });
      setSaved(true);
    }
    setLoading(false);
  };

  return (
    <button onClick={toggle} disabled={loading}
      className={`p-2 rounded-lg transition-colors ${saved ? 'text-primary bg-primary/10' : 'text-muted hover:text-foreground hover:bg-muted/10'}`}
      title={saved ? 'Unsave' : 'Save job'}>
      <Bookmark className={`h-5 w-5 ${saved ? 'fill-current' : ''}`} />
    </button>
  );
}
