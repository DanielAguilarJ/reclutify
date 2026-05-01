import type { Metadata } from 'next';
import { getPublishedJobs, getDistinctLocations } from '@/app/actions/jobs';
import JobSearchResults from './JobSearchResults';

export const metadata: Metadata = {
  title: 'Bolsa de Trabajo | Reclutify',
  description:
    'Encuentra tu próximo empleo con Reclutify. Explora vacantes de empresas top con entrevistas de IA. Busca por ubicación, tipo de trabajo y más.',
  openGraph: {
    title: 'Bolsa de Trabajo | Reclutify',
    description: 'Explora vacantes de empresas top y aplica con entrevistas de IA.',
    locale: 'es_MX',
    type: 'website',
    siteName: 'Reclutify',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bolsa de Trabajo | Reclutify',
    description: 'Encuentra tu próximo empleo con entrevistas de IA.',
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
