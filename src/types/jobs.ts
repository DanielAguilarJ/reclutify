/**
 * Types for the public Job Search / Career Fair portal.
 */

import type {
  PublicJobListing,
  PublicJobOrganization,
  PublicJobTopic,
} from '@/lib/jobs/public-projection';

/**
 * Vacante del portal público.
 *
 * La forma la define y la garantiza `src/lib/jobs/public-projection.ts`, que es
 * el módulo por el que pasan las tres lecturas públicas. Este alias existe para
 * que los componentes sigan importando `JobListing` desde `@/types/jobs`, pero la
 * definición vive junto a la proyección: así el tipo no puede prometer una forma
 * reducida mientras el `select` devuelve otra, que es exactamente lo que pasaba
 * con `topics` (el tipo decía `{ id, label }[]` y por la red viajaba la rúbrica
 * completa).
 */
export type JobListing = PublicJobListing;

export type { PublicJobTopic, PublicJobOrganization };

export interface JobSearchFilters {
  search: string;
  location: string;
  job_type: string;
}

export interface ApplyToJobPayload {
  roleId: string;
  orgId: string;
  name: string;
  email: string;
  phone?: string;
}

export interface ApplyToJobResult {
  success: boolean;
  interviewUrl?: string;
  error?: string;
}

export interface JobSearchResult {
  jobs: JobListing[];
  total: number;
  hasMore: boolean;
}
