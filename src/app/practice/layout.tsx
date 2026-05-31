import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Interview Practice — Free AI Interview Simulator | Reclutify',
  description: 'Practice AI interviews for free. AI interview assistant simulates real job interviews, gives instant feedback, and helps you prepare for AI screening. Practica entrevistas con IA gratis — simulador de entrevistas con inteligencia artificial.',
  alternates: {
    canonical: '/practice',
  },
  openGraph: {
    title: 'AI Interview Practice — Free Simulator',
    description: 'Practice with our AI interview tool. Get instant feedback and ace your next job interview.',
    url: 'https://www.reclutify.com/practice',
    type: 'website',
    siteName: 'Reclutify',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Interview Practice — Reclutify',
    description: 'Free AI interview simulator. Practice interview questions with AI feedback.',
  },
};

export default function PracticeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
