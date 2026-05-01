'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Briefcase, SearchX } from 'lucide-react';
import JobSearchBar from '@/components/jobs/JobSearchBar';
import JobCard from '@/components/jobs/JobCard';
import { useJobSearchStore } from '@/store/jobSearchStore';
import type { JobListing, JobSearchFilters } from '@/types/jobs';
import Link from 'next/link';

interface JobSearchResultsProps {
  initialJobs: JobListing[];
  initialTotal: number;
  initialHasMore: boolean;
  locations: string[];
}

export default function JobSearchResults({
  initialJobs,
  initialTotal,
  initialHasMore,
  locations,
}: JobSearchResultsProps) {
  const {
    filters,
    results,
    total,
    isLoading,
    currentPage,
    setFilters,
    setResults,
    appendResults,
    setLoading,
    incrementPage,
  } = useJobSearchStore();

  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const initialized = useRef(false);

  // Initialize store with SSR data
  useEffect(() => {
    if (!initialized.current) {
      setResults(initialJobs, initialTotal);
      setHasMore(initialHasMore);
      initialized.current = true;
    }
  }, [initialJobs, initialTotal, initialHasMore, setResults]);

  // Search handler — fetches from API
  const handleSearch = useCallback(
    async (newFilters: JobSearchFilters) => {
      setFilters(newFilters);
      setLoading(true);

      try {
        const params = new URLSearchParams();
        if (newFilters.search) params.set('q', newFilters.search);
        if (newFilters.location) params.set('location', newFilters.location);
        if (newFilters.job_type) params.set('job_type', newFilters.job_type);
        params.set('page', '1');

        const res = await fetch(`/api/jobs/search?${params.toString()}`);
        const data = await res.json();

        setResults(data.jobs || [], data.total || 0);
        setHasMore(data.hasMore || false);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    },
    [setFilters, setResults, setLoading]
  );

  // Load more handler
  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;

    setLoadingMore(true);
    const nextPage = currentPage + 1;

    try {
      const params = new URLSearchParams();
      if (filters.search) params.set('q', filters.search);
      if (filters.location) params.set('location', filters.location);
      if (filters.job_type) params.set('job_type', filters.job_type);
      params.set('page', nextPage.toString());

      const res = await fetch(`/api/jobs/search?${params.toString()}`);
      const data = await res.json();

      appendResults(data.jobs || []);
      setHasMore(data.hasMore || false);
      incrementPage();
    } catch (err) {
      console.error('Load more error:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const displayJobs = results.length > 0 ? results : initialJobs;
  const displayTotal = total > 0 ? total : initialTotal;
  const noFiltersApplied = !filters.search && !filters.location && !filters.job_type;

  return (
    <div className="min-h-screen bg-[#060b13] relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-0 right-0 w-[60vw] h-[60vw] bg-[#3b4cca] rounded-full blur-[200px] opacity-[0.08] translate-x-1/3 -translate-y-1/3 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[50vw] h-[50vw] bg-[#10b981] rounded-full blur-[200px] opacity-[0.05] -translate-x-1/3 translate-y-1/3 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 w-[40vw] h-[40vw] bg-[#8b5cf6] rounded-full blur-[200px] opacity-[0.04] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />

      <div className="relative z-10">
        {/* Header */}
        <header className="border-b border-white/[0.06] bg-[#060b13]/80 backdrop-blur-xl sticky top-0 z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
            <Link href="/career-fair" className="flex items-center gap-3">
              <span className="font-black text-xl text-white tracking-tight">reclutify</span>
              <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full bg-[#3b4cca]/20 text-[#7b8fff] text-[10px] font-bold uppercase tracking-widest">
                Bolsa de Trabajo
              </span>
            </Link>
            <Link
              href="/practice"
              className="text-xs text-white/40 hover:text-white/70 transition-colors font-medium"
            >
              Practica Entrevistas →
            </Link>
          </div>
        </header>

        {/* Hero section */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-10"
          >
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight">
              Encuentra tu próximo{' '}
              <span className="bg-gradient-to-r from-[#3b4cca] via-[#7b8fff] to-[#a78bfa] bg-clip-text text-transparent">
                empleo
              </span>
            </h1>
            <p className="text-base sm:text-lg text-white/40 max-w-2xl mx-auto leading-relaxed">
              Explora vacantes de empresas innovadoras y aplica directamente con nuestra entrevista de IA.
            </p>
          </motion.div>

          {/* Search Bar */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <JobSearchBar
              onSearch={handleSearch}
              locations={locations}
              isLoading={isLoading}
              initialFilters={filters}
            />
          </motion.div>
        </section>

        {/* Results section */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
          {/* Results count */}
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-white/40">
              {isLoading ? (
                'Buscando...'
              ) : (
                <>
                  <span className="text-white font-semibold">{displayTotal}</span>{' '}
                  {displayTotal === 1 ? 'vacante encontrada' : 'vacantes encontradas'}
                </>
              )}
            </p>
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <JobCard key={`skeleton-${i}`} isLoading />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && displayJobs.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-20"
            >
              <div className="w-20 h-20 rounded-2xl bg-white/[0.04] flex items-center justify-center mb-6 border border-white/[0.06]">
                {noFiltersApplied ? (
                  <Briefcase className="h-9 w-9 text-white/20" />
                ) : (
                  <SearchX className="h-9 w-9 text-white/20" />
                )}
              </div>
              <h3 className="text-lg font-semibold text-white/70 mb-2">
                {noFiltersApplied
                  ? 'No hay vacantes publicadas'
                  : 'No se encontraron resultados'}
              </h3>
              <p className="text-sm text-white/30 text-center max-w-sm">
                {noFiltersApplied
                  ? 'Vuelve pronto — las empresas están publicando nuevas oportunidades constantemente.'
                  : 'Intenta ajustar tus filtros de búsqueda o usa palabras clave diferentes.'}
              </p>
            </motion.div>
          )}

          {/* Job Grid */}
          {!isLoading && displayJobs.length > 0 && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.05 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
              >
                {displayJobs.map((job, index) => (
                  <motion.div
                    key={job.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                  >
                    <JobCard job={job} />
                  </motion.div>
                ))}
              </motion.div>

              {/* Load more */}
              {hasMore && (
                <div className="flex justify-center mt-10">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="px-8 py-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08]
                      text-white/60 hover:text-white text-sm font-semibold transition-all
                      disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    id="load-more-jobs"
                  >
                    {loadingMore ? (
                      <>
                        <div className="h-4 w-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                        Cargando...
                      </>
                    ) : (
                      'Cargar más vacantes'
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* Footer */}
        <footer className="border-t border-white/[0.06] py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-white/20">
              © {new Date().getFullYear()} Reclutify — AI-Powered Recruitment Platform
            </p>
            <div className="flex items-center gap-6">
              <Link href="/practice" className="text-xs text-white/30 hover:text-white/50 transition-colors">
                Practicar Entrevista
              </Link>
              <Link href="/pricing" className="text-xs text-white/30 hover:text-white/50 transition-colors">
                Para Empresas
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
