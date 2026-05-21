'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { MapPin, Briefcase, DollarSign, Clock, Building2 } from 'lucide-react';
import type { JobListing } from '@/types/jobs';

interface JobCardProps {
  job?: JobListing;
  isLoading?: boolean;
}

/**
 * Formats a date string as relative time in Spanish.
 * e.g., "hace 2 días", "hace 1 semana"
 */
function getRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMinutes < 60) return 'hace unos minutos';
  if (diffHours < 24) return `hace ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
  if (diffDays === 1) return 'hace 1 día';
  if (diffDays < 7) return `hace ${diffDays} días`;
  if (diffWeeks === 1) return 'hace 1 semana';
  if (diffWeeks < 4) return `hace ${diffWeeks} semanas`;
  if (diffMonths === 1) return 'hace 1 mes';
  return `hace ${diffMonths} meses`;
}

/**
 * Returns the company initials for the avatar fallback.
 */
function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join('')
    .toUpperCase();
}

// Color palette for avatars when no logo
const AVATAR_COLORS = [
  'from-[#3b4cca] to-[#6366f1]',
  'from-[#10b981] to-[#34d399]',
  'from-[#f59e0b] to-[#fbbf24]',
  'from-[#ef4444] to-[#f87171]',
  'from-[#8b5cf6] to-[#a78bfa]',
  'from-[#06b6d4] to-[#22d3ee]',
  'from-[#ec4899] to-[#f472b6]',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * Maps job type values to Spanish display labels.
 */
function getJobTypeLabel(jobType: string | null): string {
  if (!jobType) return '';
  const map: Record<string, string> = {
    'Full Time': 'Tiempo Completo',
    'full-time': 'Tiempo Completo',
    'Part Time': 'Medio Tiempo',
    'part-time': 'Medio Tiempo',
    'Contract': 'Contrato',
    'contract': 'Contrato',
    'Internship': 'Prácticas',
    'internship': 'Prácticas',
    'Freelance': 'Freelance',
    'freelance': 'Freelance',
    'Remote': 'Remoto',
    'remote': 'Remoto',
  };
  return map[jobType] || jobType;
}

// ─── Skeleton Loader ───
function JobCardSkeleton() {
  return (
    <div className="bg-white/[0.04] rounded-2xl border border-white/[0.06] p-5 animate-pulse">
      <div className="flex items-start gap-4 mb-4">
        <div className="w-12 h-12 rounded-xl bg-white/10" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-white/10 rounded-lg w-3/4" />
          <div className="h-3 bg-white/[0.06] rounded-lg w-1/2" />
        </div>
      </div>
      <div className="space-y-2 mb-4">
        <div className="h-3 bg-white/[0.06] rounded w-full" />
        <div className="h-3 bg-white/[0.06] rounded w-2/3" />
      </div>
      <div className="flex gap-2">
        <div className="h-6 bg-white/[0.06] rounded-full w-20" />
        <div className="h-6 bg-white/[0.06] rounded-full w-16" />
      </div>
    </div>
  );
}

export default function JobCard({ job, isLoading }: JobCardProps) {
  if (isLoading || !job) {
    return <JobCardSkeleton />;
  }

  const orgName = job.organizations?.name || 'Empresa';
  const initials = getInitials(orgName);
  const avatarColor = getAvatarColor(orgName);

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <Link
        href={`/career-fair/${job.id}`}
        className="block group"
        id={`job-card-${job.id}`}
      >
        <div className="bg-white/[0.04] hover:bg-white/[0.07] rounded-2xl border border-white/[0.06] hover:border-white/[0.12]
          p-5 transition-all duration-300 hover:shadow-[0_8px_40px_rgba(59,76,202,0.12)] h-full flex flex-col">
          {/* Header: Logo + Title */}
          <div className="flex items-start gap-4 mb-4">
            {/* Company Logo / Avatar */}
            {job.organizations?.logo_url ? (
              <img
                src={job.organizations.logo_url}
                alt={orgName}
                className="w-12 h-12 rounded-xl object-cover border border-white/10 shrink-0"
              />
            ) : (
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${avatarColor} flex items-center justify-center shrink-0 shadow-lg`}>
                <span className="text-white text-sm font-bold">{initials}</span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-white group-hover:text-[#7b8fff] transition-colors line-clamp-2 leading-tight">
                {job.title}
              </h3>
              <div className="flex items-center gap-1.5 mt-1">
                <Building2 className="h-3 w-3 text-white/40 shrink-0" />
                <span className="text-sm text-white/50 truncate">{orgName}</span>
              </div>
            </div>
          </div>

          {/* Description preview */}
          {job.description && (
            <p className="text-sm text-white/40 line-clamp-2 mb-4 leading-relaxed">
              {job.description}
            </p>
          )}

          {/* Meta info */}
          <div className="flex flex-wrap gap-2 mb-4 mt-auto">
            {job.location && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium">
                <MapPin className="h-3 w-3" />
                {job.location}
              </span>
            )}
            {job.job_type && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#3b4cca]/15 text-[#7b8fff] text-xs font-medium">
                <Briefcase className="h-3 w-3" />
                {getJobTypeLabel(job.job_type)}
              </span>
            )}
            {job.salary && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs font-medium">
                <DollarSign className="h-3 w-3" />
                {job.salary}
              </span>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
            <div className="flex items-center gap-1 text-xs text-white/30">
              <Clock className="h-3 w-3" />
              {job.published_at ? getRelativeTime(job.published_at) : 'Reciente'}
            </div>
            <span className="text-xs font-semibold text-[#3b4cca] group-hover:text-[#7b8fff] transition-colors">
              Ver detalles →
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
