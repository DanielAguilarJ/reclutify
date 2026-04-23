'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createOrganization } from '@/app/actions/onboarding';
import Logo from '@/components/ui/Logo';
import { Building2, ArrowRight, Briefcase, Users, AlertCircle } from 'lucide-react';

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    size: '1-10',
    industry: 'Technology'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      // Llamar al Server Action que maneja toda la lógica de forma segura
      const result = await createOrganization({
        name: formData.name,
        size: formData.size,
        industry: formData.industry,
      });

      if (!result.success) {
        setError(result.error || 'Error desconocido al crear la organización.');
        return;
      }

      // Éxito: redirigir al panel de administración
      router.push('/admin');
      router.refresh();
    } catch {
      setError('Ocurrió un error inesperado. Por favor, intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

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
             <p className="text-sm text-muted mt-2">Crea tu organización para empezar a evaluar candidatos de forma inteligente.</p>
          </div>

          {/* Mensaje de error descriptivo en la UI (no alert) */}
          {error && (
            <div className="mb-5 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-500">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Nombre de la Empresa</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Ej. Acme Corp"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ ...formData, name: e.target.value });
                    // Limpiar error al editar
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
                  value={formData.size}
                  onChange={(e) => setFormData({ ...formData, size: e.target.value })}
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
                  value={formData.industry}
                  onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
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
              disabled={loading || !formData.name.trim()}
              className="w-full flex items-center justify-center gap-2 group bg-primary hover:bg-primary-hover text-primary-dark font-medium py-3.5 rounded-xl transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              <span className="text-sm">{loading ? 'Creando...' : 'Crear Workspace'}</span>
              {!loading && <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-muted mt-6">
          Al crear el workspace, aceptas nuestros Términos de Servicio.
        </p>
      </div>
    </div>
  );
}
