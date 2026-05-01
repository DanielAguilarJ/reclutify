'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Mail, Phone, CheckCircle2, AlertCircle, Loader2, Sparkles, ArrowRight, X } from 'lucide-react';
import { applyToJob } from '@/app/actions/jobs';

interface ApplyFormProps {
  roleId: string;
  orgId: string;
  roleTitle: string;
  onClose: () => void;
}

type FormState = 'form' | 'submitting' | 'success' | 'error';

interface FormErrors {
  name?: string;
  email?: string;
}

export default function ApplyForm({ roleId, orgId, roleTitle, onClose }: ApplyFormProps) {
  const [state, setState] = useState<FormState>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [interviewUrl, setInterviewUrl] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState('');

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!name.trim()) {
      newErrors.name = 'El nombre es obligatorio';
    }

    if (!email.trim()) {
      newErrors.email = 'El correo es obligatorio';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Ingresa un correo válido';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setState('submitting');
    setErrors({});

    const result = await applyToJob({
      roleId,
      orgId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim() || undefined,
    });

    if (result.success) {
      setInterviewUrl(result.interviewUrl || '');
      setState('success');
    } else {
      setErrorMessage(result.error || 'Error inesperado. Intenta de nuevo.');
      setState('error');
    }
  };

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] overflow-hidden">
      <AnimatePresence mode="wait">
        {/* ─── Form State ─── */}
        {state === 'form' && (
          <motion.div
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">Aplicar a esta vacante</h3>
                  <p className="text-xs text-white/40 mt-0.5">Completa tus datos para iniciar el proceso</p>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                {/* Name */}
                <div>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => { setName(e.target.value); setErrors({ ...errors, name: undefined }); }}
                      placeholder="Nombre completo *"
                      className={`w-full pl-10 pr-4 py-3 rounded-xl bg-white/[0.04] border text-white text-sm
                        placeholder:text-white/25 focus:outline-none focus:ring-2 transition-all ${
                          errors.name
                            ? 'border-red-500/50 focus:ring-red-500/30'
                            : 'border-white/[0.08] focus:ring-[#3b4cca]/40 focus:border-[#3b4cca]/40'
                        }`}
                      id="apply-name-input"
                    />
                  </div>
                  {errors.name && (
                    <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> {errors.name}
                    </p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setErrors({ ...errors, email: undefined }); }}
                      placeholder="Correo electrónico *"
                      className={`w-full pl-10 pr-4 py-3 rounded-xl bg-white/[0.04] border text-white text-sm
                        placeholder:text-white/25 focus:outline-none focus:ring-2 transition-all ${
                          errors.email
                            ? 'border-red-500/50 focus:ring-red-500/30'
                            : 'border-white/[0.08] focus:ring-[#3b4cca]/40 focus:border-[#3b4cca]/40'
                        }`}
                      id="apply-email-input"
                    />
                  </div>
                  {errors.email && (
                    <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> {errors.email}
                    </p>
                  )}
                </div>

                {/* Phone */}
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Teléfono (opcional)"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm
                      placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#3b4cca]/40 focus:border-[#3b4cca]/40 transition-all"
                    id="apply-phone-input"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-[#3b4cca] hover:bg-[#4a5ddd] text-white font-semibold text-sm
                    transition-all shadow-lg shadow-[#3b4cca]/20 flex items-center justify-center gap-2 mt-4"
                  id="apply-submit-button"
                >
                  <Sparkles className="h-4 w-4" />
                  Enviar Aplicación
                </button>
              </form>
            </div>
          </motion.div>
        )}

        {/* ─── Submitting State ─── */}
        {state === 'submitting' && (
          <motion.div
            key="submitting"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="p-8 flex flex-col items-center justify-center"
          >
            <Loader2 className="h-8 w-8 text-[#3b4cca] animate-spin mb-3" />
            <p className="text-sm text-white/60">Procesando tu aplicación...</p>
          </motion.div>
        )}

        {/* ─── Success State ─── */}
        {state === 'success' && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="p-6"
          >
            <div className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.1 }}
                className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4"
              >
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </motion.div>

              <motion.h3
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-lg font-bold text-white mb-2"
              >
                ¡Aplicación Enviada!
              </motion.h3>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-sm text-white/50 mb-5"
              >
                Tu aplicación para <span className="text-white/70 font-medium">{roleTitle}</span> ha sido recibida.
                {interviewUrl && ' Continúa con tu entrevista de IA:'}
              </motion.p>

              {interviewUrl && (
                <motion.a
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  href={interviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#3b4cca] hover:bg-[#4a5ddd]
                    text-white font-semibold text-sm transition-all shadow-lg shadow-[#3b4cca]/20"
                >
                  Iniciar Entrevista con IA
                  <ArrowRight className="h-4 w-4" />
                </motion.a>
              )}
            </div>
          </motion.div>
        )}

        {/* ─── Error State ─── */}
        {state === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-6"
          >
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="h-7 w-7 text-red-400" />
              </div>
              <h3 className="text-base font-bold text-white mb-2">Error al Aplicar</h3>
              <p className="text-sm text-white/50 mb-5">{errorMessage}</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setState('form')}
                  className="px-5 py-2.5 rounded-xl bg-[#3b4cca] hover:bg-[#4a5ddd] text-white font-semibold text-sm transition-all"
                >
                  Intentar de Nuevo
                </button>
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white/60 font-medium text-sm transition-all"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
