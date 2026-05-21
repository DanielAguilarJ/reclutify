'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, MapPin, Briefcase, DollarSign, Building2,
  Clock, Share2, Check, ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import type { JobListing } from '@/types/jobs';
import ApplyForm from '@/components/jobs/ApplyForm';

function getRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffH = Math.floor(diffMs / 3.6e6);
  const diffD = Math.floor(diffMs / 8.64e7);
  if (diffH < 1) return 'hace unos minutos';
  if (diffH < 24) return `hace ${diffH} hora${diffH > 1 ? 's' : ''}`;
  if (diffD === 1) return 'hace 1 día';
  if (diffD < 7) return `hace ${diffD} días`;
  if (diffD < 30) return `hace ${Math.floor(diffD / 7)} semana${Math.floor(diffD / 7) > 1 ? 's' : ''}`;
  return `hace ${Math.floor(diffD / 30)} mes${Math.floor(diffD / 30) > 1 ? 'es' : ''}`;
}

function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export default function JobDetailPage({ job }: { job: JobListing }) {
  const [showApply, setShowApply] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const orgName = job.organizations?.name || 'Empresa';

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      /* noop */
    }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const descParagraphs = (job.description || '').split('\n').filter((p) => p.trim());

  return (
    <div className="min-h-screen bg-[#060b13] relative overflow-hidden">
      {/* BG blurs */}
      <div className="absolute top-0 right-0 w-[50vw] h-[50vw] bg-[#3b4cca] rounded-full blur-[200px] opacity-[0.08] translate-x-1/3 -translate-y-1/3 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[40vw] h-[40vw] bg-[#10b981] rounded-full blur-[180px] opacity-[0.05] -translate-x-1/3 translate-y-1/3 pointer-events-none" />

      {/* Header */}
      <header className="border-b border-white/[0.06] bg-[#060b13]/80 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link
            href="/career-fair"
            className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Bolsa de Trabajo
          </Link>
          <Link href="/career-fair" className="font-black text-lg text-white tracking-tight">
            reclutify
          </Link>
        </div>
      </header>

      <main className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          {/* Card wrapper */}
          <div className="bg-[#111822] border border-white/[0.08] rounded-2xl shadow-[0_20px_80px_rgba(0,0,0,0.4)] overflow-hidden">
            {/* Top section */}
            <div className="p-6 sm:p-8 border-b border-white/[0.06]">
              <div className="flex items-start gap-5">
                {/* Company avatar */}
                {job.organizations?.logo_url ? (
                  <img
                    src={job.organizations.logo_url}
                    alt={orgName}
                    className="w-16 h-16 rounded-xl object-cover border border-white/10 shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#3b4cca] to-[#6366f1] flex items-center justify-center shrink-0 shadow-lg">
                    <span className="text-white text-xl font-bold">{getInitials(orgName)}</span>
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight mb-1">
                    {job.title}
                  </h1>
                  <div className="flex items-center gap-1.5">
                    <Building2 className="h-4 w-4 text-white/40" />
                    <span className="text-base text-white/50">{orgName}</span>
                  </div>
                </div>
              </div>

              {/* Meta badges */}
              <div className="flex flex-wrap gap-2 mt-5">
                {job.location && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-medium">
                    <MapPin className="h-3.5 w-3.5" /> {job.location}
                  </span>
                )}
                {job.job_type && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#3b4cca]/15 text-[#7b8fff] text-xs font-medium">
                    <Briefcase className="h-3.5 w-3.5" /> {job.job_type}
                  </span>
                )}
                {job.salary && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 text-xs font-medium">
                    <DollarSign className="h-3.5 w-3.5" /> {job.salary}
                  </span>
                )}
                {job.published_at && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] text-white/30 text-xs font-medium">
                    <Clock className="h-3.5 w-3.5" /> {getRelativeTime(job.published_at)}
                  </span>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="p-6 sm:p-8 space-y-8">
              {descParagraphs.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">
                    Descripción del Puesto
                  </h2>
                  <div className="space-y-3">
                    {descParagraphs.map((p, i) => (
                      <p key={i} className="text-sm text-white/55 leading-relaxed">{p}</p>
                    ))}
                  </div>
                </section>
              )}

              {/* Topics */}
              {job.topics && job.topics.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">
                    Temas de Evaluación
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {job.topics.map((topic, i) => {
                      const label = typeof topic === 'string' ? topic : topic.label;
                      return (
                        <span
                          key={i}
                          className="px-3 py-1.5 rounded-lg bg-white/[0.05] text-white/60 text-xs font-medium border border-white/[0.06]"
                        >
                          {label}
                        </span>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Apply section */}
              {showApply ? (
                <ApplyForm
                  roleId={job.id}
                  orgId={job.org_id}
                  roleTitle={job.title}
                  onClose={() => setShowApply(false)}
                />
              ) : (
                <div className="flex gap-3 pt-4 border-t border-white/[0.06]">
                  <button
                    onClick={() => setShowApply(true)}
                    className="flex-1 py-3.5 rounded-xl bg-[#3b4cca] hover:bg-[#4a5ddd] text-white font-semibold text-sm transition-all shadow-lg shadow-[#3b4cca]/20 flex items-center justify-center gap-2"
                    id="job-detail-apply"
                  >
                    <ExternalLink className="h-4 w-4" /> Aplicar Ahora
                  </button>
                  <button
                    onClick={handleShare}
                    className="px-5 py-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white/50 hover:text-white font-medium text-sm transition-all flex items-center gap-2"
                  >
                    {linkCopied ? <Check className="h-4 w-4 text-emerald-400" /> : <Share2 className="h-4 w-4" />}
                    {linkCopied ? 'Copiado' : 'Compartir'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
