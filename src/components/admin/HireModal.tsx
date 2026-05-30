'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserCheck, GraduationCap, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
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
  const [error, setError] = useState<string | null>(null);
  const [trainingLink, setTrainingLink] = useState<string>('');

  useEffect(() => {
    fetchTrainingData();
  }, [fetchTrainingData]);

  useEffect(() => {
    if (programs.length > 0 && !selectedProgramId) {
      const defaultProgram = programs.find(p => p.isDefault) || programs[0];
      setSelectedProgramId(defaultProgram.id);
    }
  }, [programs, selectedProgramId]);

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
          email: candidate.candidate.email,
          name: candidate.candidate.name,
          roleTitle: candidate.roleTitle,
          orgId: useTrainingAdminStore.getState().programs[0]?.orgId || '',
          programId: selectedProgramId,
          interviewData: {
            evaluation: candidate.evaluation,
            transcript: candidate.transcript,
            cvData: candidate.candidate.cvData,
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error hiring candidate');
      }

      const data = await response.json();
      setTrainingLink(`${window.location.origin}/training/${data.employee.token}`);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setLoading(false);
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
                      {candidate.candidate.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{candidate.candidate.name}</p>
                    <p className="text-xs text-muted">{candidate.candidate.email}</p>
                  </div>
                  <span className="ml-auto inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border bg-success/10 text-success border-success/20">
                    {candidate.evaluation?.recommendation}
                  </span>
                </div>
              </div>

              {/* Program Selection */}
              <div className="mb-4">
                <label className="text-sm font-medium text-foreground mb-2 block">
                  <GraduationCap className="h-4 w-4 inline mr-1.5 -mt-0.5" />
                  {language === 'es' ? 'Programa de Capacitación' : 'Training Program'}
                </label>
                {programs.length > 0 ? (
                  <select
                    value={selectedProgramId}
                    onChange={(e) => setSelectedProgramId(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm text-foreground"
                  >
                    {programs.map(program => (
                      <option key={program.id} value={program.id}>
                        {program.title} {program.isDefault ? (language === 'es' ? '(Por defecto)' : '(Default)') : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-3 rounded-xl border-2 border-dashed border-border/30 text-center">
                    <p className="text-xs text-muted mb-2">
                      {language === 'es' ? 'No hay programas configurados' : 'No programs configured'}
                    </p>
                    <a href="/admin/training/configure" className="text-xs text-primary hover:underline font-medium">
                      {language === 'es' ? 'Crear programa' : 'Create program'}
                    </a>
                  </div>
                )}
              </div>

              {/* Info Note */}
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 mb-6">
                <p className="text-xs text-muted leading-relaxed">
                  {language === 'es'
                    ? 'Al contratar, se enviará un correo al candidato con acceso al Centro de Capacitación. La AI personalizará su experiencia basándose en los datos de su entrevista.'
                    : 'Upon hiring, an email will be sent to the candidate with access to the Training Center. The AI will personalize their experience based on their interview data.'}
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
                {language === 'es'
                  ? 'Se ha enviado un correo con acceso al Centro de Capacitación.'
                  : 'An email with Training Center access has been sent.'}
              </p>

              {trainingLink && (
                <div className="p-3 rounded-xl bg-background border border-border/30 mb-4">
                  <p className="text-xs text-muted mb-1">
                    {language === 'es' ? 'Enlace de capacitación:' : 'Training link:'}
                  </p>
                  <p className="text-xs text-primary font-mono break-all">{trainingLink}</p>
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
