'use client';

import { use, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Logo from '@/components/ui/Logo';
import InterviewOverview from '@/components/candidate/InterviewOverview';
import HardwareCheck from '@/components/candidate/HardwareCheck';
import QuickDeviceSetup from '@/components/candidate/QuickDeviceSetup';
import InterviewRoom from '@/components/candidate/InterviewRoom';
import InterviewComplete from '@/components/candidate/InterviewComplete';
import { useInterviewStore } from '@/store/interviewStore';
import { useAppStore } from '@/store/appStore';
import { dictionaries } from '@/lib/i18n';
import { Loader2, ShieldX, User, Mail, Phone, Linkedin, ArrowRight, Link2, Briefcase, MapPin } from 'lucide-react';

import type { Topic, InterviewMode } from '@/types';

type PageStatus = 'loading' | 'valid' | 'invalid' | 'registering' | 'registered';

interface RoleData {
  id: string;
  title: string;
  description?: string;
  location?: string;
  salary?: string;
  jobType?: string;
  interviewDuration: number;
  interviewMode?: InterviewMode;
  topics: Topic[];
  orgId?: string;
}

interface OrgData {
  name: string;
  planTier: string;
}

export default function PublicInterviewPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = use(params);
  const { phase, setTopics, setCandidate, setPhase, setRoleId, setInterviewDuration, setInterviewMode, interviewMode } = useInterviewStore();
  const { language } = useAppStore();
  const t = dictionaries[language];
  const es = language === 'es';

  const [pageStatus, setPageStatus] = useState<PageStatus>('loading');
  const [roleData, setRoleData] = useState<RoleData | null>(null);
  const [orgData, setOrgData] = useState<OrgData | null>(null);
  const [resultId, setResultId] = useState('');

  // Registration form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Validate public token on mount
  useEffect(() => {
    const validateToken = async () => {
      try {
        const res = await fetch(`/api/public-interview?token=${encodeURIComponent(publicToken)}`);
        if (!res.ok) {
          setPageStatus('invalid');
          return;
        }
        const data = await res.json();
        setRoleData(data.role);
        setOrgData(data.org);
        setPageStatus('valid');
      } catch {
        setPageStatus('invalid');
      }
    };

    validateToken();
  }, [publicToken]);

  // Handle registration form submit
  const handleRegister = useCallback(async () => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = es ? 'El nombre es obligatorio' : 'Name is required';
    }
    if (!email.trim()) {
      newErrors.email = es ? 'El correo es obligatorio' : 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      newErrors.email = es ? 'Correo inválido' : 'Invalid email';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSubmitting(true);
    setErrors({});

    try {
      const res = await fetch('/api/public-interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: publicToken,
          candidateName: name.trim(),
          candidateEmail: email.trim(),
          candidatePhone: phone.trim(),
          linkedinUrl: linkedinUrl.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        setErrors({ submit: errData.error || 'Error registering' });
        setSubmitting(false);
        return;
      }

      const data = await res.json();
      setResultId(data.resultId);

      // Configure interview store
      const topics: Topic[] = (data.topics || []).map((t: Topic, i: number) => ({
        ...t,
        id: t.id || `t-${Date.now()}-${i}`,
      }));
      setTopics(topics);
      setRoleId(data.roleId);
      setInterviewDuration(data.interviewDuration);
      setInterviewMode((data.interviewMode || roleData?.interviewMode || 'restricted') as InterviewMode);
      setCandidate({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        linkedinUrl: linkedinUrl.trim() || undefined,
      });

      setPageStatus('registered');
      setPhase('overview');
    } catch {
      setErrors({ submit: es ? 'Error de conexión' : 'Connection error' });
    } finally {
      setSubmitting(false);
    }
  }, [publicToken, name, email, phone, linkedinUrl, es, setTopics, setRoleId, setInterviewDuration, setInterviewMode, roleData, setCandidate, setPhase]);

  // ─── Loading state ───
  if (pageStatus === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-3 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted">{es ? 'Cargando entrevista...' : 'Loading interview...'}</p>
        </div>
      </div>
    );
  }

  // ─── Invalid token ───
  if (pageStatus === 'invalid') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="bg-card rounded-3xl shadow-sm border border-border/50 p-10 max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-danger/10 flex items-center justify-center mx-auto mb-5">
            <ShieldX className="h-8 w-8 text-danger" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            {es ? 'Enlace Inválido' : 'Invalid Link'}
          </h1>
          <p className="text-sm text-muted leading-relaxed">
            {es
              ? 'Este enlace de entrevista no es válido o ha sido desactivado. Contacta al equipo de recursos humanos.'
              : 'This interview link is not valid or has been deactivated. Contact the HR team.'}
          </p>
        </div>
      </div>
    );
  }

  // ─── Registration form (valid token, not yet registered) ───
  if (pageStatus === 'valid' && roleData) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="px-6 py-4">
          <Logo forceWhiteLabel={orgData?.planTier === 'enterprise'} />
        </header>
        <main className="flex-1 flex items-center justify-center px-6 pb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-lg"
          >
            <div className="bg-card rounded-3xl shadow-sm border border-border/50 p-8">
              {/* Role info header */}
              <div className="mb-6 pb-5 border-b border-border/30">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Briefcase className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{roleData.title}</h2>
                    {orgData?.name && (
                      <p className="text-xs text-muted">{orgData.name}</p>
                    )}
                  </div>
                </div>
                {(roleData.location || roleData.jobType) && (
                  <div className="flex items-center gap-3 mt-2">
                    {roleData.location && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted">
                        <MapPin className="h-3 w-3" /> {roleData.location}
                      </span>
                    )}
                    {roleData.jobType && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted bg-muted/10 px-2 py-0.5 rounded-full">
                        {roleData.jobType}
                      </span>
                    )}
                  </div>
                )}
                {roleData.description && (
                  <p className="text-xs text-muted mt-2 line-clamp-3">{roleData.description}</p>
                )}
              </div>

              {/* Registration title */}
              <div className="mb-5">
                <h3 className="text-base font-semibold text-foreground">
                  {es ? 'Regístrate para la Entrevista' : 'Register for the Interview'}
                </h3>
                <p className="text-xs text-muted mt-1">
                  {es
                    ? 'Ingresa tus datos para comenzar la entrevista con IA. Tu sesión será registrada de forma independiente.'
                    : 'Enter your details to start the AI interview. Your session will be recorded independently.'}
                </p>
              </div>

              {/* Form fields */}
              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">
                    {es ? 'Nombre completo' : 'Full name'} *
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={es ? 'Tu nombre completo' : 'Your full name'}
                      className={`w-full pl-10 pr-4 py-2.5 rounded-xl border ${
                        errors.name ? 'border-danger' : 'border-border'
                      } bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all`}
                    />
                  </div>
                  {errors.name && <p className="text-xs text-danger mt-1">{errors.name}</p>}
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">
                    {es ? 'Correo electrónico' : 'Email'} *
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={es ? 'tu@correo.com' : 'your@email.com'}
                      className={`w-full pl-10 pr-4 py-2.5 rounded-xl border ${
                        errors.email ? 'border-danger' : 'border-border'
                      } bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all`}
                    />
                  </div>
                  {errors.email && <p className="text-xs text-danger mt-1">{errors.email}</p>}
                </div>

                {/* Phone (optional) */}
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">
                    {es ? 'Teléfono (opcional)' : 'Phone (optional)'}
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+52 123 456 7890"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    />
                  </div>
                </div>

                {/* LinkedIn (optional) */}
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">
                    LinkedIn (opcional)
                  </label>
                  <div className="relative">
                    <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                    <input
                      type="url"
                      value={linkedinUrl}
                      onChange={(e) => setLinkedinUrl(e.target.value)}
                      placeholder="https://linkedin.com/in/tu-perfil"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    />
                  </div>
                </div>

                {/* Submit error */}
                {errors.submit && (
                  <div className="p-3 rounded-lg bg-danger/10 border border-danger/20">
                    <p className="text-xs text-danger">{errors.submit}</p>
                  </div>
                )}

                {/* Submit button */}
                <button
                  onClick={handleRegister}
                  disabled={submitting}
                  className="w-full py-3 rounded-xl bg-primary text-white font-medium text-sm 
                    hover:bg-primary-hover transition-all disabled:opacity-50 disabled:cursor-wait
                    flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {es ? 'Registrando...' : 'Registering...'}
                    </>
                  ) : (
                    <>
                      {es ? 'Comenzar Entrevista' : 'Start Interview'}
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>

              {/* Footer note */}
              <p className="text-[10px] text-muted text-center mt-4">
                {es
                  ? 'Al registrarte aceptas que tu entrevista será grabada y evaluada con IA.'
                  : 'By registering you accept that your interview will be recorded and evaluated with AI.'}
              </p>
            </div>
          </motion.div>
        </main>
      </div>
    );
  }

  // ─── Interview flow (after registration) ───
  if (phase === 'interview') {
    return <InterviewRoom roleId={roleData?.id || ''} publicResultId={resultId} />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 py-4">
        <Logo forceWhiteLabel={orgData?.planTier === 'enterprise'} />
      </header>
      <main className="flex-1 flex items-center justify-center px-6 pb-12">
        <AnimatePresence mode="wait">
          {phase === 'overview' && <InterviewOverview key="overview" />}
          {phase === 'hardware' &&
            (interviewMode === 'internal' ? (
              <QuickDeviceSetup key="quick-hardware" />
            ) : (
              <HardwareCheck key="hardware" />
            ))}
          {phase === 'complete' && <InterviewComplete key="complete" />}
        </AnimatePresence>
      </main>
    </div>
  );
}
