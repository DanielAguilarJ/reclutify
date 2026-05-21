import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Iniciar Sesión — Reclutify',
  description: 'Inicia sesión en tu cuenta de Reclutify. Accede a entrevistas con IA, tu red profesional y oportunidades laborales.',
  openGraph: {
    title: 'Iniciar Sesión | Reclutify',
    description: 'Accede a tu cuenta profesional en Reclutify.',
    url: '/login',
    type: 'website',
  },
  twitter: { card: 'summary', title: 'Iniciar Sesión | Reclutify' },
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
