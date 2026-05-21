'use client';

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import Logo from '@/components/ui/Logo';
import { motion } from 'framer-motion';
import { Loader2, ArrowLeft, Mail, AlertCircle } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import Link from 'next/link';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClient();
  const { language } = useAppStore();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/update-password`,
    });

    if (error) {
      setError(error.message);
      setIsLoading(false);
      return;
    }

    setSuccess(true);
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#1a1b23] flex flex-col justify-center items-center p-4 selection:bg-[#D3FB52] selection:text-black">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Logo size="default" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-[2rem] shadow-2xl"
        >
          {success ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-[#D3FB52]/10 flex items-center justify-center mx-auto mb-5">
                <Mail className="w-8 h-8 text-[#D3FB52]" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">
                {language === 'es' ? 'Revisa tu email' : 'Check your email'}
              </h2>
              <p className="text-neutral-400 text-sm leading-relaxed mb-6">
                {language === 'es'
                  ? 'Si existe una cuenta con ese email, recibirás un enlace para restablecer tu contraseña.'
                  : 'If an account exists with that email, you will receive a password reset link.'}
              </p>
              <Link
                href="/login"
                className="text-[#D3FB52] text-sm font-semibold hover:underline"
              >
                {language === 'es' ? 'Volver al inicio de sesión' : 'Back to login'}
              </Link>
            </div>
          ) : (
            <>
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-neutral-400 hover:text-white text-sm transition-colors mb-6"
              >
                <ArrowLeft className="w-4 h-4" />
                {language === 'es' ? 'Volver' : 'Back'}
              </Link>

              <h1 className="text-2xl font-bold text-white mb-2">
                {language === 'es' ? 'Restablecer contraseña' : 'Reset password'}
              </h1>
              <p className="text-neutral-400 text-sm mb-6">
                {language === 'es'
                  ? 'Ingresa tu email y te enviaremos un enlace para restablecer tu contraseña.'
                  : 'Enter your email and we will send you a link to reset your password.'}
              </p>

              <form onSubmit={handleReset} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                    {language === 'es' ? 'Correo electrónico' : 'Email'}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(null); }}
                    required
                    autoFocus
                    className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/10 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-[#D3FB52]/50 focus:border-[#D3FB52] transition-all"
                    placeholder="tu@email.com"
                  />
                </div>

                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-500">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3.5 px-4 bg-[#D3FB52] text-black font-semibold rounded-xl hover:bg-[#c1e847] focus:outline-none focus:ring-2 focus:ring-[#D3FB52]/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    language === 'es' ? 'Enviar enlace' : 'Send reset link'
                  )}
                </button>
              </form>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
