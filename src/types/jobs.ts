/**
 * Types for the public Job Search / Career Fair portal.
 */

export interface JobListing {
  id: string;
  org_id: string;
  title: string;
  description: string;
  location: string | null;
  salary: string | null;
  job_type: string | null;
  topics: { id: string; label: string }[] | null;
  published_at: string;
  organizations: {
    name: string;
    slug: string;
    logo_url: string | null;
  };
}

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
