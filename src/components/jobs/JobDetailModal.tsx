'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Share2, MapPin, Briefcase, DollarSign, Building2, Check, ExternalLink } from 'lucide-react';
import type { JobListing } from '@/types/jobs';
import ApplyForm from './ApplyForm';

interface JobDetailModalProps {
  job: JobListing;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Renders a job description splitting by newlines into paragraphs.
 */
function JobDescription({ text }: { text: string }) {
  const paragraphs = text.split('\n').filter((p) => p.trim());
  return (
    <div className="space-y-3">
      {paragraphs.map((p, i) => (
        <p key={i} className="text-sm text-white/60 leading-relaxed">
          {p}
        </p>
      ))}
    </div>
  );
}

export default function JobDetailModal({ job, isOpen, onClose }: JobDetailModalProps) {
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const handleShare = async () => {
    const url = `${window.location.origin}/career-fair/${job.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Fallback for non-HTTPS
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  const orgName = job.organizations?.name || 'Empresa';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2
              md:w-full md:max-w-2xl md:max-h-[85vh] z-50
              bg-[#111822] border border-white/10 rounded-2xl shadow-[0_20px_80px_rgba(0,0,0,0.6)]
              flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-start justify-between p-6 border-b border-white/[0.06] shrink-0">
              <div className="flex items-start gap-4 flex-1 min-w-0">
                {/* Company avatar */}
                {job.organizations?.logo_url ? (
                  <img
                    src={job.organizations.logo_url}
                    alt={orgName}
                    className="w-14 h-14 rounded-xl object-cover border border-white/10 shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#3b4cca] to-[#6366f1] flex items-center justify-center shrink-0">
                    <span className="text-white text-lg font-bold">
                      {orgName.split(' ').slice(0, 2).map((w) => w.charAt(0)).join('').toUpperCase()}
                    </span>
                  </div>
                )}

                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-white leading-tight">{job.title}</h2>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Building2 className="h-3.5 w-3.5 text-white/40" />
                    <span className="text-sm text-white/50">{orgName}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 ml-4">
                <button
                  onClick={handleShare}
                  className="p-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white/40 hover:text-white transition-all"
                  title="Copiar enlace"
                >
                  {linkCopied ? <Check className="h-4 w-4 text-emerald-400" /> : <Share2 className="h-4 w-4" />}
                </button>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white/40 hover:text-white transition-all"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Meta badges */}
              <div className="flex flex-wrap gap-2">
                {job.location && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-medium">
                    <MapPin className="h-3.5 w-3.5" />
                    {job.location}
                  </span>
                )}
                {job.job_type && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#3b4cca]/15 text-[#7b8fff] text-xs font-medium">
                    <Briefcase className="h-3.5 w-3.5" />
                    {job.job_type}
                  </span>
                )}
                {job.salary && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 text-xs font-medium">
                    <DollarSign className="h-3.5 w-3.5" />
                    {job.salary}
                  </span>
                )}
              </div>

              {/* Description */}
              {job.description && (
                <div>
                  <h3 className="text-sm font-semibold text-white mb-3">Descripción del Puesto</h3>
                  <JobDescription text={job.description} />
                </div>
              )}

              {/* Topics */}
              {job.topics && job.topics.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-white mb-3">Temas de Evaluación</h3>
                  <div className="flex flex-wrap gap-2">
                    {job.topics.map((topic, i) => {
                      const label = typeof topic === 'string' ? topic : topic.label;
                      return (
                        <span
                          key={i}
                          className="px-3 py-1.5 rounded-lg bg-white/[0.06] text-white/60 text-xs font-medium border border-white/[0.06]"
                        >
                          {label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Apply Form */}
              <AnimatePresence mode="wait">
                {showApplyForm && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <ApplyForm
                      roleId={job.id}
                      orgId={job.org_id}
                      roleTitle={job.title}
                      onClose={() => setShowApplyForm(false)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            {!showApplyForm && (
              <div className="p-6 border-t border-white/[0.06] shrink-0">
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowApplyForm(true)}
                    className="flex-1 py-3.5 rounded-xl bg-[#3b4cca] hover:bg-[#4a5ddd] text-white font-semibold text-sm
                      transition-all shadow-lg shadow-[#3b4cca]/20 flex items-center justify-center gap-2"
                    id="job-apply-button"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Aplicar Ahora
                  </button>
                  <button
                    onClick={handleShare}
                    className="px-5 py-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white/60 hover:text-white
                      font-medium text-sm transition-all flex items-center gap-2"
                  >
                    {linkCopied ? <Check className="h-4 w-4 text-emerald-400" /> : <Share2 className="h-4 w-4" />}
                    {linkCopied ? 'Copiado' : 'Compartir'}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
