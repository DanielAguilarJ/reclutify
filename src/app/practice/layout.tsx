import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Interview Practice — Free Video Interview Simulator | Reclutify',
  description: 'Free AI interview practice and video interview simulator. Practice video interview questions, get AI feedback, and prepare for one-way video interviews. Video interview tips and AI interview practice tool.',
  alternates: {
    canonical: '/practice',
  },
  openGraph: {
    title: 'AI Interview Practice — Free Video Interview Simulator',
    description: 'Practice video interviews with AI. Get instant feedback on your interview questions and answers. Free video interview practice tool.',
    url: 'https://www.reclutify.com/practice',
    type: 'website',
    siteName: 'Reclutify',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Video Interview Practice with AI — Reclutify',
    description: 'Free AI interview simulator. Practice video interview questions with real-time AI feedback.',
  },
};

export default function PracticeLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Reclutify AI Interview Practice',
    url: 'https://www.reclutify.com/practice',
    applicationCategory: 'EducationalApplication',
    description: 'Free AI-powered video interview practice tool. Simulate real job interviews with AI feedback. Practice interview questions and improve your video interview skills.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    operatingSystem: 'Web',
    inLanguage: ['en', 'es'],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}
