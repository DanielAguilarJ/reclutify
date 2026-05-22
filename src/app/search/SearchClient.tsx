'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, User, Briefcase, MapPin, Users, Loader2 } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { createClient } from '@/utils/supabase/client';
import AppNavbar from '@/components/ui/AppNavbar';
import Link from 'next/link';

interface PersonResult {
  user_id: string;
  username: string;
  full_name: string;
  headline: string | null;
  avatar_url: string | null;
  location: string | null;
  is_open_to_work: boolean;
}

interface JobResult {
  id: string;
  title: string;
  location: string | null;
  salary: string | null;
  job_type: string | null;
  created_at: string;
}

export function SearchClient() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const { language } = useAppStore();
  const t = (en: string, es: string) => language === 'es' ? es : en;

  const [query, setQuery] = useState(initialQuery);
  const [tab, setTab] = useState<'people' | 'jobs'>('people');
  const [people, setPeople] = useState<PersonResult[]>([]);
  const [jobs, setJobs] = useState<JobResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const performSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setPeople([]);
      setJobs([]);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setHasSearched(true);
    const supabase = createClient();

    try {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username, full_name, headline, avatar_url, location, is_open_to_work')
        .or(`full_name.ilike.%${q}%,headline.ilike.%${q}%,username.ilike.%${q}%`)
        .limit(20);

      setPeople((profiles as PersonResult[]) || []);
    } catch {
      setPeople([]);
    }

    try {
      const { data: roles } = await supabase
        .from('roles')
        .select('id, title, location, salary, job_type, created_at')
        .eq('is_published', true)
        .or(`title.ilike.%${q}%,description.ilike.%${q}%,location.ilike.%${q}%`)
        .limit(20);

      setJobs((roles as JobResult[]) || []);
    } catch {
      setJobs([]);
    }

    setLoading(false);
  }, []);

  // Initial search from URL params
  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
      performSearch(initialQuery);
    }
  }, [initialQuery, performSearch]);

  // Debounced search on input change
  const handleInputChange = (value: string) => {
    setQuery(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  };

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const SkeletonCard = () => (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border/50 animate-pulse">
      <div className="w-12 h-12 rounded-full bg-surface" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-32 bg-surface rounded" />
        <div className="h-3 w-48 bg-surface rounded" />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <AppNavbar activeRoute="/search" />

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Search Input */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder={t(
                'Search people, jobs, companies...',
                'Buscar personas, empleos, empresas...'
              )}
              className="w-full pl-12 pr-4 py-3 rounded-xl border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab('people')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'people'
                ? 'bg-primary text-white'
                : 'bg-card border border-border text-muted hover:text-foreground'
            }`}
          >
            <Users className="h-4 w-4" />
            {t('People', 'Personas')} ({people.length})
          </button>
          <button
            onClick={() => setTab('jobs')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'jobs'
                ? 'bg-primary text-white'
                : 'bg-card border border-border text-muted hover:text-foreground'
            }`}
          >
            <Briefcase className="h-4 w-4" />
            {t('Jobs', 'Empleos')} ({jobs.length})
          </button>
        </div>

        {/* Results */}
        {loading ? (
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : tab === 'people' ? (
          <div className="space-y-3">
            {people.length === 0 && hasSearched && (
              <div className="text-center py-12">
                <Users className="h-12 w-12 text-muted/30 mx-auto mb-3" />
                <p className="text-muted text-sm">
                  {t('No people found', 'No se encontraron personas')}
                </p>
                <p className="text-muted/60 text-xs mt-1">
                  {t('Try a different search term', 'Intenta con otro termino de busqueda')}
                </p>
              </div>
            )}
            {!hasSearched && people.length === 0 && (
              <div className="text-center py-12">
                <Search className="h-12 w-12 text-muted/30 mx-auto mb-3" />
                <p className="text-muted text-sm">
                  {t('Search for people by name or headline', 'Busca personas por nombre o titular')}
                </p>
              </div>
            )}
            {people.map((p) => (
              <Link
                key={p.user_id}
                href={`/profile/${p.username}`}
                className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border/50 hover:border-primary/30 transition-colors"
              >
                {p.avatar_url ? (
                  <img
                    src={p.avatar_url}
                    alt={p.full_name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-6 w-6 text-primary" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {p.full_name}
                    </p>
                    {p.is_open_to_work && (
                      <span className="text-[10px] font-bold text-success bg-success/10 px-1.5 py-0.5 rounded-full shrink-0">
                        {t('Open to work', 'Disponible')}
                      </span>
                    )}
                  </div>
                  {p.headline && (
                    <p className="text-xs text-muted truncate mt-0.5">{p.headline}</p>
                  )}
                  {p.location && (
                    <p className="text-xs text-muted flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3" />
                      {p.location}
                    </p>
                  )}
                </div>
                <span className="text-xs text-primary font-medium shrink-0">
                  {t('View Profile', 'Ver Perfil')}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.length === 0 && hasSearched && (
              <div className="text-center py-12">
                <Briefcase className="h-12 w-12 text-muted/30 mx-auto mb-3" />
                <p className="text-muted text-sm">
                  {t('No jobs found', 'No se encontraron empleos')}
                </p>
                <p className="text-muted/60 text-xs mt-1">
                  {t('Try a different search term', 'Intenta con otro termino de busqueda')}
                </p>
              </div>
            )}
            {!hasSearched && jobs.length === 0 && (
              <div className="text-center py-12">
                <Search className="h-12 w-12 text-muted/30 mx-auto mb-3" />
                <p className="text-muted text-sm">
                  {t('Search for jobs by title or location', 'Busca empleos por titulo o ubicacion')}
                </p>
              </div>
            )}
            {jobs.map((j) => (
              <Link
                key={j.id}
                href={`/career-fair/${j.id}`}
                className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border/50 hover:border-primary/30 transition-colors"
              >
                <div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                  <Briefcase className="h-6 w-6 text-success" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{j.title}</p>
                  <div className="flex items-center gap-3 text-xs text-muted mt-0.5 flex-wrap">
                    {j.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {j.location}
                      </span>
                    )}
                    {j.job_type && (
                      <span className="bg-surface px-2 py-0.5 rounded-full">{j.job_type}</span>
                    )}
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
