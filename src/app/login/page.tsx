'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import Logo from '@/components/ui/Logo';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2,
  ArrowRight,
  Eye,
  EyeOff,
  UserSearch,
  Building2,
  Mail,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { dictionaries } from '@/lib/i18n';

// ─── Password Strength Indicator ───
function PasswordStrength({ password }: { password: string }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const strength = checks.filter(Boolean).length;

  const colors = ['bg-red-500', 'bg-orange-400', 'bg-yellow-400', 'bg-[#D3FB52]'];
  const labels = ['Muy débil', 'Débil', 'Buena', 'Fuerte'];
  const labelsEn = ['Very weak', 'Weak', 'Good', 'Strong'];

  if (!password) return null;

  return (
    <div className="mt-1.5">
      <div className="flex gap-1 mb-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < strength ? colors[strength - 1] : 'bg-white/10'
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-neutral-400">
        {strength > 0 ? labels[strength - 1] : ''}
      </p>
    </div>
  );
}

// ─── Main Login Content (uses useSearchParams) ───
function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { language } = useAppStore();
  const t = dictionaries[language];

  // Read URL params for pre-selection
  const tabParam = searchParams.get('tab') as 'login' | 'register' | null;
  const roleParam = searchParams.get('role') as 'candidate' | 'employer' | null;
  const redirectTo = searchParams.get('redirectTo');

  // ─── State ───
  const [mode, setMode] = useState<'login' | 'register'>(tabParam === 'register' ? 'register' : 'login');
  const [selectedRole, setSelectedRole] = useState<'candidate' | 'employer' | null>(roleParam);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleModeChange = (newMode: 'login' | 'register') => {
    setMode(newMode);
    setError(null);
    setSuccess(null);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setFullName('');
    if (newMode === 'login') setSelectedRole(null);
  };

  // ─── Login Handler ───
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      const errorMessages: Record<string, string> = {
        'Invalid login credentials': language === 'es' ? 'Email o contraseña incorrectos' : 'Invalid email or password',
        'Email not confirmed': language === 'es' ? 'Confirma tu email antes de iniciar sesión' : 'Please confirm your email before signing in',
        'Too many requests': language === 'es' ? 'Demasiados intentos. Espera unos minutos' : 'Too many attempts. Wait a few minutes',
      };
      setError(errorMessages[error.message] || error.message);
      setIsLoading(false);
      return;
    }

    // The middleware handles correct redirect:
    // candidate → /feed, employer with org → /admin, no onboarding → /onboarding
    if (redirectTo) {
      router.push(redirectTo);
    } else {
      router.push('/');
    }
    router.refresh();
  };

  // ─── Register Handler ───
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedRole) {
      setError(t.roleRequired);
      return;
    }
    if (password !== confirmPassword) {
      setError(language === 'es' ? 'Las contraseñas no coinciden' : 'Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError(language === 'es' ? 'La contraseña debe tener al menos 8 caracteres' : 'Password must be at least 8 characters');
      return;
    }
    if (fullName.trim().length < 2) {
      setError(language === 'es' ? 'El nombre es obligatorio' : 'Full name is required');
      return;
    }

    setIsLoading(true);
    setError(null);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          role: selectedRole,
        },
      },
    });

    if (error) {
      const errorMessages: Record<string, string> = {
        'User already registered': language === 'es' ? 'Este email ya tiene una cuenta' : 'This email already has an account',
        'Password should be at least 6 characters': language === 'es' ? 'La contraseña es muy corta' : 'Password is too short',
      };
      setError(errorMessages[error.message] || error.message);
      setIsLoading(false);
      return;
    }

    if (data.session) {
      // Email confirmation disabled → session active → go to onboarding
      router.push(`/onboarding?role=${selectedRole}`);
      router.refresh();
    } else {
      // Email confirmation enabled → show message
      setSuccess(
        language === 'es'
          ? '¡Cuenta creada! Revisa tu bandeja de entrada para confirmar tu email.'
          : 'Account created! Check your inbox to confirm your email.'
      );
      setIsLoading(false);
    }
  };

  // ─── Google OAuth ───
  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  // Success screen (email confirmation)
  if (success) {
    return (
      <div className="text-center py-4">
        <div className="w-16 h-16 rounded-full bg-[#D3FB52]/10 flex items-center justify-center mx-auto mb-5">
          <Mail className="w-8 h-8 text-[#D3FB52]" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">
          {language === 'es' ? 'Revisa tu email' : 'Check your email'}
        </h2>
        <p className="text-neutral-400 text-sm leading-relaxed mb-6">{success}</p>
        <button
          onClick={() => {
            setSuccess(null);
            handleModeChange('login');
          }}
          className="text-[#D3FB52] text-sm font-semibold hover:underline"
        >
          {t.loginTab}
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Tabs */}
      <div className="flex border-b border-white/10 mb-8">
        <button
          onClick={() => handleModeChange('login')}
          className={`flex-1 pb-3 text-sm font-semibold transition-colors ${
            mode === 'login'
              ? 'text-white border-b-2 border-[#D3FB52] -mb-px'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          {t.loginTab}
        </button>
        <button
          onClick={() => handleModeChange('register')}
          className={`flex-1 pb-3 text-sm font-semibold transition-colors ${
            mode === 'register'
              ? 'text-white border-b-2 border-[#D3FB52] -mb-px'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          {t.registerTab}
        </button>
      </div>

      {/* Animated Panel */}
      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          initial={{ opacity: 0, x: mode === 'login' ? -20 : 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: mode === 'login' ? 20 : -20 }}
          transition={{ duration: 0.2 }}
        >
          {mode === 'login' ? (
            /* ─── LOGIN FORM ─── */
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                  {t.emailLabel}
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

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-neutral-300">
                    {t.passwordLabel}
                  </label>
                  <Link
                    href="/auth/reset-password"
                    className="text-xs text-[#D3FB52]/70 hover:text-[#D3FB52] transition-colors"
                  >
                    {t.forgotPassword}
                  </Link>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(null); }}
                    required
                    className="w-full px-4 py-3 pr-11 rounded-xl bg-black/20 border border-white/10 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-[#D3FB52]/50 focus:border-[#D3FB52] transition-all"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
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
                className="w-full py-3.5 px-4 bg-[#D3FB52] text-black font-semibold rounded-xl hover:bg-[#c1e847] focus:outline-none focus:ring-2 focus:ring-[#D3FB52]/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 group"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    {t.loginBtn}
                    <ArrowRight className="w-5 h-5 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                  </>
                )}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-4 my-2">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-xs text-neutral-500 uppercase tracking-wider">{t.orContinueWith}</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              {/* Google OAuth */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full py-3 px-4 border border-white/10 rounded-xl text-white font-medium text-sm hover:bg-white/5 transition-all flex items-center justify-center gap-3"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Google
              </button>

              {/* Switch to register prompt */}
              <p className="text-center text-sm text-neutral-400 mt-4">
                {t.noAccount}{' '}
                <button
                  type="button"
                  onClick={() => handleModeChange('register')}
                  className="text-[#D3FB52] font-semibold hover:underline"
                >
                  {t.registerTab}
                </button>
              </p>
            </form>
          ) : (
            /* ─── REGISTER FORM ─── */
            <form onSubmit={handleRegister} className="space-y-5">
              {/* Role Selector */}
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  {t.roleRequired}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => { setSelectedRole('candidate'); setError(null); }}
                    className={`p-4 rounded-2xl border-2 transition-all text-left ${
                      selectedRole === 'candidate'
                        ? 'border-[#D3FB52] bg-[#D3FB52]/10'
                        : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    <UserSearch className="w-5 h-5 text-[#D3FB52] mb-2" />
                    <p className="text-white text-sm font-semibold">{t.roleCandidate}</p>
                    <p className="text-neutral-400 text-xs mt-0.5">
                      {language === 'es' ? 'Candidato' : 'Candidate'}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSelectedRole('employer'); setError(null); }}
                    className={`p-4 rounded-2xl border-2 transition-all text-left ${
                      selectedRole === 'employer'
                        ? 'border-[#D3FB52] bg-[#D3FB52]/10'
                        : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    <Building2 className="w-5 h-5 text-[#D3FB52] mb-2" />
                    <p className="text-white text-sm font-semibold">{t.roleEmployer}</p>
                    <p className="text-neutral-400 text-xs mt-0.5">
                      {language === 'es' ? 'Empresa / Reclutador' : 'Company / Recruiter'}
                    </p>
                  </button>
                </div>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                  {t.fullNameLabel}
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => { setFullName(e.target.value); setError(null); }}
                  required
                  className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/10 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-[#D3FB52]/50 focus:border-[#D3FB52] transition-all"
                  placeholder={language === 'es' ? 'Ej. Daniel Aguilar' : 'e.g. Daniel Aguilar'}
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                  {t.emailLabel}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(null); }}
                  required
                  className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/10 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-[#D3FB52]/50 focus:border-[#D3FB52] transition-all"
                  placeholder="tu@email.com"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                  {t.passwordLabel}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(null); }}
                    required
                    minLength={8}
                    className="w-full px-4 py-3 pr-11 rounded-xl bg-black/20 border border-white/10 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-[#D3FB52]/50 focus:border-[#D3FB52] transition-all"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <PasswordStrength password={password} />
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                  {t.confirmPasswordLabel}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                    required
                    minLength={8}
                    className="w-full px-4 py-3 pr-11 rounded-xl bg-black/20 border border-white/10 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-[#D3FB52]/50 focus:border-[#D3FB52] transition-all"
                    placeholder="••••••••"
                  />
                  {confirmPassword && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {password === confirmPassword ? (
                        <CheckCircle2 className="w-4 h-4 text-[#D3FB52]" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-400" />
                      )}
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-500">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || !selectedRole}
                className="w-full py-3.5 px-4 bg-[#D3FB52] text-black font-semibold rounded-xl hover:bg-[#c1e847] focus:outline-none focus:ring-2 focus:ring-[#D3FB52]/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 group"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    {t.registerBtn}
                    <ArrowRight className="w-5 h-5 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                  </>
                )}
              </button>

              {/* Switch to login prompt */}
              <p className="text-center text-sm text-neutral-400 mt-4">
                {t.hasAccount}{' '}
                <button
                  type="button"
                  onClick={() => handleModeChange('login')}
                  className="text-[#D3FB52] font-semibold hover:underline"
                >
                  {t.loginTab}
                </button>
              </p>
            </form>
          )}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

// ─── Page Export (Suspense wrapper for useSearchParams) ───
export default function LoginPage() {
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
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
              </div>
            }
          >
            <LoginContent />
          </Suspense>
        </motion.div>
      </div>
    </div>
  );
}
