'use client';

import { useState, useEffect } from 'react';
import { Users, Plus, Globe, Lock, Search, Calendar, MessageSquare } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { createClient } from '@/utils/supabase/client';
import AppNavbar from '@/components/ui/AppNavbar';
import Link from 'next/link';

export default function GroupsPage() {
  const { language } = useAppStore();
  const t = (en: string, es: string) => language === 'es' ? es : en;

  const [tab, setTab] = useState<'my' | 'discover'>('my');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: '', description: '', privacy: 'public' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const loadGroups = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      if (tab === 'my') {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: memberships } = await supabase
            .from('group_members')
            .select('group_id')
            .eq('user_id', user.id);
          if (memberships && memberships.length > 0) {
            const ids = memberships.map((m: { group_id: string }) => m.group_id);
            const { data } = await supabase
              .from('groups')
              .select('*')
              .in('id', ids)
              .order('updated_at', { ascending: false });
            setGroups(data || []);
          } else {
            setGroups([]);
          }
        } else {
          setGroups([]);
        }
      } else {
        const { data } = await supabase
          .from('groups')
          .select('*')
          .eq('privacy', 'public')
          .order('members_count', { ascending: false })
          .limit(20);
        setGroups(data || []);
      }
    } catch (error) {
      console.error('Error loading groups:', error);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newGroup.name.trim()) return;
    setCreating(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const slug = newGroup.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36);
      await supabase.from('groups').insert({
        name: newGroup.name,
        slug,
        description: newGroup.description,
        creator_id: user.id,
        privacy: newGroup.privacy,
      });
      setShowCreate(false);
      setNewGroup({ name: '', description: '', privacy: 'public' });
      loadGroups();
    } catch (error) {
      console.error('Error creating group:', error);
    } finally {
      setCreating(false);
    }
  };

  // Mock suggested groups for Discover section
  const suggestedGroups = [
    {
      id: 'sg1',
      name: t('Tech Professionals LATAM', 'Profesionales Tech LATAM'),
      members_count: 2340,
      description: t(
        'A community for tech professionals across Latin America to share knowledge and opportunities.',
        'Una comunidad para profesionales de tecnología en Latinoamérica para compartir conocimiento y oportunidades.'
      ),
      privacy: 'public',
      last_activity: '2h',
    },
    {
      id: 'sg2',
      name: t('UX/UI Design Hub', 'Hub de Diseño UX/UI'),
      members_count: 1850,
      description: t(
        'Share design resources, get feedback, and connect with other designers.',
        'Comparte recursos de diseño, recibe feedback y conecta con otros diseñadores.'
      ),
      privacy: 'public',
      last_activity: '5h',
    },
    {
      id: 'sg3',
      name: t('Remote Work & Digital Nomads', 'Trabajo Remoto y Nómadas Digitales'),
      members_count: 3120,
      description: t(
        'Tips, tools, and discussions about working remotely from anywhere in the world.',
        'Tips, herramientas y discusiones sobre trabajar remotamente desde cualquier parte del mundo.'
      ),
      privacy: 'public',
      last_activity: '1h',
    },
    {
      id: 'sg4',
      name: t('Startup Founders Network', 'Red de Fundadores de Startups'),
      members_count: 980,
      description: t(
        'Connect with fellow founders, share experiences, and find co-founders.',
        'Conecta con otros fundadores, comparte experiencias y encuentra co-fundadores.'
      ),
      privacy: 'public',
      last_activity: '30m',
    },
    {
      id: 'sg5',
      name: t('Data Science & AI', 'Ciencia de Datos e IA'),
      members_count: 4560,
      description: t(
        'Everything about data science, machine learning, and artificial intelligence.',
        'Todo sobre ciencia de datos, machine learning e inteligencia artificial.'
      ),
      privacy: 'public',
      last_activity: '15m',
    },
    {
      id: 'sg6',
      name: t('Career Growth Mentorship', 'Mentoría de Crecimiento Profesional'),
      members_count: 1470,
      description: t(
        'Find mentors, share career advice, and grow professionally together.',
        'Encuentra mentores, comparte consejos de carrera y crece profesionalmente.'
      ),
      privacy: 'private',
      last_activity: '3h',
    },
  ];

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppNavbar activeRoute="/groups" />

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {t('Groups', 'Grupos')}
            </h1>
            <p className="text-sm text-muted mt-1">
              {t('Connect with communities that share your interests', 'Conecta con comunidades que comparten tus intereses')}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t('Create Group', 'Crear Grupo')}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab('my')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              tab === 'my'
                ? 'bg-primary text-white'
                : 'bg-card border border-border text-muted hover:text-foreground'
            }`}
          >
            {t('My Groups', 'Mis Grupos')}
          </button>
          <button
            onClick={() => setTab('discover')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              tab === 'discover'
                ? 'bg-primary text-white'
                : 'bg-card border border-border text-muted hover:text-foreground'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5" />
              {t('Discover', 'Descubrir')}
            </span>
          </button>
        </div>

        {/* Create Group Modal */}
        {showCreate && (
          <div className="bg-card rounded-xl border border-border p-6 mb-6 space-y-4 shadow-sm">
            <h3 className="text-lg font-semibold text-foreground">
              {t('Create New Group', 'Crear Nuevo Grupo')}
            </h3>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                {t('Group Name', 'Nombre del Grupo')}
              </label>
              <input
                value={newGroup.name}
                onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                placeholder={t('Enter group name...', 'Ingresa el nombre del grupo...')}
                className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                {t('Description', 'Descripción')}
              </label>
              <textarea
                value={newGroup.description}
                onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })}
                placeholder={t('What is this group about?', '¿De qué trata este grupo?')}
                className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm min-h-[100px] resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {t('Privacy', 'Privacidad')}
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setNewGroup({ ...newGroup, privacy: 'public' })}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    newGroup.privacy === 'public'
                      ? 'bg-primary/10 text-primary border border-primary/30'
                      : 'bg-surface border border-border text-muted'
                  }`}
                >
                  <Globe className="h-4 w-4" />
                  {t('Public', 'Público')}
                </button>
                <button
                  onClick={() => setNewGroup({ ...newGroup, privacy: 'private' })}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    newGroup.privacy === 'private'
                      ? 'bg-primary/10 text-primary border border-primary/30'
                      : 'bg-surface border border-border text-muted'
                  }`}
                >
                  <Lock className="h-4 w-4" />
                  {t('Private', 'Privado')}
                </button>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleCreate}
                disabled={!newGroup.name.trim() || creating}
                className="px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {creating ? t('Creating...', 'Creando...') : t('Create Group', 'Crear Grupo')}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-5 py-2.5 rounded-lg text-sm font-medium text-muted hover:text-foreground transition-colors"
              >
                {t('Cancel', 'Cancelar')}
              </button>
            </div>
          </div>
        )}

        {/* My Groups Tab */}
        {tab === 'my' && (
          <>
            {loading ? (
              <div className="text-center py-16">
                <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
              </div>
            ) : groups.length === 0 ? (
              <div className="text-center py-16 bg-card rounded-xl border border-border">
                <Users className="h-16 w-16 text-muted/30 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {t("You haven't joined any groups yet", 'Aún no te has unido a ningún grupo')}
                </h3>
                <p className="text-sm text-muted mb-6 max-w-md mx-auto">
                  {t(
                    'Join groups to connect with professionals who share your interests and goals.',
                    'Únete a grupos para conectar con profesionales que comparten tus intereses y objetivos.'
                  )}
                </p>
                <button
                  onClick={() => setTab('discover')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <Search className="h-4 w-4" />
                  {t('Discover Groups', 'Descubrir Grupos')}
                </button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {groups.map((g) => (
                  <Link
                    key={g.id}
                    href={`/groups/${g.slug}`}
                    className="bg-card rounded-xl border border-border p-5 hover:border-primary/30 transition-all hover:shadow-sm"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{g.name}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-muted">
                            {g.members_count || 0} {t('members', 'miembros')}
                          </span>
                          {g.privacy === 'private' && (
                            <span className="flex items-center gap-1 text-xs text-muted">
                              <Lock className="h-3 w-3" />
                              {t('Private', 'Privado')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {g.description && (
                      <p className="text-xs text-muted line-clamp-2 mb-3">{g.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-muted">
                      {g.updated_at && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {t('Active', 'Activo')} {formatDate(g.updated_at)}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        {/* Discover Tab */}
        {tab === 'discover' && (
          <>
            {loading ? (
              <div className="text-center py-16">
                <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
              </div>
            ) : (
              <>
                {/* Show fetched groups if available, otherwise show suggested */}
                <div className="mb-8">
                  <h2 className="text-lg font-semibold text-foreground mb-4">
                    {t('Suggested Groups', 'Grupos Sugeridos')}
                  </h2>
                  <div className="grid gap-4 md:grid-cols-2">
                    {(groups.length > 0 ? groups : suggestedGroups).map((g) => (
                      <div
                        key={g.id}
                        className="bg-card rounded-xl border border-border p-5 hover:border-primary/30 transition-all hover:shadow-sm"
                      >
                        <div className="flex items-start gap-3 mb-3">
                          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <Users className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{g.name}</p>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="text-xs text-muted">
                                {g.members_count?.toLocaleString() || 0} {t('members', 'miembros')}
                              </span>
                              {g.privacy === 'private' && (
                                <span className="flex items-center gap-1 text-xs text-muted">
                                  <Lock className="h-3 w-3" />
                                  {t('Private', 'Privado')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {g.description && (
                          <p className="text-xs text-muted line-clamp-2 mb-4">{g.description}</p>
                        )}
                        <div className="flex items-center justify-between">
                          {g.last_activity && (
                            <span className="text-xs text-muted flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              {t('Active', 'Activo')} {g.last_activity} {t('ago', 'atrás')}
                            </span>
                          )}
                          <button className="px-4 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors">
                            {t('Join', 'Unirse')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
