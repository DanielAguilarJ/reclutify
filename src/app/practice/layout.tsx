import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Practica Entrevistas con IA | Reclutify',
  description: 'Practica entrevistas con inteligencia artificial gratis. Mejora tus respuestas, recibe feedback en tiempo real y prepárate para tu próxima entrevista de trabajo.',
  alternates: {
    canonical: '/practice',
  },
  openGraph: {
    title: 'Practica Entrevistas con IA — Reclutify',
    description: 'Mejora tus habilidades de entrevista con nuestro simulador de IA gratuito.',
    url: 'https://www.reclutify.com/practice',
    type: 'website',
    siteName: 'Reclutify',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Practica Entrevistas con IA — Reclutify',
    description: 'Simulador de entrevistas gratuito con feedback de IA.',
  },
};

export default function PracticeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
