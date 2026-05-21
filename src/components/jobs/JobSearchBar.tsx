'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Search, MapPin, Briefcase, X } from 'lucide-react';
import type { JobSearchFilters } from '@/types/jobs';

interface JobSearchBarProps {
  onSearch: (filters: JobSearchFilters) => void;
  locations: string[];
  isLoading: boolean;
  initialFilters?: Partial<JobSearchFilters>;
}

export default function JobSearchBar({ onSearch, locations, isLoading, initialFilters }: JobSearchBarProps) {
  const [search, setSearch] = useState(initialFilters?.search || '');
  const [location, setLocation] = useState(initialFilters?.location || '');
  const [jobType, setJobType] = useState(initialFilters?.job_type || '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const JOB_TYPES = [
    { value: '', label: 'Todos los tipos' },
    { value: 'Full Time', label: 'Tiempo Completo' },
    { value: 'Part Time', label: 'Medio Tiempo' },
    { value: 'Contract', label: 'Contrato' },
    { value: 'Internship', label: 'Prácticas' },
    { value: 'Freelance', label: 'Freelance' },
    { value: 'Remote', label: 'Remoto' },
  ];

  const handleSearch = useCallback(() => {
    onSearch({ search, location, job_type: jobType });
  }, [search, location, jobType, onSearch]);

  // Debounced search on text input
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onSearch({ search: value, location, job_type: jobType });
      }, 300);
    },
    [location, jobType, onSearch]
  );

  // Immediate search on dropdown change
  useEffect(() => {
    onSearch({ search, location, job_type: jobType });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, jobType]);

  const hasFilters = search || location || jobType;

  const handleClear = () => {
    setSearch('');
    setLocation('');
    setJobType('');
    onSearch({ search: '', location: '', job_type: '' });
  };

  return (
    <div className="w-full">
      {/* Main search row */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Buscar por título, empresa, palabras clave..."
            className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-white/[0.06] border border-white/10 text-white text-sm
              placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#3b4cca]/50 focus:border-[#3b4cca]/50
              transition-all backdrop-blur-sm"
            id="job-search-input"
          />
        </div>

        {/* Location dropdown */}
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 pointer-events-none" />
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="appearance-none w-full sm:w-48 pl-9 pr-8 py-3.5 rounded-xl bg-white/[0.06] border border-white/10 text-white text-sm
              focus:outline-none focus:ring-2 focus:ring-[#3b4cca]/50 focus:border-[#3b4cca]/50
              transition-all backdrop-blur-sm cursor-pointer"
            id="job-location-filter"
          >
            <option value="" className="bg-[#111822] text-white">Todas las ubicaciones</option>
            {locations.map((loc) => (
              <option key={loc} value={loc} className="bg-[#111822] text-white">
                {loc}
              </option>
            ))}
          </select>
        </div>

        {/* Job type dropdown */}
        <div className="relative">
          <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 pointer-events-none" />
          <select
            value={jobType}
            onChange={(e) => setJobType(e.target.value)}
            className="appearance-none w-full sm:w-48 pl-9 pr-8 py-3.5 rounded-xl bg-white/[0.06] border border-white/10 text-white text-sm
              focus:outline-none focus:ring-2 focus:ring-[#3b4cca]/50 focus:border-[#3b4cca]/50
              transition-all backdrop-blur-sm cursor-pointer"
            id="job-type-filter"
          >
            {JOB_TYPES.map((type) => (
              <option key={type.value} value={type.value} className="bg-[#111822] text-white">
                {type.label}
              </option>
            ))}
          </select>
        </div>

        {/* Search button */}
        <button
          onClick={handleSearch}
          disabled={isLoading}
          className="px-6 py-3.5 rounded-xl bg-[#3b4cca] hover:bg-[#4a5ddd] text-white text-sm font-semibold
            transition-all disabled:opacity-60 disabled:cursor-not-allowed
            shadow-lg shadow-[#3b4cca]/20 flex items-center justify-center gap-2 shrink-0"
          id="job-search-button"
        >
          {isLoading ? (
            <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Buscar
        </button>
      </div>

      {/* Active filters row */}
      {hasFilters && (
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-xs text-white/40">Filtros:</span>
          {search && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#3b4cca]/20 text-[#7b8fff] text-xs font-medium">
              &ldquo;{search}&rdquo;
              <button onClick={() => handleSearchChange('')} className="hover:text-white transition-colors">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {location && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium">
              <MapPin className="h-3 w-3" />
              {location}
              <button onClick={() => setLocation('')} className="hover:text-white transition-colors">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {jobType && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 text-xs font-medium">
              <Briefcase className="h-3 w-3" />
              {JOB_TYPES.find((t) => t.value === jobType)?.label || jobType}
              <button onClick={() => setJobType('')} className="hover:text-white transition-colors">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          <button
            onClick={handleClear}
            className="text-xs text-white/30 hover:text-white/60 transition-colors ml-1"
          >
            Limpiar todo
          </button>
        </div>
      )}
    </div>
  );
}
