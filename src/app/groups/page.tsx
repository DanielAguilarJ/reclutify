'use client';
import { useState, useEffect } from 'react';
import { Users, Plus, Globe, Lock } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';

export default function GroupsPage() {
  const { language } = useAppStore();
  const [tab, setTab] = useState<'discover' | 'my'>('discover');
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: '', description: '', privacy: 'public' });

  useEffect(() => { loadGroups(); }, [tab]);

  const loadGroups = async () => {
    setLoading(true);
    const supabase = createClient();
    if (tab === 'my') {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: memberships } = await supabase.from('group_members').select('group_id').eq('user_id', user.id);
        if (memberships && memberships.length > 0) {
          const ids = memberships.map((m: any) => m.group_id);
          const { data } = await supabase.from('groups').select('*').in('id', ids);
          setGroups(data || []);
        } else setGroups([]);
      }
    } else {
      const { data } = await supabase.from('groups').select('*').eq('privacy', 'public').order('members_count', { ascending: false }).limit(20);
      setGroups(data || []);
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!newGroup.name.trim()) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const slug = newGroup.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36);
    await supabase.from('groups').insert({ name: newGroup.name, slug, description: newGroup.description, creator_id: user.id, privacy: newGroup.privacy });
    setShowCreate(false); setNewGroup({ name: '', description: '', privacy: 'public' }); loadGroups();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-foreground">{language === 'es' ? 'Grupos' : 'Groups'}</h1>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors">
            <Plus className="h-4 w-4" />{language === 'es' ? 'Crear Grupo' : 'Create Group'}
          </button>
        </div>

        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab('discover')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'discover' ? 'bg-primary text-white' : 'bg-card border border-border text-muted'}`}>
            {language === 'es' ? 'Descubrir' : 'Discover'}
          </button>
          <button onClick={() => setTab('my')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'my' ? 'bg-primary text-white' : 'bg-card border border-border text-muted'}`}>
            {language === 'es' ? 'Mis Grupos' : 'My Groups'}
          </button>
        </div>

        {showCreate && (
          <div className="bg-card rounded-xl border border-border p-6 mb-6 space-y-4">
            <h3 className="text-sm font-semibold">{language === 'es' ? 'Nuevo Grupo' : 'New Group'}</h3>
            <input value={newGroup.name} onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })} placeholder={language === 'es' ? 'Nombre del grupo' : 'Group name'} className="w-full px-4 py-2 rounded-lg border border-border bg-background text-sm" />
            <textarea value={newGroup.description} onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })} placeholder={language === 'es' ? 'Descripcion' : 'Description'} className="w-full px-4 py-2 rounded-lg border border-border bg-background text-sm min-h-[80px]" />
            <div className="flex gap-2">
              <button onClick={() => setNewGroup({ ...newGroup, privacy: 'public' })} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${newGroup.privacy === 'public' ? 'bg-primary text-white' : 'bg-muted/10 text-muted'}`}><Globe className="h-3 w-3 inline mr-1" />Public</button>
              <button onClick={() => setNewGroup({ ...newGroup, privacy: 'private' })} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${newGroup.privacy === 'private' ? 'bg-primary text-white' : 'bg-muted/10 text-muted'}`}><Lock className="h-3 w-3 inline mr-1" />Private</button>
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreate} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium">{language === 'es' ? 'Crear' : 'Create'}</button>
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg text-sm text-muted">{language === 'es' ? 'Cancelar' : 'Cancel'}</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12"><div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" /></div>
        ) : groups.length === 0 ? (
          <div className="text-center py-12"><Users className="h-12 w-12 text-muted/30 mx-auto mb-3" /><p className="text-sm text-muted">{tab === 'my' ? (language === 'es' ? 'No te has unido a ningun grupo' : 'You have not joined any groups') : (language === 'es' ? 'No hay grupos disponibles' : 'No groups available')}</p></div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {groups.map((g) => (
              <Link key={g.id} href={`/groups/${g.slug}`} className="bg-card rounded-xl border border-border/50 p-5 hover:border-primary/30 transition-colors">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><Users className="h-5 w-5 text-primary" /></div>
                  <div><p className="text-sm font-semibold text-foreground">{g.name}</p><p className="text-xs text-muted">{g.members_count} {language === 'es' ? 'miembros' : 'members'}</p></div>
                </div>
                {g.description && <p className="text-xs text-muted line-clamp-2">{g.description}</p>}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
