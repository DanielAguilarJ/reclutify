/**
 * Types for the Professional Profile / Social Network features.
 */

/** Canonical user roles for routing and access control */
export type UserRole = 'candidate' | 'employer' | 'admin';

export interface ProfileExperience {
  id: string;
  title: string;
  company: string;
  start_date: string;        // ISO date string (YYYY-MM)
  end_date: string | null;   // null = current position
  description: string;
  is_current: boolean;
}

export interface ProfileEducation {
  id: string;
  institution: string;
  degree: string;
  field: string;
  start_year: number;
  end_year: number | null;   // null = currently studying
}

export interface Profile {
  id: string;
  user_id: string;
  username: string;
  full_name: string;
  headline: string | null;
  bio: string | null;
  location: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  website_url: string | null;
  public_email: boolean;
  is_open_to_work: boolean;
  user_type: 'candidate' | 'recruiter';
  skills: string[];
  experience: ProfileExperience[];
  education: ProfileEducation[];
  connections_count: number;
  profile_views: number;
  created_at: string;
  updated_at: string;
}

export interface ProfileUpdatePayload {
  full_name?: string;
  headline?: string;
  bio?: string;
  location?: string;
  website_url?: string;
  public_email?: boolean;
  is_open_to_work?: boolean;
  skills?: string[];
  experience?: ProfileExperience[];
  education?: ProfileEducation[];
}

export interface ProfileScoreResult {
  score: number;              // 0–100
  completeness: number;       // 0–100
  suggestions: string[];
  strengths: string[];
}
