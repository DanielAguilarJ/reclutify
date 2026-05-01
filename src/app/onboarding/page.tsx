'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createOrganization, setupCandidateProfile } from '@/app/actions/onboarding';
import Logo from '@/components/ui/Logo';
import {
  Building2,
  ArrowRight,
  Briefcase,
  Users,
  AlertCircle,
  UserSearch,
  MapPin,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  AtSign,
} from 'lucide-react';

type OnboardingRole = 'candidate' | 'employer' | null;

/**
 * Generates a URL-friendly username from a full name.
 * "Daniel Aguilar" → "daniel-aguilar"
 */
function suggestUsername(fullName: string): string {
  return fullName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roleParam = searchParams.get('role') as OnboardingRole;

  const [selectedRole, setSelectedRole] = useState<OnboardingRole>(
    roleParam === 'candidate' || roleParam === 'employer' ? roleParam : null
  );

  // Employer form state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employerData, setEmployerData] = useState({
    name: '',
    size: '1-10',
    industry: 'Technology',
  });

  // Candidate form state
  const [candidateData, setCandidateData] = useState({
    full_name: '',
    headline: '',
    location: '',
    is_open_to_work: true,
    username: '',
  });
  const [usernameManuallyEdited, setUsernameManuallyEdited] = useState(false);

  // Auto-suggest username from full_name
  useEffect(() => {
    if (!usernameManuallyEdited && candidateData.full_name.length >= 2) {
      setCandidateData((prev) => ({
        ...prev,
        username: suggestUsername(prev.full_name),
      }));
    }
  }, [candidateData.full_name, usernameManuallyEdited]);

  // ─── HANDLERS ───

  const handleEmployerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await createOrganization({
        name: employerData.name,
        size: employerData.size,
        industry: employerData.industry,
      });

      if (!result.success) {
        setError(result.error || 'Error desconocido al crear la organización.');
        return;
      }

      router.push(result.redirectTo || '/admin');
      router.refresh();
    } catch {
      setError('Ocurrió un error inesperado. Por favor, intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleCandidateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await setupCandidateProfile({
        full_name: candidateData.full_name,
        headline: candidateData.headline,
        location: candidateData.location,
        is_open_to_work: candidateData.is_open_to_work,
        username: candidateData.username,
      });

      if (!result.success) {
        setError(result.error || 'Error desconocido al crear tu perfil.');
        return;
      }

      router.push(result.redirectTo || '/feed');
      router.refresh();
    } catch {
      setError('Ocurrió un error inesperado. Por favor, intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  // ─── STEP 0: ROLE SELECTOR ───
  if (!selectedRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[50vh] h-[50vh] bg-primary/20 blur-[100px] rounded-full translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 left-0 w-[50vh] h-[50vh] bg-[#3b4cca]/20 blur-[100px] rounded-full -translate-x-1/2 translate-y-1/2" />

        <div className="w-full max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="mb-8 flex justify-center">
            <Logo size="large" />
          </div>

          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-foreground mb-2">
              ¿Cómo quieres usar Reclutify?
            </h1>
            <p className="text-sm text-muted">
              Elige tu rol para personalizar tu experiencia.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Candidate Card */}
            <button
              onClick={() => {
                setSelectedRole('candidate');
                router.replace('/onboarding?role=candidate');
              }}
              className="group bg-card border border-border/50 rounded-3xl p-8 shadow-xl shadow-black/5 hover:border-[#00D3D8]/40 hover:shadow-[#00D3D8]/10 transition-all text-left cursor-pointer"
            >
              <div className="w-14 h-14 bg-[#00D3D8]/10 rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <UserSearch className="h-7 w-7 text-[#00D3D8]" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Busco empleo</h2>
              <p className="text-sm text-muted leading-relaxed">
                Crea tu perfil, conecta con empresas y encuentra tu trabajo ideal
              </p>
              <div className="mt-5 flex items-center gap-2 text-[#00D3D8] text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                Comenzar <ArrowRight className="w-4 h-4" />
              </div>
            </button>

            {/* Employer Card */}
            <button
              onClick={() => {
                setSelectedRole('employer');
                router.replace('/onboarding?role=employer');
              }}
              className="group bg-card border border-border/50 rounded-3xl p-8 shadow-xl shadow-black/5 hover:border-primary/40 hover:shadow-primary/10 transition-all text-left cursor-pointer"
            >
              <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <Building2 className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Soy empleador</h2>
              <p className="text-sm text-muted leading-relaxed">
                Publica vacantes y evalúa candidatos con inteligencia artificial
              </p>
              <div className="mt-5 flex items-center gap-2 text-primary text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                Comenzar <ArrowRight className="w-4 h-4" />
              </div>
            </button>
          </div>

          <p className="text-center text-xs text-muted mt-8">
            Podrás cambiar tu rol más adelante en la configuración.
          </p>
        </div>
      </div>
    );
  }

  // ─── STEP 1: CANDIDATE FORM ───
  if (selectedRole === 'candidate') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[50vh] h-[50vh] bg-[#00D3D8]/20 blur-[100px] rounded-full translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 left-0 w-[50vh] h-[50vh] bg-[#3b4cca]/20 blur-[100px] rounded-full -translate-x-1/2 translate-y-1/2" />

        <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="mb-8 flex justify-center">
            <Logo size="large" />
          </div>

          <div className="bg-card border border-border/50 rounded-3xl p-8 shadow-xl shadow-black/5">
            <div className="mb-6">
              <div className="w-12 h-12 bg-[#00D3D8]/10 rounded-2xl flex items-center justify-center mb-4">
                <UserSearch className="h-6 w-6 text-[#00D3D8]" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Crea tu perfil</h1>
              <p className="text-sm text-muted mt-2">
                Configura tu perfil profesional para empezar a conectar con oportunidades.
              </p>
            </div>

            {/* Error display */}
            {error && (
              <div className="mb-5 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-500">{error}</p>
              </div>
            )}

            <form onSubmit={handleCandidateSubmit} className="space-y-5">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Ej. Daniel Aguilar"
                  value={candidateData.full_name}
                  onChange={(e) => {
                    setCandidateData({ ...candidateData, full_name: e.target.value });
                    if (error) setError(null);
                  }}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-[#00D3D8]/20 focus:border-[#00D3D8] outline-none transition-all placeholder:text-muted/50 text-sm"
                />
              </div>

              {/* Headline */}
              <div>
                <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Titular Profesional
                </label>
                <input
                  type="text"
                  placeholder="Ej. Frontend Developer | React | TypeScript"
                  value={candidateData.headline}
                  onChange={(e) =>
                    setCandidateData({ ...candidateData, headline: e.target.value })
                  }
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-[#00D3D8]/20 focus:border-[#00D3D8] outline-none transition-all placeholder:text-muted/50 text-sm"
                />
              </div>

              {/* Location */}
              <div>
                <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Ubicación
                </label>
                <input
                  type="text"
                  placeholder="Ej. Ciudad de México, México"
                  value={candidateData.location}
                  onChange={(e) =>
                    setCandidateData({ ...candidateData, location: e.target.value })
                  }
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-[#00D3D8]/20 focus:border-[#00D3D8] outline-none transition-all placeholder:text-muted/50 text-sm"
                />
              </div>

              {/* Username */}
              <div>
                <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                  <AtSign className="h-3 w-3" /> Username
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/50 text-sm">@</span>
                  <input
                    type="text"
                    required
                    placeholder="tu-username"
                    value={candidateData.username}
                    onChange={(e) => {
                      const value = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '');
                      setCandidateData({ ...candidateData, username: value });
                      setUsernameManuallyEdited(true);
                      if (error) setError(null);
                    }}
                    className="w-full pl-8 pr-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-[#00D3D8]/20 focus:border-[#00D3D8] outline-none transition-all placeholder:text-muted/50 text-sm"
                  />
                </div>
                <p className="text-xs text-muted mt-1.5">
                  Tu perfil será visible en reclutify.com/profile/{candidateData.username || 'tu-username'}
                </p>
              </div>

              {/* Open to Work Toggle */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-background border border-border">
                <div>
                  <p className="text-sm font-medium text-foreground">Open to Work</p>
                  <p className="text-xs text-muted mt-0.5">
                    Los reclutadores verán que buscas empleo
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setCandidateData({
                      ...candidateData,
                      is_open_to_work: !candidateData.is_open_to_work,
                    })
                  }
                  className="text-[#00D3D8] transition-colors"
                >
                  {candidateData.is_open_to_work ? (
                    <ToggleRight className="w-8 h-8" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-muted" />
                  )}
                </button>
              </div>

              <button
                type="submit"
                disabled={loading || !candidateData.full_name.trim() || !candidateData.username.trim()}
                className="w-full flex items-center justify-center gap-2 group bg-[#00D3D8] hover:bg-[#00bfc4] text-white font-medium py-3.5 rounded-xl transition-all shadow-lg shadow-[#00D3D8]/20 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                <span className="text-sm">
                  {loading ? 'Creando perfil...' : 'Crear Perfil'}
                </span>
                {!loading && (
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                )}
              </button>
            </form>

            {/* Back to role selector */}
            <button
              onClick={() => {
                setSelectedRole(null);
                setError(null);
                router.replace('/onboarding');
              }}
              className="w-full text-center text-xs text-muted mt-4 hover:text-foreground transition-colors cursor-pointer"
            >
              ← Cambiar tipo de cuenta
            </button>
          </div>

          <p className="text-center text-xs text-muted mt-6">
            Al crear el perfil, aceptas nuestros Términos de Servicio.
          </p>
        </div>
      </div>
    );
  }

  // ─── STEP 1: EMPLOYER FORM (existing form preserved) ───
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[50vh] h-[50vh] bg-primary/20 blur-[100px] rounded-full translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 left-0 w-[50vh] h-[50vh] bg-[#3b4cca]/20 blur-[100px] rounded-full -translate-x-1/2 translate-y-1/2" />

      <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="mb-8 flex justify-center">
          <Logo size="large" />
        </div>

        <div className="bg-card border border-border/50 rounded-3xl p-8 shadow-xl shadow-black/5">
          <div className="mb-6">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Configura tu espacio</h1>
            <p className="text-sm text-muted mt-2">
              Crea tu organización para empezar a evaluar candidatos de forma inteligente.
            </p>
          </div>

          {/* Error display */}
          {error && (
            <div className="mb-5 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-500">{error}</p>
            </div>
          )}

          <form onSubmit={handleEmployerSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
                Nombre de la Empresa
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Ej. Acme Corp"
                  value={employerData.name}
                  onChange={(e) => {
                    setEmployerData({ ...employerData, name: e.target.value });
                    if (error) setError(null);
                  }}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-muted/50 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Users className="h-3 w-3" /> Tamaño
                </label>
                <select
                  value={employerData.size}
                  onChange={(e) => setEmployerData({ ...employerData, size: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background outline-none text-sm focus:ring-2 focus:border-primary opacity-90"
                >
                  <option value="1-10">1 - 10 empleados</option>
                  <option value="11-50">11 - 50 empleados</option>
                  <option value="51-200">51 - 200 empleados</option>
                  <option value="200+">200+ empleados</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Briefcase className="h-3 w-3" /> Industria
                </label>
                <select
                  value={employerData.industry}
                  onChange={(e) =>
                    setEmployerData({ ...employerData, industry: e.target.value })
                  }
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background outline-none text-sm focus:ring-2 focus:border-primary opacity-90"
                >
                  <option value="Technology">Tecnología</option>
                  <option value="Finance">Finanzas</option>
                  <option value="Retail">Retail</option>
                  <option value="Healthcare">Salud</option>
                  <option value="Other">Otro</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !employerData.name.trim()}
              className="w-full flex items-center justify-center gap-2 group bg-primary hover:bg-primary-hover text-primary-dark font-medium py-3.5 rounded-xl transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              <span className="text-sm">{loading ? 'Creando...' : 'Crear Workspace'}</span>
              {!loading && (
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              )}
            </button>
          </form>

          {/* Back to role selector */}
          <button
            onClick={() => {
              setSelectedRole(null);
              setError(null);
              router.replace('/onboarding');
            }}
            className="w-full text-center text-xs text-muted mt-4 hover:text-foreground transition-colors cursor-pointer"
          >
            ← Cambiar tipo de cuenta
          </button>
        </div>

        <p className="text-center text-xs text-muted mt-6">
          Al crear el workspace, aceptas nuestros Términos de Servicio.
        </p>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="animate-pulse text-muted">Cargando...</div>
        </div>
      }
    >
      <OnboardingContent />
    </Suspense>
  );
}
