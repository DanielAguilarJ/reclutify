import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Configurar Perfil — Reclutify',
  description: 'Completa tu perfil profesional en Reclutify para acceder a todas las funcionalidades.',
  robots: { index: false, follow: false },
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
