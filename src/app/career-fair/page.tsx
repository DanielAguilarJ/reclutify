import type { Metadata } from 'next';
import { getPublishedJobs, getDistinctLocations } from '@/app/actions/jobs';
import JobSearchResults from './JobSearchResults';

export const metadata: Metadata = {
  title: 'Bolsa de Trabajo con IA — Vacantes y Empleo | Reclutify',
  description:
    'Bolsa de trabajo con entrevistas de IA. Encuentra empleo y vacantes en empresas top de CDMX, Monterrey, Guadalajara y toda LATAM. Aplica con AI interview y destaca.',
  alternates: {
    canonical: '/career-fair',
  },
  openGraph: {
    title: 'Bolsa de Trabajo con IA — Empleo y Vacantes',
    description: 'Encuentra vacantes con entrevistas de IA. Empleo en CDMX, Monterrey, Guadalajara y más.',
    url: 'https://www.reclutify.com/career-fair',
    locale: 'es_MX',
    type: 'website',
    siteName: 'Reclutify',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bolsa de Trabajo con IA — Reclutify',
    description: 'Bolsa de trabajo con AI interview. Vacantes en empresas top de LATAM.',
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
