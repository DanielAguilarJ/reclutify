'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserCheck, GraduationCap, Loader2, CheckCircle2, AlertCircle, Copy, Check } from 'lucide-react';
import { useTrainingAdminStore } from '@/store/trainingAdminStore';
import type { CandidateResult } from '@/types';

interface HireModalProps {
  candidate: CandidateResult;
  language: 'es' | 'en';
  onClose: () => void;
}

export default function HireModal({ candidate, language, onClose }: HireModalProps) {
  const { programs, fetchTrainingData } = useTrainingAdminStore();
  const [selectedProgramId, setSelectedProgramId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trainingLink, setTrainingLink] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchTrainingData();
  }, [fetchTrainingData]);

  // Filtrar programas elegibles
  const eligiblePrograms = programs.filter(
    (program) =>
      program.roleId === candidate.roleId &&
      program.status === 'published'
  );

  useEffect(() => {
    if (eligiblePrograms.length > 0 && !selectedProgramId) {
      // Auto-seleccionar el primero o el default
      const defaultProgram = eligiblePrograms.find(p => p.isDefault) || eligiblePrograms[0];
      setSelectedProgramId(defaultProgram.id);
    }
  }, [eligiblePrograms, selectedProgramId]);

  const handleHire = async () => {
    if (!selectedProgramId) {
      setError(language === 'es' ? 'Selecciona un programa de capacitación' : 'Select a training program');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/training/hire-candidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateResultId: candidate.id,
          programId: selectedProgramId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error hiring candidate');
      }

      const data = await response.json();
      setTrainingLink(data.trainingUrl);
      setEmailSent(!!data.emailSent);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(trainingLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
          className="bg-card rounded-2xl border border-border/50 shadow-xl shadow-black/10 w-full max-w-md p-6"
          onClick={(e) => e.stopPropagation()}
        >
          {!success ? (
            <>
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center">
                    <UserCheck className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">
                      {language === 'es' ? 'Contratar Candidato' : 'Hire Candidate'}
                    </h2>
                    <p className="text-xs text-muted">
                      {language === 'es' ? 'Iniciar proceso de capacitación' : 'Start training process'}
                    </p>
                  </div>
                </div>
                <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-background flex items-center justify-center transition-colors">
                  <X className="h-4 w-4 text-muted" />
                </button>
              </div>

              {/* Candidate Info */}
              <div className="p-4 rounded-xl bg-background border border-border/30 mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary-light flex items-center justify-center">
                    <span className="text-primary text-sm font-bold">
                      {candidate.candidate.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{candidate.candidate.name}</p>
                    <p className="text-xs text-muted">{candidate.candidate.email}</p>
                  </div>
                  <span className="ml-auto inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border bg-success/10 text-success border-success/20">
                    {candidate.evaluation?.recommendation || 'Hired'}
                  </span>
                </div>
              </div>

              {/* Program Selection */}
              <div className="mb-4">
                <label className="text-sm font-medium text-foreground mb-2 block">
                  <GraduationCap className="h-4 w-4 inline mr-1.5 -mt-0.5" />
                  {language === 'es' ? 'Programa de Capacitación' : 'Training Program'}
                </label>
                {eligiblePrograms.length > 0 ? (
                  <select
                    value={selectedProgramId}
                    onChange={(e) => setSelectedProgramId(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm text-foreground"
                  >
                    {eligiblePrograms.map(program => (
                      <option key={program.id} value={program.id}>
                        {program.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-4 rounded-xl border-2 border-dashed border-border/30 text-center">
                    <p className="text-xs text-muted mb-2">
                      {language === 'es' 
                        ? 'No hay programas publicados para este puesto' 
                        : 'No published programs for this role'}
                    </p>
                    <a href="/admin/training" className="text-xs text-primary hover:underline font-medium">
                      {language === 'es' ? 'Ir a configurar un programa' : 'Go configure a program'}
                    </a>
                  </div>
                )}
              </div>

              {/* Info Note */}
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 mb-6">
                <p className="text-xs text-muted leading-relaxed">
                  {language === 'es'
                    ? 'Al contratar, se creará el empleado de capacitación y se generará su URL de acceso.'
                    : 'Upon hiring, a training employee will be created and their access URL will be generated.'}
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-4 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                  <p className="text-xs text-red-500">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-3 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-background transition-colors"
                >
                  {language === 'es' ? 'Cancelar' : 'Cancel'}
                </button>
                <button
                  onClick={handleHire}
                  disabled={loading || !selectedProgramId}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-success hover:bg-success/90 text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-success/20"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserCheck className="h-4 w-4" />
                  )}
                  {language === 'es' ? 'Contratar' : 'Hire'}
                </button>
              </div>
            </>
          ) : (
            /* Success State */
            <div className="text-center py-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4"
              >
                <CheckCircle2 className="h-8 w-8 text-success" />
              </motion.div>
              <h3 className="text-lg font-semibold text-foreground mb-1">
                {language === 'es' ? 'Candidato Contratado' : 'Candidate Hired'}
              </h3>
              
              <p className="text-sm text-muted mb-4">
                {emailSent ? (
                  language === 'es'
                    ? 'Se ha enviado un correo con acceso al Centro de Capacitación.'
                    : 'An email with Training Center access has been sent.'
                ) : (
                  language === 'es'
                    ? 'Empleado creado, pero no se pudo enviar el correo de invitación. Puedes copiar el enlace manualmente.'
                    : 'Employee created, but invitation email could not be sent. You can copy the link manually.'
                )}
              </p>

              {trainingLink && (
                <div className="p-3 rounded-xl bg-background border border-border/30 mb-4 flex items-center justify-between gap-2">
                  <div className="text-left min-w-0 flex-1">
                    <p className="text-xs text-muted mb-0.5">
                      {language === 'es' ? 'Enlace de capacitación:' : 'Training link:'}
                    </p>
                    <p className="text-xs text-primary font-mono truncate">{trainingLink}</p>
                  </div>
                  <button
                    onClick={handleCopy}
                    className="p-2 rounded-lg hover:bg-muted/10 transition-colors shrink-0"
                    title={language === 'es' ? 'Copiar enlace' : 'Copy link'}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-success" />
                    ) : (
                      <Copy className="h-4 w-4 text-muted" />
                    )}
                  </button>
                </div>
              )}

              <button
                onClick={onClose}
                className="w-full px-4 py-3 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all"
              >
                {language === 'es' ? 'Cerrar' : 'Close'}
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
