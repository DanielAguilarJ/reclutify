'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import Logo from '@/components/ui/Logo';
import { motion } from 'framer-motion';
import { Loader2, ArrowRight } from 'lucide-react';
import { useAppStore } from '@/store/appStore';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const { language } = useAppStore();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error("Supabase Login Error:", error);
      setError(error.message);
      setIsLoading(false);
    } else {
      router.push('/admin/create-role');
      router.refresh(); // Refresh to update server components layout
    }
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
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white mb-2">
              {language === 'es' ? 'Acceso Administrativo' : 'Admin Access'}
            </h1>
            <p className="text-neutral-400 text-sm">
              {language === 'es' 
                ? 'Ingresa tus credenciales de Reclutify' 
                : 'Enter your Reclutify credentials'}
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                {language === 'es' ? 'Correo Electrónico' : 'Email Address'}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/10 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-[#D3FB52]/50 focus:border-[#D3FB52] transition-all"
                placeholder="admin@reclutify.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/10 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-[#D3FB52]/50 focus:border-[#D3FB52] transition-all"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 px-4 bg-[#D3FB52] text-black font-semibold rounded-xl hover:bg-[#c1e847] focus:outline-none focus:ring-2 focus:ring-[#D3FB52]/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 group"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  {language === 'es' ? 'Iniciar Sesión' : 'Sign In'}
                  <ArrowRight className="w-5 h-5 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
