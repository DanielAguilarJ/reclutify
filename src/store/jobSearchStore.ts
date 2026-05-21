import { create } from 'zustand';
import type { JobListing, JobSearchFilters } from '@/types/jobs';

interface JobSearchStore {
  filters: JobSearchFilters;
  results: JobListing[];
  total: number;
  isLoading: boolean;
  currentPage: number;
  setFilters: (filters: Partial<JobSearchFilters>) => void;
  setResults: (results: JobListing[], total: number) => void;
  appendResults: (results: JobListing[]) => void;
  setLoading: (loading: boolean) => void;
  incrementPage: () => void;
  resetSearch: () => void;
}

export const useJobSearchStore = create<JobSearchStore>()((set) => ({
  filters: {
    search: '',
    location: '',
    job_type: '',
  },
  results: [],
  total: 0,
  isLoading: false,
  currentPage: 1,

  setFilters: (filters) =>
    set((state) => ({
      filters: { ...state.filters, ...filters },
      currentPage: 1, // Reset pagination when filters change
    })),

  setResults: (results, total) =>
    set({ results, total, currentPage: 1 }),

  appendResults: (newResults) =>
    set((state) => ({
      results: [...state.results, ...newResults],
    })),

  setLoading: (isLoading) => set({ isLoading }),

  incrementPage: () =>
    set((state) => ({ currentPage: state.currentPage + 1 })),

  resetSearch: () =>
    set({
      filters: { search: '', location: '', job_type: '' },
      results: [],
      total: 0,
      currentPage: 1,
      isLoading: false,
    }),
}));
