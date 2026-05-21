'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, User, Briefcase, MapPin, Users } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';

export function SearchClient() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const { language } = useAppStore();
  const [query, setQuery] = useState(initialQuery);
  const [tab, setTab] = useState<'people' | 'jobs'>('people');
  const [people, setPeople] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!initialQuery) return;
    setQuery(initialQuery);
    handleSearch(initialQuery);
  }, [initialQuery]);

  const handleSearch = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    const supabase = createClient();
    const { data: profiles } = await supabase.from('profiles')
      .select('user_id, username, full_name, headline, avatar_url, location, skills, is_open_to_work')
      .or(`full_name.ilike.%${q}%,headline.ilike.%${q}%,username.ilike.%${q}%`).limit(20);
    setPeople(profiles || []);
    const { data: roles } = await supabase.from('roles').select('id, title, location, salary, job_type, created_at')
      .eq('is_published', true).or(`title.ilike.%${q}%,description.ilike.%${q}%,location.ilike.%${q}%`).limit(20);
    setJobs(roles || []);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <form onSubmit={(e) => { e.preventDefault(); handleSearch(query); }}>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted" />
              <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder={language === 'es' ? 'Buscar personas, empleos, empresas...' : 'Search people, jobs, companies...'}
                className="w-full pl-12 pr-4 py-3 rounded-xl border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </form>
        </div>

        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab('people')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'people' ? 'bg-primary text-white' : 'bg-card border border-border text-muted hover:text-foreground'}`}>
            <Users className="h-4 w-4" />{language === 'es' ? 'Personas' : 'People'} ({people.length})
          </button>
          <button onClick={() => setTab('jobs')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'jobs' ? 'bg-primary text-white' : 'bg-card border border-border text-muted hover:text-foreground'}`}>
            <Briefcase className="h-4 w-4" />{language === 'es' ? 'Empleos' : 'Jobs'} ({jobs.length})
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12"><div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" /></div>
        ) : tab === 'people' ? (
          <div className="space-y-3">
            {people.length === 0 && query && <p className="text-center text-muted py-8">{language === 'es' ? 'No se encontraron personas' : 'No people found'}</p>}
            {people.map((p) => (
              <Link key={p.user_id} href={`/profile/${p.username}`} className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border/50 hover:border-primary/30 transition-colors">
                {p.avatar_url ? <img src={p.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover" /> : <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center"><User className="h-6 w-6 text-primary" /></div>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{p.full_name}</p>
                    {p.is_open_to_work && <span className="text-[10px] font-bold text-success bg-success/10 px-1.5 py-0.5 rounded-full">Open to work</span>}
                  </div>
                  <p className="text-xs text-muted truncate">{p.headline}</p>
                  {p.location && <p className="text-xs text-muted flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" />{p.location}</p>}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.length === 0 && query && <p className="text-center text-muted py-8">{language === 'es' ? 'No se encontraron empleos' : 'No jobs found'}</p>}
            {jobs.map((j) => (
              <Link key={j.id} href={`/career-fair/${j.id}`} className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border/50 hover:border-primary/30 transition-colors">
                <div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center"><Briefcase className="h-6 w-6 text-success" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{j.title}</p>
                  <div className="flex items-center gap-3 text-xs text-muted mt-0.5">
                    {j.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{j.location}</span>}
                    {j.job_type && <span>{j.job_type}</span>}
                    {j.salary && <span>{j.salary}</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
