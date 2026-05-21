import Link from 'next/link';
import Logo from '@/components/ui/Logo';
import { Home, CreditCard, LogIn } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#1a1b23] text-white font-sans selection:bg-[#D3FB52] selection:text-black flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between border-b border-white/5">
        <Link href="/"><Logo /></Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          {/* Animated 404 badge */}
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-[#D3FB52]/10 border border-[#D3FB52]/20 mb-8">
            <span className="text-4xl font-black text-[#D3FB52]">404</span>
          </div>

          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            Página no encontrada
          </h1>
          <p className="text-neutral-400 leading-relaxed mb-10">
            Lo sentimos, la página que buscas no existe o ha sido movida.
            Verifica la URL o regresa al inicio.
          </p>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 bg-[#D3FB52] text-black font-semibold px-6 py-3 rounded-xl hover:bg-[#c1e847] transition-colors"
            >
              <Home className="w-4 h-4" />
              Volver al inicio
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 border border-white/20 px-6 py-3 rounded-xl font-medium text-sm hover:border-white/40 transition-colors"
            >
              <CreditCard className="w-4 h-4" />
              Ver Precios
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 border border-white/20 px-6 py-3 rounded-xl font-medium text-sm hover:border-white/40 transition-colors"
            >
              <LogIn className="w-4 h-4" />
              Iniciar Sesión
            </Link>
          </div>
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-neutral-500 border-t border-white/5">
        <p>&copy; {new Date().getFullYear()} WorldBrain EdTech. Todos los derechos reservados.</p>
      </footer>
    </div>
  );
}
