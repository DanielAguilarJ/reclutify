import type { Metadata } from 'next';
import { getPublishedJobs, getDistinctLocations } from '@/app/actions/jobs';
import JobSearchResults from './JobSearchResults';

export const metadata: Metadata = {
  title: 'Bolsa de Trabajo y Empleo — Vacantes con AI Interview | Reclutify',
  description:
    'Bolsa de trabajo y bolsa de empleo con entrevistas de IA. Vacantes y ofertas de empleo en empresas top de CDMX, Estado de México, Monterrey, Guadalajara, Puebla. Entrevista de trabajo con video interview.',
  alternates: {
    canonical: '/career-fair',
  },
  openGraph: {
    title: 'Bolsa de Trabajo — Vacantes y Ofertas de Empleo',
    description: 'Bolsa de empleo con video interview. Vacantes en CDMX, Monterrey, Guadalajara, Puebla y toda LATAM.',
    url: 'https://www.reclutify.com/career-fair',
    locale: 'es_MX',
    type: 'website',
    siteName: 'Reclutify',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bolsa de Trabajo — Empleo y Vacantes con IA | Reclutify',
    description: 'Bolsa de trabajo con entrevista de trabajo por IA. Ofertas de empleo en empresas top.',
  },
};

/**
 * Career Fair / Job Board — Server Component for SEO.
 * Fetches initial published jobs and distinct locations server-side,
 * then hydrates the client-side search component.
 */
export default async function CareerFairPage() {
  // Parallel fetch for initial data
  const [initialData, locations] = await Promise.all([
    getPublishedJobs({ page: 1, perPage: 12 }),
    getDistinctLocations(),
  ]);

  return (
    <JobSearchResults
      initialJobs={initialData.jobs}
      initialTotal={initialData.total}
      initialHasMore={initialData.hasMore}
      locations={locations}
    />
  );
}
