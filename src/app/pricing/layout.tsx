import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Planes y Precios — Reclutify',
  description: 'Elige el plan ideal para tu empresa. Desde $29/mes con entrevistas ilimitadas con IA, evaluaciones automatizadas y detección de sesgos.',
  openGraph: {
    title: 'Planes y Precios | Reclutify',
    description: 'Planes flexibles para reclutamiento con IA desde $29/mes.',
    url: '/pricing',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: { card: 'summary_large_image', title: 'Planes y Precios | Reclutify' },
  alternates: { canonical: '/pricing' },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
