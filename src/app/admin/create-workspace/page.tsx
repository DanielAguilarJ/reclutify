'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  ArrowRight,
  ArrowLeft,
  Briefcase,
  Users,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { addWorkspace } from '@/app/actions/organizations';

export default function CreateWorkspacePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    size: '1-10',
    industry: 'Technology',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await addWorkspace(formData);

      if (!result.success) {
        setError(result.error || 'Error desconocido al crear el workspace.');
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

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>
        <h1 className="text-2xl font-bold text-foreground">Nuevo Workspace</h1>
        <p className="text-sm text-muted mt-1">
          Crea una nueva organización para gestionar otro equipo o empresa.
        </p>
      </div>

      <div className="bg-card border border-border/50 rounded-3xl p-8 shadow-xl shadow-black/5">
        <div className="mb-6">
          <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Configura tu espacio</h2>
          <p className="text-sm text-muted mt-1">
            Cada workspace tiene su propio pipeline de candidatos y configuración.
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
              Nombre de la Empresa
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder="Ej. Acme Corp"
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                if (error) setError(null);
              }}
              className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-muted/50 text-sm"
            />
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
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Creando workspace...</span>
              </>
            ) : (
              <>
                <span className="text-sm">Crear Workspace</span>
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>
      </div>

      <p className="text-center text-xs text-muted mt-6">
        Al crear el workspace, aceptas nuestros Términos de Servicio.
      </p>
    </div>
  );
}
