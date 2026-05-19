'use client';
import { useState, useRef, useEffect } from 'react';
import { Search, User, Briefcase } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/appStore';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';

interface SearchResult { type: 'person' | 'job'; id: string; title: string; subtitle: string; url: string; avatar?: string; }

export function GlobalSearchBar() {
  const { language } = useAppStore();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const debounce = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!query.trim() || query.length < 2) { setResults([]); setIsOpen(false); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setLoading(true);
      const supabase = createClient();
      const r: SearchResult[] = [];
      const { data: profiles } = await supabase.from('profiles')
        .select('user_id, username, full_name, headline, avatar_url')
        .or(`full_name.ilike.%${query}%,headline.ilike.%${query}%,username.ilike.%${query}%`).limit(5);
      if (profiles) profiles.forEach((p: any) => r.push({ type: 'person', id: p.user_id, title: p.full_name, subtitle: p.headline || p.username, url: `/profile/${p.username}`, avatar: p.avatar_url }));
      const { data: jobs } = await supabase.from('roles').select('id, title, location')
        .eq('is_published', true).or(`title.ilike.%${query}%,location.ilike.%${query}%`).limit(5);
      if (jobs) jobs.forEach((j: any) => r.push({ type: 'job', id: j.id, title: j.title, subtitle: j.location || '', url: `/career-fair/${j.id}` }));
      setResults(r); setIsOpen(r.length > 0); setLoading(false);
    }, 300);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className="relative w-full" ref={ref}>
      <form onSubmit={(e) => { e.preventDefault(); if (query.trim()) { router.push(`/search?q=${encodeURIComponent(query)}`); setIsOpen(false); } }}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} onFocus={() => results.length > 0 && setIsOpen(true)}
            placeholder={language === 'es' ? 'Buscar personas, empleos...' : 'Search people, jobs...'}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/20" />
          {loading && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />}
        </div>
      </form>
      {isOpen && (
        <div className="absolute top-full mt-1 w-full bg-card rounded-xl border border-border shadow-xl overflow-hidden z-50">
          {results.map((r) => (
            <Link key={`${r.type}-${r.id}`} href={r.url} onClick={() => { setIsOpen(false); setQuery(''); }}
              className="flex items-center gap-3 px-4 py-3 hover:bg-muted/5 transition-colors border-b border-border/20 last:border-0">
              {r.type === 'person' ? (r.avatar ? <img src={r.avatar} alt="" className="w-8 h-8 rounded-full object-cover" /> : <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center"><User className="h-4 w-4 text-primary" /></div>) : <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center"><Briefcase className="h-4 w-4 text-success" /></div>}
              <div className="flex-1 min-w-0"><p className="text-sm font-medium text-foreground truncate">{r.title}</p><p className="text-xs text-muted truncate">{r.subtitle}</p></div>
            </Link>
          ))}
          <Link href={`/search?q=${encodeURIComponent(query)}`} onClick={() => setIsOpen(false)} className="block px-4 py-2.5 text-center text-xs font-medium text-primary hover:bg-primary/5 border-t border-border/30">
            {language === 'es' ? `Ver todos los resultados` : `See all results`}
          </Link>
        </div>
      )}
    </div>
  );
}
