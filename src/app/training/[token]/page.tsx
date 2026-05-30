'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldX } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useTrainingStore } from '@/store/trainingStore';

type TokenPhase = 'loading' | 'invalid' | 'valid';

export default function TrainingTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();
  const { language } = useAppStore();
  const { initializeFromToken } = useTrainingStore();
  const [phase, setPhase] = useState<TokenPhase>('loading');

  useEffect(() => {
    const validate = async () => {
      const isValid = await initializeFromToken(token);
      if (isValid) {
        setPhase('valid');
        router.push('/training/center');
      } else {
        setPhase('invalid');
      }
    };

    // Small delay for Zustand hydration
    setTimeout(validate, 150);
  }, [token, initializeFromToken, router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center animate-in fade-in duration-500">
      <AnimatePresence mode="wait">
        {phase === 'loading' && (
          <motion.div
            key="loading"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center gap-6"
          >
            {/* Pulsing Logo */}
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#00D3D8] to-[#00A5A8] flex items-center justify-center animate-pulse shadow-lg shadow-[#00D3D8]/20">
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 40 40"
                  fill="none"
                  className="text-white"
                >
                  <path
                    d="M20 4L36 12V28L20 36L4 28V12L20 4Z"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    fill="none"
                  />
                  <path
                    d="M20 14C23.3 14 26 16.7 26 20C26 23.3 23.3 26 20 26C16.7 26 14 23.3 14 20C14 16.7 16.7 14 20 14Z"
                    fill="currentColor"
                  />
                </svg>
              </div>
              {/* Rotating ring */}
              <div className="absolute inset-[-8px] rounded-3xl border-2 border-[#00D3D8]/30 border-t-[#00D3D8] animate-spin" />
            </div>

            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                {language === 'es' ? 'Reclutify Training' : 'Reclutify Training'}
              </p>
              <p className="text-xs text-muted mt-1">
                {language === 'es'
                  ? 'Verificando acceso...'
                  : 'Verifying access...'}
              </p>
            </div>

            {/* Loading dots */}
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-2 h-2 rounded-full bg-[#00D3D8]"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{
                    duration: 1.2,
                    repeat: Infinity,
                    delay: i * 0.2,
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}

        {phase === 'invalid' && (
          <motion.div
            key="invalid"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="max-w-md w-full mx-4"
          >
            <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-5">
                <ShieldX className="h-8 w-8 text-red-500" />
              </div>

              <h1 className="text-2xl font-bold text-foreground mb-2">
                {language === 'es'
                  ? 'Enlace Inválido'
                  : 'Invalid Link'}
              </h1>

              <p className="text-sm text-muted leading-relaxed mb-6">
                {language === 'es'
                  ? 'Este enlace de capacitación no es válido o ha expirado. Por favor contacta al equipo de recursos humanos para obtener un nuevo enlace.'
                  : 'This training link is not valid or has expired. Please contact the HR team for a new link.'}
              </p>

              {/* Illustration */}
              <div className="w-full h-32 rounded-xl bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20 flex items-center justify-center">
                <div className="flex flex-col items-center gap-2 opacity-60">
                  <div className="w-12 h-8 rounded bg-red-200 dark:bg-red-800/30" />
                  <div className="w-20 h-1.5 rounded-full bg-red-200 dark:bg-red-800/30" />
                  <div className="w-16 h-1.5 rounded-full bg-red-200 dark:bg-red-800/30" />
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {phase === 'valid' && (
          <motion.div
            key="valid"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="w-12 h-12 rounded-full bg-[#00D3D8]/10 flex items-center justify-center">
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.5 }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 13L9 17L19 7"
                    stroke="#00D3D8"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </motion.div>
            </div>
            <p className="text-sm text-muted">
              {language === 'es' ? 'Redirigiendo...' : 'Redirecting...'}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
